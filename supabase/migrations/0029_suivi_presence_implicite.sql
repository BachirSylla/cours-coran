-- =============================================================================
-- 0029_suivi_presence_implicite.sql — le lien de suivi compte comme le rapport
--
-- ⚠️ CORRECTIF D'UN ÉCART RÉEL. Une apprenante venue aux trois séances tenues
-- d'un cours lisait sur son lien « 1 partielle, sur 1 séance tenue ». En base,
-- seule la troisième séance portait des pointages : aux deux premières, l'écran
-- de saisie avait affiché tout le monde « Présent » par défaut, sans rien écrire.
--
-- L'application tenait DEUX règles pour une séance tenue sans pointage :
--
--   * saisie et rapport de session — l'apprenant est PRÉSENT ;
--   * lien de suivi et assiduité de l'accueil — la séance n'existe PAS.
--
-- Le rapport imprimé et le lien se contredisaient donc sur la même personne.
-- Cette migration aligne le lien sur la règle de la saisie et du rapport ; le
-- tableau de bord est aligné côté client (`pointagesEffectifs`).
--
-- Ce qui ne change PAS : la liste blanche (onze colonnes, pas une de plus), les
-- évaluations (toujours les seules séances NOTÉES), les gardes de centre, de
-- statut et de date, l'ordre du parcours. Aucune donnée n'est écrite.
--
-- Migration idempotente et transactionnelle.
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
     * L'ASSIDUITÉ — une ligne par séance TENUE du cours, pointée ou non (0029).
     *
     * ⚠️ La requête part des SÉANCES, plus des présences. Jusqu'ici elle ne
     * comptait que les lignes `presence` existantes, alors que l'écran de saisie
     * affiche « Présent » coché pour qui n'a aucune ligne, sans rien écrire — et
     * que le rapport de session (`rapportSession.ts`) compte ce même apprenant
     * présent. Trois séances tenues, une seule pointée : le rapport disait 3, le
     * lien disait 1. Le lien n'était pas faux vis-à-vis de la base, il l'était
     * vis-à-vis de ce que l'enseignant avait VU en saisissant.
     *
     * La règle est désormais la même partout : **séance tenue sans pointage =
     * présence**. Aucune ligne n'est fabriquée en base pour autant.
     *
     * ⚠️ `pr.seance_id is null` et PAS `pr.present` : sur la jointure externe
     * d'une séance non pointée, `pr.present` vaut NULL, et l'ancien
     * `case when pr.present then 'present' else 'absent'` en ferait une ABSENCE —
     * exactement l'inverse de la règle.
     *
     * ⚠️ Aucune borne sur la date d'inscription, et c'est délibéré : ni
     * `inscription.created_at` ni `apprenant.date_inscription` ne disent quand la
     * personne a rejoint le cours — ils disent quand on l'a SAISIE. En base, des
     * pointages réels précèdent la création de leur inscription (saisie après
     * coup). Borner sur ces dates effacerait des présences vraies.
     *
     * `statut = 'faite'` ET `date <= current_date`, comme partout (§5.11) : une
     * séance annulée n'est pas une absence, et une séance future pré-générée
     * « faite » n'est pas encore une présence. Sans ces deux gardes, la présence
     * implicite rendrait l'apprenant présent à des séances annulées ou à venir.
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
        select case
                 when pr.seance_id is null then 'present'
                 else coalesce(pr.etat, case when pr.present then 'present' else 'absent' end)
               end as etat_reel
        from public.seance as s
        left join public.presence as pr
          on pr.seance_id    = s.id
         and pr.apprenant_id = i.apprenant_id
        where s.cours_id  = i.cours_id
          and s.centre_id = porte.centre_id
          and s.statut    = 'faite'
          and s.date     <= current_date
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

-- Le pin de propriétaire et les droits, reposés : cette migration ne doit pas
-- dépendre de ce que 0019 et 0025 ont établi. Sans `owner postgres`, un
-- `force row level security` renverrait zéro ligne SANS ERREUR.
alter function public.suivi_apprenant(uuid) owner to postgres;
revoke all on function public.suivi_apprenant(uuid) from public, anon, authenticated;
grant execute on function public.suivi_apprenant(uuid) to anon, authenticated;

comment on function public.suivi_apprenant(uuid) is
  'Parcours privé d''un apprenant dans son centre, lisible sans compte via son jeton. Une ligne par cours, ordre chronologique. Assiduité : toute séance tenue compte, une séance sans pointage vaut présence (comme la saisie et le rapport). La liste de colonnes est la liste blanche : n''y rien ajouter sans se demander ce que cela publie.';

commit;
