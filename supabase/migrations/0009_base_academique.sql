-- =============================================================================
-- 0009_base_academique.sql — sur quoi repose la part académique
--
-- Jusqu'ici, la part académique de la note finale ne venait que de l'examen de
-- fin de session : les notes de récitation données séance après séance
-- s'affichaient dans le rapport sans entrer dans aucun calcul.
--
-- Deux bases sont désormais possibles, et la nouvelle est le défaut :
--   examen_seul            → examen / examen_bareme × bareme_academique
--   moyenne_devoirs_examen → la moyenne des devoirs et de l'examen, à parts
--                            égales, ramenée sur bareme_academique
--
-- Le défaut s'applique aussi à la ligne déjà enregistrée : les notes AFFICHÉES
-- changent donc pour tout cours ayant des devoirs notés. Rien n'est perdu — la
-- note finale n'est stockée nulle part, elle est recalculée à chaque affichage
-- — et « examen_seul » rétablit le comportement précédent.
--
-- Cas limite tenu côté applicatif (shared/lib/rapport.ts) : sans aucun devoir
-- noté, la base retombe sur l'examen seul. On ne moyenne pas avec du vide.
--
-- Migration idempotente.
-- =============================================================================

-- `text` + `check` plutôt qu'un enum, comme les six précédents du schéma :
-- `create type` n'a pas de `if not exists`, et `alter type ... add value` ne
-- peut pas être suivi d'un backfill dans la même transaction — ajouter une base
-- plus tard imposerait de scinder la migration.
alter table public.parametres
  add column if not exists base_academique text not null
    default 'moyenne_devoirs_examen';

-- `conname` n'est unique que par table : on qualifie.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.parametres'::regclass
      and conname = 'parametres_base_academique_connue'
  ) then
    alter table public.parametres
      add constraint parametres_base_academique_connue
      check (base_academique in ('examen_seul', 'moyenne_devoirs_examen'));
  end if;
end
$$;

comment on column public.parametres.base_academique is
  'Sur quoi repose la part académique : examen_seul, ou moyenne_devoirs_examen (moyenne à parts égales des notes de séance et de l''examen). Défaut dupliqué dans shared/lib/rapport.ts';

-- Rafraîchit le cache de schéma de PostgREST (automatique sur Supabase Cloud).
notify pgrst, 'reload schema';
