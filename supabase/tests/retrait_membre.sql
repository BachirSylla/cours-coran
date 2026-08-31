-- =============================================================================
-- retrait_membre.sql — sortir quelqu'un du centre sans rien perdre
--
-- Deux choses à prouver, et la seconde est la plus importante :
--
--   1. QUI peut retirer QUI — un enseignant personne, un responsable les
--      membres de SON centre, jamais le dernier responsable, jamais soi-même ;
--   2. que le retrait ne détruit AUCUNE donnée pédagogique. Séances, présences,
--      notes de récitation et d'examen pendent du COURS, pas du membre : elles
--      doivent être là, au comptage près, après le départ.
--
-- Tout se déroule dans une transaction ANNULÉE à la fin.
--
-- Exécution :
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/retrait_membre.sql
--
-- Succès = aucune exception, et la ligne finale « TOUTES LES ASSERTIONS PASSENT ».
-- =============================================================================

\set ON_ERROR_STOP on
begin;

-- -----------------------------------------------------------------------------
-- Outillage
-- -----------------------------------------------------------------------------
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
    raise exception 'ÉCART — % : % au lieu de %', p_message, v_n, p_attendu;
  end if;
end;
$$;

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
--   Centre ALPHA : R1 responsable, R2 responsable, A et B enseignants
--   Centre BETA  : R3 responsable
--
--   A enseigne deux cours, chargés de séances, présences, notes et examens.
--   Deux responsables dans Alpha : sans cela, aucun retrait de responsable ne
--   serait testable — le trigger refuserait toujours.
-- -----------------------------------------------------------------------------
create table public.t_ids (cle text primary key, val uuid);
grant select on public.t_ids to authenticated;

insert into public.t_ids (cle, val)
values ('u_r1', gen_random_uuid()), ('u_r2', gen_random_uuid()),
       ('u_a', gen_random_uuid()), ('u_b', gen_random_uuid()),
       ('u_r3', gen_random_uuid());

insert into auth.users (id, email)
select val, cle || '@retrait.invalid' from public.t_ids;

insert into public.centre (nom) values ('Alpha'), ('Beta');

insert into public.t_ids (cle, val)
select 'c_alpha', id from public.centre where nom = 'Alpha'
union all select 'c_beta', id from public.centre where nom = 'Beta';

create function public.__id(p_cle text) returns uuid
language sql stable as $$ select val from public.t_ids where cle = p_cle $$;

insert into public.membre (centre_id, user_id, role, nom_affiche) values
  (public.__id('c_alpha'), public.__id('u_r1'), 'responsable', 'R1'),
  (public.__id('c_alpha'), public.__id('u_r2'), 'responsable', 'R2'),
  (public.__id('c_alpha'), public.__id('u_a'),  'enseignant',  'Amina'),
  (public.__id('c_alpha'), public.__id('u_b'),  'enseignant',  'Bilal'),
  (public.__id('c_beta'),  public.__id('u_r3'), 'responsable', 'R3');

-- Deux cours pour Amina, un pour Bilal.
insert into public.cours (centre_id, enseignant_id, libelle, type_cours_id, format, date_debut)
select public.__id('c_alpha'), public.__id('u_a'), 'Amina-1', id, 'groupe', '2026-01-05'
from public.type_cours limit 1;

insert into public.cours (centre_id, enseignant_id, libelle, type_cours_id, format, date_debut)
select public.__id('c_alpha'), public.__id('u_a'), 'Amina-2', id, 'individuel', '2026-01-05'
from public.type_cours limit 1;

insert into public.cours (centre_id, enseignant_id, libelle, type_cours_id, format, date_debut)
select public.__id('c_alpha'), public.__id('u_b'), 'Bilal-1', id, 'groupe', '2026-01-05'
from public.type_cours limit 1;

insert into public.t_ids (cle, val)
select 'cours_a1', id from public.cours where libelle = 'Amina-1'
union all select 'cours_a2', id from public.cours where libelle = 'Amina-2'
union all select 'cours_b1', id from public.cours where libelle = 'Bilal-1';

/*
 * Des CRÉNEAUX — sans eux, aucun chevauchement n'est possible et le garde-fou
 * §5.1 ne pourrait rien attraper. Ils sont posés pour qu'aucune réaffectation
 * du scénario nominal ne crée de collision : Amina lundi et mardi, Bilal jeudi.
 */
insert into public.creneau (centre_id, cours_id, jour_semaine, heure_debut, heure_fin) values
  (public.__id('c_alpha'), public.__id('cours_a1'), 1, '09:00', '10:00'),
  (public.__id('c_alpha'), public.__id('cours_a2'), 2, '14:00', '15:00'),
  (public.__id('c_alpha'), public.__id('cours_b1'), 4, '09:00', '10:00');

insert into public.apprenant (centre_id, nom, prenom)
values (public.__id('c_alpha'), 'Diallo', 'Aïcha');

insert into public.t_ids (cle, val)
select 'app', id from public.apprenant where nom = 'Diallo';

-- Le travail d'Amina : inscriptions notées, séances, présences avec notes.
insert into public.inscription (centre_id, apprenant_id, cours_id, note_examen, examen_bareme)
values (public.__id('c_alpha'), public.__id('app'), public.__id('cours_a1'), 15, 20),
       (public.__id('c_alpha'), public.__id('app'), public.__id('cours_a2'), 12, 20);

insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut, contenu_aborde)
values (public.__id('c_alpha'), public.__id('cours_a1'), '2026-01-05', '09:00', '10:00', 'faite', 'Leçon 1'),
       (public.__id('c_alpha'), public.__id('cours_a1'), '2026-01-12', '09:00', '10:00', 'faite', 'Leçon 2'),
       (public.__id('c_alpha'), public.__id('cours_a2'), '2026-01-06', '14:00', '15:00', 'faite', 'Leçon 1');

insert into public.presence (centre_id, seance_id, apprenant_id, present, etat, note, note_bareme)
select public.__id('c_alpha'), s.id, public.__id('app'), true, 'present', 17, 20
from public.seance as s
where s.cours_id in (public.__id('cours_a1'), public.__id('cours_a2'));

-- =============================================================================
-- Le comptage AVANT — l'invariant central de ce lot
-- =============================================================================
create table public.t_avant (cle text primary key, valeur bigint);

insert into public.t_avant (cle, valeur)
select 'seances', count(*) from public.seance
where cours_id in (public.__id('cours_a1'), public.__id('cours_a2'));

insert into public.t_avant (cle, valeur)
select 'presences', count(*) from public.presence
where cours_id in (public.__id('cours_a1'), public.__id('cours_a2'));

insert into public.t_avant (cle, valeur)
select 'notes', count(*) from public.presence
where cours_id in (public.__id('cours_a1'), public.__id('cours_a2')) and note is not null;

insert into public.t_avant (cle, valeur)
select 'examens', count(*) from public.inscription
where cours_id in (public.__id('cours_a1'), public.__id('cours_a2')) and note_examen is not null;

insert into public.t_avant (cle, valeur)
select 'cours', count(*) from public.cours
where id in (public.__id('cours_a1'), public.__id('cours_a2'));

create function public.__avant(p_cle text) returns bigint
language sql stable as $$ select valeur from public.t_avant where cle = p_cle $$;

-- =============================================================================
-- 1. Qui n'a pas le droit
-- =============================================================================
set local role authenticated;

do $$
begin
  -- Une enseignante ne retire personne, pas même un autre enseignant.
  perform public.__devenir(public.__id('u_a'));
  perform public.__refus(
    format('select public.retirer_membre(%L, %L)', public.__id('u_b'), public.__id('u_a')),
    'P0030', 'Amina, enseignante, retire un collègue');

  perform public.__devenir(public.__id('u_r1'));

  -- On ne se retire pas soi-même — et le message doit parler de ÇA, pas du
  -- « dernier responsable » que le trigger invoquerait.
  perform public.__refus(
    format('select public.retirer_membre(%L, %L)', public.__id('u_r1'), public.__id('u_r2')),
    'P0030', 'R1 se retire lui-même');

  -- Un membre d'un autre centre est « introuvable », sans distinguer les deux
  -- cas : pas d'oracle d'existence inter-centres.
  perform public.__refus(
    format('select public.retirer_membre(%L, null)', public.__id('u_r3')),
    'P0031', 'R1 retire le responsable du centre Beta');

  perform public.__refus(
    format('select public.retirer_membre(%L, null)', gen_random_uuid()),
    'P0031', 'R1 retire un compte qui n''est membre de rien');

  -- La cible de réaffectation subit les mêmes contrôles.
  perform public.__refus(
    format('select public.retirer_membre(%L, %L)', public.__id('u_a'), public.__id('u_r3')),
    'P0031', 'R1 réaffecte les cours à un membre du centre Beta');

  perform public.__refus(
    format('select public.retirer_membre(%L, %L)', public.__id('u_a'), public.__id('u_a')),
    'P0031', 'R1 réaffecte les cours au membre qui part');

  -- Et dans l'autre sens : R3 (Beta) ne touche pas au centre Alpha.
  perform public.__devenir(public.__id('u_r3'));
  perform public.__refus(
    format('select public.retirer_membre(%L, null)', public.__id('u_a')),
    'P0031', 'R3 retire un membre du centre Alpha');

  perform public.__devenir(public.__id('u_r1'));

  -- Aucun de ces refus n'a touché quoi que ce soit.
  -- Quatre, et non cinq : R1 ne voit que SON centre. R3 (Beta) lui est invisible.
  perform public.__attendre('select count(*) from public.membre', 4::bigint,
    'un retrait refusé ne supprime aucun membre');
  perform public.__attendre(
    format('select count(*) from public.cours where enseignant_id = %L', public.__id('u_a')),
    2::bigint, 'un retrait refusé ne déplace aucun cours');
end;
$$;

-- =============================================================================
-- 2. Le dernier responsable — refusé PROPREMENT, et pour la bonne raison
--
-- Ce contrôle n'est atteignable que si l'on place « pas soi-même » APRÈS lui :
-- un responsable seul ne peut viser que lui-même. Dans l'autre ordre, il
-- s'entendrait répondre « vous ne pouvez pas vous retirer » là où la vraie
-- raison — et l'action à faire — est qu'il n'y a personne pour prendre la suite.
-- =============================================================================
do $$
begin
  perform public.__devenir(public.__id('u_r1'));

  -- Alpha a deux responsables : retirer R2 doit passer.
  perform public.__accepte(
    format('select public.retirer_membre(%L, null)', public.__id('u_r2')),
    'R1 retire le second responsable');

  perform public.__attendre(
    format($sql$select count(*) from public.membre
                 where centre_id = %L and role = 'responsable'$sql$, public.__id('c_alpha')),
    1::bigint, 'Alpha n''a plus qu''un responsable');

  -- R1 est désormais seul : c'est le dernier responsable qui parle, pas la
  -- garde « pas soi-même ».
  perform public.__refus(
    format('select public.retirer_membre(%L, null)', public.__id('u_r1')),
    'P0032', 'le dernier responsable se retire lui-même');
end;
$$;

-- On remet un second responsable — un INSERT ne déclenche pas le trigger de
-- suppression, contrairement à un `delete` qui laisserait le centre sans chef.
reset role;
insert into public.membre (centre_id, user_id, role, nom_affiche)
values (public.__id('c_alpha'), public.__id('u_r2'), 'responsable', 'R2');
set local role authenticated;

do $$
begin
  perform public.__devenir(public.__id('u_r1'));

  -- R1 n'est plus le dernier : c'est maintenant « pas soi-même » qui répond.
  perform public.__refus(
    format('select public.retirer_membre(%L, null)', public.__id('u_r1')),
    'P0030', 'R1 se retire lui-même alors qu''un autre responsable existe');

  -- Et on rend le centre à son état d'origine pour la suite.
  perform public.__accepte(
    format('select public.retirer_membre(%L, null)', public.__id('u_r2')),
    'R1 retire de nouveau R2');
end;
$$;

-- =============================================================================
-- 3. La réaffectation ne peut pas créer de double réservation
--
-- Le garde-fou de chevauchement (CLAUDE.md §5.1) vit dans `enregistrer_cours` et
-- nulle part ailleurs : un UPDATE de `enseignant_id` le contournerait. Pire, les
-- cours ainsi superposés deviendraient INEDITABLES — la sauvegarde qui voudrait
-- les séparer lèverait elle-même P0003.
-- =============================================================================
reset role;

-- Bilal reprend un cours qui tombe pile sur le sien : jeudi 09:00.
insert into public.cours (centre_id, enseignant_id, libelle, type_cours_id, format, date_debut)
select public.__id('c_alpha'), public.__id('u_a'), 'Amina-jeudi', id, 'groupe', '2026-01-05'
from public.type_cours limit 1;

insert into public.t_ids (cle, val)
select 'cours_jeudi', id from public.cours where libelle = 'Amina-jeudi';

insert into public.creneau (centre_id, cours_id, jour_semaine, heure_debut, heure_fin)
values (public.__id('c_alpha'), public.__id('cours_jeudi'), 4, '09:00', '10:00');

set local role authenticated;

do $$
begin
  perform public.__devenir(public.__id('u_r1'));

  perform public.__refus(
    format('select public.retirer_membre(%L, %L)', public.__id('u_a'), public.__id('u_b')),
    'P0033', 'la réaffectation superposerait deux cours de Bilal');

  -- Le refus n'a rien laissé derrière lui : c'est le `raise` qui annule tout.
  perform public.__attendre(
    format('select count(*) from public.membre where user_id = %L', public.__id('u_a')),
    1::bigint, 'Amina est toujours là après le refus');

  perform public.__attendre(
    format('select count(*) from public.cours where enseignant_id = %L', public.__id('u_b')),
    1::bigint, 'aucun cours n''a été transféré');
end;
$$;

-- On retire le cours gênant : la suite reprend son cours normal.
reset role;
delete from public.cours where id = public.__id('cours_jeudi');
set local role authenticated;

-- =============================================================================
-- 4. Le retrait légitime — et la preuve qu'on n'a rien perdu
-- =============================================================================
do $$
declare v_deplaces integer;
begin
  perform public.__devenir(public.__id('u_r1'));

  execute format('select public.retirer_membre(%L, %L)',
                 public.__id('u_a'), public.__id('u_b'))
  into v_deplaces;

  if v_deplaces <> 2 then
    raise exception 'La fonction doit annoncer 2 cours déplacés, elle en annonce %.', v_deplaces;
  end if;

  -- Le membre est parti…
  perform public.__attendre(
    format('select count(*) from public.membre where user_id = %L', public.__id('u_a')),
    0::bigint, 'Amina a quitté le centre');

  -- …et ses cours portent le nouvel enseignant.
  perform public.__attendre(
    format('select count(*) from public.cours where enseignant_id = %L', public.__id('u_b')),
    3::bigint, 'Bilal a repris les deux cours d''Amina, en plus du sien');

  perform public.__attendre(
    format('select count(*) from public.cours where enseignant_id is null and centre_id = %L',
           public.__id('c_alpha')),
    0::bigint, 'aucun cours n''est resté orphelin');

  -- ZÉRO PERTE — le cœur de ce lot.
  perform public.__attendre(
    format($sql$select count(*) from public.seance
                 where cours_id in (%L, %L)$sql$, public.__id('cours_a1'), public.__id('cours_a2')),
    public.__avant('seances'), 'les séances du partant sont toutes là');

  perform public.__attendre(
    format($sql$select count(*) from public.presence
                 where cours_id in (%L, %L)$sql$, public.__id('cours_a1'), public.__id('cours_a2')),
    public.__avant('presences'), 'les présences du partant sont toutes là');

  perform public.__attendre(
    format($sql$select count(*) from public.presence
                 where cours_id in (%L, %L) and note is not null$sql$,
           public.__id('cours_a1'), public.__id('cours_a2')),
    public.__avant('notes'), 'les notes de récitation du partant sont toutes là');

  perform public.__attendre(
    format($sql$select count(*) from public.inscription
                 where cours_id in (%L, %L) and note_examen is not null$sql$,
           public.__id('cours_a1'), public.__id('cours_a2')),
    public.__avant('examens'), 'les notes d''examen du partant sont toutes là');

  perform public.__attendre(
    format('select count(*) from public.cours where id in (%L, %L)',
           public.__id('cours_a1'), public.__id('cours_a2')),
    public.__avant('cours'), 'les cours du partant existent toujours');

  -- Et le repreneur peut réellement les animer : `cours_animables()` suit
  -- l'affectation, sinon le transfert serait cosmétique.
  perform public.__devenir(public.__id('u_b'));
  perform public.__accepte(
    format($sql$update public.seance set contenu_aborde = 'Repris par Bilal'
                where cours_id = %L$sql$, public.__id('cours_a1')),
    'Bilal saisit le contenu d''une séance qu''il vient de reprendre');
end;
$$;

-- Le COMPTE du partant survit — vérifiable seulement en `postgres` :
-- `auth.users` n'est lisible par aucun rôle client. C'est ce qui lui permettra
-- de revenir avec un nouveau code d'invitation.
reset role;

do $$
begin
  if not exists (select 1 from auth.users where id = public.__id('u_a')) then
    raise exception 'FAILLE : le compte auth du partant a été supprimé avec sa ligne membre.';
  end if;
end;
$$;

set local role authenticated;

-- =============================================================================
-- 5. La cible nulle — « laisser sans enseignant »
--
-- Ce n'est pas un paramètre oublié (la fonction n'a pas de défaut, l'omettre
-- échoue) : c'est un choix. Les cours passent orphelins par
-- `on delete set null`, et `cours_animables()` les rend au responsable.
-- =============================================================================
do $$
declare v_deplaces integer;
begin
  perform public.__devenir(public.__id('u_r1'));

  execute format('select public.retirer_membre(%L, null)', public.__id('u_b'))
  into v_deplaces;

  if v_deplaces <> 3 then
    raise exception 'La fonction doit annoncer 3 cours concernés, elle en annonce %.', v_deplaces;
  end if;

  perform public.__attendre(
    format('select count(*) from public.cours where enseignant_id is null and centre_id = %L',
           public.__id('c_alpha')),
    3::bigint, 'les trois cours sont devenus orphelins');

  -- Et rien n'est gelé : `cours_animables()` les rend au responsable.
  perform public.__attendre(
    'select array_length((select public.cours_animables()), 1)::bigint',
    3::bigint, 'le responsable récupère les cours orphelins');

  perform public.__accepte(
    format($sql$insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin)
                values (%L, %L, '2026-02-02', '09:00', '10:00')$sql$,
           public.__id('c_alpha'), public.__id('cours_a1')),
    'R1 écrit une séance sur un cours devenu orphelin');

  -- Et toujours rien de perdu, après ce second retrait.
  perform public.__attendre(
    format($sql$select count(*) from public.presence
                 where cours_id in (%L, %L) and note is not null$sql$,
           public.__id('cours_a1'), public.__id('cours_a2')),
    public.__avant('notes'), 'les notes survivent au second retrait');
end;
$$;

-- =============================================================================
-- 6. Ni `anon`, ni l'écriture directe
-- =============================================================================
do $$
begin
  perform public.__devenir(public.__id('u_r1'));

  -- La table reste fermée : aucun `grant delete`, aucune policy de suppression.
  begin
    execute format('delete from public.membre where user_id = %L', public.__id('u_r1'));
    raise exception 'FAILLE : un client a supprimé une ligne `membre` directement.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    execute format('select public.retirer_membre(%L, null)', gen_random_uuid());
    raise exception 'FAILLE : `anon` peut appeler `retirer_membre`.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select '✅ TOUTES LES ASSERTIONS PASSENT — retrait de membre, zéro perte' as resultat;

rollback;
