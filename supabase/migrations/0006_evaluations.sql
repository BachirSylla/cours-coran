-- =============================================================================
-- 0006_evaluations.sql — évaluation de la récitation, et paramètres du compte
--
-- L'évaluation vit sur `presence` : le grain est exactement le même (séance ×
-- apprenant) et cette table porte déjà l'unicité correspondante. Une table
-- dédiée dupliquerait ce grain sans jamais pouvoir en diverger.
--
-- La note est stockée AVEC son barème. Sans cela, basculer le barème de /20 à
-- /10 réinterpréterait tout l'historique : un 15/20 deviendrait un 15/10, une
-- note impossible. Même raisonnement que l'horaire figé sur `seance` et le
-- montant dû figé sur `paiement`.
--
-- Migration idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- presence : note, barème, commentaire et passage évalué
-- -----------------------------------------------------------------------------
alter table public.presence add column if not exists note numeric(5, 2);
alter table public.presence add column if not exists note_bareme smallint;
alter table public.presence add column if not exists commentaire text;
alter table public.presence add column if not exists passage_evalue text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'presence_bareme_connu') then
    alter table public.presence
      add constraint presence_bareme_connu
      check (note_bareme is null or note_bareme in (10, 20));
  end if;

  -- Interdit l'état incohérent « une note sans son barème » : c'est ce qui
  -- garantit qu'aucune note ne devienne inintelligible plus tard.
  if not exists (select 1 from pg_constraint where conname = 'presence_note_coherente') then
    alter table public.presence
      add constraint presence_note_coherente
      check (
        note is null
        or (note >= 0 and note_bareme is not null and note <= note_bareme)
      );
  end if;
end
$$;

comment on column public.presence.note is
  'Note de récitation, à lire avec note_bareme — jamais seule';
comment on column public.presence.note_bareme is
  'Barème figé au moment de la notation (10 ou 20)';
comment on column public.presence.passage_evalue is
  'Passage récité lors de l''évaluation, quand il diffère du contenu de la séance';

-- -----------------------------------------------------------------------------
-- parametres — une seule ligne par enseignant.
-- Aucune ligne n'existe tant que le barème par défaut convient : l'application
-- retombe sur 20 (voir parametresRepo.get()).
-- -----------------------------------------------------------------------------
create table if not exists public.parametres (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique default auth.uid()
                references auth.users (id) on delete cascade,
  note_bareme smallint not null default 20 check (note_bareme in (10, 20)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists parametres_set_updated_at on public.parametres;
create trigger parametres_set_updated_at
  before update on public.parametres
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — isolation par propriétaire (CLAUDE.md §4)
-- Pas de policy DELETE : rien ne justifie de supprimer ses propres paramètres,
-- et leur absence est déjà le cas nominal.
-- =============================================================================
alter table public.parametres enable row level security;

drop policy if exists "parametres_select_own" on public.parametres;
create policy "parametres_select_own"
  on public.parametres for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "parametres_insert_own" on public.parametres;
create policy "parametres_insert_own"
  on public.parametres for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "parametres_update_own" on public.parametres;
create policy "parametres_update_own"
  on public.parametres for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
