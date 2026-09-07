-- =============================================================================
-- 0028_seances_faites.sql — combien de séances ont réellement eu lieu
--
-- Deux écrans en ont besoin, et pour la même raison : décider. Le résumé par
-- enseignant du tableau de bord dit qui a effectivement tenu ses cours ; l'écran
-- de clôture dit, cours par cours, ce qui a été fait avant de fermer la période.
--
-- ⚠️ UNE agrégation, pas une liste rapatriée. Compter côté client aurait obligé
-- à ramener une ligne par séance — et PostgREST coupe à `max_rows` (1000) **sans
-- rien dire**, si bien qu'un centre actif aurait vu son compteur devenir faux en
-- silence au fil des sessions. C'est la leçon de `listPointages`, appliquée
-- avant d'en payer le prix.
--
-- ⚠️ `security INVOKER`, jamais `definer`. La policy `seance_select` porte sur
-- `cours_lisibles()` : un enseignant ne compte donc que SES cours, un
-- responsable ceux de son centre, et le cloisonnement reste celui de la RLS.
-- Une fonction `definer` aurait ouvert une porte que personne n'a demandée —
-- pour un simple `count(*)`.
--
-- Aucun champ ajouté : le compte se déduit de `seance.statut`, qui existe depuis
-- 0003. Le stocker le figerait, et il deviendrait faux à la première séance
-- annulée après coup.
-- =============================================================================

begin;

/*
 * ⚠️ Les colonnes de sortie s'appellent `id_cours` et `faites`, PAS `cours_id`
 * et `count`. Dans une fonction `returns table`, ces noms sont des paramètres
 * OUT visibles dans le corps : les faire coïncider avec une colonne de la
 * requête rejouerait le piège de `suivi_apprenant` (§5.11), où un nom partagé
 * rendait un prédicat tautologique. Le préfixe du paramètre suit la même règle.
 */
create or replace function public.seances_faites_par_cours(p_session_id uuid)
returns table (id_cours uuid, faites bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.cours_id, count(*)
  from public.seance as s
  join public.cours as c on c.id = s.cours_id
  where c.session_id = p_session_id
    and s.statut = 'faite'
  group by s.cours_id;
$$;

alter function public.seances_faites_par_cours(uuid) owner to postgres;

/*
 * ⚠️ Révoquer explicitement `anon`. Un `revoke from public` ne suffit pas :
 * Supabase pose un `alter default privileges … grant execute on functions to
 * authenticated`, qui est un privilège NOMMÉ et survit (CLAUDE.md §10).
 */
revoke all on function public.seances_faites_par_cours(uuid) from public, anon, authenticated;
grant execute on function public.seances_faites_par_cours(uuid) to authenticated;

comment on function public.seances_faites_par_cours(uuid) is
  'Nombre de séances tenues (statut = faite) par cours, pour une session. security invoker : la RLS de `seance` (cours_lisibles()) fait le cloisonnement. Un cours sans séance n''apparaît pas — l''appelant lit alors zéro.';

commit;
