-- =============================================================================
-- 0015_drop_owner_id.sql — le filet est retiré
--
-- La migration 0012 a fait passer la propriété des données du compte au CENTRE,
-- en gardant `owner_id` comme filet : nullable, sans défaut, sans aucune policy,
-- simple trace d'audit. Le modèle est éprouvé — on le retire.
--
-- **Seul acte irréversible de toute la série.** D'où le contrôle préalable
-- ci-dessous, et le refus d'employer `cascade` : `drop column` en RESTRICT
-- échoue bruyamment si quoi que ce soit dépend encore de la colonne, plutôt que
-- de supprimer en silence une policy qu'on aurait oubliée.
--
-- Elle ne touche PAS à `enregistrer_cours`. Son `returns public.cours` est un
-- rowtype résolu à l'exécution : supprimer une colonne invalide les plans en
-- cache, que PostgreSQL reconstruit tout seul.
--
-- Migration idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Contrôle préalable — on ne retire pas un filet sans regarder en dessous
--
-- Une seule ligne sans `centre_id` et la donnée deviendrait définitivement
-- illisible, `owner_id` n'étant plus là pour la retrouver.
-- -----------------------------------------------------------------------------
do $$
declare
  v_table    text;
  v_orphelin bigint;
  v_policy   record;
begin
  foreach v_table in array array[
    'apprenant', 'cours', 'creneau', 'inscription',
    'seance', 'presence', 'paiement', 'parametres'
  ]
  loop
    execute format('select count(*) from public.%I where centre_id is null', v_table)
      into v_orphelin;

    if v_orphelin > 0 then
      raise exception
        'Refus : %.centre_id est vide sur % ligne(s). Ces données seraient perdues.',
        v_table, v_orphelin;
    end if;
  end loop;

  -- 0012 a supprimé les 31 policies qui citaient `owner_id`. Si l'une d'elles
  -- avait survécu, `drop column` la supprimerait — en RESTRICT il refuse, mais
  -- autant dire pourquoi.
  for v_policy in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%owner_id%'
  loop
    raise exception 'Refus : la policy %.% cite encore `owner_id`.',
      v_policy.tablename, v_policy.policyname;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Les index qui portaient l'ancien tenant
--
-- `drop column` les emporterait de toute façon — un index dont une colonne
-- disparaît disparaît avec elle. On les nomme quand même : c'est ce qui rend
-- lisible qu'aucun n'a été perdu par inadvertance, et chacun a son remplaçant
-- sur `centre_id` depuis 0012.
-- -----------------------------------------------------------------------------
drop index if exists public.cours_owner_id_idx;              -- → cours_centre_id_idx
drop index if exists public.apprenant_owner_id_idx;          -- → apprenant_centre_id_idx
drop index if exists public.inscription_owner_id_idx;        -- → inscription_centre_id_idx
drop index if exists public.creneau_owner_id_jour_semaine_idx; -- → creneau_centre_jour_idx
drop index if exists public.seance_owner_id_date_idx;        -- → seance_centre_date_idx
drop index if exists public.paiement_owner_id_mois_idx;      -- → paiement_centre_mois_idx

-- -----------------------------------------------------------------------------
-- 3. La colonne
--
-- Sans `cascade` : les clés étrangères vers `auth.users` portées par la colonne
-- partent avec elle, mais toute autre dépendance ferait échouer la migration.
-- C'est exactement ce qu'on veut d'un acte irréversible.
--
-- Effet de bord recherché : supprimer un compte ne détruit plus les données du
-- centre. L'ancien `owner_id ... on delete cascade` le faisait.
-- -----------------------------------------------------------------------------
alter table public.apprenant   drop column if exists owner_id;
alter table public.cours       drop column if exists owner_id;
alter table public.creneau     drop column if exists owner_id;
alter table public.inscription drop column if exists owner_id;
alter table public.seance      drop column if exists owner_id;
alter table public.presence    drop column if exists owner_id;
alter table public.paiement    drop column if exists owner_id;
alter table public.parametres  drop column if exists owner_id;

notify pgrst, 'reload schema';
