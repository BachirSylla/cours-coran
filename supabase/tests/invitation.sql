-- =============================================================================
-- invitation.sql — l'invitation par code, mise à l'épreuve
--
-- Lot sensible : c'est le seul chemin qui crée une ligne `membre`, donc le seul
-- endroit où quelqu'un pourrait entrer dans un centre. Ce script teste l'accès
-- REFUSÉ autant que l'accès autorisé, et vérifie qu'aucun refus ne laisse de
-- trace derrière lui.
--
-- Tout se déroule dans une transaction ANNULÉE à la fin.
--
-- Exécution :
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/invitation.sql
--
-- Succès = aucune exception, et la ligne finale « TOUTES LES ASSERTIONS PASSENT ».
-- =============================================================================

\set ON_ERROR_STOP on
begin;

-- -----------------------------------------------------------------------------
-- Outillage
-- -----------------------------------------------------------------------------

/* L'appel doit être REFUSÉ, avec le code d'erreur attendu. */
create function public.__refus(p_sql text, p_etat text, p_message text)
returns void language plpgsql security invoker as $$
declare v_etat text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_etat = returned_sqlstate;
    if v_etat <> p_etat then
      raise exception 'MAUVAIS REFUS — % : attendu %, obtenu % (%)',
        p_message, p_etat, v_etat, sqlerrm;
    end if;
    return;
  end;

  raise exception 'FAILLE — % : l''appel a été ACCEPTÉ', p_message;
end;
$$;

/* L'appel doit passer. Un refus est une régression, pas une sécurité. */
create function public.__accepte(p_sql text, p_message text)
returns void language plpgsql security invoker as $$
begin
  execute p_sql;
exception when others then
  raise exception 'RÉGRESSION — % : refusé (% / %)', p_message, sqlstate, sqlerrm;
end;
$$;

create function public.__attendre(p_sql text, p_attendu bigint, p_message text)
returns void language plpgsql security invoker as $$
declare v_n bigint;
begin
  execute p_sql into v_n;
  if v_n is distinct from p_attendu then
    raise exception 'FUITE — % : % au lieu de %', p_message, v_n, p_attendu;
  end if;
end;
$$;

create function public.__refus_droit(p_sql text, p_message text)
returns void language plpgsql security invoker as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then return;
  end;

  raise exception 'FAILLE — % : c''est ACCESSIBLE', p_message;
end;
$$;

/* Prend l'identité d'un compte pour la suite de la transaction. */
create function public.__devenir(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', p_user), true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Le décor
--
--   Centre Alpha : R1 responsable, A enseignant
--   Centre Beta  : R2 responsable
--   NOUVEAU      : compte créé mais sans `membre` — le candidat au rachat
--   AUTRE        : second compte inerte, qui rachètera lui aussi
--   LIBRE, LIBRE2 : comptes inertes gardés intacts, pour éprouver les refus
--                   depuis quelqu'un que le pré-contrôle « déjà membre » ne
--                   court-circuite pas
-- -----------------------------------------------------------------------------
create table public.t_ids (cle text primary key, val uuid);
grant select on public.t_ids to authenticated;

insert into public.t_ids (cle, val)
values ('u_r1', gen_random_uuid()), ('u_a', gen_random_uuid()),
       ('u_r2', gen_random_uuid()), ('u_nouveau', gen_random_uuid()),
       ('u_autre', gen_random_uuid()), ('u_libre', gen_random_uuid()),
       ('u_libre2', gen_random_uuid());

insert into auth.users (id, email)
select val, cle || '@invitation.invalid' from public.t_ids;

insert into public.centre (nom) values ('Alpha'), ('Beta');

insert into public.t_ids (cle, val)
select 'c_alpha', id from public.centre where nom = 'Alpha'
union all select 'c_beta', id from public.centre where nom = 'Beta';

create function public.__id(p_cle text) returns uuid
language sql stable as $$ select val from public.t_ids where cle = p_cle $$;

/*
 * Les codes en clair du décor. `t_ids` ne porte que des uuid, et surtout :
 * `code_hash` n'est accordé à PERSONNE en lecture, donc retrouver une
 * invitation par son code ne peut se faire qu'en `postgres`. C'est voulu — et
 * c'est pourquoi ce script note l'identifiant au moment où il crée le code.
 */
create table public.t_codes (cle text primary key, code text, invitation_id uuid);
grant select on public.t_codes to authenticated;

/* Crée une invitation (R1 par défaut) et note son code ET son identifiant. */
create function public.__inviter(p_cle text, p_par text default 'u_r1')
returns void language plpgsql as $$
declare v_code text;
begin
  perform public.__devenir(public.__id(p_par));
  set local role authenticated;
  select public.creer_invitation(7) into v_code;
  reset role;

  insert into public.t_codes (cle, code, invitation_id)
  select p_cle, v_code, id
  from public.invitation where code_hash = public.empreinte_code(v_code);
end;
$$;

insert into public.membre (centre_id, user_id, role, nom_affiche) values
  (public.__id('c_alpha'), public.__id('u_r1'), 'responsable', 'R1'),
  (public.__id('c_alpha'), public.__id('u_a'),  'enseignant',  'Amina'),
  (public.__id('c_beta'),  public.__id('u_r2'), 'responsable', 'R2');

-- =============================================================================
-- 1. Création : qui peut, qui ne peut pas
-- =============================================================================
set local role authenticated;
select public.__devenir(public.__id('u_r1'));

do $$
begin
  perform public.__accepte('select public.creer_invitation(7)',
    'R1, responsable, crée une invitation');

  -- Elle est bien posée sur SON centre, au rôle enseignant, non utilisée.
  perform public.__attendre(
    format($sql$select count(*) from public.invitation
                 where centre_id = %L and role = 'enseignant'
                   and utilise_le is null and revoquee_le is null$sql$,
           public.__id('c_alpha')),
    1::bigint, 'l''invitation de R1 porte son centre et le rôle enseignant');
end;
$$;

-- Le code en clair n'est jamais stocké. Vérifiable seulement en `postgres` :
-- `code_hash` n'est accordé à personne.
reset role;
select public.__inviter('temoin');

do $$
declare v_temoin record;
begin
  select c.code, i.code_hash into v_temoin
  from public.t_codes as c
  join public.invitation as i on i.id = c.invitation_id
  where c.cle = 'temoin';

  if v_temoin.code_hash = v_temoin.code then
    raise exception 'FAILLE : le code est stocké en clair.';
  end if;
  if v_temoin.code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'La colonne doit contenir une empreinte SHA-256. Obtenu : %',
      v_temoin.code_hash;
  end if;
  -- Et l'empreinte est bien celle du code : le rachat pourra le retrouver.
  if v_temoin.code_hash <> public.empreinte_code(v_temoin.code) then
    raise exception 'L''empreinte stockée ne correspond pas au code émis.';
  end if;
end;
$$;

set local role authenticated;
select public.__devenir(public.__id('u_a'));

-- L'enseignante, elle, ne crée rien.
do $$
begin
  perform public.__refus('select public.creer_invitation(7)', 'P0010',
    'Amina, enseignante, crée une invitation');

  -- Et elle ne voit pas les invitations de son centre.
  perform public.__attendre('select count(*) from public.invitation', 0::bigint,
    'une enseignante lit les invitations de son centre');
end;
$$;

-- Un compte sans centre non plus.
select public.__devenir(public.__id('u_nouveau'));

do $$
begin
  perform public.__refus('select public.creer_invitation(7)', 'P0010',
    'un compte sans centre crée une invitation');

  perform public.__attendre('select count(*) from public.invitation', 0::bigint,
    'un compte sans centre lit les invitations');

  -- Sécurité par inertie : il ne voit rien du tout (CLAUDE.md §5.11).
  perform public.__attendre('select count(*) from public.cours', 0::bigint,
    'compte inerte : cours');
  perform public.__attendre('select count(*) from public.apprenant', 0::bigint,
    'compte inerte : apprenants');
  perform public.__attendre('select count(*) from public.membre', 0::bigint,
    'compte inerte : membres');
end;
$$;

-- =============================================================================
-- 2. Rachat d'un code valide
-- =============================================================================
reset role;
select public.__inviter('valide');

set local role authenticated;
select public.__devenir(public.__id('u_nouveau'));

do $$
declare v_code text := (select code from public.t_codes where cle = 'valide');
begin
  -- Le racheteur n'a AUCUN paramètre pour choisir son rôle ni son centre : la
  -- signature est (code, nom). C'est l'invariant anti-escalade, structurel.
  perform public.__accepte(
    format('select public.racheter_invitation(%L, %L)', v_code, '  Bilal Sow  '),
    'un compte sans centre rachète un code valide');
end;
$$;

reset role;

do $$
declare v_membre record;
begin
  select centre_id, role, nom_affiche into v_membre
  from public.membre where user_id = public.__id('u_nouveau');

  if v_membre.centre_id <> public.__id('c_alpha') then
    raise exception 'FAILLE : le membre n''a pas été rattaché au centre de l''invitation.';
  end if;
  if v_membre.role <> 'enseignant' then
    raise exception 'FAILLE : le rôle ne vient pas de l''invitation (obtenu %).', v_membre.role;
  end if;
  if v_membre.nom_affiche <> 'Bilal Sow' then
    raise exception 'Le nom affiché doit être nettoyé. Obtenu : « % ».', v_membre.nom_affiche;
  end if;

  -- L'invitation est consommée, et sait par qui.
  perform public.__attendre(
    format($sql$select count(*) from public.invitation
                 where utilise_par = %L and utilise_le is not null$sql$,
           public.__id('u_nouveau')),
    1::bigint, 'l''invitation rachetée est marquée utilisée');
end;
$$;

-- =============================================================================
-- 3. Tous les rachats qui doivent échouer — sans jamais créer de membre
-- =============================================================================
reset role;
select public.__inviter('a_revoquer');
select public.__inviter('a_expirer');
select public.__inviter('deja_utilise');
select public.__inviter('libre');

-- Révocation et expiration posées à la main : le décor ne peut pas attendre
-- sept jours, et `revoquer_invitation` se contente de la revendication d'identité.
select public.__devenir(public.__id('u_r1'));
select public.revoquer_invitation((select invitation_id from public.t_codes where cle = 'a_revoquer'));

update public.invitation set expire_le = now() - interval '1 day'
where id = (select invitation_id from public.t_codes where cle = 'a_expirer');

set local role authenticated;
select public.__devenir(public.__id('u_autre'));

do $$
declare
  v_avant bigint := (select count(*) from public.membre);
  c       text;
begin
  foreach c in array array['a_revoquer', 'a_expirer']
  loop
    perform public.__refus(
      format('select public.racheter_invitation(%L, %L)',
             (select code from public.t_codes where cle = c), 'Intrus'),
      'P0011', 'rachat d''un code « ' || c || ' »');
  end loop;

  perform public.__refus(
    format('select public.racheter_invitation(%L, %L)', 'ZZZZ-ZZZZ-ZZZZ', 'Intrus'),
    'P0011', 'rachat d''un code inconnu');

  perform public.__refus(
    format('select public.racheter_invitation(%L, %L)',
           (select code from public.t_codes where cle = 'libre'), '   '),
    'P0011', 'rachat sans nom affiché');

  -- Aucun de ces refus n'a créé de membre.
  perform public.__attendre('select count(*) from public.membre', v_avant,
    'un rachat refusé ne crée aucun membre');
end;
$$;

-- =============================================================================
-- 4. Usage unique — le second rachat du même code est refusé
-- =============================================================================
do $$
declare
  v_code   text := (select code from public.t_codes where cle = 'deja_utilise');
  v_membres bigint;
begin
  perform public.__accepte(
    format('select public.racheter_invitation(%L, %L)', v_code, 'Premier'),
    'premier rachat');

  -- Compté depuis R1, qui voit tout son centre : `u_libre2` n'est membre de
  -- rien et la RLS ne lui montrerait aucune ligne, quel que soit le résultat.
  perform public.__devenir(public.__id('u_r1'));
  select count(*) into v_membres from public.membre;

  /*
   * Le second racheteur doit être LIBRE — c'est tout l'enjeu.
   *
   * Le prendre déjà membre ferait échouer le rachat sur le pré-contrôle
   * « appartient déjà à un centre », AVANT même que le code soit regardé : le
   * test passerait au vert sans jamais éprouver la garde `utilise_le is null`.
   * On attend donc P0011 (« déjà utilisé »), pas P0012.
   */
  perform public.__devenir(public.__id('u_libre2'));
  perform public.__refus(
    format('select public.racheter_invitation(%L, %L)', v_code, 'Second'),
    'P0011', 'un compte LIBRE rachète un code déjà consommé');

  perform public.__devenir(public.__id('u_r1'));
  perform public.__attendre('select count(*) from public.membre', v_membres,
    'le second rachat n''a créé aucun membre');
end;
$$;

-- =============================================================================
-- 5. Déjà membre : refus PROPRE, et le code survit
-- =============================================================================
select public.__devenir(public.__id('u_a'));

do $$
declare v_code text := (select code from public.t_codes where cle = 'libre');
begin
  perform public.__refus(
    format('select public.racheter_invitation(%L, %L)', v_code, 'Amina'),
    'P0012', 'une enseignante déjà membre rachète un code');

  -- Le code n'a pas été brûlé pour rien : il reste rachetable par un compte
  -- encore libre.
  perform public.__devenir(public.__id('u_libre'));
  perform public.__accepte(
    format('select public.racheter_invitation(%L, %L)', v_code, 'Autre'),
    'le code refusé à un membre reste utilisable pour un compte libre');
end;
$$;

-- =============================================================================
-- 6. Révocation
-- =============================================================================
reset role;
select public.__inviter('a_revoquer_2');

set local role authenticated;

do $$
declare v_id uuid := (select invitation_id from public.t_codes where cle = 'a_revoquer_2');
begin
  -- Une enseignante ne révoque rien.
  perform public.__devenir(public.__id('u_a'));
  perform public.__refus(format('select public.revoquer_invitation(%L)', v_id),
    'P0010', 'une enseignante révoque une invitation');

  -- Le responsable d'un AUTRE centre non plus — il ne la voit même pas.
  perform public.__devenir(public.__id('u_r2'));
  perform public.__refus(format('select public.revoquer_invitation(%L)', v_id),
    'P0011', 'R2 révoque une invitation du centre Alpha');

  -- Le responsable du centre, oui — et une seule fois.
  perform public.__devenir(public.__id('u_r1'));
  perform public.__accepte(format('select public.revoquer_invitation(%L)', v_id),
    'R1 révoque son invitation');

  perform public.__refus(format('select public.revoquer_invitation(%L)', v_id),
    'P0011', 'R1 révoque deux fois la même invitation');
end;
$$;

-- =============================================================================
-- 7. Étanchéité de la table
-- =============================================================================
-- Sans invitation chez Beta, l'assertion d'étanchéité ci-dessous serait vraie
-- quelle que soit la policy — y compris `using (true)`. On lui donne quelque
-- chose à ne pas voir.
reset role;
select public.__inviter('chez_beta', 'u_r2');

set local role authenticated;

do $$
begin
  -- R1 voit les siennes, et seulement les siennes.
  perform public.__devenir(public.__id('u_r1'));

  if not exists (select 1 from public.t_codes where cle = 'chez_beta') then
    raise exception 'Décor incomplet : aucune invitation du centre Beta à masquer.';
  end if;

  perform public.__attendre(
    format('select count(*) from public.invitation where centre_id <> %L', public.__id('c_alpha')),
    0::bigint, 'R1 voit une invitation d''un autre centre');

  -- Et il ne peut pas la révoquer : le même message qu'un identifiant inconnu,
  -- donc pas d'oracle d'existence entre centres.
  perform public.__refus(
    format('select public.revoquer_invitation(%L)',
           (select invitation_id from public.t_codes where cle = 'chez_beta')),
    'P0011', 'R1 révoque une invitation du centre Beta');

  -- Mais pas l'empreinte : elle ne sort jamais de la base.
  perform public.__refus_droit('select code_hash from public.invitation',
    'R1 lit `code_hash`');

  -- Et il n'écrit pas la table à la main : tout passe par les fonctions.
  perform public.__refus_droit(
    format($sql$insert into public.invitation (centre_id, code_hash, expire_le)
                values (%L, 'x', now() + interval '1 day')$sql$, public.__id('c_alpha')),
    'R1 insère une invitation directement');

  perform public.__refus_droit('update public.invitation set utilise_le = null',
    'R1 réarme une invitation directement');

  perform public.__refus_droit('delete from public.invitation',
    'R1 supprime une invitation directement');

  -- `empreinte_code` reste fermée : l'ouvrir donnerait un oracle à codes. Elle
  -- n'est plus `security definer` — ce `revoke` est donc sa seule protection,
  -- raison de plus pour le tenir sous test.
  perform public.__refus_droit($sql$select public.empreinte_code('ABCD')$sql$,
    'un authentifié calcule une empreinte de code');

  perform public.__refus_droit($sql$select public.normaliser_code('ABCD')$sql$,
    'un authentifié normalise un code');
end;
$$;

reset role;
set local role anon;

do $$
begin
  perform public.__refus_droit('select 1 from public.invitation', 'anon lit `invitation`');
  perform public.__refus_droit('select public.creer_invitation(7)',
    'anon crée une invitation');
  perform public.__refus_droit($sql$select public.racheter_invitation('X', 'Y')$sql$,
    'anon rachète un code');
  perform public.__refus_droit($sql$select public.revoquer_invitation(gen_random_uuid())$sql$,
    'anon révoque une invitation');
end;
$$;

-- =============================================================================
-- 8. La forme de la revendication
--
-- Le verrou de ligne d'un UPDATE unique est ce qui rend l'usage vraiment unique
-- sous concurrence : la seconde transaction attend, puis réévalue son `where`
-- sur la ligne modifiée et ne touche rien. La régression à craindre n'est pas
-- un mauvais message, c'est une réécriture en « select … puis update » — qui
-- rouvrirait la course sans qu'aucun test de comportement séquentiel ne s'en
-- aperçoive. On vérifie donc la FORME de la fonction.
-- =============================================================================
reset role;

do $$
declare v_corps text;
begin
  select pg_get_functiondef(p.oid) into v_corps
  from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'racheter_invitation';

  if v_corps !~ 'update public\.invitation' then
    raise exception 'La revendication doit être un UPDATE sur `invitation`.';
  end if;
  if v_corps !~ 'utilise_le is null' then
    raise exception 'La garde `utilise_le is null` doit vivre dans le `where` de l''UPDATE.';
  end if;
  if v_corps !~ 'returning centre_id, role' then
    raise exception 'Le centre et le rôle doivent venir du `returning` de l''UPDATE, pas d''une lecture séparée.';
  end if;
  if v_corps ~ 'select\s+centre_id\s*,\s*role\s+into' then
    raise exception 'FAILLE : lecture-puis-écriture détectée — la course d''usage unique est rouverte.';
  end if;

  -- Cette branche est ce qui empêche de brûler un code quand deux rachats
  -- concurrents visent le MÊME compte : elle lève, donc annule la revendication.
  -- Une vraie course ne s'éprouve pas en une transaction ; on tient au moins sa
  -- présence.
  if v_corps !~ 'when unique_violation' then
    raise exception 'Le rattrapage de `unique_violation` a disparu : un rachat concurrent brûlerait le code.';
  end if;
end;
$$;

select '✅ TOUTES LES ASSERTIONS PASSENT — invitation par code' as resultat;

rollback;
