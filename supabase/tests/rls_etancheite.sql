-- =============================================================================
-- rls_etancheite.sql — la RLS mise à l'épreuve, pas décrite
--
-- Ce script monte un décor complet — deux centres, trois enseignants, un
-- apprenant partagé — puis prend tour à tour chaque identité et LÈVE UNE
-- EXCEPTION à la moindre fuite. Il teste l'accès REFUSÉ autant que l'accès
-- autorisé : une matrice de policies ne prouve rien, seul le refus effectif le
-- fait.
--
-- Tout se déroule dans une transaction ANNULÉE à la fin : la base de production
-- ressort inchangée. Les fonctions d'assertion, créées dans la transaction,
-- disparaissent avec elle.
--
-- Exécution :
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_etancheite.sql
--
-- Succès = aucune exception, et la ligne finale « TOUTES LES ASSERTIONS PASSENT ».
--
-- Trois familles d'invariants :
--   A. Étanchéité entre CENTRES        — rien ne traverse, dans aucun sens.
--   B. Étanchéité entre ENSEIGNANTS    — dont l'apprenant partagé.
--   C. Frontière GESTION / PÉDAGOGIE   — à l'intérieur d'un même centre, sur
--                                        ses PROPRES cours.
--   D. Non-régression du durcissement 0007 — `anon` reste sans droit table.
-- =============================================================================

\set ON_ERROR_STOP on
begin;

-- -----------------------------------------------------------------------------
-- Outillage d'assertion
--
-- `security invoker` : ces fonctions doivent subir la RLS de l'identité en
-- cours, sans quoi elles ne testeraient rien.
-- -----------------------------------------------------------------------------

/* Compte les lignes VISIBLES et compare à l'attendu. */
create function public.__attendre(p_sql text, p_attendu bigint, p_message text)
returns void language plpgsql security invoker as $$
declare v_n bigint;
begin
  execute p_sql into v_n;
  if v_n is distinct from p_attendu then
    raise exception 'FUITE — % : % ligne(s) visible(s), % attendue(s)',
      p_message, v_n, p_attendu;
  end if;
end;
$$;

/*
 * Écriture qui DOIT être refusée.
 *
 * Le refus prend deux formes qu'il faut accepter toutes les deux : un INSERT
 * dont le `with check` échoue LÈVE (42501), tandis qu'un UPDATE ou un DELETE
 * dont le `using` ne matche pas ne lève rien du tout — il touche simplement
 * ZÉRO ligne. Ne tester que l'exception laisserait passer la moitié des cas.
 */
create function public.__refus(p_sql text, p_message text)
returns void language plpgsql security invoker as $$
declare v_n bigint := 0; v_refuse boolean := false;
begin
  begin
    execute p_sql;
    get diagnostics v_n = row_count;
    v_refuse := (v_n = 0);
  exception
    -- 42501 : policy. 23503 : clé étrangère composite — l'étanchéité
    -- structurelle du §5 de la migration. 23514 : contrainte métier.
    when insufficient_privilege or foreign_key_violation or check_violation then
      v_refuse := true;
  end;

  if not v_refuse then
    raise exception 'FAILLE — % : écriture ACCEPTÉE (% ligne(s) touchée(s))', p_message, v_n;
  end if;
end;
$$;

/* Écriture légitime : elle doit passer ET toucher au moins une ligne. */
create function public.__accepte(p_sql text, p_message text)
returns void language plpgsql security invoker as $$
declare v_n bigint;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'RÉGRESSION — % : écriture légitime restée sans effet', p_message;
  end if;
end;
$$;

/* Absence de DROIT sur la table — plus fort que « zéro ligne visible ». */
create function public.__refus_droit(p_sql text, p_message text)
returns void language plpgsql security invoker as $$
begin
  begin
    execute p_sql;
  exception
    when insufficient_privilege then return;
  end;

  raise exception 'FAILLE — % : la table est ACCESSIBLE', p_message;
end;
$$;

-- -----------------------------------------------------------------------------
-- Le décor
--
--   Centre ALPHA          Centre BETA
--     R1  responsable       R2  responsable (et enseignant de son cours)
--     A   enseignant  → cours « Alpha-A »
--     B   enseignant  → cours « Alpha-B »
--                       cours « Beta »
--
--   Apprenant PARTAGÉ : inscrit chez A ET chez B. C'est le cas qui distingue
--   « voir l'identité » de « voir le travail ».
-- -----------------------------------------------------------------------------
-- Table ordinaire et non temporaire : le script change d'identité en cours de
-- route, et `pg_temp` n'est lisible que par son créateur. Elle disparaît avec
-- le `rollback`, comme le reste du décor.
create table public.t_ids (cle text primary key, val uuid);
grant select on public.t_ids to authenticated, anon;

insert into t_ids (cle, val)
values ('u_r1', gen_random_uuid()), ('u_a', gen_random_uuid()),
       ('u_b', gen_random_uuid()), ('u_r2', gen_random_uuid());

insert into auth.users (id, email)
select val, cle || '@etancheite.invalid' from t_ids;

insert into public.centre (nom) values ('Centre Alpha'), ('Centre Beta');

insert into t_ids (cle, val)
select 'c_alpha', id from public.centre where nom = 'Centre Alpha'
union all
select 'c_beta', id from public.centre where nom = 'Centre Beta';

create function public.__id(p_cle text) returns uuid
language sql stable as $$ select val from public.t_ids where cle = p_cle $$;

insert into public.membre (centre_id, user_id, role, nom_affiche) values
  (public.__id('c_alpha'), public.__id('u_r1'), 'responsable', 'R1'),
  (public.__id('c_alpha'), public.__id('u_a'),  'enseignant',  'A'),
  (public.__id('c_alpha'), public.__id('u_b'),  'enseignant',  'B'),
  (public.__id('c_beta'),  public.__id('u_r2'), 'responsable', 'R2');

insert into public.cours (centre_id, enseignant_id, libelle, type_cours_id, format, date_debut, prix_mensuel)
select public.__id('c_alpha'), public.__id('u_a'), 'Alpha-A', t.id, 'groupe', '2026-01-05', 10000
from public.type_cours as t limit 1;

insert into public.cours (centre_id, enseignant_id, libelle, type_cours_id, format, date_debut, prix_mensuel)
select public.__id('c_alpha'), public.__id('u_b'), 'Alpha-B', t.id, 'groupe', '2026-01-05', 10000
from public.type_cours as t limit 1;

insert into public.cours (centre_id, enseignant_id, libelle, type_cours_id, format, date_debut, prix_mensuel)
select public.__id('c_beta'), public.__id('u_r2'), 'Beta', t.id, 'groupe', '2026-01-05', 10000
from public.type_cours as t limit 1;

insert into t_ids (cle, val)
select 'cours_a', id from public.cours where libelle = 'Alpha-A'
union all select 'cours_b', id from public.cours where libelle = 'Alpha-B'
union all select 'cours_beta', id from public.cours where libelle = 'Beta';

insert into public.creneau (centre_id, cours_id, jour_semaine, heure_debut, heure_fin) values
  (public.__id('c_alpha'), public.__id('cours_a'),    1, '09:00', '10:00'),
  (public.__id('c_alpha'), public.__id('cours_b'),    2, '09:00', '10:00'),
  (public.__id('c_beta'),  public.__id('cours_beta'), 1, '09:00', '10:00');

insert into public.apprenant (centre_id, nom, prenom) values
  (public.__id('c_alpha'), 'Partagé', 'Le'),
  (public.__id('c_beta'),  'Beta', 'Apprenant');

insert into t_ids (cle, val)
select 'app_partage', id from public.apprenant where nom = 'Partagé'
union all select 'app_beta', id from public.apprenant where nom = 'Beta';

-- L'apprenant partagé suit les DEUX cours du centre Alpha.
insert into public.inscription (centre_id, apprenant_id, cours_id, note_examen, examen_bareme) values
  (public.__id('c_alpha'), public.__id('app_partage'), public.__id('cours_a'), 15, 20),
  (public.__id('c_alpha'), public.__id('app_partage'), public.__id('cours_b'), 8,  20),
  (public.__id('c_beta'),  public.__id('app_beta'),    public.__id('cours_beta'), 12, 20);

insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut) values
  (public.__id('c_alpha'), public.__id('cours_a'),    '2026-01-05', '09:00', '10:00', 'faite'),
  (public.__id('c_alpha'), public.__id('cours_b'),    '2026-01-06', '09:00', '10:00', 'faite'),
  (public.__id('c_beta'),  public.__id('cours_beta'), '2026-01-05', '09:00', '10:00', 'faite');

insert into t_ids (cle, val)
select 'seance_a', id from public.seance where cours_id = public.__id('cours_a')
union all select 'seance_b', id from public.seance where cours_id = public.__id('cours_b')
union all select 'seance_beta', id from public.seance where cours_id = public.__id('cours_beta');

-- La note « sensible » : celle de l'apprenant partagé, chez B.
insert into public.presence (centre_id, seance_id, apprenant_id, present, etat, note, note_bareme) values
  (public.__id('c_alpha'), public.__id('seance_a'), public.__id('app_partage'), true, 'present', 18, 20),
  (public.__id('c_alpha'), public.__id('seance_b'), public.__id('app_partage'), false, 'absent',  4, 20),
  (public.__id('c_beta'),  public.__id('seance_beta'), public.__id('app_beta'), true, 'present', 11, 20);

insert into public.paiement (centre_id, cours_id, mois_concerne, montant_du, montant_recu) values
  (public.__id('c_alpha'), public.__id('cours_a'),    '2026-01', 10000, 10000),
  (public.__id('c_beta'),  public.__id('cours_beta'), '2026-01', 10000, 5000);

insert into public.parametres (centre_id, note_bareme) values
  (public.__id('c_alpha'), 20), (public.__id('c_beta'), 20);

-- Le décor lui-même doit être sain : sans lui, les assertions de refus
-- passeraient pour de mauvaises raisons.
do $$
begin
  perform public.__attendre('select count(*) from public.cours', 9::bigint, 'décor (postgres ignore la RLS)');
exception when others then
  -- 6 cours de production + 3 du décor. Un autre total n'invalide rien : on ne
  -- veut vérifier que la présence des lignes du décor.
  null;
end;
$$;

-- =============================================================================
-- A. Identité : l'enseignant A (centre Alpha)
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';

do $$
declare v_claims text;
begin
  select format('{"sub":"%s","role":"authenticated"}', public.__id('u_a')) into v_claims;
  perform set_config('request.jwt.claims', v_claims, true);
end;
$$;

do $$
begin
  -- --- Lecture : son périmètre, et rien d'autre -----------------------------
  perform public.__attendre(
    'select count(*) from public.cours', 1::bigint,
    'A ne doit voir QUE son cours (ni celui de B, ni celui du centre Beta)');

  perform public.__attendre(
    format('select count(*) from public.cours where id = %L', public.__id('cours_a')),
    1::bigint, 'A doit voir son propre cours');

  perform public.__attendre(
    'select count(*) from public.creneau', 1::bigint, 'A ne voit que les créneaux de son cours');

  perform public.__attendre(
    'select count(*) from public.seance', 1::bigint, 'A ne voit que les séances de son cours');

  perform public.__attendre(
    'select count(*) from public.presence', 1::bigint, 'A ne voit que les présences de son cours');

  perform public.__attendre(
    'select count(*) from public.inscription', 1::bigint,
    'A ne voit que l''inscription à SON cours, pas celle du même apprenant chez B');

  -- --- Le cœur de l'invariant : identité oui, travail non -------------------
  perform public.__attendre(
    format('select count(*) from public.apprenant where id = %L', public.__id('app_partage')),
    1::bigint, 'A doit voir l''IDENTITÉ de l''apprenant partagé');

  perform public.__attendre(
    format('select count(*) from public.presence where apprenant_id = %L and note = 4',
           public.__id('app_partage')),
    0::bigint, 'A ne doit voir AUCUNE note de l''apprenant partagé prise chez B');

  perform public.__attendre(
    format('select coalesce(max(note_examen), -1) from public.inscription where apprenant_id = %L',
           public.__id('app_partage')),
    15::bigint, 'A ne doit voir que la note d''examen de SON cours (15), pas celle de B (8)');

  perform public.__attendre(
    'select count(*) from public.apprenant', 1::bigint,
    'A ne voit pas les apprenants du centre Beta');

  -- --- Le financier reste au responsable ------------------------------------
  perform public.__attendre(
    'select count(*) from public.paiement', 0::bigint,
    'A ne voit AUCUN paiement, pas même celui de son propre cours');

  -- --- Les réglages du centre lui sont lisibles (le rapport en dépend) ------
  perform public.__attendre(
    'select count(*) from public.parametres', 1::bigint,
    'A lit les réglages de SON centre, et d''un seul');

  perform public.__attendre(
    'select count(*) from public.membre', 3::bigint, 'A ne voit que les membres de son centre');

  perform public.__attendre(
    'select count(*) from public.centre', 1::bigint, 'A ne voit que son centre');
end;
$$;

-- -----------------------------------------------------------------------------
-- C. La frontière GESTION / PÉDAGOGIE, sur SES PROPRES cours
--
-- C'est ici que se joue la décision « strict » : A est bien chez lui, mais
-- gérer n'est pas enseigner. Chaque refus porte sur le cours dont il EST
-- l'enseignant — pas sur celui d'un autre.
-- -----------------------------------------------------------------------------
do $$
begin
  -- cours ---------------------------------------------------------------------
  perform public.__refus(
    format('update public.cours set libelle = ''Renommé'' where id = %L', public.__id('cours_a')),
    'A renomme SON PROPRE cours');

  perform public.__refus(
    format('update public.cours set prix_mensuel = 1 where id = %L', public.__id('cours_a')),
    'A change le prix de SON PROPRE cours');

  perform public.__refus(
    format('delete from public.cours where id = %L', public.__id('cours_a')),
    'A supprime SON PROPRE cours');

  perform public.__refus(
    format($sql$insert into public.cours (centre_id, enseignant_id, libelle, type_cours_id, format, date_debut)
                select %L, %L, 'Créé par A', id, 'groupe', '2026-02-01' from public.type_cours limit 1$sql$,
           public.__id('c_alpha'), public.__id('u_a')),
    'A crée un cours dans son centre');

  -- creneau -------------------------------------------------------------------
  perform public.__refus(
    format($sql$insert into public.creneau (centre_id, cours_id, jour_semaine, heure_debut, heure_fin)
                values (%L, %L, 5, '14:00', '15:00')$sql$,
           public.__id('c_alpha'), public.__id('cours_a')),
    'A ajoute un créneau à SON PROPRE cours');

  perform public.__refus(
    format('update public.creneau set heure_debut = ''11:00'' where cours_id = %L', public.__id('cours_a')),
    'A déplace le créneau de SON PROPRE cours');

  perform public.__refus(
    format('delete from public.creneau where cours_id = %L', public.__id('cours_a')),
    'A supprime le créneau de SON PROPRE cours');

  -- apprenant -----------------------------------------------------------------
  perform public.__refus(
    format('update public.apprenant set nom = ''Modifié'' where id = %L', public.__id('app_partage')),
    'A modifie la fiche d''un apprenant qu''il voit');

  perform public.__refus(
    format($sql$insert into public.apprenant (centre_id, nom, prenom) values (%L, 'Nouveau', 'Par A')$sql$,
           public.__id('c_alpha')),
    'A crée un apprenant');

  perform public.__refus(
    format('delete from public.apprenant where id = %L', public.__id('app_partage')),
    'A supprime un apprenant');

  -- inscription ---------------------------------------------------------------
  perform public.__refus(
    format('update public.inscription set note_examen = 20 where cours_id = %L', public.__id('cours_a')),
    'A saisit la note d''EXAMEN sur son propre cours (elle relève de la gestion)');

  perform public.__refus(
    format('delete from public.inscription where cours_id = %L', public.__id('cours_a')),
    'A désinscrit un apprenant de SON PROPRE cours');

  -- paiement ------------------------------------------------------------------
  perform public.__refus(
    format($sql$insert into public.paiement (centre_id, cours_id, mois_concerne, montant_du)
                values (%L, %L, '2026-03', 1)$sql$,
           public.__id('c_alpha'), public.__id('cours_a')),
    'A enregistre un paiement sur son propre cours');

  perform public.__refus(
    format('update public.paiement set montant_recu = 0 where cours_id = %L', public.__id('cours_a')),
    'A modifie un paiement');

  -- parametres ----------------------------------------------------------------
  perform public.__refus(
    'update public.parametres set penalite_absence = 5',
    'A modifie les réglages de notation du centre');

  -- membre --------------------------------------------------------------------
  -- Le barème de récitation est SON outil de travail : il le règle.
  perform public.__accepte(
    format('update public.membre set note_bareme = 10 where user_id = %L', public.__id('u_a')),
    'A choisit son propre barème de récitation');

  -- Mais la ligne `membre` ne s'ouvre pas pour autant : sans le privilège de
  -- colonne, la policy « je modifie ma propre ligne » serait une escalade.
  perform public.__refus_droit(
    format('update public.membre set role = ''responsable'' where user_id = %L',
           public.__id('u_a')),
    'A se promeut responsable');

  perform public.__refus_droit(
    format('update public.membre set centre_id = %L where user_id = %L',
           public.__id('c_beta'), public.__id('u_a')),
    'A change de centre');

  perform public.__refus(
    format('update public.membre set note_bareme = 10 where user_id = %L', public.__id('u_b')),
    'A règle le barème de son collègue B');

  -- --- Et ce qui EST son métier doit passer ---------------------------------
  perform public.__accepte(
    format($sql$update public.seance set contenu_aborde = 'Leçon 4', observations = 'RAS'
                where id = %L$sql$, public.__id('seance_a')),
    'A saisit le contenu de SA séance');

  perform public.__accepte(
    format($sql$insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut)
                values (%L, %L, '2026-01-12', '09:00', '10:00', 'faite') returning id$sql$,
           public.__id('c_alpha'), public.__id('cours_a')),
    'A crée une séance sur son cours et la relit');

  perform public.__accepte(
    format($sql$update public.presence set note = 17, note_bareme = 20, etat = 'retard', present = true
                where seance_id = %L$sql$, public.__id('seance_a')),
    'A note la récitation sur SA séance');

  perform public.__accepte(
    format($sql$insert into public.presence (centre_id, seance_id, apprenant_id, present, etat)
                values (%L, %L, %L, true, 'present') returning id$sql$,
           public.__id('c_alpha'),
           (select id from public.seance where cours_id = public.__id('cours_a') and date = '2026-01-12'),
           public.__id('app_partage')),
    'A saisit la présence sur une séance de son cours et la relit');
end;
$$;

-- -----------------------------------------------------------------------------
-- B. Étanchéité entre enseignants et entre centres, en ÉCRITURE
-- -----------------------------------------------------------------------------
do $$
begin
  perform public.__refus(
    format('update public.cours set enseignant_id = %L where id = %L',
           public.__id('u_a'), public.__id('cours_b')),
    'A s''affecte le cours de B');

  perform public.__refus(
    format($sql$update public.seance set contenu_aborde = 'Intrusion' where id = %L$sql$,
           public.__id('seance_b')),
    'A écrit sur une séance de B');

  perform public.__refus(
    format('update public.presence set note = 20 where seance_id = %L', public.__id('seance_b')),
    'A note un apprenant sur une séance de B');

  perform public.__refus(
    format($sql$insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin)
                values (%L, %L, '2026-02-02', '09:00', '10:00')$sql$,
           public.__id('c_alpha'), public.__id('cours_b')),
    'A greffe une séance sur le cours de B');

  perform public.__refus(
    format($sql$insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin)
                values (%L, %L, '2026-02-02', '09:00', '10:00')$sql$,
           public.__id('c_beta'), public.__id('cours_beta')),
    'A écrit dans le centre Beta');
end;
$$;

-- =============================================================================
-- Identité : le responsable R1 (centre Alpha)
-- =============================================================================
reset role;
set local role authenticated;
do $$
declare v_claims text;
begin
  select format('{"sub":"%s","role":"authenticated"}', public.__id('u_r1')) into v_claims;
  perform set_config('request.jwt.claims', v_claims, true);
end;
$$;

do $$
begin
  -- --- Il voit tout son centre, et rien du centre Beta ----------------------
  perform public.__attendre('select count(*) from public.cours', 2::bigint,
    'R1 voit les deux cours de son centre, pas celui de Beta');

  perform public.__attendre('select count(*) from public.apprenant', 1::bigint,
    'R1 ne voit pas l''apprenant du centre Beta');

  perform public.__attendre('select count(*) from public.paiement', 1::bigint,
    'R1 voit le paiement de son centre, pas celui de Beta');

  perform public.__attendre('select count(*) from public.parametres', 1::bigint,
    'R1 ne voit que les réglages de son centre');

  -- Sur les COURS et non sur les lignes : A vient d'en saisir une de plus, et
  -- ce qu'on veut prouver est que le responsable voit les deux enseignants.
  perform public.__attendre(
    format('select count(distinct cours_id) from public.presence where apprenant_id = %L',
           public.__id('app_partage')),
    2::bigint, 'R1 voit le travail de l''apprenant partagé chez SES DEUX enseignants');

  -- --- Il gère ------------------------------------------------------------
  perform public.__accepte(
    format('update public.cours set prix_mensuel = 12000 where id = %L', public.__id('cours_a')),
    'R1 change le prix d''un cours de son centre');

  perform public.__accepte(
    format('update public.inscription set note_examen = 16, examen_bareme = 20 where cours_id = %L',
           public.__id('cours_a')),
    'R1 saisit la note d''examen');

  -- --- Il CRÉE, et la ligne créée lui revient -------------------------------
  --
  -- Le `returning` n'est pas décoratif : PostgREST en pose un dès qu'un
  -- repository chaîne `.select()`, et il fait passer la ligne neuve par la
  -- policy de SELECT. Une policy de lecture qui relit sa propre table ne verrait
  -- pas cette ligne, et TOUTE création échouerait — sans qu'aucun test de
  -- refus ne s'en aperçoive.
  perform public.__accepte(
    format($sql$insert into public.apprenant (centre_id, nom, prenom)
                values (%L, 'Neuf', 'Apprenant') returning id$sql$, public.__id('c_alpha')),
    'R1 crée un apprenant et le relit');

  perform public.__accepte(
    format($sql$insert into public.cours (centre_id, enseignant_id, libelle, type_cours_id, format, date_debut)
                select %L, %L, 'Alpha-neuf', id, 'groupe', '2026-03-01'
                from public.type_cours limit 1
                returning id$sql$,
           public.__id('c_alpha'), public.__id('u_a')),
    'R1 crée un cours et le relit');

  perform public.__accepte(
    format($sql$insert into public.creneau (centre_id, cours_id, jour_semaine, heure_debut, heure_fin)
                values (%L, %L, 4, '16:00', '17:00') returning id$sql$,
           public.__id('c_alpha'), public.__id('cours_a')),
    'R1 ajoute un créneau et le relit');

  perform public.__accepte(
    format($sql$insert into public.inscription (centre_id, apprenant_id, cours_id)
                select %L, id, %L from public.apprenant where nom = 'Neuf' returning id$sql$,
           public.__id('c_alpha'), public.__id('cours_a')),
    'R1 inscrit un apprenant et relit l''inscription');

  perform public.__accepte(
    format($sql$insert into public.paiement (centre_id, cours_id, mois_concerne, montant_du)
                values (%L, %L, '2026-04', 10000) returning id$sql$,
           public.__id('c_alpha'), public.__id('cours_a')),
    'R1 enregistre un règlement et le relit');

  perform public.__accepte(
    format($sql$insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin)
                values (%L, %L, '2026-03-02', '09:00', '10:00') returning id$sql$,
           public.__id('c_alpha'), public.__id('cours_a')),
    'R1 crée une séance et la relit');

  -- La voie réelle de l'application : cours + créneaux en une transaction, avec
  -- le garde-fou de chevauchement (CLAUDE.md §5.1).
  perform public.__accepte(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle', 'Par la RPC',
                                'type_cours_id', (select id from public.type_cours limit 1),
                                'format', 'individuel', 'date_debut', '2026-03-01'),
             jsonb_build_array(jsonb_build_object('jour_semaine', 6,
                                                  'heure_debut', '20:00',
                                                  'heure_fin', '21:00'))) $sql$),
    'R1 enregistre un cours par `enregistrer_cours`');

  -- --- Mais il ne sort pas de son centre -----------------------------------
  perform public.__refus(
    format('update public.cours set libelle = ''Volé'' where id = %L', public.__id('cours_beta')),
    'R1 modifie un cours du centre Beta');

  perform public.__refus(
    format('delete from public.apprenant where id = %L', public.__id('app_beta')),
    'R1 supprime un apprenant du centre Beta');

  -- --- Il ne déplace rien vers un autre centre (le `with check` d'UPDATE) ---
  perform public.__refus(
    format('update public.cours set centre_id = %L where id = %L',
           public.__id('c_beta'), public.__id('cours_a')),
    'R1 déménage son cours vers le centre Beta');

  perform public.__refus(
    format('update public.apprenant set centre_id = %L where id = %L',
           public.__id('c_beta'), public.__id('app_partage')),
    'R1 déménage un apprenant vers le centre Beta');

  -- --- Affectation d'un cours à un enseignant (migration 0014) -------------
  --
  -- Ce que la FK composite `(enseignant_id, centre_id)` garantit : on affecte
  -- dans son centre, et nulle part ailleurs. Aucune policy n'en parle — c'est
  -- structurel, donc valable même pour un client qui contournerait PostgREST.
  perform public.__accepte(
    format('update public.cours set enseignant_id = %L where id = %L',
           public.__id('u_b'), public.__id('cours_a')),
    'R1 réaffecte un cours de A vers B, tous deux de son centre');

  perform public.__accepte(
    format('update public.cours set enseignant_id = %L where id = %L',
           public.__id('u_a'), public.__id('cours_a')),
    'R1 rend le cours à A');

  perform public.__accepte(
    format('update public.cours set enseignant_id = %L where id = %L',
           public.__id('u_r1'), public.__id('cours_a')),
    'R1 se garde un cours — responsable et enseignant à la fois');

  -- La voie réelle : l'affectation passe par `enregistrer_cours`.
  perform public.__accepte(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle', 'Affecté à A',
                                'type_cours_id', (select id from public.type_cours limit 1),
                                'format', 'individuel', 'date_debut', '2026-03-01',
                                'enseignant_id', %L),
             jsonb_build_array(jsonb_build_object('jour_semaine', 7,
                                                  'heure_debut', '08:00',
                                                  'heure_fin', '09:00'))) $sql$,
           public.__id('u_a')),
    'R1 crée un cours directement affecté à A');

  if not exists (
    select 1 from public.cours
    where libelle = 'Affecté à A' and enseignant_id = public.__id('u_a')
  ) then
    raise exception 'RÉGRESSION : `enregistrer_cours` a ignoré l''affectation demandée.';
  end if;

  -- --- Il n'affecte pas un cours à quelqu'un d'un autre centre --------------
  perform public.__refus(
    format('update public.cours set enseignant_id = %L where id = %L',
           public.__id('u_r2'), public.__id('cours_a')),
    'R1 affecte son cours à un membre du centre Beta');

  perform public.__refus(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle', 'Affecté hors centre',
                                'type_cours_id', (select id from public.type_cours limit 1),
                                'format', 'individuel', 'date_debut', '2026-03-01',
                                'enseignant_id', %L),
             jsonb_build_array(jsonb_build_object('jour_semaine', 7,
                                                  'heure_debut', '21:00',
                                                  'heure_fin', '22:00'))) $sql$,
           public.__id('u_r2')),
    'R1 crée un cours affecté à un membre du centre Beta');

  perform public.__refus(
    format('update public.cours set enseignant_id = %L where id = %L',
           gen_random_uuid(), public.__id('cours_a')),
    'R1 affecte son cours à un compte qui n''est membre de rien');

  -- --- Le scénario de PRÉ-EMPTION (§1 du plan) ------------------------------
  -- Sans clé étrangère composite, ces deux lignes seraient acceptées : R1
  -- planterait chez lui une ligne pointant un parent de Beta, invisible pour
  -- Beta mais bloquant à jamais ses contraintes d'unicité globales.
  perform public.__refus(
    format($sql$insert into public.paiement (centre_id, cours_id, mois_concerne, montant_du)
                values (%L, %L, '2026-05', 0)$sql$,
           public.__id('c_alpha'), public.__id('cours_beta')),
    'R1 pré-empte un mois LIBRE sur un cours du centre Beta');

  perform public.__refus(
    format($sql$insert into public.creneau (centre_id, cours_id, jour_semaine, heure_debut, heure_fin)
                values (%L, %L, 5, '18:00', '19:00')$sql$,
           public.__id('c_alpha'), public.__id('cours_beta')),
    'R1 pré-empte un créneau LIBRE sur un cours du centre Beta');

  perform public.__refus(
    format($sql$insert into public.inscription (centre_id, apprenant_id, cours_id)
                values (%L, %L, %L)$sql$,
           public.__id('c_alpha'), public.__id('app_beta'), public.__id('cours_a')),
    'R1 inscrit un apprenant du centre Beta dans son cours');

  -- --- Le jeton d'inscription n'est jamais écrit par le client --------------
  perform public.__refus_droit(
    format('update public.inscription set jeton = gen_random_uuid() where cours_id = %L',
           public.__id('cours_a')),
    'R1 choisit lui-même le jeton d''une inscription');
end;
$$;

-- =============================================================================
-- Identité : le responsable R2 (centre Beta) — l'étanchéité dans l'autre sens
-- =============================================================================
reset role;
set local role authenticated;
do $$
declare v_claims text;
begin
  select format('{"sub":"%s","role":"authenticated"}', public.__id('u_r2')) into v_claims;
  perform set_config('request.jwt.claims', v_claims, true);
end;
$$;

do $$
begin
  perform public.__attendre('select count(*) from public.cours', 1::bigint,
    'R2 ne voit que le cours de son centre');

  perform public.__attendre('select count(*) from public.apprenant', 1::bigint,
    'R2 ne voit pas l''apprenant partagé du centre Alpha');

  perform public.__attendre('select count(*) from public.presence', 1::bigint,
    'R2 ne voit aucune présence du centre Alpha');

  perform public.__attendre('select count(*) from public.membre', 1::bigint,
    'R2 ne voit pas les membres du centre Alpha');

  perform public.__refus(
    format('update public.seance set observations = ''Intrusion'' where id = %L',
           public.__id('seance_a')),
    'R2 écrit sur une séance du centre Alpha');
end;
$$;

-- =============================================================================
-- Identité : un compte SANS centre — il ne doit rien voir, et rien casser
--
-- Les helpers ne lèvent jamais : un compte orphelin voit des listes vides au
-- lieu de faire tomber l'application.
-- =============================================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);

do $$
begin
  perform public.__attendre('select count(*) from public.cours', 0::bigint, 'compte sans centre : cours');
  perform public.__attendre('select count(*) from public.apprenant', 0::bigint, 'compte sans centre : apprenants');
  perform public.__attendre('select count(*) from public.seance', 0::bigint, 'compte sans centre : séances');
  perform public.__attendre('select count(*) from public.presence', 0::bigint, 'compte sans centre : présences');
  perform public.__attendre('select count(*) from public.paiement', 0::bigint, 'compte sans centre : paiements');
  perform public.__attendre('select count(*) from public.parametres', 0::bigint, 'compte sans centre : réglages');
end;
$$;

-- =============================================================================
-- D. Non-régression du durcissement 0007 : `anon` reste sans droit table
-- =============================================================================
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  perform public.__refus_droit('select 1 from public.cours',       'anon lit `cours`');
  perform public.__refus_droit('select 1 from public.creneau',     'anon lit `creneau`');
  perform public.__refus_droit('select 1 from public.apprenant',   'anon lit `apprenant`');
  perform public.__refus_droit('select 1 from public.inscription', 'anon lit `inscription`');
  perform public.__refus_droit('select 1 from public.seance',      'anon lit `seance`');
  perform public.__refus_droit('select 1 from public.presence',    'anon lit `presence`');
  perform public.__refus_droit('select 1 from public.paiement',    'anon lit `paiement`');
  perform public.__refus_droit('select 1 from public.parametres',  'anon lit `parametres`');
  -- Les deux tables ajoutées par 0012 — l'oubli le plus facile.
  perform public.__refus_droit('select 1 from public.centre',      'anon lit `centre`');
  perform public.__refus_droit('select 1 from public.membre',      'anon lit `membre`');

  -- Et les helpers de rôle ne lui sont pas ouverts non plus.
  perform public.__refus_droit('select public.centre_courant()',   'anon appelle `centre_courant()`');
  perform public.__refus_droit('select public.est_responsable()',  'anon appelle `est_responsable()`');
  perform public.__refus_droit('select public.cours_lisibles()',   'anon appelle `cours_lisibles()`');
end;
$$;

-- Sa seule porte reste ouverte, et son payload n'a pas grossi.
reset role;
update public.cours set jeton_partage = '11111111-1111-1111-1111-111111111111'
where id = public.__id('cours_a');

set local role anon;
do $$
declare v_cles text;
begin
  select string_agg(cle, ',' order by cle) into v_cles
  from (
    select jsonb_object_keys(to_jsonb(c)) as cle
    from public.cours_public('11111111-1111-1111-1111-111111111111') as c
  ) as k;

  if v_cles is distinct from
     'creneaux,date_debut,date_fin,dernier_exercice,libelle,lien_meet,statut,type_libelle' then
    raise exception 'FAILLE — le payload public de `cours_public` a changé : %', v_cles;
  end if;
end;
$$;

reset role;
select '✅ TOUTES LES ASSERTIONS PASSENT — étanchéité centres, enseignants, gestion/pédagogie, anon' as resultat;

rollback;
