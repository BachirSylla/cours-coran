-- =============================================================================
-- 0003_seances.sql — occurrences réelles des cours et présence des apprenants
-- Voir CLAUDE.md §4 (modèle de données), §5.3 (génération au fil de l'eau).
--
-- Les séances ne sont PAS pré-générées : une ligne n'existe qu'à partir du
-- moment où l'enseignant saisit quelque chose. Les occurrences à venir sont
-- calculées côté application (src/shared/lib/seances.ts) à partir des créneaux.
--
-- Migration idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- seance — ce qui s'est réellement passé un jour donné.
--
-- heure_debut / heure_fin sont un SNAPSHOT du créneau au moment de la saisie :
-- si l'enseignant déplace ensuite le créneau, l'historique reste exact.
-- -----------------------------------------------------------------------------
create table if not exists public.seance (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid()
                      references auth.users (id) on delete cascade,
  cours_id          uuid not null references public.cours (id) on delete cascade,

  date              date not null,
  heure_debut       time not null,
  heure_fin         time not null,

  statut            text not null default 'faite'
                      check (statut in ('faite', 'annulee', 'reportee', 'absence')),

  -- Texte libre : convient à l'initiation (leçon/page de méthode Nourania, Qaïda).
  contenu_aborde    text,

  -- Renseignés pour la lecture et la mémorisation.
  sourate           text,
  versets_de        integer,
  versets_a         integer,
  type_travail      text
                      check (type_travail is null or
                             type_travail in ('nouvelle_memorisation', 'revision', 'lecture')),

  exercices_a_faire text,
  observations      text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint seance_horaires_coherents check (heure_fin > heure_debut),
  constraint seance_versets_positifs check (
    (versets_de is null or versets_de >= 1) and (versets_a is null or versets_a >= 1)
  ),
  constraint seance_versets_coherents check (
    versets_de is null or versets_a is null or versets_a >= versets_de
  ),
  -- Clé fonctionnelle d'une occurrence : elle permet un upsert idempotent
  -- depuis l'application, sans savoir si la séance existe déjà.
  constraint seance_cours_date_heure_unique unique (cours_id, date, heure_debut)
);

comment on column public.seance.heure_debut is
  'Snapshot du créneau au moment de la séance : l''historique survit à un déplacement du créneau';
comment on column public.seance.contenu_aborde is
  'Texte libre : leçon ou page pour l''initiation, contenu travaillé sinon';

-- -----------------------------------------------------------------------------
-- presence — présence d'un apprenant à une séance (utile surtout en groupe).
-- -----------------------------------------------------------------------------
create table if not exists public.presence (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  seance_id    uuid not null references public.seance (id) on delete cascade,
  apprenant_id uuid not null references public.apprenant (id) on delete cascade,
  present      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint presence_seance_apprenant_unique unique (seance_id, apprenant_id)
);

-- -----------------------------------------------------------------------------
-- Index
-- -----------------------------------------------------------------------------
-- Requête principale : les séances d'une plage de dates (semaine affichée).
create index if not exists seance_owner_id_date_idx on public.seance (owner_id, date);
create index if not exists seance_cours_id_idx on public.seance (cours_id);

create index if not exists presence_seance_id_idx on public.presence (seance_id);
-- Base de la future progression par apprenant.
create index if not exists presence_apprenant_id_idx on public.presence (apprenant_id);

-- -----------------------------------------------------------------------------
-- Triggers updated_at (fonction créée par la migration 0001)
-- -----------------------------------------------------------------------------
drop trigger if exists seance_set_updated_at on public.seance;
create trigger seance_set_updated_at
  before update on public.seance
  for each row execute function public.set_updated_at();

drop trigger if exists presence_set_updated_at on public.presence;
create trigger presence_set_updated_at
  before update on public.presence
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — isolation stricte par propriétaire (CLAUDE.md §4)
-- =============================================================================
alter table public.seance   enable row level security;
alter table public.presence enable row level security;

-- seance ----------------------------------------------------------------------
drop policy if exists "seance_select_own" on public.seance;
create policy "seance_select_own"
  on public.seance for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "seance_insert_own" on public.seance;
create policy "seance_insert_own"
  on public.seance for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "seance_update_own" on public.seance;
create policy "seance_update_own"
  on public.seance for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "seance_delete_own" on public.seance;
create policy "seance_delete_own"
  on public.seance for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- presence --------------------------------------------------------------------
drop policy if exists "presence_select_own" on public.presence;
create policy "presence_select_own"
  on public.presence for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "presence_insert_own" on public.presence;
create policy "presence_insert_own"
  on public.presence for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "presence_update_own" on public.presence;
create policy "presence_update_own"
  on public.presence for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "presence_delete_own" on public.presence;
create policy "presence_delete_own"
  on public.presence for delete to authenticated
  using ((select auth.uid()) = owner_id);
