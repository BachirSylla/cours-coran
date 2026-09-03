-- =============================================================================
-- 0022_sessions.sql — la session, période qui regroupe les cours d'un centre
--
-- Un centre travaille par session : « Session 17 », « Session 18 »… Chacune
-- porte ses cours, ses niveaux, son planning. À la fin, on ouvre la suivante en
-- recopiant la structure — la reconduction viendra en phase 3.
--
-- ⚠️ LES SESSIONS SONT OPTIONNELLES, et cette migration doit être INVISIBLE pour
-- un centre qui n'en veut pas. Le backfill lui crée une session perpétuelle —
-- `date_fin` nulle, `en_cours` — qui contient tout, ne se ferme jamais, et
-- s'affiche comme un libellé plutôt qu'une liste déroulante. Rien ne change pour
-- lui : c'est l'exigence principale de cette phase, avant toute fonctionnalité.
--
-- ORDRE DES OPÉRATIONS, et il n'est pas interchangeable :
--
--   1. la table `session` (les colonnes qui suivent la référencent) ;
--   2. les colonnes de `cours`, NULLABLES d'abord ;
--   3. une session perpétuelle par CENTRE — y compris ceux qui n'ont aucun
--      cours, sinon leur responsable ne pourrait jamais en créer un ;
--   4. le rattachement, puis le CONTRÔLE qui interrompt tout si un cours reste
--      orphelin (motif 0015 : on compte avant, on compte après) ;
--   5. `not null`, puis la clé étrangère ;
--   6. les re-grants de colonnes — sans eux, plus aucun cours ne s'enregistre.
--
-- Migration idempotente, et TRANSACTIONNELLE.
--
-- ⚠️ Le `begin`/`commit` n'est pas décoratif. Entre le backfill et le
-- `set not null`, la colonne est nullable et `enregistrer_cours` est encore la
-- version de 0014, qui ne l'écrit pas : un cours créé par un client en vol dans
-- cette fenêtre naîtrait orphelin et ferait échouer le `set not null`, laissant
-- la migration à mi-chemin — table créée, colonnes ajoutées, ni clé étrangère
-- ni re-grants ni nouvelles fonctions. Tout ou rien.
-- =============================================================================

begin;

/*
 * Le verrou est pris AVANT le backfill, et tenu jusqu'au bout : aucun client ne
 * peut insérer un cours pendant que la colonne se remplit. `lock_timeout` (posé
 * par la ligne de commande) fait échouer bruyamment plutôt qu'attendre en
 * silence derrière une connexion PostgREST restée ouverte.
 */
lock table public.cours in access exclusive mode;

-- =============================================================================
-- 1. La table `session`
--
-- Même patron que tout depuis 0012 : `centre_id not null default
-- centre_courant()`, `unique (id, centre_id)` pour porter les clés étrangères
-- composites, RLS activée, écriture gardée `est_responsable()`.
--
-- La session est de la STRUCTURE, pas de la pédagogie (CLAUDE.md §5.13) : elle
-- décide quels cours existent et quand, ce qui est le métier du responsable.
-- L'enseignant la lit — il en a besoin pour se repérer — et ne l'écrit pas.
-- =============================================================================
create table if not exists public.session (
  id         uuid primary key default gen_random_uuid(),
  centre_id  uuid not null default public.centre_courant()
               references public.centre (id) on delete cascade,

  nom        text not null,
  date_debut date not null,

  /*
   * PRÉVISIONNELLE, et rien d'autre. Elle ne ferme jamais rien toute seule, peut
   * être dépassée sans conséquence, et reste modifiable tant que la session est
   * `en_cours`. Le seul verrou est l'action manuelle de clôture — sinon une
   * date saisie à la louche en septembre couperait la saisie en décembre, au
   * pire moment.
   */
  date_fin   date,

  statut     text not null default 'en_cours'
               check (statut in ('en_cours', 'terminee')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint session_dates_coherentes check (date_fin is null or date_fin >= date_debut),
  -- Porteur des clés étrangères composites : c'est lui qui empêche un cours de
  -- pointer la session d'un autre centre.
  constraint session_id_centre_unique unique (id, centre_id),
  -- « Session 17 » deux fois dans le même centre n'a pas de sens, et rendrait le
  -- sélecteur illisible. Deux centres peuvent en revanche avoir la même.
  constraint session_nom_unique_par_centre unique (centre_id, nom)
);

create index if not exists session_centre_id_idx on public.session (centre_id);

comment on column public.session.date_fin is
  'Prévisionnelle : n''interdit rien, peut être dépassée. Seule la clôture manuelle verrouille la saisie.';

drop trigger if exists session_set_updated_at on public.session;
create trigger session_set_updated_at
  before update on public.session
  for each row execute function public.set_updated_at();

alter table public.session enable row level security;

/*
 * ⚠️ Le prédicat de SELECT porte sur la COLONNE de la ligne, jamais sur un
 * helper qui relirait `session` (CLAUDE.md §5.10) : un helper `stable` ne voit
 * pas la ligne en cours d'insertion, et le `returning` que PostgREST ajoute dès
 * qu'un repository chaîne `.select()` échouerait sur toute création.
 */
drop policy if exists session_select on public.session;
create policy session_select on public.session
  for select to authenticated
  using (centre_id = (select public.centre_courant()));

drop policy if exists session_insert on public.session;
create policy session_insert on public.session
  for insert to authenticated
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists session_update on public.session;
create policy session_update on public.session
  for update to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()))
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

/*
 * Pas de policy de DELETE, délibérément. Une session supprimée emporterait la
 * question « et ses cours ? », à laquelle `on delete restrict` répond déjà par
 * un refus sec et illisible. Clôturer est le geste juste ; supprimer viendra
 * s'il se révèle nécessaire, avec sa propre RPC et ses propres gardes.
 */
grant select, insert, update on public.session to authenticated;

-- =============================================================================
-- 2. Les colonnes de `cours` — nullables pour l'instant
-- =============================================================================
alter table public.cours add column if not exists session_id uuid;
alter table public.cours add column if not exists niveau text;

comment on column public.cours.niveau is
  'Texte libre, proposé à la saisie parmi les niveaux déjà employés dans le centre. Filtrable. Volontairement pas une table de référence : un niveau se crée au moment où l''on crée le cours, pas dans un écran d''administration.';

-- =============================================================================
-- 3 & 4. Le backfill — zéro perte, et prouvé
--
-- ⚠️ On parcourt les CENTRES, pas les cours. Un centre neuf n'a aucun cours :
-- s'il n'obtenait pas de session, `session_id not null` interdirait à son
-- responsable de créer le premier — l'application serait morte à l'ouverture.
--
-- Idempotent : un centre qui a déjà une session n'en reçoit pas une seconde, et
-- un cours déjà rattaché n'est pas touché.
-- =============================================================================
do $$
declare
  v_avant  bigint;
  v_apres  bigint;
  v_orphelins bigint;
begin
  select count(*) into v_avant from public.cours;

  -- Une session perpétuelle par centre qui n'en a aucune. `date_debut` remonte
  -- au premier cours du centre pour que la période affichée ait un sens ; à
  -- défaut, aujourd'hui.
  insert into public.session (centre_id, nom, date_debut, date_fin, statut)
  select
    c.id,
    'Session en cours',
    coalesce((select min(co.date_debut) from public.cours as co where co.centre_id = c.id),
             current_date),
    null,
    'en_cours'
  from public.centre as c
  where not exists (select 1 from public.session as s where s.centre_id = c.id);

  -- Rattachement. Un centre a forcément une session ici, et une seule tant que
  -- personne n'en a créé d'autres.
  update public.cours as co
  set session_id = (
    select s.id from public.session as s
    where s.centre_id = co.centre_id
    order by s.date_debut, s.created_at
    limit 1
  )
  where co.session_id is null;

  select count(*) into v_orphelins from public.cours where session_id is null;
  select count(*) into v_apres from public.cours;

  /*
   * Les deux contrôles ne disent pas la même chose : le premier prouve que rien
   * n'est resté sur le bord, le second qu'aucune ligne n'a disparu en chemin.
   * Une migration qui rattache 8 cours sur 9 est pire qu'une qui échoue.
   */
  if v_orphelins > 0 then
    raise exception
      'BACKFILL INTERROMPU : % cours sans session. Un centre n''a probablement pas reçu la sienne.',
      v_orphelins using errcode = 'P0063';
  end if;

  if v_apres <> v_avant then
    raise exception 'BACKFILL INTERROMPU : % cours avant, % après.', v_avant, v_apres
      using errcode = 'P0063';
  end if;

  raise notice 'Backfill : % cours rattachés, aucun orphelin.', v_apres;
end
$$;

-- =============================================================================
-- 4 bis. Tout centre NEUF naît avec sa session
--
-- ⚠️ Le backfill ci-dessus ne couvre que les centres EXISTANTS. Un centre créé
-- après cette migration n'aurait aucune session, et `session_id not null`
-- interdirait à son responsable de créer son premier cours : une application
-- morte à l'ouverture, sans message qui explique pourquoi.
--
-- Un trigger plutôt qu'une ligne ajoutée au script d'administration : la
-- garantie ne doit pas dépendre du chemin emprunté. `after insert` — la ligne
-- `centre` doit exister avant qu'une session puisse la référencer.
-- =============================================================================
create or replace function public.centre_session_par_defaut()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.session (centre_id, nom, date_debut, date_fin, statut)
  values (new.id, 'Session en cours', current_date, null, 'en_cours');

  return new;
end;
$function$;

alter function public.centre_session_par_defaut() owner to postgres;
revoke all on function public.centre_session_par_defaut() from public, anon, authenticated;

drop trigger if exists centre_session_par_defaut on public.centre;
create trigger centre_session_par_defaut
  after insert on public.centre
  for each row execute function public.centre_session_par_defaut();

-- =============================================================================
-- 5. `not null` et la clé étrangère composite
--
-- `on delete restrict`, jamais cascade : supprimer une session ne doit pas
-- emporter des cours, et donc leurs séances, présences et notes. Le refus est
-- brutal mais réparable ; la cascade ne l'est pas.
-- =============================================================================
alter table public.cours alter column session_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cours'::regclass and conname = 'cours_session_du_centre_fkey'
  ) then
    alter table public.cours add constraint cours_session_du_centre_fkey
      foreign key (session_id, centre_id)
      references public.session (id, centre_id)
      on delete restrict;
  end if;
end
$$;

create index if not exists cours_session_id_idx on public.cours (session_id);

-- =============================================================================
-- 6. Les re-grants — l'étape qu'on oublie, et qui casse tout en silence
--
-- `cours` n'a AUCUN privilège d'écriture au niveau table : la liste des colonnes
-- accordées est exactement ce que `enregistrer_cours` écrit, et rien de plus
-- (CLAUDE.md §5.13). `enregistrer_cours` étant `security invoker`, ces
-- privilèges s'appliquent À L'INTÉRIEUR d'elle : une colonne oubliée ici fait
-- échouer toute création et toute édition de cours, sans message utile côté
-- client.
--
-- Un `grant` de colonne est cumulatif : réaccorder la liste complète est donc
-- idempotent et lisible d'un coup d'œil.
-- =============================================================================
grant insert (
  libelle, type_cours_id, format, date_debut, date_fin, statut, enseignant_id,
  session_id, niveau
) on public.cours to authenticated;

grant update (
  libelle, type_cours_id, format, date_debut, date_fin, statut, enseignant_id,
  session_id, niveau
) on public.cours to authenticated;

-- =============================================================================
-- 7. `enregistrer_cours` — la session entre dans le garde-fou
--
-- Corps de 0014, augmenté de quatre choses et rien d'autre :
--
--   * `session_id` et `niveau` écrits, avec la règle « le silence n'est pas un
--     effacement » déjà appliquée à `enseignant_id` et au prix ;
--   * P0060 : un cours doit appartenir à une session (à la CRÉATION seulement) ;
--   * P0061 : une session clôturée n'accepte ni création ni modification ;
--   * le conflit ne compare plus que les créneaux de la MÊME session.
--
-- ⚠️ `security invoker` : les privilèges de colonne posés au §6 s'appliquent à
-- l'INTÉRIEUR de cette fonction. La liste re-grantée couvre exactement ce que le
-- corps ci-dessous écrit — pas une de plus, pas une de moins.
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
  v_a_prix   := p_cours ? 'prix_mensuel';
  v_a_devise := p_cours ? 'devise';

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

  select t.prix_mensuel, coalesce(t.devise, 'XOF')
  into v_prix, v_devise
  from jsonb_to_record(p_cours) as t(prix_mensuel numeric, devise text);

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
  if v_a_prix or v_a_devise then
    insert into public.tarif (cours_id, centre_id, prix_mensuel, devise)
    values (v_cours.id, v_cours.centre_id, v_prix, v_devise)
    on conflict (cours_id) do update
    set prix_mensuel = case when v_a_prix then excluded.prix_mensuel
                            else public.tarif.prix_mensuel end,
        devise       = case when v_a_devise then excluded.devise
                            else public.tarif.devise end;
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
-- 8. `retirer_membre` — le même invariant, troisième et dernier endroit
--
-- Corps de 0018, augmenté d'UNE ligne : le contrôle de chevauchement final ne
-- compare plus que des cours de la même session. Sans elle, transférer les cours
-- d'un partant serait refusé dès que deux sessions emploient le même créneau —
-- c'est-à-dire dès la première reconduction.
--
-- L'invariant de conflit vit donc à TROIS endroits, et aucun ne partage de code
-- avec les autres : `enregistrer_cours`, `shared/lib/conflits.ts`, et ici.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.retirer_membre(p_user_id uuid, p_reaffecter_a uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_centre  uuid := (select public.centre_courant());
  v_moi     uuid := (select auth.uid());
  v_role      text;
  v_cours     integer;
  v_supprimes integer;
  v_choc_a    text;
  v_choc_b    text;
begin
  if not (select public.est_responsable()) then
    raise exception 'Seul le responsable du centre peut retirer un membre.'
      using errcode = 'P0030';
  end if;

  -- Un seul message pour « n'existe pas » et « pas votre centre » : pas d'oracle
  -- d'existence d'un centre à l'autre.
  select role into v_role
  from public.membre
  where user_id = p_user_id and centre_id = v_centre;

  if not found then
    raise exception 'Ce membre est introuvable dans votre centre.' using errcode = 'P0031';
  end if;

  /*
   * `null` est une valeur ACCEPTÉE — « laisser sans enseignant » — et non un
   * paramètre oublié : la fonction n'a pas de `default`, donc l'omettre échoue.
   * La distinction porte tout : un vieux client ne doit pas orphaniser par
   * accident, mais le responsable doit pouvoir le décider.
   */
  if p_reaffecter_a is not null then
    if p_reaffecter_a = p_user_id then
      raise exception 'On ne peut pas réaffecter les cours au membre qui part.'
        using errcode = 'P0031';
    end if;

    if not exists (
      select 1 from public.membre
      where user_id = p_reaffecter_a and centre_id = v_centre
    ) then
      raise exception 'L''enseignant qui doit reprendre les cours n''est pas de votre centre.'
        using errcode = 'P0031';
    end if;
  end if;

  /*
   * VERROU. Sans lui, deux retraits concurrents laissent un centre SANS AUCUN
   * responsable — et c'est irrécupérable : aucun chemin ne permet de promouvoir
   * quelqu'un, `role` n'étant accordé à personne en écriture.
   *
   * Le trigger de 0012 ne rattrape pas ce cas : son `select` est ordinaire, donc
   * en READ COMMITTED il ne voit pas la suppression non validée de l'autre
   * transaction — exactement comme le contrôle ci-dessous. Les deux passent, les
   * deux valident, le centre est bloqué.
   *
   * `for update` sérialise : la seconde transaction attend, puis relit dans un
   * instantané frais (nouvelle instruction en READ COMMITTED) et voit le départ
   * de la première.
   */
  perform 1 from public.membre
  where centre_id = v_centre and role = 'responsable'
  for update;

  /*
   * Le dernier responsable, AVANT le contrôle « pas soi-même » — et l'ordre
   * compte.
   *
   * Un responsable seul dans son centre ne peut viser que lui-même : mettre
   * « pas soi-même » en premier rendrait ce contrôle-ci inatteignable, et lui
   * répondrait « vous ne pouvez pas vous retirer » là où la vraie raison est
   * qu'il n'y a personne pour prendre la suite. Dans cet ordre, il apprend
   * quoi faire : nommer un second responsable d'abord.
   *
   * Le trigger `refuser_dernier_responsable` (0012) reste le filet.
   */
  if v_role = 'responsable' and not exists (
    select 1 from public.membre
    where centre_id = v_centre and role = 'responsable' and user_id <> p_user_id
  ) then
    raise exception 'Un centre doit garder au moins un responsable. Nommez-en un autre avant de retirer celui-ci.'
      using errcode = 'P0032';
  end if;

  -- On ne se retire pas soi-même : se verrouiller dehors n'est pas un geste
  -- qu'on doit pouvoir faire par accident. C'est à un autre responsable de le
  -- faire.
  if p_user_id = v_moi then
    raise exception 'Vous ne pouvez pas vous retirer vous-même du centre.'
      using errcode = 'P0030';
  end if;

  -- Compté AVANT, pour pouvoir l'annoncer même quand on n'a rien réaffecté :
  -- c'est le nombre de cours que ce retrait déplace, ou orphanise.
  select count(*) into v_cours
  from public.cours
  where enseignant_id = p_user_id and centre_id = v_centre;

  /*
   * RÉAFFECTER D'ABORD, supprimer ensuite — l'ordre n'est pas interchangeable.
   * Supprimer en premier déclencherait `on delete set null`, qui effacerait
   * précisément l'information « quels cours étaient les siens » : il n'y aurait
   * plus rien à réaffecter.
   *
   * Cible nulle : on ne touche à rien, et c'est la suppression qui orphanise.
   * `cours_animables()` (0017) rend ces cours au responsable, donc rien ne gèle.
   */
  if p_reaffecter_a is not null then
    update public.cours
    set enseignant_id = p_reaffecter_a
    where enseignant_id = p_user_id and centre_id = v_centre;
  end if;

  -- Les deux écritures vivent dans la transaction de l'appelant : elles
  -- réussissent ou échouent ensemble, sans machinerie supplémentaire.
  begin
    delete from public.membre where user_id = p_user_id and centre_id = v_centre;
  exception
    when sqlstate 'P0004' then
      -- Le trigger reste le filet, notamment pour une suppression directe par
      -- `service_role`. On retraduit plutôt que de laisser passer son exception.
      raise exception 'Un centre doit garder au moins un responsable.' using errcode = 'P0032';
  end;

  get diagnostics v_supprimes = row_count;

  -- Zéro ligne : quelqu'un d'autre vient de le retirer. Rapporter un succès pour
  -- une suppression qui n'a pas eu lieu serait pire que le refus.
  if v_supprimes = 0 then
    raise exception 'Ce membre est introuvable dans votre centre.' using errcode = 'P0031';
  end if;

  /*
   * ⚠️ Le garde-fou de chevauchement (CLAUDE.md §5.1) vit dans
   * `enregistrer_cours`, jamais en contrainte : une réaffectation par UPDATE le
   * contournerait en silence, et poserait deux cours du même enseignant sur le
   * même créneau. Pire, ces cours deviendraient INEDITABLES — toute sauvegarde
   * ultérieure lèverait P0003, y compris celle qui voudrait les séparer.
   *
   * On le vérifie donc sur l'état FINAL, après suppression : lever ici annule
   * tout, et le responsable choisit une autre cible ou déplace un créneau.
   * Le cas « sans enseignant » compte autant — `is not distinct from` range tous
   * les orphelins dans un même agenda.
   */
  select a_cours.libelle, b_cours.libelle
  into v_choc_a, v_choc_b
  from public.creneau as a
  join public.creneau as b
    on b.centre_id     = a.centre_id
   and b.cours_id     <> a.cours_id
   and b.jour_semaine  = a.jour_semaine
   and a.heure_debut   < b.heure_fin
   and b.heure_debut   < a.heure_fin
  join public.cours as a_cours on a_cours.id = a.cours_id
  join public.cours as b_cours on b_cours.id = b.cours_id
  where a_cours.centre_id = v_centre
    and a_cours.enseignant_id is not distinct from b_cours.enseignant_id
    and a_cours.enseignant_id is not distinct from p_reaffecter_a
    -- ⚠️ MÊME SESSION (0022). L'invariant de conflit vit à TROIS endroits :
    -- `enregistrer_cours`, `shared/lib/conflits.ts`, et ici. L'oublier ici
    -- refuserait des transferts parfaitement légitimes — deux cours du même
    -- créneau dans deux sessions différentes ne se gênent pas.
    and a_cours.session_id = b_cours.session_id
  limit 1;

  if v_choc_a is not null then
    raise exception
      'Ce transfert placerait « % » et « % » sur le même créneau. Choisissez un autre enseignant, ou déplacez un créneau d''abord.',
      v_choc_a, v_choc_b using errcode = 'P0033';
  end if;

  return v_cours;
end;
$function$;

commit;
