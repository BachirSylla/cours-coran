-- =============================================================================
-- 0005_sourate_numero.sql — numéro canonique de la sourate sur une séance
--
-- La colonne `sourate` (texte libre) ne permettait aucun classement : rien ne
-- dit qu'« Al-Baqara » précède « An-Nas », et les orthographes concurrentes
-- empêchaient tout regroupement. Le numéro (1..114) apporte l'ordre.
--
-- `sourate` est CONSERVÉE : elle porte l'affichage et fait vivre les séances
-- déjà saisies, qui n'ont pas de numéro.
--
-- Migration idempotente.
-- =============================================================================

alter table public.seance add column if not exists sourate_numero smallint;

-- `add constraint` n'accepte pas `if not exists` : on garde la migration
-- rejouable en vérifiant d'abord le catalogue.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'seance_sourate_numero_valide'
  ) then
    alter table public.seance
      add constraint seance_sourate_numero_valide
      check (sourate_numero is null or sourate_numero between 1 and 114);
  end if;
end
$$;

comment on column public.seance.sourate_numero is
  'Numéro canonique 1..114 ; NULL pour les séances saisies avant l''introduction du sélecteur';
