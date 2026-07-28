-- =============================================================================
-- 0004_paiements.sql — suivi mensuel des règlements
-- Voir CLAUDE.md §4 (modèle de données), §5.5 (aucune relance de paiement).
--
-- Comme les séances, les mois dus ne sont PAS pré-générés : ils se calculent au
-- fil de l'eau côté application (src/shared/lib/paiements.ts). Une ligne
-- n'existe qu'à partir du moment où un règlement est enregistré.
--
-- Le STATUT n'est pas stocké : il se déduit de montant_du, montant_recu et du
-- mois comparé au mois courant. Une colonne le figerait, et elle deviendrait
-- fausse toute seule au passage d'un mois, sans qu'aucune écriture n'ait lieu.
--
-- Migration idempotente.
-- =============================================================================

create table if not exists public.paiement (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  cours_id      uuid not null references public.cours (id) on delete cascade,

  -- Format AAAA-MM strict : garantit que l'ordre lexicographique est l'ordre
  -- chronologique, ce sur quoi repose toute la logique de comparaison.
  mois_concerne text not null
                  check (mois_concerne ~ '^\d{4}-(0[1-9]|1[0-2])$'),

  montant_du    numeric(10, 2) not null,
  montant_recu  numeric(10, 2) not null default 0,
  date_paiement date,
  methode       text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint paiement_montant_du_positif check (montant_du >= 0),
  constraint paiement_montant_recu_positif check (montant_recu >= 0),
  -- Clé fonctionnelle : permet un upsert idempotent depuis l'application.
  constraint paiement_cours_mois_unique unique (cours_id, mois_concerne)
);

comment on column public.paiement.mois_concerne is
  'Mois facturé au format AAAA-MM ; l''ordre des chaînes vaut ordre chronologique';
comment on column public.paiement.montant_du is
  'Figé à l''enregistrement : un changement ultérieur de prix_mensuel ne réécrit pas le passé';

-- -----------------------------------------------------------------------------
-- Index
-- -----------------------------------------------------------------------------
-- Requête principale : les règlements d'un mois donné (tableau de bord V2-b).
create index if not exists paiement_owner_id_mois_idx
  on public.paiement (owner_id, mois_concerne);
create index if not exists paiement_cours_id_idx on public.paiement (cours_id);

-- -----------------------------------------------------------------------------
-- Trigger updated_at (fonction créée par la migration 0001)
-- -----------------------------------------------------------------------------
drop trigger if exists paiement_set_updated_at on public.paiement;
create trigger paiement_set_updated_at
  before update on public.paiement
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — isolation stricte par propriétaire (CLAUDE.md §4)
-- =============================================================================
alter table public.paiement enable row level security;

drop policy if exists "paiement_select_own" on public.paiement;
create policy "paiement_select_own"
  on public.paiement for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "paiement_insert_own" on public.paiement;
create policy "paiement_insert_own"
  on public.paiement for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "paiement_update_own" on public.paiement;
create policy "paiement_update_own"
  on public.paiement for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "paiement_delete_own" on public.paiement;
create policy "paiement_delete_own"
  on public.paiement for delete to authenticated
  using ((select auth.uid()) = owner_id);
