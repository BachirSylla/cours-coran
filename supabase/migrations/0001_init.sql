-- =============================================================================
-- 0001_init.sql — socle MVP : type_cours, apprenant, cours, creneau, inscription
-- Voir CLAUDE.md §4 (modèle de données), §5 (règles métier), §10 (pièges).
-- Hors périmètre volontaire : seance, presence, paiement.
--
-- Migration idempotente : rejouable sans casse.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper : met à jour updated_at à chaque UPDATE
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- type_cours — table de référence GLOBALE (pas de owner_id ; jamais de valeurs
-- en dur dans le code : CLAUDE.md §10). Lisible par tout utilisateur authentifié.
-- -----------------------------------------------------------------------------
create table if not exists public.type_cours (
  id         uuid primary key default gen_random_uuid(),
  libelle    text not null unique,
  created_at timestamptz not null default now()
);

insert into public.type_cours (libelle)
values
  ('Initiation à la lecture du Coran'),
  ('Lecture du Coran'),
  ('Mémorisation')
on conflict (libelle) do nothing;

-- -----------------------------------------------------------------------------
-- apprenant
-- -----------------------------------------------------------------------------
create table if not exists public.apprenant (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid()
                     references auth.users (id) on delete cascade,
  nom              text not null,
  prenom           text not null,
  contact          text,
  niveau           text,
  date_inscription date not null default current_date,
  statut           text not null default 'actif'
                     check (statut in ('actif', 'pause', 'parti')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.apprenant.contact is
  'WhatsApp, téléphone ou e-mail (format libre)';

-- -----------------------------------------------------------------------------
-- cours — modèle RÉCURRENT (≠ séance : CLAUDE.md §10).
-- Ne porte QUE la plage de vie du cours : date_debut (obligatoire) → date_fin
-- (nullable). Les créneaux hebdomadaires vivent dans `creneau`.
-- -----------------------------------------------------------------------------
create table if not exists public.cours (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  libelle       text not null,
  type_cours_id uuid not null references public.type_cours (id) on delete restrict,
  format        text not null check (format in ('individuel', 'groupe')),

  date_debut    date not null,
  date_fin      date,

  lien_meet     text,
  prix_mensuel  numeric(10, 2),
  devise        text not null default 'XOF' check (char_length(devise) = 3),
  statut        text not null default 'actif'
                  check (statut in ('actif', 'pause', 'termine')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint cours_dates_coherentes check (date_fin is null or date_fin >= date_debut)
);

comment on column public.cours.date_fin is
  'NULL tant que le cours est en cours ; renseignée seulement à la fin du cours';
comment on column public.cours.lien_meet is
  'Un seul lien par cours, réutilisé par toutes ses séances (CLAUDE.md §5.4)';

-- -----------------------------------------------------------------------------
-- creneau — créneaux hebdomadaires récurrents d'un cours (1..N).
-- Un cours donné 2×/semaine = deux lignes ici (il n'y a pas de champ `frequence`).
-- C'est sur cette table que porte la détection de conflit (CLAUDE.md §5.1).
-- -----------------------------------------------------------------------------
create table if not exists public.creneau (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  cours_id     uuid not null references public.cours (id) on delete cascade,
  -- ISO-8601 : 1 = lundi … 7 = dimanche (aligné sur getISODay de date-fns)
  jour_semaine smallint not null check (jour_semaine between 1 and 7),
  heure_debut  time not null,
  heure_fin    time not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Pas de marge automatique entre les cours (CLAUDE.md §5.1) : bornes strictes.
  constraint creneau_horaires_coherents check (heure_fin > heure_debut),
  constraint creneau_cours_jour_heure_unique unique (cours_id, jour_semaine, heure_debut)
);

comment on column public.creneau.jour_semaine is
  'Jour ISO-8601 : 1 = lundi … 7 = dimanche (aligné sur getISODay de date-fns)';

-- -----------------------------------------------------------------------------
-- inscription — liaison apprenant ↔ cours (gère les groupes)
-- -----------------------------------------------------------------------------
create table if not exists public.inscription (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  apprenant_id uuid not null references public.apprenant (id) on delete cascade,
  cours_id     uuid not null references public.cours (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint inscription_apprenant_cours_unique unique (apprenant_id, cours_id)
);

-- -----------------------------------------------------------------------------
-- Index
-- -----------------------------------------------------------------------------
create index if not exists apprenant_owner_id_idx
  on public.apprenant (owner_id);

create index if not exists cours_owner_id_idx
  on public.cours (owner_id);

create index if not exists cours_type_cours_id_idx
  on public.cours (type_cours_id);

-- Requête principale de la grille hebdomadaire + base de la détection de conflit.
create index if not exists creneau_owner_id_jour_semaine_idx
  on public.creneau (owner_id, jour_semaine);

create index if not exists creneau_cours_id_idx
  on public.creneau (cours_id);

create index if not exists inscription_owner_id_idx
  on public.inscription (owner_id);

-- inscription.apprenant_id est déjà couvert par l'index de la contrainte unique
-- (apprenant_id, cours_id) — inutile de le dupliquer.
create index if not exists inscription_cours_id_idx
  on public.inscription (cours_id);

-- -----------------------------------------------------------------------------
-- Triggers updated_at
-- -----------------------------------------------------------------------------
drop trigger if exists apprenant_set_updated_at on public.apprenant;
create trigger apprenant_set_updated_at
  before update on public.apprenant
  for each row execute function public.set_updated_at();

drop trigger if exists cours_set_updated_at on public.cours;
create trigger cours_set_updated_at
  before update on public.cours
  for each row execute function public.set_updated_at();

drop trigger if exists creneau_set_updated_at on public.creneau;
create trigger creneau_set_updated_at
  before update on public.creneau
  for each row execute function public.set_updated_at();

drop trigger if exists inscription_set_updated_at on public.inscription;
create trigger inscription_set_updated_at
  before update on public.inscription
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — isolation stricte par propriétaire (CLAUDE.md §4)
-- auth.uid() est encapsulé dans un sous-select : Postgres l'évalue une seule fois
-- par requête (initPlan) au lieu d'une fois par ligne.
-- =============================================================================
alter table public.type_cours  enable row level security;
alter table public.apprenant   enable row level security;
alter table public.cours       enable row level security;
alter table public.creneau     enable row level security;
alter table public.inscription enable row level security;

-- type_cours : référence globale, lecture seule pour les utilisateurs connectés.
drop policy if exists "type_cours_select_authenticated" on public.type_cours;
create policy "type_cours_select_authenticated"
  on public.type_cours for select to authenticated
  using (true);

-- apprenant -------------------------------------------------------------------
drop policy if exists "apprenant_select_own" on public.apprenant;
create policy "apprenant_select_own"
  on public.apprenant for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "apprenant_insert_own" on public.apprenant;
create policy "apprenant_insert_own"
  on public.apprenant for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "apprenant_update_own" on public.apprenant;
create policy "apprenant_update_own"
  on public.apprenant for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "apprenant_delete_own" on public.apprenant;
create policy "apprenant_delete_own"
  on public.apprenant for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- cours -----------------------------------------------------------------------
drop policy if exists "cours_select_own" on public.cours;
create policy "cours_select_own"
  on public.cours for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "cours_insert_own" on public.cours;
create policy "cours_insert_own"
  on public.cours for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "cours_update_own" on public.cours;
create policy "cours_update_own"
  on public.cours for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "cours_delete_own" on public.cours;
create policy "cours_delete_own"
  on public.cours for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- creneau ---------------------------------------------------------------------
drop policy if exists "creneau_select_own" on public.creneau;
create policy "creneau_select_own"
  on public.creneau for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "creneau_insert_own" on public.creneau;
create policy "creneau_insert_own"
  on public.creneau for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "creneau_update_own" on public.creneau;
create policy "creneau_update_own"
  on public.creneau for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "creneau_delete_own" on public.creneau;
create policy "creneau_delete_own"
  on public.creneau for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- inscription -----------------------------------------------------------------
drop policy if exists "inscription_select_own" on public.inscription;
create policy "inscription_select_own"
  on public.inscription for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "inscription_insert_own" on public.inscription;
create policy "inscription_insert_own"
  on public.inscription for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "inscription_update_own" on public.inscription;
create policy "inscription_update_own"
  on public.inscription for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "inscription_delete_own" on public.inscription;
create policy "inscription_delete_own"
  on public.inscription for delete to authenticated
  using ((select auth.uid()) = owner_id);
