-- =============================================================================
-- 0008_rapport.sql — fondation du rapport de session
--
-- Trois ajouts, tous rétrocompatibles (CLAUDE.md §4) :
--
-- 1. `presence.etat` nuance le booléen `present` : un retard, une absence
--    excusée et une absence sèche ne se valent pas dans un bilan de fin de
--    session. NULL = non renseigné → la logique applicative retombe sur
--    `present`, donc rien ne change pour les cours qui ne s'en servent pas et
--    les séances déjà saisies restent correctement comptées.
--
-- 2. `inscription.note_examen` porte la note d'examen de fin de session d'un
--    apprenant POUR CE COURS. Même grain que la liaison, comme la note de
--    récitation vit sur `presence` (migration 0006). Elle est stockée AVEC son
--    barème, pour la même raison qu'en 0006 : sans lui, changer de réglage
--    réinterpréterait tout l'historique.
--
-- 3. `parametres` reçoit la configuration de la notation finale. La note finale
--    est TOUJOURS sur 20 (académique + assiduité), indépendamment de
--    `note_bareme`, qui ne concerne que les notes de récitation par séance.
--
-- Migration idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- presence.etat — état de présence nuancé
--
-- `text` + `check` plutôt qu'un enum Postgres, comme les cinq précédents du
-- schéma (cours.statut, cours.format, seance.statut, seance.type_travail,
-- apprenant.statut) : `create type` n'a pas de `if not exists`, et surtout
-- `alter type ... add value` ne peut pas être suivi d'un backfill dans la même
-- transaction — ajouter un état plus tard imposerait de scinder la migration.
-- Un `check` se remplace en un seul bloc.
-- -----------------------------------------------------------------------------
alter table public.presence add column if not exists etat text;

-- `conname` n'est unique que par table : on qualifie, sinon le catalogue est
-- interrogé en entier et une homonymie ailleurs ferait sauter la création.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.presence'::regclass and conname = 'presence_etat_connu'
  ) then
    alter table public.presence
      add constraint presence_etat_connu
      check (etat is null or etat in ('present', 'retard', 'absent', 'excuse', 'partiel'));
  end if;
end
$$;

comment on column public.presence.etat is
  'État nuancé : present | retard | absent | excuse | partiel. NULL = non renseigné, on retombe alors sur le booléen present. Classification portée par shared/lib/rapport.ts (estPresent)';

-- -----------------------------------------------------------------------------
-- inscription — note d'examen de fin de session
-- -----------------------------------------------------------------------------
alter table public.inscription
  add column if not exists note_examen numeric(5, 2),
  add column if not exists examen_bareme smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscription'::regclass
      and conname = 'inscription_examen_bareme_connu'
  ) then
    alter table public.inscription
      add constraint inscription_examen_bareme_connu
      check (examen_bareme is null or examen_bareme in (10, 20));
  end if;

  -- Interdit « une note sans son barème », comme presence_note_coherente : c'est
  -- ce qui garantit qu'aucune note ne devienne inintelligible plus tard.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscription'::regclass
      and conname = 'inscription_note_examen_coherente'
  ) then
    alter table public.inscription
      add constraint inscription_note_examen_coherente
      check (
        note_examen is null
        or (note_examen >= 0 and examen_bareme is not null and note_examen <= examen_bareme)
      );
  end if;
end
$$;

comment on column public.inscription.note_examen is
  'Note d''examen de fin de session de cet apprenant POUR CE COURS, à lire avec examen_bareme — jamais seule. Supprimée avec l''inscription';
comment on column public.inscription.examen_bareme is
  'Barème figé au moment de la notation de l''examen (10 ou 20)';

-- Aucun index à ajouter : `inscription_cours_id_idx` existe depuis la migration
-- 0001 et sert déjà les deux accès du rapport — les inscrits d'un cours, et la
-- cascade à la suppression du cours.

-- -----------------------------------------------------------------------------
-- parametres — configuration de la notation finale
--
-- Les mêmes valeurs par défaut sont dupliquées côté client dans
-- shared/lib/rapport.ts (NOTATION_PAR_DEFAUT), parce qu'aucune ligne n'existe
-- tant que l'enseignant n'a rien réglé — persistance paresseuse, comme le
-- barème de récitation. Les deux doivent rester alignées ; un test Vitest les
-- fige.
-- -----------------------------------------------------------------------------
alter table public.parametres
  add column if not exists bareme_academique smallint not null default 17,
  add column if not exists bareme_assiduite smallint not null default 3,
  add column if not exists penalite_absence numeric(4, 2) not null default 0.5,
  add column if not exists penalite_retard numeric(4, 2) not null default 0.25,
  add column if not exists penaliser_absences_excusees boolean not null default false;

do $$
begin
  -- La note finale est sur 20 : les deux parts se partagent exactement ce total.
  -- Le nom ne fige pas la valeur, il dit l'intention.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.parametres'::regclass
      and conname = 'parametres_bareme_total_coherent'
  ) then
    alter table public.parametres
      add constraint parametres_bareme_total_coherent
      check (bareme_academique + bareme_assiduite = 20);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.parametres'::regclass
      and conname = 'parametres_baremes_positifs'
  ) then
    alter table public.parametres
      add constraint parametres_baremes_positifs
      check (bareme_academique >= 0 and bareme_assiduite >= 0);
  end if;

  -- La borne HAUTE n'est pas cosmétique : `numeric` accepte 'NaN' quel que soit
  -- le typmod, et en Postgres NaN >= 0 vaut true. Un simple `>= 0` laisserait
  -- donc passer un NaN, après quoi toute note finale deviendrait NaN en
  -- silence. `NaN <= 20` étant faux, le between ferme le trou.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.parametres'::regclass
      and conname = 'parametres_penalites_bornees'
  ) then
    alter table public.parametres
      add constraint parametres_penalites_bornees
      check (penalite_absence between 0 and 20 and penalite_retard between 0 and 20);
  end if;
end
$$;

comment on column public.parametres.bareme_academique is
  'Part de la note finale (sur 20) venant de l''examen. Avec bareme_assiduite, la somme vaut toujours 20. Défaut dupliqué dans shared/lib/rapport.ts';
comment on column public.parametres.bareme_assiduite is
  'Part de la note finale (sur 20) venant de l''assiduité. Défaut dupliqué dans shared/lib/rapport.ts';
comment on column public.parametres.penalite_absence is
  'Points retirés de la note d''assiduité PAR absence non excusée. Défaut dupliqué dans shared/lib/rapport.ts';
comment on column public.parametres.penalite_retard is
  'Points retirés de la note d''assiduité PAR retard. Une présence partielle n''est jamais pénalisée. Défaut dupliqué dans shared/lib/rapport.ts';
comment on column public.parametres.penaliser_absences_excusees is
  'false (défaut) : une absence excusée reste comptée et affichée, mais ne retire aucun point — c''est ce qui donne un sens à la marquer';

-- Rafraîchit le cache de schéma de PostgREST (automatique sur Supabase Cloud,
-- mais pas sur une stack locale déjà démarrée : sans lui, PostgREST renvoie
-- « PGRST204 column does not exist » alors que la colonne existe).
notify pgrst, 'reload schema';
