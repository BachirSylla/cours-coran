-- =============================================================================
-- 0026_modes_facturation.sql — facturer au mois, ou au forfait par session
--
-- Tous les centres ne facturent pas au même rythme. Certains encaissent chaque
-- mois ; d'autres demandent un forfait unique pour toute la session. Jusqu'ici
-- l'application ne savait faire que le premier, et le supposait sans le dire.
--
-- ⚠️ CE QUE CETTE MIGRATION CHANGE VRAIMENT, ET QUI DÉPASSE LE MODE :
-- le GRAIN du règlement. `paiement` est unique sur `(cours_id, mois_concerne)`
-- — un règlement pour le COURS entier. Dans un groupe de huit inscrits, cela ne
-- dit jamais QUI a payé : c'est un total, pas un suivi. La table `reglement`
-- naît donc au grain `(inscription, période)`, où l'inscription porte le couple
-- apprenant × cours. Un apprenant inscrit à deux cours a deux règlements, chacun
-- au tarif de son cours ; un groupe de huit a huit lignes par période.
--
-- ⚠️ POURQUOI UNE TABLE NEUVE, ET NON UNE COLONNE DE PLUS SUR `paiement` :
-- ajouter `inscription_id` à `paiement` aurait laissé deux grains cohabiter dans
-- une même table, sous une contrainte d'unicité `(cours_id, mois_concerne)` qui
-- interdit précisément ce que le nouveau grain exige — huit lignes pour un cours
-- et un mois. La desserrer aurait rendu l'ancienne unicité inopérante, donc
-- l'historique réinterprétable. Une table neuve laisse `paiement` exactement tel
-- qu'il est : lisible, non réécrit, non réinterprété.
--
-- **AUCUNE reprise de données.** Les règlements déjà saisis restent dans
-- `paiement`, au grain du cours, et l'écran les montre comme un historique
-- « avant bascule ». Les rattacher supposerait de deviner qui, parmi huit
-- inscrits, avait payé — une donnée que personne n'a jamais saisie. Inventer
-- l'aurait rendue indiscernable d'une donnée vraie.
--
-- Ce que la migration NE fait pas, et qui est délibéré :
--
--   * elle ne verrouille pas le mode. Changer d'avis ne touche aucun règlement
--     déjà saisi : ceux de l'autre mode restent en base et restent lisibles.
--     Verrouiller un centre sur un mode à cause d'une ligne de test serait une
--     punition, pas une garde ;
--   * elle ne supprime rien, ne renomme rien, ne déplace rien.
--
-- Migration idempotente et transactionnelle.
-- =============================================================================

begin;

-- =============================================================================
-- 1. Le mode, sur `parametres`
--
-- Et non sur `centre`, bien que l'invariant soit « uniforme au niveau centre » :
-- `parametres` EST le porteur des réglages du centre (`unique (centre_id)`), et
-- il a déjà exactement les policies voulues — lecture par tout membre, écriture
-- par le seul responsable. Le poser sur `centre` aurait obligé à ouvrir une
-- policy d'UPDATE sur une table qui n'en a aucune, rendant du même coup le NOM
-- du centre modifiable : un effet de bord que personne n'a demandé.
--
-- ⚠️ `parametres` porte des privilèges de TABLE (`arwdDxtm`), pas de colonne :
-- la colonne nouvelle est donc couverte d'office. Ce n'est PAS le cas de
-- `cours`, et confondre les deux casse toute écriture en silence.
--
-- Le défaut `mensuel` est ce qui rend la migration rétro-compatible : aucun
-- centre existant ne change de comportement, et aucun écran ne se met à poser
-- une question dont personne n'attendait la réponse.
-- =============================================================================
alter table public.parametres
  add column if not exists mode_facturation text not null default 'mensuel';

alter table public.parametres drop constraint if exists parametres_mode_facturation_connu;
alter table public.parametres add constraint parametres_mode_facturation_connu
  check (mode_facturation in ('mensuel', 'par_session'));

comment on column public.parametres.mode_facturation is
  'Rythme de facturation du centre : mensuel (un règlement par mois) ou par_session (un forfait pour toute la session). Uniforme au centre — l''affiner par cours demanderait une décision délibérée.';

-- =============================================================================
-- 2. Le forfait, sur `tarif`
--
-- `prix_session` cohabite avec `prix_mensuel` plutôt que de le remplacer : les
-- deux ne se déduisent pas l'un de l'autre — un forfait n'est presque jamais le
-- mensuel multiplié par la durée, c'est là tout son intérêt commercial — et un
-- centre qui essaie un mode puis revient doit retrouver son tarif intact.
--
-- `devise` reste partagée : un centre facture dans une seule monnaie, et rien
-- dans ce lot ne demande le contraire.
--
-- ⚠️ `tarif` est la seule table DÉCOMPOSÉE du schéma (0017), et la raison vaut
-- pour cette colonne comme pour l'autre : elle est gardée `est_responsable()` en
-- LECTURE autant qu'en écriture, parce qu'un enseignant n'a rien à faire du prix
-- de son cours. Ajouter le forfait ici, et non sur `cours`, le range du bon côté
-- de cette frontière sans qu'aucune policy n'ait à changer.
-- =============================================================================
alter table public.tarif add column if not exists prix_session numeric(10,2);

alter table public.tarif drop constraint if exists tarif_prix_session_positif;
alter table public.tarif add constraint tarif_prix_session_positif
  check (prix_session is null or prix_session >= 0);

comment on column public.tarif.prix_session is
  'Forfait couvrant TOUTE la session, en mode par_session. Sans rapport arithmétique avec prix_mensuel : les deux se saisissent séparément et se conservent l''un l''autre.';

-- =============================================================================
-- 3. L'unicité qui laisse la clé étrangère transporter le tenant
--
-- « Les clés étrangères transportent le tenant » (CLAUDE.md §4) : `reglement`
-- doit pointer `inscription (id, centre_id)`, et non le seul `id`. Sans cela, un
-- responsable pourrait planter chez lui une ligne rattachée à l'inscription d'un
-- autre centre — invisible pour l'autre, mais les contraintes d'unicité étant
-- globales, elle lui interdirait définitivement d'enregistrer cette période.
-- L'étanchéité doit être STRUCTURELLE, pas seulement déclarative.
--
-- ⚠️ **`drop constraint if exists` puis `add` n'est PAS idempotent ici.** C'est
-- le motif employé partout ailleurs dans ce fichier, et il est juste pour un
-- `check` — dont rien ne dépend. Mais `reglement_inscription_fkey` s'appuie sur
-- CETTE contrainte unique : au second passage, le `drop` échoue (« other objects
-- depend on it ») et la migration entière avorte. Il faut donc tester l'existence
-- plutôt que de détruire pour recréer. Un défaut qu'on ne voit qu'en REJOUANT.
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inscription'::regclass
      and conname  = 'inscription_id_centre_unique'
  ) then
    alter table public.inscription
      add constraint inscription_id_centre_unique unique (id, centre_id);
  end if;
end;
$$;

-- =============================================================================
-- 4. `reglement` — un suivi par inscription et par période
--
-- La PÉRIODE prend deux formes exclusives : un mois `AAAA-MM`, ou une session.
-- Deux colonnes plutôt qu'une clé polymorphe en texte, parce que `session_id`
-- doit être une vraie clé étrangère — sans quoi rien n'empêcherait un règlement
-- de désigner la session d'un autre centre, ou une session supprimée.
--
-- ⚠️ La FK composite vers `session` porte une colonne NULLABLE. En MATCH SIMPLE
-- — le défaut, et ce qu'on veut ici — une ligne dont `session_id` est nul
-- satisfait la contrainte sans être vérifiée. C'est exactement le comportement
-- attendu d'un règlement mensuel. En MATCH FULL, elle serait refusée.
--
-- Comme pour `paiement`, le STATUT n'est pas une colonne : payé / partiel /
-- en attente / en retard se déduit des montants et de la période comparée à
-- aujourd'hui. Le stocker le figerait, et il deviendrait faux tout seul au
-- passage d'un mois, sans qu'aucune écriture n'ait eu lieu.
--
-- Et comme pour les séances, les périodes dues sont calculées AU FIL DE L'EAU :
-- une ligne n'existe qu'une fois un règlement saisi, et son `montant_du` est
-- alors figé — pour qu'un changement de tarif ne réécrive pas le passé.
-- =============================================================================
create table if not exists public.reglement (
  id             uuid primary key default gen_random_uuid(),
  centre_id      uuid not null default public.centre_courant(),
  inscription_id uuid not null,

  -- La période, sous l'une OU l'autre forme — jamais les deux, jamais aucune.
  mois           text,
  session_id     uuid,

  montant_du     numeric(10,2) not null,
  montant_recu   numeric(10,2) not null default 0,
  date_paiement  date,
  methode        text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint reglement_centre_fkey
    foreign key (centre_id) references public.centre (id) on delete cascade,

  /*
   * ⚠️ `on delete cascade` : désinscrire un apprenant emporte ses règlements,
   * comme cela emporte déjà sa note d'examen. C'est de l'argent encaissé, donc
   * l'interface DOIT annoncer ce qu'elle détruit avant de le faire — sur le
   * modèle de « Retirer les pointages » (0020). Le refus (`restrict`) aurait
   * rendu toute désinscription impossible après le premier règlement, ce qui
   * pousse à supprimer le règlement d'abord : la même perte, en moins visible.
   */
  constraint reglement_inscription_fkey
    foreign key (inscription_id, centre_id)
    references public.inscription (id, centre_id) on delete cascade,

  constraint reglement_session_fkey
    foreign key (session_id, centre_id)
    references public.session (id, centre_id) on delete restrict,

  constraint reglement_periode_exclusive check (num_nonnulls(mois, session_id) = 1),
  constraint reglement_mois_format
    check (mois is null or mois ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint reglement_montant_du_positif check (montant_du >= 0),
  constraint reglement_montant_recu_positif check (montant_recu >= 0)
);

comment on table public.reglement is
  'Suivi de règlement par (inscription, période) — période = un mois en mode mensuel, une session en mode forfait. Remplace le grain (cours, mois) de `paiement`, qui reste en lecture comme historique d''avant bascule.';

/*
 * Un règlement par inscription et par période, dans chaque forme. Index
 * PARTIELS : une contrainte `unique (inscription_id, mois)` ordinaire laisserait
 * passer autant de lignes qu'on veut avec `mois` nul, NULL n'étant jamais égal à
 * lui-même — c'est-à-dire tous les règlements de session.
 */
create unique index if not exists reglement_inscription_mois_unique
  on public.reglement (inscription_id, mois) where mois is not null;

create unique index if not exists reglement_inscription_session_unique
  on public.reglement (inscription_id, session_id) where session_id is not null;

-- Le tableau de bord lit par centre et par période : l'index suit cet accès.
create index if not exists reglement_centre_mois_idx
  on public.reglement (centre_id, mois) where mois is not null;
create index if not exists reglement_centre_session_idx
  on public.reglement (centre_id, session_id) where session_id is not null;
create index if not exists reglement_inscription_idx on public.reglement (inscription_id);

drop trigger if exists reglement_set_updated_at on public.reglement;
create trigger reglement_set_updated_at
  before update on public.reglement
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 5. RLS — le règlement est de la GESTION, donc du responsable seul
--
-- Calquée sur `paiement` (0012 puis 0015), et pour la même raison : un enseignant
-- ne voit AUCUN règlement, pas même sur ses propres cours. La lecture se ferme
-- ici, pas seulement l'écriture — c'est ce qui distingue cette table des tables
-- pédagogiques, et c'est le pendant exact de la décomposition de `tarif` (0017).
--
-- ⚠️ La policy de SELECT ne relit PAS `reglement` : elle porte sur les colonnes
-- de la ligne. Un helper `stable` ne verrait pas la ligne en cours d'insertion,
-- et le `returning` que PostgREST ajoute dès qu'un repository chaîne `.select()`
-- échouerait sur toute création (CLAUDE.md §5.10).
-- =============================================================================
alter table public.reglement enable row level security;

drop policy if exists reglement_select_responsable on public.reglement;
create policy reglement_select_responsable on public.reglement
  for select to authenticated
  using (
    centre_id = (select public.centre_courant())
    and (select public.est_responsable())
  );

drop policy if exists reglement_insert_responsable on public.reglement;
create policy reglement_insert_responsable on public.reglement
  for insert to authenticated
  with check (
    centre_id = (select public.centre_courant())
    and (select public.est_responsable())
  );

drop policy if exists reglement_update_responsable on public.reglement;
create policy reglement_update_responsable on public.reglement
  for update to authenticated
  using (
    centre_id = (select public.centre_courant())
    and (select public.est_responsable())
  )
  with check (
    centre_id = (select public.centre_courant())
    and (select public.est_responsable())
  );

drop policy if exists reglement_delete_responsable on public.reglement;
create policy reglement_delete_responsable on public.reglement
  for delete to authenticated
  using (
    centre_id = (select public.centre_courant())
    and (select public.est_responsable())
  );

/*
 * ⚠️ RÉVOQUER D'ABORD, accorder ensuite — le motif de `tarif` (0017), et non
 * celui de `paiement` (0004) qui grante directement. Sans la révocation,
 * `authenticated` conserve `TRUNCATE`, `TRIGGER` et `REFERENCES` hérités des
 * privilèges par défaut de Supabase. `TRUNCATE` en particulier **n'est pas
 * soumis à la RLS** : il viderait la table entière sans qu'aucune policy ne s'y
 * oppose. PostgREST n'en émet jamais, mais on n'accorde pas sur la table qui
 * porte l'argent un droit dont on n'a aucun usage.
 *
 * Ici `revoke all` est sans risque : la table est neuve et ne porte aucun
 * privilège de COLONNE. Ailleurs, ce serait une faute — voir le §9.
 */
revoke all on public.reglement from anon, authenticated;
grant select, insert, update, delete on public.reglement to authenticated;

-- =============================================================================
-- 6. Les gardes de cohérence
--
-- Trois refus, et chacun répond à une question que la structure seule ne sait
-- pas poser.
-- =============================================================================

/*
 * ⚠️ `security definer`, comme les triggers de 0020, et pour la même raison :
 * en `invoker`, ce trigger ne verrait que ce que l'appelant a le droit de lire.
 * Il lit `session` et `parametres` — que le responsable lit, certes, mais une
 * garde qui dépend des droits de qui l'a déclenchée n'est pas une garde.
 */
create or replace function public.reglement_coherent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $garde$
declare
  v_mode      text;
  v_date_fin  date;
begin
  select p.mode_facturation into v_mode
  from public.parametres as p
  where p.centre_id = new.centre_id;

  /*
   * P0081 — la forme de la période doit être celle du mode ACTIF, à la
   * CRÉATION seulement.
   *
   * ⚠️ Pas à la modification, et c'est le cœur de l'arbitrage : un centre qui
   * bascule de mode doit pouvoir corriger un montant saisi sous l'ancien
   * régime — une faute de frappe ne doit pas devenir définitive parce qu'on a
   * changé de rythme entre-temps. La garde protège la création, pas la
   * correction ; l'historique reste modifiable, donc vivant.
   *
   * `v_mode` nul (centre sans ligne `parametres`) ne bloque rien : c'est un état
   * transitoire, et refuser ici transformerait un réglage manquant en panne.
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
   * P0080 — un forfait suppose une session BORNÉE.
   *
   * « Payer une fois pour toute la session » n'a de sens que si la session
   * finit. Une session perpétuelle — celle que le backfill de 0022 pose à tout
   * centre qui n'utilise pas les sessions — n'en a pas : l'apprenant paierait
   * pour une durée indéterminée, et personne ne saurait jamais quand refacturer.
   *
   * Le refus porte sur le RÈGLEMENT, pas sur le mode : basculer un centre en
   * forfait reste permis, et l'écran invite alors à borner les sessions. Bloquer
   * la bascule aurait obligé à tout mettre en ordre avant de pouvoir seulement
   * essayer le mode.
   */
  if new.session_id is not null then
    select s.date_fin into v_date_fin
    from public.session as s
    where s.id = new.session_id and s.centre_id = new.centre_id;

    /*
     * ⚠️ `found`, et pas seulement `v_date_fin is null`. Une session ABSENTE de
     * ce centre laisse aussi la variable nulle : sans ce test, le trigger
     * répondait « cette session n'a pas de date de fin » à qui pointait la
     * session d'un AUTRE centre. La clé étrangère refuse déjà ce cas, et son
     * message dit la vérité — un trigger qui parle avant elle ne doit pas la
     * couvrir d'un diagnostic faux.
     */
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

/*
 * P0082 — l'autre sens de la garde P0080.
 *
 * Interdire d'écrire un forfait sur une session sans fin ne sert à rien si la
 * fin peut être effacée ensuite : la session redeviendrait perpétuelle sous des
 * règlements déjà encaissés. C'est la leçon de 0020 — « une garde à sens unique
 * ne protège rien » — appliquée telle quelle.
 *
 * ⚠️ `for update` sur les règlements concernés. Sans lui, deux transactions
 * concurrentes franchissent chacune la sienne : l'une efface la date pendant que
 * l'autre enregistre un forfait, et en READ COMMITTED aucune ne voit le travail
 * non validé de l'autre. C'est la leçon de 0018.
 */
create or replace function public.session_garder_date_fin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $garde$
declare v_forfaits integer;
begin
  if new.date_fin is not null or old.date_fin is null then
    return new;
  end if;

  /*
   * ⚠️ En DEUX temps, et non `select count(*) … for update` : PostgreSQL refuse
   * « FOR UPDATE is not allowed with aggregate functions ». Écrit d'un bloc, le
   * trigger levait 0A000 à chaque tentative — il refusait donc TOUT, y compris
   * ce qu'il devait laisser passer, et pour la mauvaise raison. Le `perform`
   * pose le verrou, le `count` compte sous ce verrou.
   */
  perform 1 from public.reglement as r where r.session_id = new.id for update;

  select count(*) into v_forfaits
  from public.reglement as r
  where r.session_id = new.id;

  if v_forfaits > 0 then
    raise exception
      'Cette session porte % règlement(s) au forfait : retirer sa date de fin les laisserait couvrir une période sans terme.',
      v_forfaits
      using errcode = 'P0082';
  end if;

  return new;
end;
$garde$;

alter function public.session_garder_date_fin() owner to postgres;

drop trigger if exists session_garder_date_fin on public.session;
create trigger session_garder_date_fin
  before update on public.session
  for each row execute function public.session_garder_date_fin();

-- =============================================================================
-- 7. `enregistrer_cours` apprend le forfait
--
-- ⚠️ Cette fonction se fait remplacer de migration en migration (0002, 0012,
-- 0013, 0014, 0022, et maintenant 0026) : rejouer une ANCIENNE après une plus
-- récente restaure son comportement. La version ci-dessous est celle de 0022,
-- augmentée du seul `prix_session`.
--
-- ⚠️ Elle est `security invoker` : les privilèges de colonne de `cours`
-- s'appliquent À L'INTÉRIEUR d'elle. `prix_session` vit sur `tarif`, qui porte
-- des privilèges de TABLE — rien à re-granter ici. Ajouter une colonne à `cours`
-- aurait été une autre affaire, et son oubli casserait toute création en silence.
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

  select t.prix_mensuel, coalesce(t.devise, 'XOF'), t.prix_session
  into v_prix, v_devise, v_forfait
  from jsonb_to_record(p_cours)
    as t(prix_mensuel numeric, devise text, prix_session numeric);

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
  if v_a_prix or v_a_devise or v_a_forfait then
    insert into public.tarif (cours_id, centre_id, prix_mensuel, devise, prix_session)
    values (v_cours.id, v_cours.centre_id, v_prix, v_devise, v_forfait)
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
                            else public.tarif.prix_session end;
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
-- 8. `reconduire_session` apprend le forfait
--
-- La reconduction recopie le tarif du cours source (0024). Elle le faisait
-- colonne par colonne — donc sans `prix_session`, qui n'existait pas encore.
-- Un centre au forfait reconduisait ainsi une session dont chaque cours arrivait
-- sans prix, et il fallait tout ressaisir : la perte est silencieuse, elle ne se
-- voit qu'en ouvrant l'onglet Paiements de la session neuve.
--
-- ⚠️ Aucun test ne pouvait l'attraper : `reconduction.sql` n'assertait que
-- `prix_mensuel`. C'est le piège que CLAUDE.md §10 énonce mot pour mot, et il
-- s'est refermé exactement comme annoncé.
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
    insert into public.tarif (cours_id, centre_id, prix_mensuel, prix_session, devise)
    select v_copie, v_centre, t.prix_mensuel, t.prix_session, t.devise
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

-- =============================================================================
-- 9. LE MÊME TROU, SUR TOUTES LES AUTRES TABLES
--
-- `reglement` ne l'avait pas inventé : `alter default privileges … grant all on
-- tables to authenticated`, posé par Supabase, l'accorde à toute table créée
-- sans révocation explicite. L'audit l'a confirmé — DIX tables de `public` le
-- portaient encore : `apprenant`, `cours`, `creneau`, `inscription`, `paiement`,
-- `parametres`, `presence`, `seance`, `session`, `type_cours`. Seules `tarif`,
-- `membre`, `invitation` et `centre` y échappaient, parce que leurs migrations
-- avaient révoqué avant d'accorder.
--
-- Ce que cela vaut, précisément :
--
--   * **`TRUNCATE` n'est PAS soumis à la RLS.** Une policy filtre des lignes ;
--     `TRUNCATE` ne les regarde pas, il vide la table. Un porteur de jeton
--     `authenticated` qui atteindrait une connexion SQL — et non PostgREST, qui
--     n'émet jamais cette commande — effacerait les données de TOUS les centres.
--     C'est le seul de la liste qui casse vraiment le cloisonnement ;
--   * `REFERENCES` et `TRIGGER` ne sont pas exploitables tels quels (ils
--     supposent de pouvoir créer une table ou une fonction, ce que
--     `authenticated` ne peut pas dans `public`), mais ils n'ont aucun usage :
--     un droit sans emploi est un droit à retirer.
--
-- ⚠️ **`revoke truncate, references, trigger`, JAMAIS `revoke all`.** `cours`,
-- `inscription`, `invitation` et `membre` portent des privilèges de COLONNE —
-- c'est ce qui protège `inscription.jeton`, `membre.role`, `invitation.code_hash`
-- et la liste exacte que `enregistrer_cours` peut écrire. `REVOKE ALL ON TABLE`
-- les emporterait tous, et toute création de cours ou d'inscription cesserait de
-- fonctionner **en silence côté client**. Les trois privilèges visés ici
-- n'existent pas au niveau colonne : la révocation ciblée ne peut rien casser.
--
-- Les tables du schéma `storage` en portent aussi. On n'y touche pas : elles
-- appartiennent à Supabase, leurs migrations les gèrent, et cette application
-- n'utilise pas le stockage.
--
-- ⚠️ Ce défaut se reposera sur toute table FUTURE. Créer une table sans
-- `revoke` explicite, c'est le rouvrir.
-- =============================================================================
revoke truncate, references, trigger on table
  public.apprenant,
  public.cours,
  public.creneau,
  public.inscription,
  public.paiement,
  public.parametres,
  public.presence,
  public.seance,
  public.session,
  public.type_cours
from anon, authenticated;

commit;
