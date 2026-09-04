-- =============================================================================
-- 0025_suivi_parcours.sql — un lien, un parcours
--
-- Jusqu'ici, `suivi_apprenant(jeton)` résolvait vers UNE inscription et rendait
-- UNE ligne : un lien par cours. Un apprenant qui suivait « Niveau 1 » en
-- Session 17 puis « Niveau 2 » en Session 18 se lisait comme deux inconnus, et
-- devait jongler avec deux adresses pour voir une progression qui n'en forme
-- qu'une.
--
-- Le jeton résout désormais vers un APPRENANT, et rend son parcours entier dans
-- ce centre — une ligne par cours, du plus ancien au plus récent. Ce sont SES
-- résultats, via SON lien : les agréger est le but, pas un risque.
--
-- ⚠️ CE QUI NE CHANGE PAS, ET QUI EST L'ESSENTIEL :
--
--   * la LISTE DE COLONNES est identique — onze, pas une de plus. Agréger
--     plusieurs sessions ajoute des LIGNES, jamais des colonnes : la surface
--     exposée à `anon` ne s'élargit pas d'un octet ;
--   * les filtres par séance tiennent sur CHAQUE session agrégée —
--     `statut = 'faite'` et `date <= current_date`. Pas de fuite du futur, pas
--     de séance annulée ;
--   * `anon` n'a toujours aucun droit sur aucune table ;
--   * jeton révoqué, inconnu ou mal formé : même réponse vide, aucun oracle.
--
-- ⚠️ CE QUI DEVIENT PLUS DANGEREUX, et que la migration traite : la requête
-- joignait auparavant une seule inscription connue. Elle en agrège maintenant
-- plusieurs, et CHAQUE jointure doit porter `centre_id`. Une seule qui
-- l'oublierait ferait remonter le cours d'un autre centre — la RLS ne protège
-- pas ici, la fonction est `security definer` et voit tout.
--
-- Conséquence à connaître, traitée dans l'interface : puisque tout jeton valide
-- de l'apprenant montre le parcours complet, couper l'accès suppose de révoquer
-- TOUS ses liens. D'où `revoquer_suivi_apprenant`, plus bas.
--
-- Migration idempotente et transactionnelle. Aucun changement de schéma : c'est
-- une lecture qui s'élargit, pas une donnée qui s'ajoute.
-- =============================================================================

begin;

CREATE OR REPLACE FUNCTION public.suivi_apprenant(p_jeton uuid)
 RETURNS TABLE(apprenant text, cours_libelle text, type_libelle text, enseignant text, centre_nom text, logo text, statut text, evaluations jsonb, assiduite jsonb, examen jsonb, exercices text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  /*
   * Le jeton résout vers un APPRENANT, plus vers une inscription (0025).
   *
   * Un apprenant n'a qu'un parcours : lui donner un lien par cours l'obligeait à
   * jongler avec trois adresses pour lire une progression qui n'en forme qu'une.
   * Ce sont SES résultats, via SON lien — les agréger est le but.
   *
   * Le couple (apprenant, centre) est figé ici. Un jeton révoqué vaut `null` et
   * ne matche rien : zéro ligne, comme un jeton inconnu. Pas d'oracle.
   *
   * ⚠️ Le paramètre s'appelle `p_jeton`, PAS `jeton` : dans une fonction
   * `language sql`, un nom de paramètre identique à un nom de colonne se résout
   * sur la COLONNE, et `where i.jeton = jeton` deviendrait toujours vrai.
   *
   * `limit 1` par prudence : l'index unique partiel sur `inscription.jeton`
   * garantit déjà l'unicité, mais une seule ligne ici borne le résultat quoi
   * qu'il arrive.
   */
  with porteur as (
    select i.apprenant_id, i.centre_id
    from public.inscription as i
    where i.jeton = p_jeton
    limit 1
  )
  select
    trim(a.prenom || ' ' || a.nom),
    c.libelle,
    t.libelle,
    m.nom_affiche,
    ce.nom,
    -- Le logo du cours l'emporte sur celui du centre : même règle que
    -- `parametresEffectifs` côté client (migration 0011).
    coalesce(c.logo, p.logo),
    c.statut,

    /*
     * Les ÉVALUATIONS — uniquement les séances réellement notées.
     *
     * `note is not null` : aucune ligne vide, aucun espace réservé. Une séance
     * sans note n'existe pas pour l'apprenant, et une grille trouée se lirait
     * comme un reproche.
     *
     * ⚠️ `statut = 'faite'` ET `date <= current_date`, comme 0007. Les deux, et
     * pas l'un des deux : `seance.statut` vaut `'faite'` PAR DÉFAUT (0003), et le
     * formulaire le pose aussi en dur — une séance générée pour la semaine
     * prochaine est donc « faite » sans que personne l'ait décidé. Sans la
     * garde de date, une note pré-remplie sortirait avant que la séance ait eu
     * lieu. Sans la garde de statut, une note resterait publiée sur une séance
     * annulée après coup, alors que le rapport de session, lui, l'écarte
     * (`rapportSession.ts`) — l'apprenant verrait une note s'évaporer.
     *
     * `contenu` suit la même règle que `libelleContenuSeance`
     * (`shared/lib/rapport.ts`) : sourate + versets s'ils sont renseignés,
     * sinon le contenu libre. `null` si ni l'un ni l'autre — le client affiche
     * alors la date seule.
     */
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'date', s.date,
                   'contenu', case
                     when nullif(btrim(coalesce(s.sourate, '')), '') is not null then
                       case
                         when s.versets_de is not null and s.versets_a is not null
                           then btrim(s.sourate) || ' v' || s.versets_de || '–' || s.versets_a
                         when s.versets_de is not null
                           then btrim(s.sourate) || ' v' || s.versets_de
                         else btrim(s.sourate)
                       end
                     else nullif(btrim(coalesce(s.contenu_aborde, '')), '')
                   end,
                   'note', pr.note,
                   'bareme', pr.note_bareme,
                   'commentaire', nullif(btrim(coalesce(pr.commentaire, '')), ''),
                   'etat', coalesce(pr.etat, case when pr.present then 'present' else 'absent' end)
                 )
                 order by s.date, s.heure_debut
               )
        from public.presence as pr
        join public.seance as s on s.id = pr.seance_id
        where pr.apprenant_id = i.apprenant_id
          and pr.cours_id = i.cours_id
          and pr.note is not null
          and s.statut = 'faite'
          and s.date <= current_date
      ),
      '[]'::jsonb
    ),

    /*
     * L'ASSIDUITÉ, sur les seules séances RÉELLEMENT TENUES — `statut = 'faite'`
     * ET `date <= current_date`. Compter une séance annulée comme une absence
     * serait un reproche injuste ; compter une séance à venir, dont la présence
     * a pu être pré-remplie, annoncerait le passé de la semaine prochaine.
     *
     * Le `coalesce` reproduit `etatEffectif` (`shared/lib/rapport.ts`) : un état
     * non renseigné retombe sur le booléen `present`, ce qui garde correctes les
     * séances d'avant la migration 0008.
     */
    (
      select jsonb_build_object(
               'present', count(*) filter (where etat_reel = 'present'),
               'retard',  count(*) filter (where etat_reel = 'retard'),
               'absent',  count(*) filter (where etat_reel = 'absent'),
               'excuse',  count(*) filter (where etat_reel = 'excuse'),
               'partiel', count(*) filter (where etat_reel = 'partiel'),
               'seances', count(*)
             )
      from (
        select coalesce(pr.etat, case when pr.present then 'present' else 'absent' end) as etat_reel
        from public.presence as pr
        join public.seance as s on s.id = pr.seance_id
        where pr.apprenant_id = i.apprenant_id
          and pr.cours_id = i.cours_id
          and s.statut = 'faite'
          and s.date <= current_date
      ) as etats
    ),

    -- L'examen n'apparaît que s'il existe. La note ne va jamais sans son barème.
    case
      when i.note_examen is not null and i.examen_bareme is not null
        then jsonb_build_object('note', i.note_examen, 'bareme', i.examen_bareme)
      else null
    end,

    -- Les exercices de la dernière séance tenue. `date <= current_date` reprend
    -- mot pour mot 0007 : une séance pré-remplie dans le futur ne doit pas
    -- publier son contenu par avance — sinon l'apprenant lit aujourd'hui le
    -- travail préparé pour dans deux semaines.
    (
      select s.exercices_a_faire
      from public.seance as s
      where s.cours_id = i.cours_id
        and s.statut = 'faite'
        and s.date <= current_date
        and nullif(btrim(coalesce(s.exercices_a_faire, '')), '') is not null
      order by s.date desc, s.heure_debut desc
      limit 1
    )

  /*
   * ⚠️ CHAQUE JOINTURE PORTE LE CENTRE. C'est LA garde de cette migration.
   *
   * Le jeton ne désigne plus une inscription mais un APPRENANT : la requête
   * agrège désormais plusieurs lignes, et une seule jointure qui oublierait
   * `centre_id` suffirait à faire remonter le cours — ou pire, l'apprenant —
   * d'un autre centre. Le cloisonnement de la RLS ne protège pas ici : la
   * fonction est `security definer` et voit tout.
   *
   * `porteur` fixe le couple (apprenant, centre) une fois pour toutes, et tout
   * le reste s'y rattache.
   */
  from porteur as porte
  join public.inscription as i
    on i.apprenant_id = porte.apprenant_id
   and i.centre_id    = porte.centre_id
  join public.apprenant as a
    on a.id        = porte.apprenant_id
   and a.centre_id = porte.centre_id
  join public.cours as c
    on c.id        = i.cours_id
   and c.centre_id = porte.centre_id
  join public.session as sess
    on sess.id        = c.session_id
   and sess.centre_id = porte.centre_id
  join public.type_cours as t on t.id = c.type_cours_id
  left join public.membre as m
    on m.user_id = c.enseignant_id and m.centre_id = porte.centre_id
  join public.centre as ce on ce.id = porte.centre_id
  left join public.parametres as p on p.centre_id = porte.centre_id
  /*
   * L'ORDRE, et il doit être déterministe.
   *
   * ⚠️ La session s'appelle `sess`, PAS `s` : les sous-requêtes corrélées
   * appellent `s` la SÉANCE depuis 0019, et le même nom l'y masquerait — une
   * sous-requête qui lirait un jour la session lirait la séance en silence.
   *
   * `date_debut` d'abord — c'est la chronologie du parcours. Puis `created_at`
   * de la session, puis son IDENTIFIANT, puis le libellé du cours, puis le sien :
   * deux sessions peuvent partager une date de début, et deux cours d'une même
   * session un libellé. Sans ces départages, l'ordre varierait d'un appel à
   * l'autre au gré du plan d'exécution, et le parcours se réordonnerait sous les
   * yeux de qui recharge la page.
   *
   * ⚠️ `sess.id` n'est pas redondant avec `created_at`. Celui-ci a pour défaut
   * `now()`, qui est le temps de TRANSACTION : deux sessions créées dans la même
   * transaction — ce que fait toute reconduction, et tout script de décor —
   * portent le même horodatage à la microseconde près. Le tri retombait alors sur
   * le libellé du cours et ENTRELAÇAIT les deux sessions, si bien que le liseré
   * « ici commence le passé » de la page se posait au mauvais endroit. Le
   * départage par identifiant est arbitraire, mais il garde chaque session d'un
   * seul tenant — ce qui est la propriété qui compte.
   */
  order by sess.date_debut, sess.created_at, sess.id, c.libelle, c.id;
$function$;

/*
 * Le pin de propriétaire, reposé comme en 0019 : `create or replace` le
 * préserve, mais cette migration ne doit pas dépendre de ce qu'une autre a
 * établi. Sans `owner postgres`, un `force row level security` sur une table
 * lue ici renverrait zéro ligne SANS ERREUR — la page se viderait en silence.
 */
alter function public.suivi_apprenant(uuid) owner to postgres;

comment on function public.suivi_apprenant(uuid) is
  'Parcours privé d''un apprenant dans son centre, lisible sans compte via son jeton. Une ligne par cours, ordre chronologique. La liste de colonnes est la liste blanche : n''y rien ajouter sans se demander ce que cela publie.';

-- =============================================================================
-- Fermer TOUS les liens d'un apprenant
--
-- Un jeton donne désormais accès au parcours entier : révoquer un lien sur un
-- cours n'y suffit plus si l'apprenant en a d'autres ouverts ailleurs. Sans ce
-- geste, « fermer le suivi » serait un mot vide — l'ancienne adresse continuerait
-- de tout montrer par un autre jeton.
--
-- Gardée comme `activer_suivi` : quiconque anime un cours de cet apprenant peut
-- fermer TOUS ses liens, y compris ceux qu'un autre enseignant a distribués sur
-- ses propres cours.
--
-- ⚠️ Ce n'est PAS une symétrie — A ne peut ni ouvrir ni régénérer un lien sur le
-- cours de B, mais il peut le fermer. L'asymétrie est délibérée et penche du bon
-- côté : fermer est réversible et ne divulgue rien, tandis que la garde inverse
-- — n'autoriser que l'ouvreur — rendrait l'accès IMPOSSIBLE à couper dès que
-- deux enseignants ont ouvert un lien sur le même apprenant. Entre un levier de
-- nuisance qui se répare d'un clic et une porte qu'on ne peut plus refermer, on
-- choisit le premier.
--
-- ⚠️ Elle ne ferme que les liens des cours du CENTRE de l'appelant. `centre_id`
-- borne l'update, et l'appartenance est re-vérifiée par `cours_animables()`.
-- =============================================================================
create or replace function public.revoquer_suivi_apprenant(p_apprenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $revoc$
declare
  v_centre uuid := (select public.centre_courant());
  v_fermes integer;
begin
  if v_centre is null then
    raise exception 'Seul l''enseignant d''un cours de cet apprenant peut fermer ses liens.'
      using errcode = 'P0040';
  end if;

  /*
   * L'appelant doit animer au moins un cours de cet apprenant. Même message que
   * le refus général : ne pas distinguer « pas votre apprenant » de « n'existe
   * pas », pour ne rien apprendre à qui cherche.
   */
  if not exists (
    select 1
    from public.inscription as i
    where i.apprenant_id = p_apprenant_id
      and i.centre_id    = v_centre
      and i.cours_id     = any ((select public.cours_animables())::uuid[])
  ) then
    raise exception 'Seul l''enseignant d''un cours de cet apprenant peut fermer ses liens.'
      using errcode = 'P0040';
  end if;

  update public.inscription
  set jeton = null
  where apprenant_id = p_apprenant_id
    and centre_id    = v_centre
    and jeton is not null;

  get diagnostics v_fermes = row_count;

  return v_fermes;
end;
$revoc$;

alter function public.revoquer_suivi_apprenant(uuid) owner to postgres;
revoke all on function public.revoquer_suivi_apprenant(uuid) from public, anon, authenticated;
grant execute on function public.revoquer_suivi_apprenant(uuid) to authenticated;

comment on function public.revoquer_suivi_apprenant(uuid) is
  'Ferme TOUS les liens de suivi d''un apprenant dans le centre. Nécessaire depuis 0025 : un jeton donne accès au parcours entier, donc en révoquer un seul ne coupe pas l''accès.';

commit;
