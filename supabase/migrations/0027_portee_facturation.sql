-- =============================================================================
-- 0027_portee_facturation.sql — un forfait pour toute la classe
--
-- ⚠️ CORRECTIF D'UN BUG RÉEL, pas un confort. Le modèle de 0026 applique le
-- tarif à CHAQUE inscription : c'est juste quand chacun paie sa place, et faux
-- quand une classe verse un montant unique. Un cours à 100 000 F le mois pour
-- toute la classe, avec huit inscrits, annonçait 800 000 F attendus et collait
-- 100 000 F au nom de chaque apprenant sur l'écran « qui n'a pas payé ». Le
-- tableau de bord du centre affichait 870 000 F à encaisser au lieu de 170 000.
--
-- La portée devient donc un réglage du COURS :
--
--   * `par_apprenant` (défaut) — inchangé. Le tarif s'applique à chaque
--     inscription, le suivi reste nominatif, l'attendu vaut tarif × inscrits ;
--   * `forfait_classe` — le tarif est le TOTAL du cours pour la période. Un seul
--     suivi par (cours, période), jamais multiplié, et « qui n'a pas payé »
--     affiche une seule ligne au nom du cours. On ne cherche pas qui paie : on
--     suit l'état de la classe.
--
-- ⚠️ **Deux axes ORTHOGONAUX**, et ils cohabitent :
--
--                        mensuel                    par_session
--   par_apprenant   X par mois et par personne   X par session et par personne
--   forfait_classe  X par mois pour la classe    X par session pour la classe
--
-- Le défaut `par_apprenant` rend la migration rétro-compatible : aucun cours
-- existant ne change de comportement.
--
-- ⚠️ **La portée vit sur `tarif`, pas sur `cours`.** Deux raisons, et la
-- première est un piège que ce dépôt a déjà payé : `cours` n'a AUCUN privilège
-- d'écriture de table, et `enregistrer_cours` est `security invoker` — une
-- colonne ajoutée sans `grant` de COLONNE en INSERT **et** en UPDATE casse toute
-- création de cours, en silence côté client. `tarif` porte des privilèges de
-- TABLE : la colonne est couverte d'office. La seconde raison est de fond : une
-- portée de facturation EST un attribut du tarif, et `tarif` est justement la
-- table fermée en lecture à l'enseignant (0017).
--
-- Migration idempotente et transactionnelle.
-- =============================================================================

begin;

-- =============================================================================
-- 1. La portée, sur `tarif`
-- =============================================================================
alter table public.tarif
  add column if not exists portee_facturation text not null default 'par_apprenant';

alter table public.tarif drop constraint if exists tarif_portee_connue;
alter table public.tarif add constraint tarif_portee_connue
  check (portee_facturation in ('par_apprenant', 'forfait_classe'));

comment on column public.tarif.portee_facturation is
  'À qui s''applique le prix : par_apprenant (chaque inscrit paie ce montant) ou forfait_classe (ce montant couvre toute la classe, un seul règlement par période). Orthogonal au mode de facturation du centre.';

-- =============================================================================
-- 2. `reglement` apprend à porter un COURS
--
-- Le porteur prend deux formes exclusives, exactement comme la période depuis
-- 0026 : une inscription (suivi nominatif) OU un cours (forfait de classe). Le
-- motif est déjà celui de cette table — deux colonnes, une contrainte
-- d'exclusivité, des index partiels — et le réutiliser évite une seconde table
-- qui aurait dupliqué les statuts, les montants et la notion de période.
--
-- ⚠️ Désigner arbitrairement une inscription « porteuse » aurait été le piège
-- évident : le règlement de toute la classe aurait disparu avec la
-- désinscription d'un apprenant, et l'argent encaissé avec lui.
--
-- `inscription_id` devient donc NULLABLE. Sans risque ici : la table est vide en
-- production, et la contrainte d'exclusivité garantit qu'aucune ligne ne peut
-- désormais n'avoir aucun porteur.
-- =============================================================================
alter table public.reglement alter column inscription_id drop not null;
alter table public.reglement add column if not exists cours_id uuid;

alter table public.reglement drop constraint if exists reglement_porteur_exclusif;
alter table public.reglement add constraint reglement_porteur_exclusif
  check (num_nonnulls(inscription_id, cours_id) = 1);

/*
 * ⚠️ La clé étrangère transporte le tenant (CLAUDE.md §4). Sans elle, un
 * responsable pourrait rattacher chez lui un règlement au cours d'un autre
 * centre : invisible pour l'autre, mais l'unicité étant globale, elle lui
 * interdirait d'enregistrer cette période.
 *
 * ⚠️ `drop constraint if exists` puis `add` n'est pas idempotent dès qu'un objet
 * dépend de la contrainte ; ici rien n'en dépend, mais on teste quand même
 * l'existence — c'est le motif que 0026 a dû adopter en cours de route.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reglement'::regclass
      and conname  = 'reglement_cours_fkey'
  ) then
    alter table public.reglement
      add constraint reglement_cours_fkey
      foreign key (cours_id, centre_id)
      references public.cours (id, centre_id) on delete cascade;
  end if;
end;
$$;

/*
 * Un règlement par cours et par période, dans chaque forme. Index PARTIELS, pour
 * la même raison qu'en 0026 : une contrainte ordinaire laisserait passer autant
 * de lignes qu'on veut avec `cours_id` nul, NULL n'étant jamais égal à lui-même.
 */
create unique index if not exists reglement_cours_mois_unique
  on public.reglement (cours_id, mois) where cours_id is not null and mois is not null;

create unique index if not exists reglement_cours_session_unique
  on public.reglement (cours_id, session_id)
  where cours_id is not null and session_id is not null;

create index if not exists reglement_cours_idx
  on public.reglement (cours_id) where cours_id is not null;

comment on column public.reglement.cours_id is
  'Porteur du règlement en mode forfait_classe : le cours entier, et non une inscription. Exclusif avec inscription_id.';

-- =============================================================================
-- 3. La garde de cohérence — la forme du porteur suit la PORTÉE du cours
--
-- Sans elle, un client pourrait enregistrer les deux formes sur le même cours et
-- la même période : la classe paierait deux fois, une fois en bloc et une fois
-- par tête.
--
-- ⚠️ **Ce n'est PAS une garantie structurelle**, et il faut le savoir : la garde
-- juge la portée AU MOMENT de l'insert. Encaisser huit règlements nominatifs,
-- basculer le cours au forfait, puis encaisser le forfait du même mois reste
-- accepté — les deux formes coexistent alors. C'est le prix de l'invariant qui
-- prime : changer de portée ne doit RIEN détruire ni figer, et l'historique
-- reste corrigeable. Une garde qui refuserait la coexistence devrait soit
-- interdire la bascule, soit effacer le passé.
--
-- ⚠️ À la CRÉATION seulement, comme P0081. Changer la portée d'un cours qui a
-- déjà des règlements ne doit RIEN détruire ni figer : l'historique reste
-- lisible et corrigeable. C'est l'invariant que le propriétaire a posé comme
-- sacré, et il vaut pour les deux axes.
-- =============================================================================
create or replace function public.reglement_coherent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $garde$
declare
  v_mode      text;
  v_date_fin  date;
  v_portee    text;
  v_cours     uuid;
begin
  select p.mode_facturation into v_mode
  from public.parametres as p
  where p.centre_id = new.centre_id;

  /*
   * P0081 — la forme de la PÉRIODE doit être celle du mode actif, à la création
   * seulement. Un centre qui bascule doit pouvoir corriger un montant saisi sous
   * l'ancien régime : une faute de frappe ne doit pas devenir définitive parce
   * qu'on a changé de rythme entre-temps.
   */
  if tg_op = 'INSERT' and v_mode is not null then
    if v_mode = 'mensuel' and new.mois is null then
      raise exception
        'Ce centre facture au mois : un règlement doit porter un mois, pas une session.'
        using errcode = 'P0081';
    end if;

    if v_mode = 'par_session' and new.session_id is null then
      raise exception
        'Ce centre facture au forfait par session : un règlement doit porter une session, pas un mois.'
        using errcode = 'P0081';
    end if;
  end if;

  /*
   * P0083 — la forme du PORTEUR doit être celle de la portée du cours.
   *
   * On remonte au cours quel que soit le porteur : par l'inscription, ou
   * directement. Sans tarif, la portée vaut son défaut — `par_apprenant` — et
   * un règlement de classe n'aurait alors aucun montant de référence.
   */
  if tg_op = 'INSERT' then
    v_cours := coalesce(
      new.cours_id,
      (select i.cours_id from public.inscription as i where i.id = new.inscription_id)
    );

    select coalesce(t.portee_facturation, 'par_apprenant') into v_portee
    from public.cours as c
    left join public.tarif as t on t.cours_id = c.id
    where c.id = v_cours and c.centre_id = new.centre_id;

    if found then
      if v_portee = 'forfait_classe' and new.cours_id is null then
        raise exception
          'Ce cours est réglé par un forfait de classe : le règlement porte sur le cours, pas sur un apprenant.'
          using errcode = 'P0083';
      end if;

      if v_portee = 'par_apprenant' and new.cours_id is not null then
        raise exception
          'Ce cours est réglé par apprenant : le règlement porte sur une inscription, pas sur le cours entier.'
          using errcode = 'P0083';
      end if;
    end if;
  end if;

  /*
   * P0080 — un forfait de SESSION suppose une session bornée. « Payer une fois
   * pour toute la session » n'a de sens que si la session finit.
   *
   * ⚠️ `found`, et pas seulement `v_date_fin is null` : une session absente de ce
   * centre laisse aussi la variable nulle, et la clé étrangère dit alors la
   * vérité — un trigger qui parle avant elle ne doit pas la couvrir d'un
   * diagnostic faux.
   */
  if new.session_id is not null then
    select s.date_fin into v_date_fin
    from public.session as s
    where s.id = new.session_id and s.centre_id = new.centre_id;

    if found and v_date_fin is null then
      raise exception
        'Cette session n''a pas de date de fin : un forfait suppose une période qui se termine. Donnez-lui une date de fin avant d''enregistrer un règlement.'
        using errcode = 'P0080';
    end if;
  end if;

  return new;
end;
$garde$;

alter function public.reglement_coherent() owner to postgres;

drop trigger if exists reglement_coherent on public.reglement;
create trigger reglement_coherent
  before insert or update on public.reglement
  for each row execute function public.reglement_coherent();

-- =============================================================================
-- 4. `enregistrer_cours` apprend la portée
--
-- Le chemin est celui que `prix_session` a ouvert en 0026 : la clé absente veut
-- dire « n'y touche pas », une valeur la remplace. Un client qui ignore la
-- portée ne doit pas basculer en silence les cours qu'il enregistre.
--
-- ⚠️ Cette fonction se fait remplacer de migration en migration (0002, 0012,
-- 0013, 0014, 0022, 0026, et maintenant 0027) : rejouer une ANCIENNE après une
-- plus récente restaure son comportement.
--
-- ⚠️ `portee_facturation` vit sur `tarif`, qui porte des privilèges de TABLE :
-- rien à re-granter. C'est précisément pourquoi elle n'est pas sur `cours`.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enregistrer_cours(p_cours jsonb, p_creneaux jsonb, p_cours_id uuid DEFAULT NULL::uuid)
 RETURNS cours
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_cours      public.cours;
  v_creneau    jsonb;
  v_libelle    text;
  v_enseignant text;
  v_prix       numeric;
  v_devise     text;
  v_a_prix     boolean;
  v_a_devise   boolean;
  v_forfait    numeric;
  v_a_forfait  boolean;
  v_portee     text;
  v_a_portee   boolean;
  v_a_niveau   boolean;
  v_session    uuid;
  v_statut_s   text;
begin
  if p_creneaux is null or jsonb_array_length(p_creneaux) = 0 then
    raise exception 'Un cours doit avoir au moins un créneau.' using errcode = 'P0001';
  end if;

  /*
   * `jsonb_to_record` ne distingue pas « cle absente » de « cle a null ». Sans
   * ce test de PRÉSENCE, un appelant qui omet le prix l'effacerait, et omettre
   * la devise la ramènerait à XOF — écrasant un EUR stocké. Même prudence que
   * pour `enseignant_id` plus bas : le silence ne veut pas dire « efface ».
   */
  v_a_prix    := p_cours ? 'prix_mensuel';
  v_a_devise  := p_cours ? 'devise';
  /*
   * ⚠️ La PRÉSENCE de la clé, jamais sa valeur : `prix_session: null` veut dire
   * « efface le forfait », l'absence de clé veut dire « n'y touche pas ». Un
   * client qui ignore le mode par session ne doit pas effacer les forfaits des
   * cours qu'il enregistre — c'est la même règle que pour `enseignant_id`.
   */
  v_a_forfait := p_cours ? 'prix_session';
  /*
   * ⚠️ La PRÉSENCE de la clé, jamais sa valeur. Un client qui ignore la portée
   * ne doit pas basculer en silence les cours qu'il enregistre — c'est la même
   * règle que pour `enseignant_id` et `prix_session`.
   */
  v_a_portee  := p_cours ? 'portee_facturation';

  /*
   * La SESSION. Même prudence que pour le prix : « clé absente » ne veut pas
   * dire « efface ». À la création elle est obligatoire — pas de repli
   * implicite sur « la session en cours », parce qu'un cours qui atterrit
   * silencieusement dans la mauvaise session est invisible et pénible à
   * rattraper. À la modification, l'absence laisse la session en place.
   */
  v_a_niveau := p_cours ? 'niveau';
  select t.session_id into v_session
  from jsonb_to_record(p_cours) as t(session_id uuid);

  if p_cours_id is null and v_session is null then
    raise exception 'Un cours doit appartenir à une session.' using errcode = 'P0060';
  end if;

  /*
   * Une session clôturée est un dossier fermé : on n'y crée pas, on n'y modifie
   * pas, on n'en sort pas et on n'y entre pas. Le responsable la rouvre d'un
   * clic si besoin.
   *
   * ⚠️ DEUX contrôles, pas un. Ne vérifier que la session VISÉE laissait un
   * trou : à la modification, `session_id` est facultatif — « le silence n'est
   * pas un déplacement » — donc l'omettre suffisait à sauter la garde et à
   * renommer un cours, ou à remplacer ses créneaux, dans une session close.
   * C'est la session ACTUELLE du cours qu'il faut regarder d'abord.
   */
  if p_cours_id is not null then
    select s.statut into v_statut_s
    from public.cours as c
    join public.session as s on s.id = c.session_id
    where c.id = p_cours_id;

    if v_statut_s = 'terminee' then
      raise exception
        'Cette session est clôturée. Rouvrez-la avant d''y modifier un cours.'
        using errcode = 'P0061';
    end if;
  end if;

  if v_session is not null then
    select s.statut into v_statut_s from public.session as s where s.id = v_session;

    if v_statut_s = 'terminee' then
      raise exception
        'Cette session est clôturée. Rouvrez-la avant d''y créer ou d''y déplacer un cours.'
        using errcode = 'P0061';
    end if;
  end if;

  select t.prix_mensuel, coalesce(t.devise, 'XOF'), t.prix_session,
         coalesce(t.portee_facturation, 'par_apprenant')
  into v_prix, v_devise, v_forfait, v_portee
  from jsonb_to_record(p_cours)
    as t(prix_mensuel numeric, devise text, prix_session numeric,
         portee_facturation text);

  if p_cours_id is null then
    insert into public.cours (
      libelle, type_cours_id, format, date_debut, date_fin, statut, enseignant_id,
      session_id, niveau
    )
    select
      c.libelle, c.type_cours_id, c.format, c.date_debut, c.date_fin,
      coalesce(c.statut, 'actif'),
      coalesce(c.enseignant_id, (select auth.uid())),
      c.session_id,
      nullif(btrim(coalesce(c.niveau, '')), '')
    from jsonb_to_record(p_cours) as c(
      libelle text, type_cours_id uuid, format text, date_debut date, date_fin date,
      statut text, enseignant_id uuid, session_id uuid, niveau text
    )
    returning * into v_cours;
  else
    update public.cours as cible
    set libelle       = c.libelle,
        type_cours_id = c.type_cours_id,
        format        = c.format,
        date_debut    = c.date_debut,
        date_fin      = c.date_fin,
        statut        = coalesce(c.statut, 'actif'),
        -- Absent de la charge utile = inchangé. Ne jamais interpréter le silence
        -- comme une désaffectation.
        enseignant_id = coalesce(c.enseignant_id, cible.enseignant_id),
        -- Même règle : le silence n'est pas un déplacement.
        session_id    = coalesce(c.session_id, cible.session_id),
        niveau        = case when v_a_niveau then nullif(btrim(coalesce(c.niveau, '')), '')
                             else cible.niveau end
    from jsonb_to_record(p_cours) as c(
      libelle text, type_cours_id uuid, format text, date_debut date, date_fin date,
      statut text, enseignant_id uuid, session_id uuid, niveau text
    )
    where cible.id = p_cours_id
    returning cible.* into v_cours;

    if v_cours.id is null then
      raise exception 'Cours introuvable.' using errcode = 'P0002';
    end if;
  end if;

  -- Le prix vit dans `tarif`, gardée responsable en lecture comme en écriture.
  -- Aucune clé de prix dans la charge utile = on ne touche pas au tarif, et on
  -- n'en crée pas pour un cours qui n'en a pas.
  if v_a_prix or v_a_devise or v_a_forfait or v_a_portee then
    insert into public.tarif
      (cours_id, centre_id, prix_mensuel, devise, prix_session, portee_facturation)
    values (v_cours.id, v_cours.centre_id, v_prix, v_devise, v_forfait, v_portee)
    on conflict (cours_id) do update
    set prix_mensuel = case when v_a_prix then excluded.prix_mensuel
                            else public.tarif.prix_mensuel end,
        devise       = case when v_a_devise then excluded.devise
                            else public.tarif.devise end,
        /*
         * Le tarif de l'AUTRE mode se conserve. Un centre qui essaie le forfait
         * puis revient au mois doit retrouver son mensuel intact : l'effacer
         * ferait payer l'essai d'un mode par la perte d'une donnée saisie.
         */
        prix_session = case when v_a_forfait then excluded.prix_session
                            else public.tarif.prix_session end,
        portee_facturation = case when v_a_portee then excluded.portee_facturation
                                  else public.tarif.portee_facturation end;
  end if;

  delete from public.creneau where cours_id = v_cours.id;

  for v_creneau in select * from jsonb_array_elements(p_creneaux)
  loop
    insert into public.creneau (centre_id, cours_id, jour_semaine, heure_debut, heure_fin)
    values (
      v_cours.centre_id, v_cours.id,
      (v_creneau ->> 'jour_semaine')::smallint,
      (v_creneau ->> 'heure_debut')::time,
      (v_creneau ->> 'heure_fin')::time
    );
  end loop;

  /*
   * Garde-fou de conflit (CLAUDE.md §5.1). Bornes strictes, aucune marge.
   * `is not distinct from` et non `=` : deux cours sans enseignant affecté
   * forment un groupe qui se contrôle contre lui-même.
   */
  select autre_cours.libelle, membre.nom_affiche
  into v_libelle, v_enseignant
  from public.creneau as nouveau
  join public.creneau as autre
    on autre.centre_id    = nouveau.centre_id
   and autre.cours_id    <> nouveau.cours_id
   and autre.jour_semaine = nouveau.jour_semaine
   and nouveau.heure_debut < autre.heure_fin
   and autre.heure_debut   < nouveau.heure_fin
  join public.cours as autre_cours
    on autre_cours.id = autre.cours_id
   and autre_cours.enseignant_id is not distinct from v_cours.enseignant_id
   -- ⚠️ MÊME SESSION. Sans cette ligne, reconduire un cours aux mêmes heures en
   -- Session 18 se heurterait à son propre modèle resté en Session 17 : la
   -- reconduction se gênerait elle-même, et deviendrait inutilisable.
   and autre_cours.session_id = v_cours.session_id
  left join public.membre as membre
    on membre.user_id = v_cours.enseignant_id
   and membre.centre_id = v_cours.centre_id
   and membre.user_id is distinct from (select auth.uid())
  where nouveau.cours_id = v_cours.id
  limit 1;

  if v_libelle is not null then
    if v_enseignant is not null then
      raise exception '% est déjà pris sur ce créneau : il chevauche le cours « % ».',
        v_enseignant, v_libelle using errcode = 'P0003';
    else
      raise exception 'Ce créneau chevauche le cours « % ».', v_libelle using errcode = 'P0003';
    end if;
  end if;

  return v_cours;
end;
$function$;

-- =============================================================================
-- 5. `reconduire_session` recopie la portée
--
-- ⚠️ Une colonne ajoutée à `tarif` doit venir ici EN MÊME TEMPS. 0026 l'a appris
-- à ses dépens : `prix_session` avait été oublié, et chaque reconduction faisait
-- perdre silencieusement tous les forfaits du centre. Recopier le prix sans la
-- portée aurait été pire encore — le montant serait resté juste, mais appliqué à
-- chaque apprenant au lieu de la classe.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reconduire_session(p_session_id uuid, p_nom text, p_date_debut date, p_date_fin date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_centre   uuid;
  v_nouvelle uuid;
  v_nom      text := btrim(coalesce(p_nom, ''));
  v_source   public.cours;
  v_copie    uuid;
  v_choc_a   text;
  v_choc_b   text;
begin
  /*
   * Garde de rôle. La reconduction est de la STRUCTURE : elle décide quels
   * cours existent et quand (CLAUDE.md §5.13).
   */
  if not (select public.est_responsable()) then
    raise exception 'Seul le responsable du centre peut ouvrir une session.'
      using errcode = 'P0070';
  end if;

  /*
   * La session source doit être du centre de l'appelant. Message IDENTIQUE à
   * celui du refus de rôle : distinguer « pas votre centre » de « n'existe
   * pas » dirait à un responsable curieux quels identifiants sont réels
   * ailleurs. Même prudence que `retirer_membre` (§5.15).
   */
  select s.centre_id into v_centre
  from public.session as s
  where s.id = p_session_id
    and s.centre_id = (select public.centre_courant());

  if v_centre is null then
    raise exception 'Seul le responsable du centre peut ouvrir une session.'
      using errcode = 'P0070';
  end if;

  if v_nom = '' or p_date_debut is null then
    raise exception 'La nouvelle session a besoin d''un nom et d''une date de début.'
      using errcode = 'P0071';
  end if;

  if p_date_fin is not null and p_date_fin < p_date_debut then
    raise exception 'La date de fin ne peut pas précéder la date de début.'
      using errcode = 'P0071';
  end if;

  /*
   * La date de début est CHOISIE, jamais déduite de la session source : entre
   * deux sessions il y a souvent des vacances, et imposer la continuité
   * obligerait à la corriger chaque fois. Aucune contrainte non plus entre les
   * deux périodes — une session de rattrapage n'attend pas la fin de la
   * précédente.
   *
   * La session source n'est PAS touchée : elle reste en cours ou se clôture
   * séparément, quand son responsable le décide.
   */
  begin
    insert into public.session (centre_id, nom, date_debut, date_fin, statut)
    values (v_centre, v_nom, p_date_debut, p_date_fin, 'en_cours')
    returning id into v_nouvelle;
  exception when unique_violation then
    raise exception 'Une session porte déjà le nom « % » dans ce centre.', v_nom
      using errcode = 'P0071';
  end;

  /*
   * Un tour de boucle par cours. Une insertion ensembliste serait plus courte,
   * mais il faudrait ensuite rattacher chaque créneau à la BONNE copie — et le
   * seul lien commun serait le libellé, qui n'est pas unique : deux cours
   * peuvent porter le même nom dans une session. `returning` donne l'identifiant
   * de la copie sans rien deviner. Les volumes sont de l'ordre de la dizaine.
   */
  for v_source in
    select * from public.cours where session_id = p_session_id order by libelle
  loop
    /*
     * `statut = 'actif'` quel que soit celui de la source : on ouvre une
     * période, on ne recopie pas un cours dans l'état « terminé ». `date_debut`
     * suit la nouvelle session et `date_fin` repart nulle — la plage de vie du
     * cours est celle de SA session, pas de la précédente.
     *
     * ⚠️ `enseignant_id` est recopié tel quel, `null` compris. Un membre retiré
     * entre-temps a laissé ses cours orphelins (`on delete set null`, 0018) : la
     * copie l'est aussi, et `cours_animables()` la rend au responsable. Il ne
     * peut pas pointer quelqu'un d'invalide — la clé étrangère composite vers
     * `membre (user_id, centre_id)` le refuserait.
     */
    insert into public.cours (
      centre_id, session_id, libelle, type_cours_id, niveau, format,
      enseignant_id, date_debut, date_fin, statut, logo, reconduit_de,
      assiduite_active, base_academique, bareme_assiduite,
      penalite_absence, penalite_retard, penaliser_absences_excusees
    )
    values (
      v_centre, v_nouvelle, v_source.libelle, v_source.type_cours_id, v_source.niveau,
      v_source.format, v_source.enseignant_id, p_date_debut, null, 'actif', v_source.logo,
      -- D'où vient cette copie. C'est ce lien qui permettra de proposer les
      -- anciens inscrits, et de suivre un apprenant d'une session à l'autre.
      v_source.id,
      v_source.assiduite_active, v_source.base_academique, v_source.bareme_assiduite,
      v_source.penalite_absence, v_source.penalite_retard, v_source.penaliser_absences_excusees
    )
    returning id into v_copie;

    -- Mêmes jours, mêmes heures. C'est le cœur de la reconduction, et c'est ce
    -- qui exige que le conflit soit scopé par session (0022).
    insert into public.creneau (centre_id, cours_id, jour_semaine, heure_debut, heure_fin)
    select v_centre, v_copie, cr.jour_semaine, cr.heure_debut, cr.heure_fin
    from public.creneau as cr
    where cr.cours_id = v_source.id;

    /*
     * Le tarif. Il n'était pas dans la liste demandée, et c'est un choix
     * assumé : sans lui, il faudrait ressaisir le prix de chaque cours à chaque
     * session. Un prix hérité se voit dans le formulaire et se corrige ; un prix
     * oublié facture zéro. `tarif` est gardée `est_responsable()` en lecture
     * comme en écriture (0017), et cette fonction l'est aussi.
     */
    /*
     * ⚠️ LES DEUX TARIFS, pas seulement le mensuel. `prix_session` est arrivé
     * avec 0026, après l'écriture de cette fonction : sans cette ligne, un centre
     * qui facture au forfait reconduisait une session dont TOUS les cours
     * perdaient leur prix — « aucun tarif saisi » pour chaque inscrit, à
     * ressaisir un par un. C'est très exactement le piège que 0024 nommait :
     * recopier colonne par colonne sans se demander ce qu'une colonne AJOUTÉE
     * plus tard deviendra.
     */
    /*
     * ⚠️ LA PORTÉE SUIT LE PRIX. Recopier le montant sans elle laisserait le
     * tarif juste mais appliqué à chaque apprenant au lieu de la classe : une
     * session reconduite se serait mise à réclamer huit fois le forfait, sans
     * que rien ne l'annonce. Toute colonne ajoutée à `tarif` doit venir ici en
     * même temps qu'à la table — c'est la leçon de `prix_session` en 0026.
     */
    insert into public.tarif
      (cours_id, centre_id, prix_mensuel, prix_session, devise, portee_facturation)
    select v_copie, v_centre, t.prix_mensuel, t.prix_session, t.devise, t.portee_facturation
    from public.tarif as t
    where t.cours_id = v_source.id;
  end loop;

  /*
   * ⚠️ Le garde-fou de chevauchement (§5.1) vit dans `enregistrer_cours`, et
   * ces insertions ne passent pas par elle. Une session source saine produit
   * une copie saine — mais « saine » n'est garanti que par cette même fonction,
   * et rien n'empêche une session d'avoir été bricolée en SQL. On vérifie donc
   * l'état FINAL de la session NEUVE, comme `retirer_membre` le fait après
   * réaffectation (§5.15).
   *
   * `is not distinct from` : les cours sans enseignant forment un agenda commun.
   */
  select a_cours.libelle, b_cours.libelle
  into v_choc_a, v_choc_b
  from public.creneau as a
  join public.creneau as b
    on b.cours_id     <> a.cours_id
   and b.jour_semaine  = a.jour_semaine
   and a.heure_debut   < b.heure_fin
   and b.heure_debut   < a.heure_fin
  join public.cours as a_cours on a_cours.id = a.cours_id
  join public.cours as b_cours on b_cours.id = b.cours_id
  where a_cours.session_id = v_nouvelle
    and b_cours.session_id = v_nouvelle
    and a_cours.enseignant_id is not distinct from b_cours.enseignant_id
  limit 1;

  if v_choc_a is not null then
    raise exception
      'La session source contient deux cours du même enseignant sur le même créneau (« % » et « % »). Corrigez-les avant de reconduire.',
      v_choc_a, v_choc_b using errcode = 'P0072';
  end if;

  /*
   * ⚠️ Un cours sans aucun créneau. `enregistrer_cours` l'interdit (P0001), mais
   * rien n'empêche un `delete` direct sur `creneau` — le même raisonnement qui a
   * justifié le contrôle ci-dessus, poussé jusqu'au bout.
   *
   * Il y a un second chemin, plus subtil : la boucle ouvre un curseur, dont
   * l'instantané est figé, tandis que chaque `insert … select from creneau`
   * prend le sien. En READ COMMITTED, des créneaux supprimés pendant la
   * reconduction donneraient une copie vide sans que rien ne le signale.
   *
   * On contrôle donc l'état FINAL de la session neuve, ce qui attrape les deux
   * cas d'un coup — plutôt que la source, qui n'en attraperait qu'un.
   */
  select copie.libelle into v_choc_a
  from public.cours as copie
  where copie.session_id = v_nouvelle
    and not exists (select 1 from public.creneau as cr where cr.cours_id = copie.id)
  limit 1;

  if v_choc_a is not null then
    raise exception
      'Le cours « % » de la session source n''a aucun créneau : sa copie serait inutilisable. Donnez-lui un horaire avant de reconduire.',
      v_choc_a using errcode = 'P0073';
  end if;

  return v_nouvelle;
end;
$function$;

commit;
