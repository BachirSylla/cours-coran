-- =============================================================================
-- 0017_autonomie_enseignant.sql — le responsable tient la structure,
--                                 l'enseignant anime son cours
--
-- Renverse la frontière posée par 0011 (« réglages spécifiques = responsable
-- seul ») et par 0012 (la note d'examen rangée du côté gestion). Désormais :
--
--   RESPONSABLE  identité du cours, créneaux, affectation, prix, roster,
--                réglages PAR DÉFAUT du centre ;
--   ENSEIGNANT   séances, présences, notes, examen, surcharges de notation,
--                logo du cours, lien de partage, lien visio, rapport
--                — sur les seuls cours dont il est l'enseignant affecté.
--
-- LA RÈGLE QUI DÉCIDE DE CHAQUE CAS. Les privilèges de colonne portent sur le
-- rôle Postgres `authenticated`, que le responsable et l'enseignant partagent :
-- ils ne peuvent JAMAIS séparer les deux. D'où :
--
--     on DÉCOMPOSE quand la LECTURE doit se fermer ;
--     on RÉVOQUE LA COLONNE et on passe par une RPC quand seule l'ÉCRITURE
--     se ferme.
--
-- Une seule décomposition en découle — `tarif` — parce que c'est le seul cas
-- où un rôle doit cesser de LIRE. Tout le reste garde ses colonnes en place,
-- ce qui évite un déplacement de données là où rien ne l'exige.
--
-- Migration idempotente.
-- =============================================================================

-- =============================================================================
-- 1. Le helper : ce que j'enseigne, pas ce que je vois
--
-- ⚠️ Strictement `enseignant_id = auth.uid()`. Employer `cours_lisibles()` ici
-- rendrait au responsable, pour les cours d'autrui, tout ce que ce lot vient de
-- lui retirer. Les suffixes se lisent : `_lisibles` = ce que je vois,
-- `_enseignes` = ce que j'anime.
-- =============================================================================
create or replace function public.cours_enseignes()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
  from public.cours as c
  where c.centre_id = (select public.centre_courant())
    and c.enseignant_id = (select auth.uid());
$$;

/*
 * Ce que j'ai le droit d'ANIMER — l'usage réel des policies pédagogiques.
 *
 * C'est `cours_enseignes()`, PLUS les cours sans enseignant affecté quand on
 * est responsable. Sans cette seconde branche, supprimer un membre gèlerait
 * définitivement ses anciens cours : `cours.enseignant_id` est `on delete set
 * null` (0012), et plus personne — pas même le responsable — ne pourrait y
 * toucher une séance ou une note. Ce n'est pas un contournement : un cours que
 * personne n'enseigne ne prive personne.
 */
create or replace function public.cours_animables()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
  from public.cours as c
  where c.centre_id = (select public.centre_courant())
    and (
      c.enseignant_id = (select auth.uid())
      or (c.enseignant_id is null and (select public.est_responsable()))
    );
$$;

alter function public.cours_enseignes() owner to postgres;
alter function public.cours_animables() owner to postgres;

-- =============================================================================
-- 2. `tarif` — la seule table nouvelle, et la fermeture d'une fuite
--
-- Un enseignant lisait `cours.prix_mensuel` sur ses propres cours : l'interface
-- le masquait, la RLS non. Sortir la colonne est le seul moyen de fermer cette
-- lecture, puisque `revoke select (colonne)` la retirerait aussi au responsable.
--
-- Ferme du même coup une fuite plus discrète : `inscriptionRepo.listByApprenant`
-- embarque `cours(*)` — prix compris — dans la fiche d'un apprenant.
-- =============================================================================
create table if not exists public.tarif (
  cours_id     uuid primary key,
  centre_id    uuid not null default public.centre_courant(),
  prix_mensuel numeric(10, 2),
  devise       text not null default 'XOF' check (char_length(devise) = 3),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Composite, comme toute FK depuis 0012 : la clé transporte le tenant.
  constraint tarif_cours_fkey foreign key (cours_id, centre_id)
    references public.cours (id, centre_id) on delete cascade
);

create index if not exists tarif_centre_id_idx on public.tarif (centre_id);

drop trigger if exists tarif_set_updated_at on public.tarif;
create trigger tarif_set_updated_at
  before update on public.tarif
  for each row execute function public.set_updated_at();

-- Recopie AVANT toute suppression. Le bloc se saute proprement au rejeu, quand
-- les colonnes source n'existent plus.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cours' and column_name = 'prix_mensuel'
  ) then
    execute $sql$
      insert into public.tarif (cours_id, centre_id, prix_mensuel, devise)
      select c.id, c.centre_id, c.prix_mensuel, coalesce(c.devise, 'XOF')
      from public.cours as c
      where c.prix_mensuel is not null or c.devise is distinct from 'XOF'
      on conflict (cours_id) do nothing
    $sql$;
  end if;
end
$$;

alter table public.tarif enable row level security;

/*
 * Lecture COMPRISE dans la garde : c'est tout l'objet de la décomposition. Un
 * enseignant simple n'obtient pas la ligne — l'embed PostgREST lui renvoie
 * `null`, pas une erreur. Un responsable qui enseigne aussi le cours la lit :
 * il est responsable.
 */
drop policy if exists "tarif_select_responsable" on public.tarif;
create policy "tarif_select_responsable"
  on public.tarif for select to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "tarif_insert_responsable" on public.tarif;
create policy "tarif_insert_responsable"
  on public.tarif for insert to authenticated
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "tarif_update_responsable" on public.tarif;
create policy "tarif_update_responsable"
  on public.tarif for update to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()))
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "tarif_delete_responsable" on public.tarif;
create policy "tarif_delete_responsable"
  on public.tarif for delete to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

revoke all on public.tarif from anon, authenticated;
grant select, insert, update, delete on public.tarif to authenticated;

-- =============================================================================
-- 3. Les réglages de notation du cours — RPC, liste blanche de clés
--
-- `jsonb_to_record` avec une liste de colonnes EXPLICITE est la liste blanche :
-- toute clé inattendue de la charge utile est ignorée, elle ne peut pas se
-- déverser dans la ligne.
--
-- ⚠️ C'est un REMPLACEMENT des sept réglages, pas un patch : une clé absente
-- vaut null, c'est-à-dire « hériter du centre », et non « inchangé ». C'est le
-- contrat du formulaire, qui les envoie toujours ensemble — mais quiconque
-- appellerait cette RPC avec une charge partielle effacerait le reste.
-- =============================================================================
create or replace function public.definir_reglages_cours(p_cours_id uuid, p_reglages jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_touchees integer;
begin
  if not (p_cours_id = any ((select public.cours_animables())::uuid[])) then
    raise exception 'Seul l''enseignant de ce cours peut en changer les réglages.'
      using errcode = 'P0020';
  end if;

  update public.cours as cible
  set logo                        = r.logo,
      assiduite_active            = r.assiduite_active,
      base_academique             = r.base_academique,
      bareme_assiduite            = r.bareme_assiduite,
      penalite_absence            = r.penalite_absence,
      penalite_retard             = r.penalite_retard,
      penaliser_absences_excusees = r.penaliser_absences_excusees
  from jsonb_to_record(coalesce(p_reglages, '{}'::jsonb)) as r(
    logo text, assiduite_active boolean, base_academique text,
    -- `smallint`, comme la colonne : déclaré `numeric`, un 3,7 serait arrondi
    -- en silence au lieu d'être refusé.
    bareme_assiduite smallint, penalite_absence numeric, penalite_retard numeric,
    penaliser_absences_excusees boolean
  )
  where cible.id = p_cours_id;

  get diagnostics v_touchees = row_count;

  if v_touchees = 0 then
    raise exception 'Cours introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- =============================================================================
-- 3 bis. Le lien visio finit dans un href — et sur la page PUBLIQUE
--
-- `cours_public` republie `lien_meet` à des visiteurs non authentifiés, et
-- `LienMeet` le rend en `<a href>`. `URL.canParse` côté client accepte
-- `javascript:` : sans garde en base, un lien actif s'exécuterait chez
-- l'apprenant. Même motif que `cours_logo_valide` (0011), qui verrouille une
-- autre colonne finissant en HTML.
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cours'::regclass and conname = 'cours_lien_meet_valide'
  ) then
    alter table public.cours add constraint cours_lien_meet_valide
      check (lien_meet is null or lien_meet ~ '^https?://');
  end if;
end
$$;

-- =============================================================================
-- 4. Le lien de visioconférence — l'enseignant, pas le responsable
-- =============================================================================
create or replace function public.definir_lien_meet(p_cours_id uuid, p_lien text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_touchees integer;
begin
  if not (p_cours_id = any ((select public.cours_animables())::uuid[])) then
    raise exception 'Seul l''enseignant de ce cours peut en changer le lien de visioconférence.'
      using errcode = 'P0020';
  end if;

  update public.cours
  set lien_meet = nullif(btrim(coalesce(p_lien, '')), '')
  where id = p_cours_id;

  get diagnostics v_touchees = row_count;

  if v_touchees = 0 then
    raise exception 'Cours introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- =============================================================================
-- 5. La note d'examen — la cible est résolue jusqu'au cours
--
-- L'appelant fournit une INSCRIPTION ; la fonction remonte elle-même à son
-- cours et vérifie qu'elle l'enseigne. Le client ne nomme donc jamais le cours,
-- et ne peut pas le forcer — même principe que le code d'invitation du lot 4.
-- =============================================================================
create or replace function public.noter_examen(
  p_inscription_id uuid,
  p_note           numeric,
  p_bareme         numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_touchees integer;
begin
  update public.inscription
  set note_examen   = p_note,
      examen_bareme = case when p_note is null then null else p_bareme end
  where id = p_inscription_id
    and cours_id = any ((select public.cours_animables())::uuid[]);

  get diagnostics v_touchees = row_count;

  if v_touchees = 0 then
    -- Inscription inexistante, ou cours qu'on n'enseigne pas : un seul message,
    -- donc aucun oracle d'existence entre enseignants.
    raise exception 'Seul l''enseignant de ce cours peut y saisir une note d''examen.'
      using errcode = 'P0020';
  end if;
end;
$$;

-- =============================================================================
-- 6. Le partage — d'`invoker` à `definer`, avec sa garde propre
--
-- Les trois fonctions de 0007 étaient `security invoker` et ne portaient AUCUN
-- contrôle : elles s'appuyaient sur la policy d'UPDATE de `cours`, donc sur
-- `est_responsable()`. Deux raisons de les basculer :
--   * le partage devient le métier de l'enseignant ;
--   * `jeton_partage` sort des colonnes accordées plus bas — une fonction
--     `invoker` ne pourrait plus l'écrire du tout.
-- =============================================================================
create or replace function public.activer_partage(p_cours_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_jeton uuid;
begin
  if not (p_cours_id = any ((select public.cours_animables())::uuid[])) then
    raise exception 'Seul l''enseignant de ce cours peut en activer le partage.'
      using errcode = 'P0020';
  end if;

  -- Idempotent : un lien déjà actif n'est pas remplacé.
  update public.cours
  set jeton_partage = coalesce(jeton_partage, gen_random_uuid())
  where id = p_cours_id
  returning jeton_partage into v_jeton;

  return v_jeton;
end;
$$;

create or replace function public.regenerer_partage(p_cours_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_jeton uuid;
begin
  if not (p_cours_id = any ((select public.cours_animables())::uuid[])) then
    raise exception 'Seul l''enseignant de ce cours peut en régénérer le lien.'
      using errcode = 'P0020';
  end if;

  update public.cours
  set jeton_partage = gen_random_uuid()
  where id = p_cours_id
  returning jeton_partage into v_jeton;

  return v_jeton;
end;
$$;

create or replace function public.revoquer_partage(p_cours_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (p_cours_id = any ((select public.cours_animables())::uuid[])) then
    raise exception 'Seul l''enseignant de ce cours peut en révoquer le lien.'
      using errcode = 'P0020';
  end if;

  update public.cours set jeton_partage = null where id = p_cours_id;
end;
$$;

alter function public.definir_reglages_cours(uuid, jsonb) owner to postgres;
alter function public.definir_lien_meet(uuid, text)       owner to postgres;
alter function public.noter_examen(uuid, numeric, numeric) owner to postgres;
alter function public.activer_partage(uuid)                owner to postgres;
alter function public.regenerer_partage(uuid)              owner to postgres;
alter function public.revoquer_partage(uuid)               owner to postgres;

-- =============================================================================
-- 7. `enregistrer_cours` — la structure, et le prix routé vers `tarif`
--
-- Elle reste `security invoker` : la policy responsable de `cours` et celle de
-- `tarif` font l'autorisation, comme avant. Elle n'écrit plus `lien_meet`, qui
-- appartient désormais à l'enseignant.
-- =============================================================================
do $$
declare v_fonction record;
begin
  for v_fonction in
    select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
    from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enregistrer_cours'
  loop
    execute format('drop function public.%I(%s)', v_fonction.proname, v_fonction.arguments);
  end loop;
end
$$;

create function public.enregistrer_cours(
  p_cours    jsonb,
  p_creneaux jsonb,
  p_cours_id uuid default null
)
returns public.cours
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cours      public.cours;
  v_creneau    jsonb;
  v_libelle    text;
  v_enseignant text;
  v_prix       numeric;
  v_devise     text;
  v_a_prix     boolean;
  v_a_devise   boolean;
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

  select t.prix_mensuel, coalesce(t.devise, 'XOF')
  into v_prix, v_devise
  from jsonb_to_record(p_cours) as t(prix_mensuel numeric, devise text);

  if p_cours_id is null then
    insert into public.cours (
      libelle, type_cours_id, format, date_debut, date_fin, statut, enseignant_id
    )
    select
      c.libelle, c.type_cours_id, c.format, c.date_debut, c.date_fin,
      coalesce(c.statut, 'actif'),
      coalesce(c.enseignant_id, (select auth.uid()))
    from jsonb_to_record(p_cours) as c(
      libelle text, type_cours_id uuid, format text, date_debut date, date_fin date,
      statut text, enseignant_id uuid
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
        enseignant_id = coalesce(c.enseignant_id, cible.enseignant_id)
    from jsonb_to_record(p_cours) as c(
      libelle text, type_cours_id uuid, format text, date_debut date, date_fin date,
      statut text, enseignant_id uuid
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
$$;

comment on function public.enregistrer_cours(jsonb, jsonb, uuid) is
  'Enregistre la STRUCTURE d''un cours — identité, affectation, créneaux, tarif — dans une seule transaction, et refuse tout chevauchement avec un autre cours du même enseignant (CLAUDE.md §5.1). Le lien visio et les réglages relèvent de l''enseignant, par leurs propres RPC.';

-- =============================================================================
-- 8. Les verrous de colonne
--
-- ⚠️ `revoke <priv> (colonne)` seul est SANS EFFET tant qu'un privilège de TABLE
-- le couvre : on retire celui de la table, puis on réaccorde colonne par colonne.
--
-- ⚠️ `enregistrer_cours` est `security invoker` : ces privilèges s'appliquent À
-- L'INTÉRIEUR d'elle. La liste ci-dessous doit donc couvrir EXACTEMENT ce
-- qu'elle écrit, ni plus ni moins — une colonne oubliée casse toute création et
-- toute édition de cours, en silence côté client.
-- =============================================================================
revoke insert, update on public.cours from authenticated;

grant insert (libelle, type_cours_id, format, date_debut, date_fin, statut, enseignant_id)
  on public.cours to authenticated;
grant update (libelle, type_cours_id, format, date_debut, date_fin, statut, enseignant_id)
  on public.cours to authenticated;

/*
 * Restent volontairement DEHORS, donc écrivables par les seules RPC ci-dessus :
 *   lien_meet, jeton_partage, logo, assiduite_active, base_academique,
 *   bareme_assiduite, penalite_absence, penalite_retard,
 *   penaliser_absences_excusees.
 * Le SELECT reste plein : la lecture ne se resserre pas (le rapport en dépend).
 */

-- L'examen sort des deux listes : ni le responsable ni l'enseignant ne l'écrit
-- directement. `noter_examen` est le seul chemin, et elle vérifie l'enseignant.
revoke insert, update on public.inscription from authenticated;
grant insert (id, centre_id, apprenant_id, cours_id, created_at, updated_at)
  on public.inscription to authenticated;
grant update (id, centre_id, apprenant_id, cours_id, created_at, updated_at)
  on public.inscription to authenticated;

-- =============================================================================
-- 9. Le pédagogique se resserre sur l'enseignant affecté
--
-- Les LECTURES ne bougent pas — `cours_lisibles()` partout : un responsable doit
-- pouvoir lire les séances et les notes de tout son centre pour sortir un
-- rapport. Seule l'ÉCRITURE passe à `cours_enseignes()`.
-- =============================================================================
drop policy if exists "seance_insert" on public.seance;
create policy "seance_insert"
  on public.seance for insert to authenticated
  with check (
    centre_id = (select public.centre_courant())
    and cours_id = any ((select public.cours_animables())::uuid[])
  );

drop policy if exists "seance_update" on public.seance;
create policy "seance_update"
  on public.seance for update to authenticated
  using (cours_id = any ((select public.cours_animables())::uuid[]))
  with check (
    centre_id = (select public.centre_courant())
    and cours_id = any ((select public.cours_animables())::uuid[])
  );

drop policy if exists "seance_delete" on public.seance;
create policy "seance_delete"
  on public.seance for delete to authenticated
  using (cours_id = any ((select public.cours_animables())::uuid[]));

drop policy if exists "presence_insert" on public.presence;
create policy "presence_insert"
  on public.presence for insert to authenticated
  with check (
    centre_id = (select public.centre_courant())
    and cours_id = any ((select public.cours_animables())::uuid[])
  );

drop policy if exists "presence_update" on public.presence;
create policy "presence_update"
  on public.presence for update to authenticated
  using (cours_id = any ((select public.cours_animables())::uuid[]))
  with check (
    centre_id = (select public.centre_courant())
    and cours_id = any ((select public.cours_animables())::uuid[])
  );

drop policy if exists "presence_delete" on public.presence;
create policy "presence_delete"
  on public.presence for delete to authenticated
  using (cours_id = any ((select public.cours_animables())::uuid[]));

-- =============================================================================
-- 10. Le prix quitte `cours` — contrôle préalable, puis RESTRICT
--
-- Motif de 0015 : on ne retire une colonne qu'après avoir prouvé que chacune de
-- ses valeurs est arrivée à destination. Le bloc REFUSE au moindre écart, et se
-- saute proprement au rejeu.
-- =============================================================================
do $$
declare
  v_source   bigint;
  v_arrivee  bigint;
  v_manquant bigint;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cours' and column_name = 'prix_mensuel'
  ) then
    return;  -- déjà migré
  end if;

  execute $sql$
    select count(*) from public.cours where prix_mensuel is not null
  $sql$ into v_source;

  execute $sql$
    select count(*)
    from public.cours as c
    join public.tarif as t on t.cours_id = c.id
    where c.prix_mensuel is not null and t.prix_mensuel is not distinct from c.prix_mensuel
  $sql$ into v_arrivee;

  execute $sql$
    select count(*)
    from public.cours as c
    left join public.tarif as t on t.cours_id = c.id
    where (c.prix_mensuel is not null and t.prix_mensuel is distinct from c.prix_mensuel)
       or (c.devise is distinct from 'XOF' and t.devise is distinct from c.devise)
  $sql$ into v_manquant;

  if v_manquant > 0 then
    raise exception
      'Refus de supprimer le prix : % ligne(s) mal recopiée(s) vers `tarif`.', v_manquant;
  end if;

  if v_source <> v_arrivee then
    raise exception
      'Refus de supprimer le prix : % prix en source, % arrivés à destination.',
      v_source, v_arrivee;
  end if;

  raise notice 'Bascule du prix vérifiée : % valeur(s) recopiée(s) à l''identique.', v_source;

  -- Sans `cascade` : si quoi que ce soit dépendait encore de ces colonnes, la
  -- migration doit échouer bruyamment plutôt que l'emporter en silence.
  alter table public.cours drop column prix_mensuel;
  alter table public.cours drop column devise;
end
$$;

-- =============================================================================
-- 11. Droits des fonctions — hygiène `definer` du lot 4
-- =============================================================================
revoke all on function public.cours_enseignes() from public, anon, authenticated;
revoke all on function public.cours_animables() from public, anon, authenticated;
revoke all on function public.definir_reglages_cours(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.definir_lien_meet(uuid, text) from public, anon, authenticated;
revoke all on function public.noter_examen(uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function public.activer_partage(uuid) from public, anon, authenticated;
revoke all on function public.regenerer_partage(uuid) from public, anon, authenticated;
revoke all on function public.revoquer_partage(uuid) from public, anon, authenticated;
revoke all on function public.enregistrer_cours(jsonb, jsonb, uuid) from public, anon, authenticated;

grant execute on function public.cours_enseignes() to authenticated;
grant execute on function public.cours_animables() to authenticated;
grant execute on function public.definir_reglages_cours(uuid, jsonb) to authenticated;
grant execute on function public.definir_lien_meet(uuid, text) to authenticated;
grant execute on function public.noter_examen(uuid, numeric, numeric) to authenticated;
grant execute on function public.activer_partage(uuid) to authenticated;
grant execute on function public.regenerer_partage(uuid) to authenticated;
grant execute on function public.revoquer_partage(uuid) to authenticated;
grant execute on function public.enregistrer_cours(jsonb, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
