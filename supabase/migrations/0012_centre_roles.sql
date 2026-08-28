-- =============================================================================
-- 0012_centre_roles.sql — le centre devient le propriétaire, les rôles décident
--
-- L'application était mono-utilisateur : 8 tables portaient `owner_id` et 31
-- policies disaient `auth.uid() = owner_id`. Les données appartiennent désormais
-- à un CENTRE, et un RÔLE décide de ce que chacun voit.
--
-- L'enseignant solo devient un centre à une personne, responsable ET enseignant.
-- Un seul modèle, pas de cas particulier.
--
-- `owner_id` est CONSERVÉ ici, en filet : rendu nullable, son défaut retiré, ses
-- policies supprimées. Il n'est plus qu'une trace d'audit. Sa suppression —
-- seul acte irréversible — fait l'objet de la migration 0013, une fois celle-ci
-- éprouvée.
--
-- Gain collatéral : supprimer un compte ne détruit plus les données. L'ancien
-- `owner_id ... on delete cascade` le faisait.
--
-- Migration idempotente.
-- =============================================================================

-- =============================================================================
-- 1. Le centre et ses membres
-- =============================================================================
create table if not exists public.centre (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.membre (
  id          uuid primary key default gen_random_uuid(),
  centre_id   uuid not null references public.centre (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('responsable', 'enseignant')),
  -- Dénormalisé : `auth.users` est illisible depuis le client comme depuis un
  -- helper. Sans ce champ, une liste « affecter un enseignant » n'a rien à
  -- afficher.
  nom_affiche text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Simplification du lot 1, et elle porte : c'est elle qui rend
  -- `centre_courant()` scalaire et supprime l'ambiguïté « dans quel centre
  -- j'agis ». À relâcher le jour où la multi-appartenance sera un vrai besoin.
  constraint membre_user_unique unique (user_id),
  -- Cible de la clé étrangère composite de `cours.enseignant_id`.
  constraint membre_user_centre_unique unique (user_id, centre_id)
);

/*
 * Barème des notes de RÉCITATION, propre à chaque enseignant.
 *
 * Il ne vit pas dans `parametres` — qui est la configuration de notation du
 * centre, réservée au responsable — parce que ce n'est pas une règle de
 * notation : c'est la façon dont un enseignant note au quotidien, et chaque
 * note en garde de toute façon une copie (`presence.note_bareme`). Le lui
 * refuser serait absurde ; ouvrir `parametres` pour autant lui donnerait les
 * pénalités et les pondérations.
 *
 * `null` = hérite du centre (`parametres.note_bareme`), ce qui préserve
 * exactement le comportement d'avant cette migration.
 */
alter table public.membre add column if not exists note_bareme numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.membre'::regclass and conname = 'membre_note_bareme_valide'
  ) then
    alter table public.membre add constraint membre_note_bareme_valide
      check (note_bareme is null or note_bareme in (10, 20));
  end if;
end
$$;

create index if not exists membre_centre_id_idx on public.membre (centre_id);

drop trigger if exists centre_set_updated_at on public.centre;
create trigger centre_set_updated_at
  before update on public.centre
  for each row execute function public.set_updated_at();

drop trigger if exists membre_set_updated_at on public.membre;
create trigger membre_set_updated_at
  before update on public.membre
  for each row execute function public.set_updated_at();

/*
 * Sans ce garde-fou, supprimer le dernier responsable rendrait
 * `centre_courant()` NULL pour tout le monde : les données existeraient encore
 * et seraient définitivement illisibles.
 */
create or replace function public.refuser_dernier_responsable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'responsable' and not exists (
    select 1 from public.membre
    where centre_id = old.centre_id and role = 'responsable' and id <> old.id
  ) then
    raise exception 'Un centre doit garder au moins un responsable.' using errcode = 'P0004';
  end if;

  return old;
end;
$$;

drop trigger if exists membre_refuser_dernier_responsable on public.membre;
create trigger membre_refuser_dernier_responsable
  before delete on public.membre
  for each row execute function public.refuser_dernier_responsable();

-- =============================================================================
-- 2. Colonnes — NULLABLES et SANS DÉFAUT à ce stade
--
-- Elles précèdent les helpers, qui les lisent : Postgres valide le corps d'une
-- fonction SQL à sa création.
--
-- `add column centre_id not null default public.centre_courant()` ÉCHOUERAIT sur
-- une table non vide : le défaut est `stable`, donc Postgres l'évalue une seule
-- fois pendant l'ALTER, où `auth.uid()` vaut NULL. La valeur manquante des
-- lignes existantes serait NULL, en violation immédiate du NOT NULL.
-- D'où : nullable → backfill → set not null → set default.
-- =============================================================================
alter table public.apprenant   add column if not exists centre_id uuid;
alter table public.cours       add column if not exists centre_id uuid;
alter table public.creneau     add column if not exists centre_id uuid;
alter table public.inscription add column if not exists centre_id uuid;
alter table public.seance      add column if not exists centre_id uuid;
alter table public.presence    add column if not exists centre_id uuid;
alter table public.paiement    add column if not exists centre_id uuid;
alter table public.parametres  add column if not exists centre_id uuid;

alter table public.cours    add column if not exists enseignant_id uuid;
-- Dénormalisé : `presence` est la table qui grossit (séances × apprenants).
-- Une policy qui remonterait presence → seance → cours à chaque ligne serait le
-- point chaud garanti. La cohérence est assurée par une FK composite, pas par
-- la confiance faite au client (§5).
alter table public.presence add column if not exists cours_id uuid;

-- =============================================================================
-- 3. Helpers de policy
--
-- Tous `security definer` et possédés par `postgres`. Ce n'est PAS le
-- `security definer` qui contourne la RLS : c'est que le propriétaire de la
-- fonction possède aussi les tables, et que la RLS ne s'applique pas au
-- propriétaire tant que `force row level security` n'est pas posé. Même
-- invariant que `cours_public` (0007) — ne jamais poser `force` sur ces tables.
--
-- AUCUN de ces helpers ne lève jamais : une exception dans un `using` avorte la
-- requête entière, et un compte sans centre ferait tomber toute l'application
-- au lieu de voir des listes vides.
--
-- Ils sont SANS ARGUMENT et s'emploient enveloppés — `(select f())` — pour
-- devenir un InitPlan : un appel par requête, pas un appel par ligne. Un helper
-- `security definer` avec clause `SET` n'est jamais inliné par le planificateur.
-- =============================================================================
create or replace function public.centre_courant()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select centre_id from public.membre where user_id = (select auth.uid());
$$;

create or replace function public.est_responsable()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membre
    where user_id = (select auth.uid()) and role = 'responsable'
  );
$$;

/*
 * Périmètre de LECTURE des cours : tout le centre pour un responsable, ses
 * seules affectations pour un enseignant.
 *
 * ⚠️ Ce helper n'a le droit d'apparaître qu'en `select`, et en écriture sur les
 * seules tables PÉDAGOGIQUES (`seance`, `presence`). L'employer dans un
 * `with check` d'une table de gestion rouvrirait l'écriture à l'enseignant.
 * Le suffixe `_lisibles` est là pour que la faute saute aux yeux en relecture.
 */
create or replace function public.cours_lisibles()
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
      (select public.est_responsable())
      or c.enseignant_id = (select auth.uid())
    );
$$;

/*
 * Identités visibles par un ENSEIGNANT : les apprenants inscrits à ses cours —
 * et rien de leur travail ailleurs, ce que garantit le filtrage par cours de
 * `seance` et `presence`. Un responsable court-circuite ce helper : sa policy
 * lui ouvre tout le centre.
 *
 * ⚠️ Il part d'`inscription`, JAMAIS d'`apprenant`. Un helper `stable` qui
 * relirait la table qu'il filtre ne verrait pas la ligne en cours d'insertion,
 * et tout `insert ... returning` sur `apprenant` échouerait — PostgREST en pose
 * un dès qu'on chaîne `.select()`.
 *
 * ⚠️ Lecture seule, comme `cours_lisibles`.
 */
create or replace function public.apprenants_lisibles()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct i.apprenant_id), '{}'::uuid[])
  from public.inscription as i
  where i.centre_id = (select public.centre_courant())
    and i.cours_id = any ((select public.cours_lisibles())::uuid[]);
$$;

alter function public.centre_courant() owner to postgres;
alter function public.est_responsable() owner to postgres;
alter function public.cours_lisibles() owner to postgres;
alter function public.apprenants_lisibles() owner to postgres;

-- =============================================================================
-- 4. Backfill — idempotent
--
-- Un centre par `owner_id` distinct, créé SEULEMENT si cet utilisateur n'a pas
-- déjà un membre. Rejouer la migration ne duplique donc rien.
-- =============================================================================
with proprietaires as (
  select distinct owner_id from public.cours where owner_id is not null
  union
  select distinct owner_id from public.apprenant where owner_id is not null
  union
  select distinct owner_id from public.parametres where owner_id is not null
),
a_creer as (
  select p.owner_id
  from proprietaires as p
  where not exists (select 1 from public.membre as m where m.user_id = p.owner_id)
),
crees as (
  insert into public.centre (nom)
  select 'Mon centre' from a_creer
  returning id
),
appaires as (
  select c.id as centre_id, a.owner_id,
         row_number() over (order by c.id) as rang_centre,
         row_number() over (order by a.owner_id) as rang_owner
  from (select id, row_number() over (order by id) as r from crees) as c
  join (select owner_id, row_number() over (order by owner_id) as r from a_creer) as a
    on a.r = c.r
)
insert into public.membre (centre_id, user_id, role, nom_affiche)
select centre_id, owner_id, 'responsable', 'Enseignant'
from appaires
on conflict (user_id) do nothing;

-- Chaque table hérite du centre de son propriétaire historique.
update public.apprenant   as t set centre_id = m.centre_id from public.membre as m where m.user_id = t.owner_id and t.centre_id is null;
update public.cours       as t set centre_id = m.centre_id from public.membre as m where m.user_id = t.owner_id and t.centre_id is null;
update public.creneau     as t set centre_id = m.centre_id from public.membre as m where m.user_id = t.owner_id and t.centre_id is null;
update public.inscription as t set centre_id = m.centre_id from public.membre as m where m.user_id = t.owner_id and t.centre_id is null;
update public.seance      as t set centre_id = m.centre_id from public.membre as m where m.user_id = t.owner_id and t.centre_id is null;
update public.presence    as t set centre_id = m.centre_id from public.membre as m where m.user_id = t.owner_id and t.centre_id is null;
update public.paiement    as t set centre_id = m.centre_id from public.membre as m where m.user_id = t.owner_id and t.centre_id is null;
update public.parametres  as t set centre_id = m.centre_id from public.membre as m where m.user_id = t.owner_id and t.centre_id is null;

-- Le propriétaire historique devient l'enseignant de ses cours : c'est ce qui
-- préserve exactement son comportement actuel.
update public.cours set enseignant_id = owner_id where enseignant_id is null and owner_id is not null;

update public.presence as p
set cours_id = s.cours_id
from public.seance as s
where s.id = p.seance_id and p.cours_id is null;

-- =============================================================================
-- 5. Verrouillage : NOT NULL, défauts, et clés étrangères COMPOSITES
--
-- C'est ici que l'étanchéité devient STRUCTURELLE. Une clôture de tenant dans
-- les policies protège la lecture, pas les clés étrangères : sans FK composite,
-- le responsable du centre X pourrait insérer chez lui une ligne pointant un
-- parent du centre Y. Invisible pour Y — mais les contraintes d'unicité étant
-- globales, cela lui interdirait DÉFINITIVEMENT d'enregistrer ce créneau ou ce
-- mois, sur une ligne qu'il ne peut ni voir ni supprimer.
-- =============================================================================
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'apprenant', 'cours', 'creneau', 'inscription',
    'seance', 'presence', 'paiement', 'parametres'
  ]
  loop
    execute format('alter table public.%I alter column centre_id set not null', v_table);
    execute format(
      'alter table public.%I alter column centre_id set default public.centre_courant()',
      v_table
    );
  end loop;
end
$$;

-- Sans défaut déclaré, les types générés rendront `cours_id` obligatoire côté
-- client alors que c'est la base qui le pose. Lui donner un défaut n'y changerait
-- rien (`set default null` équivaut à `drop default`) : la conversion est
-- assumée dans `presenceRepo`, à un seul endroit. Les contraintes NOT NULL étant
-- vérifiées APRÈS les triggers `before`, `presence_hydrater_cours` a le temps de
-- remplir la colonne.
alter table public.presence alter column cours_id set not null;

-- Cibles référençables (id, centre_id) — le surcoût est un index par parent.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.cours'::regclass and conname = 'cours_id_centre_unique') then
    alter table public.cours add constraint cours_id_centre_unique unique (id, centre_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.apprenant'::regclass and conname = 'apprenant_id_centre_unique') then
    alter table public.apprenant add constraint apprenant_id_centre_unique unique (id, centre_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.seance'::regclass and conname = 'seance_id_centre_unique') then
    alter table public.seance add constraint seance_id_centre_unique unique (id, centre_id);
  end if;
  -- Cible de la FK de `presence.cours_id` : garantit que la présence pend d'une
  -- séance DU cours qu'elle prétend, sans trigger ni confiance au client.
  if not exists (select 1 from pg_constraint where conrelid = 'public.seance'::regclass and conname = 'seance_id_cours_unique') then
    alter table public.seance add constraint seance_id_cours_unique unique (id, cours_id);
  end if;
end
$$;

-- Chaque enfant transporte désormais le tenant dans sa FK.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.cours'::regclass and conname = 'cours_centre_fkey') then
    alter table public.cours add constraint cours_centre_fkey
      foreign key (centre_id) references public.centre (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.apprenant'::regclass and conname = 'apprenant_centre_fkey') then
    alter table public.apprenant add constraint apprenant_centre_fkey
      foreign key (centre_id) references public.centre (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.parametres'::regclass and conname = 'parametres_centre_fkey') then
    alter table public.parametres add constraint parametres_centre_fkey
      foreign key (centre_id) references public.centre (id) on delete cascade;
  end if;

  -- Un cours ne peut être affecté qu'à un membre DE SON CENTRE.
  if not exists (select 1 from pg_constraint where conrelid = 'public.cours'::regclass and conname = 'cours_enseignant_du_centre_fkey') then
    alter table public.cours add constraint cours_enseignant_du_centre_fkey
      foreign key (enseignant_id, centre_id)
      references public.membre (user_id, centre_id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.creneau'::regclass and conname = 'creneau_cours_fkey') then
    alter table public.creneau drop constraint if exists creneau_cours_id_fkey;
    alter table public.creneau add constraint creneau_cours_fkey
      foreign key (cours_id, centre_id) references public.cours (id, centre_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.seance'::regclass and conname = 'seance_cours_fkey') then
    alter table public.seance drop constraint if exists seance_cours_id_fkey;
    alter table public.seance add constraint seance_cours_fkey
      foreign key (cours_id, centre_id) references public.cours (id, centre_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.paiement'::regclass and conname = 'paiement_cours_fkey') then
    alter table public.paiement drop constraint if exists paiement_cours_id_fkey;
    alter table public.paiement add constraint paiement_cours_fkey
      foreign key (cours_id, centre_id) references public.cours (id, centre_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.inscription'::regclass and conname = 'inscription_cours_fkey') then
    alter table public.inscription drop constraint if exists inscription_cours_id_fkey;
    alter table public.inscription add constraint inscription_cours_fkey
      foreign key (cours_id, centre_id) references public.cours (id, centre_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.inscription'::regclass and conname = 'inscription_apprenant_fkey') then
    alter table public.inscription drop constraint if exists inscription_apprenant_id_fkey;
    alter table public.inscription add constraint inscription_apprenant_fkey
      foreign key (apprenant_id, centre_id) references public.apprenant (id, centre_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.presence'::regclass and conname = 'presence_seance_fkey') then
    alter table public.presence drop constraint if exists presence_seance_id_fkey;
    alter table public.presence add constraint presence_seance_fkey
      foreign key (seance_id, cours_id) references public.seance (id, cours_id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.presence'::regclass and conname = 'presence_apprenant_fkey') then
    alter table public.presence drop constraint if exists presence_apprenant_id_fkey;
    alter table public.presence add constraint presence_apprenant_fkey
      foreign key (apprenant_id, centre_id) references public.apprenant (id, centre_id) on delete cascade;
  end if;
end
$$;

/*
 * `presence.cours_id` est rempli par la base : le client n'a rien à envoyer, et
 * ne peut donc pas mentir. La FK composite ci-dessus refuserait de toute façon
 * une valeur incohérente.
 */
create or replace function public.presence_hydrater_cours()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cours_id is null then
    select s.cours_id into new.cours_id from public.seance as s where s.id = new.seance_id;
  end if;

  return new;
end;
$$;

drop trigger if exists presence_hydrater_cours on public.presence;
create trigger presence_hydrater_cours
  before insert or update of seance_id on public.presence
  for each row execute function public.presence_hydrater_cours();

-- =============================================================================
-- 6. `inscription.jeton` — la colonne anticipée, avec ce qui la rend sûre
--
-- Aucune fonctionnalité n'est construite ici. Mais une colonne `uuid` nue et
-- écrivable inviterait à `update inscription set jeton = '<valeur choisie>'`,
-- soit un secret prévisible. On la ferme dès maintenant : elle sera tirée par
-- le serveur le jour où l'espace apprenant existera, comme `cours.jeton_partage`.
-- =============================================================================
alter table public.inscription add column if not exists jeton uuid;

create unique index if not exists inscription_jeton_idx
  on public.inscription (jeton)
  where jeton is not null;

comment on column public.inscription.jeton is
  'Secret d''un futur espace apprenant. Jamais écrit par le client — voir le revoke ci-dessous';

-- =============================================================================
-- 7. Les anciennes policies disparaissent
--
-- Elles ne peuvent PAS cohabiter avec les nouvelles : les policies permissives
-- s'additionnent en OR, et `auth.uid() = owner_id` redonnerait à l'ancien
-- propriétaire l'accès à tout ce qu'il a créé, court-circuitant le modèle.
-- =============================================================================
do $$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and policyname like '%\_own'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      v_policy.policyname, v_policy.schemaname, v_policy.tablename
    );
  end loop;
end
$$;

-- `owner_id` n'est plus qu'une trace d'audit : plus de défaut, plus de NOT NULL,
-- plus aucune policy. La migration 0013 le supprimera.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'apprenant', 'cours', 'creneau', 'inscription',
    'seance', 'presence', 'paiement', 'parametres'
  ]
  loop
    execute format('alter table public.%I alter column owner_id drop default', v_table);
    execute format('alter table public.%I alter column owner_id drop not null', v_table);
  end loop;
end
$$;

-- =============================================================================
-- 8. Les nouvelles policies
--
-- Deux familles, qui ne partagent AUCUN prédicat d'écriture :
--
--   GESTION (cours, creneau, apprenant, inscription, paiement)
--     → écriture gardée par `est_responsable()`, et rien d'autre.
--
--   PÉDAGOGIE (seance, presence)
--     → écriture gardée par `cours_lisibles()`, le métier de l'enseignant.
--
-- Un `_lisibles()` dans un `with check` de la première famille serait une faille.
-- =============================================================================
alter table public.centre enable row level security;
alter table public.membre enable row level security;

drop policy if exists "centre_select_membre" on public.centre;
create policy "centre_select_membre"
  on public.centre for select to authenticated
  using (id = (select public.centre_courant()));

drop policy if exists "membre_select_centre" on public.membre;
create policy "membre_select_centre"
  on public.membre for select to authenticated
  using (centre_id = (select public.centre_courant()));

/*
 * Chacun modifie SA propre ligne, et elle seule.
 *
 * Cette policy serait une porte d'escalade de privilège si elle allait seule :
 * un enseignant se poserait `role = 'responsable'`. Ce qui la rend sûre est le
 * privilège de COLONNE plus bas — `note_bareme` est la seule colonne écrivable,
 * `role` et `centre_id` ne le sont par personne depuis le client.
 */
drop policy if exists "membre_update_soi" on public.membre;
create policy "membre_update_soi"
  on public.membre for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- cours ------------------------------------------------------------------------
/*
 * Le prédicat porte sur les colonnes de la LIGNE, et n'appelle pas
 * `cours_lisibles()` : ce helper relit `public.cours`, et un helper `stable` ne
 * voit pas la ligne que la même instruction est en train d'insérer. Le
 * `returning` de tout `insert` — que PostgREST ajoute dès qu'on chaîne
 * `.select()` — échouerait alors sur la policy de SELECT.
 *
 * Les deux expressions restent équivalentes : c'est la définition même de
 * `cours_lisibles()`, écrite ici ligne à ligne.
 */
drop policy if exists "cours_select" on public.cours;
create policy "cours_select"
  on public.cours for select to authenticated
  using (
    centre_id = (select public.centre_courant())
    and (
      (select public.est_responsable())
      or enseignant_id = (select auth.uid())
    )
  );

drop policy if exists "cours_insert_responsable" on public.cours;
create policy "cours_insert_responsable"
  on public.cours for insert to authenticated
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "cours_update_responsable" on public.cours;
create policy "cours_update_responsable"
  on public.cours for update to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()))
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "cours_delete_responsable" on public.cours;
create policy "cours_delete_responsable"
  on public.cours for delete to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

-- creneau ----------------------------------------------------------------------
drop policy if exists "creneau_select" on public.creneau;
create policy "creneau_select"
  on public.creneau for select to authenticated
  using (cours_id = any ((select public.cours_lisibles())::uuid[]));

drop policy if exists "creneau_insert_responsable" on public.creneau;
create policy "creneau_insert_responsable"
  on public.creneau for insert to authenticated
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "creneau_update_responsable" on public.creneau;
create policy "creneau_update_responsable"
  on public.creneau for update to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()))
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "creneau_delete_responsable" on public.creneau;
create policy "creneau_delete_responsable"
  on public.creneau for delete to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

-- apprenant --------------------------------------------------------------------
drop policy if exists "apprenant_select" on public.apprenant;
create policy "apprenant_select"
  on public.apprenant for select to authenticated
  using (
    centre_id = (select public.centre_courant())
    and (
      -- Le responsable voit tout son centre, y compris un apprenant qui n'est
      -- encore inscrit à rien — celui qu'on vient de créer, notamment.
      (select public.est_responsable())
      or id = any ((select public.apprenants_lisibles())::uuid[])
    )
  );

drop policy if exists "apprenant_insert_responsable" on public.apprenant;
create policy "apprenant_insert_responsable"
  on public.apprenant for insert to authenticated
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "apprenant_update_responsable" on public.apprenant;
create policy "apprenant_update_responsable"
  on public.apprenant for update to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()))
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "apprenant_delete_responsable" on public.apprenant;
create policy "apprenant_delete_responsable"
  on public.apprenant for delete to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

-- inscription ------------------------------------------------------------------
drop policy if exists "inscription_select" on public.inscription;
create policy "inscription_select"
  on public.inscription for select to authenticated
  using (cours_id = any ((select public.cours_lisibles())::uuid[]));

drop policy if exists "inscription_insert_responsable" on public.inscription;
create policy "inscription_insert_responsable"
  on public.inscription for insert to authenticated
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "inscription_update_responsable" on public.inscription;
create policy "inscription_update_responsable"
  on public.inscription for update to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()))
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "inscription_delete_responsable" on public.inscription;
create policy "inscription_delete_responsable"
  on public.inscription for delete to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

-- paiement ---------------------------------------------------------------------
-- Le financier ne sort pas du responsable, en lecture comme en écriture.
drop policy if exists "paiement_select_responsable" on public.paiement;
create policy "paiement_select_responsable"
  on public.paiement for select to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "paiement_insert_responsable" on public.paiement;
create policy "paiement_insert_responsable"
  on public.paiement for insert to authenticated
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "paiement_update_responsable" on public.paiement;
create policy "paiement_update_responsable"
  on public.paiement for update to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()))
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "paiement_delete_responsable" on public.paiement;
create policy "paiement_delete_responsable"
  on public.paiement for delete to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

-- seance — PÉDAGOGIQUE : l'enseignant écrit sur ses cours ------------------------
drop policy if exists "seance_select" on public.seance;
create policy "seance_select"
  on public.seance for select to authenticated
  using (cours_id = any ((select public.cours_lisibles())::uuid[]));

drop policy if exists "seance_insert" on public.seance;
create policy "seance_insert"
  on public.seance for insert to authenticated
  with check (
    centre_id = (select public.centre_courant())
    and cours_id = any ((select public.cours_lisibles())::uuid[])
  );

drop policy if exists "seance_update" on public.seance;
create policy "seance_update"
  on public.seance for update to authenticated
  using (cours_id = any ((select public.cours_lisibles())::uuid[]))
  with check (
    centre_id = (select public.centre_courant())
    and cours_id = any ((select public.cours_lisibles())::uuid[])
  );

drop policy if exists "seance_delete" on public.seance;
create policy "seance_delete"
  on public.seance for delete to authenticated
  using (cours_id = any ((select public.cours_lisibles())::uuid[]));

-- presence — PÉDAGOGIQUE, filtrée par le cours dénormalisé -----------------------
drop policy if exists "presence_select" on public.presence;
create policy "presence_select"
  on public.presence for select to authenticated
  using (cours_id = any ((select public.cours_lisibles())::uuid[]));

drop policy if exists "presence_insert" on public.presence;
create policy "presence_insert"
  on public.presence for insert to authenticated
  with check (
    centre_id = (select public.centre_courant())
    and cours_id = any ((select public.cours_lisibles())::uuid[])
  );

drop policy if exists "presence_update" on public.presence;
create policy "presence_update"
  on public.presence for update to authenticated
  using (cours_id = any ((select public.cours_lisibles())::uuid[]))
  with check (
    centre_id = (select public.centre_courant())
    and cours_id = any ((select public.cours_lisibles())::uuid[])
  );

drop policy if exists "presence_delete" on public.presence;
create policy "presence_delete"
  on public.presence for delete to authenticated
  using (cours_id = any ((select public.cours_lisibles())::uuid[]));

-- parametres — lus par tout le centre (le rapport en a besoin), écrits par le
-- seul responsable.
drop policy if exists "parametres_select_centre" on public.parametres;
create policy "parametres_select_centre"
  on public.parametres for select to authenticated
  using (centre_id = (select public.centre_courant()));

drop policy if exists "parametres_insert_responsable" on public.parametres;
create policy "parametres_insert_responsable"
  on public.parametres for insert to authenticated
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

drop policy if exists "parametres_update_responsable" on public.parametres;
create policy "parametres_update_responsable"
  on public.parametres for update to authenticated
  using (centre_id = (select public.centre_courant()) and (select public.est_responsable()))
  with check (centre_id = (select public.centre_courant()) and (select public.est_responsable()));

-- `parametres` devient une ligne par CENTRE, plus une par compte.
alter table public.parametres drop constraint if exists parametres_owner_id_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.parametres'::regclass and conname = 'parametres_centre_unique'
  ) then
    alter table public.parametres add constraint parametres_centre_unique unique (centre_id);
  end if;
end
$$;

-- =============================================================================
-- 9. Index sur `centre_id`, en remplacement de ceux d'`owner_id`
-- =============================================================================
create index if not exists cours_centre_id_idx       on public.cours (centre_id);
create index if not exists apprenant_centre_id_idx   on public.apprenant (centre_id);
create index if not exists creneau_centre_jour_idx   on public.creneau (centre_id, jour_semaine);
create index if not exists inscription_centre_id_idx on public.inscription (centre_id);
create index if not exists seance_centre_date_idx    on public.seance (centre_id, date);
create index if not exists paiement_centre_mois_idx  on public.paiement (centre_id, mois_concerne);
create index if not exists presence_cours_id_idx     on public.presence (cours_id);
create index if not exists cours_enseignant_id_idx   on public.cours (enseignant_id);

-- =============================================================================
-- 10. `enregistrer_cours` — réécrite pour le centre
--
-- Elle écrivait `creneau.owner_id` en dur et joignait le garde-fou de conflit
-- sur `autre.owner_id`.
--
-- Le périmètre du conflit devient LE CENTRE. C'est identique à aujourd'hui tant
-- qu'il n'y a qu'un enseignant ; dès qu'il y en aura deux, ils se gêneront à
-- tort. Le scoping par enseignant est le lot 2 — ce lot-ci ne touche pas à la
-- règle, il la transpose.
--
-- `returns public.cours` est un rowtype qui change avec la table : on supprime
-- les surcharges par le catalogue avant de recréer, comme en 0007, sans quoi
-- une ancienne signature survivrait, toujours accordée.
-- =============================================================================
do $$
declare
  v_fonction record;
begin
  for v_fonction in
    select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
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
security invoker            -- RLS et défauts s'appliquent normalement
set search_path = ''
as $$
declare
  v_cours   public.cours;
  v_creneau jsonb;
  v_libelle text;
begin
  if p_creneaux is null or jsonb_array_length(p_creneaux) = 0 then
    raise exception 'Un cours doit avoir au moins un créneau.' using errcode = 'P0001';
  end if;

  if p_cours_id is null then
    -- `centre_id` vient du défaut de la table ; `enseignant_id` est posé sur le
    -- créateur, ce qui reproduit exactement le comportement d'avant le multi-
    -- centre. L'affectation à un autre enseignant est une opération à part.
    insert into public.cours (
      libelle, type_cours_id, format, date_debut, date_fin,
      lien_meet, prix_mensuel, devise, statut, enseignant_id
    )
    select
      c.libelle, c.type_cours_id, c.format, c.date_debut, c.date_fin,
      c.lien_meet, c.prix_mensuel, coalesce(c.devise, 'XOF'), coalesce(c.statut, 'actif'),
      (select auth.uid())
    from jsonb_to_record(p_cours) as c(
      libelle text, type_cours_id uuid, format text, date_debut date, date_fin date,
      lien_meet text, prix_mensuel numeric, devise text, statut text
    )
    returning * into v_cours;
  else
    update public.cours as cible
    set libelle       = c.libelle,
        type_cours_id = c.type_cours_id,
        format        = c.format,
        date_debut    = c.date_debut,
        date_fin      = c.date_fin,
        lien_meet     = c.lien_meet,
        prix_mensuel  = c.prix_mensuel,
        devise        = coalesce(c.devise, 'XOF'),
        statut        = coalesce(c.statut, 'actif')
    from jsonb_to_record(p_cours) as c(
      libelle text, type_cours_id uuid, format text, date_debut date, date_fin date,
      lien_meet text, prix_mensuel numeric, devise text, statut text
    )
    where cible.id = p_cours_id
    returning cible.* into v_cours;

    -- Ligne absente, masquée par RLS, ou écriture refusée : rien à modifier.
    if v_cours.id is null then
      raise exception 'Cours introuvable.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.creneau where cours_id = v_cours.id;

  for v_creneau in select * from jsonb_array_elements(p_creneaux)
  loop
    insert into public.creneau (centre_id, cours_id, jour_semaine, heure_debut, heure_fin)
    values (
      v_cours.centre_id,
      v_cours.id,
      (v_creneau ->> 'jour_semaine')::smallint,
      (v_creneau ->> 'heure_debut')::time,
      (v_creneau ->> 'heure_fin')::time
    );
  end loop;

  -- Garde-fou de conflit (CLAUDE.md §5.1). Bornes strictes, aucune marge.
  select autre_cours.libelle
  into v_libelle
  from public.creneau as nouveau
  join public.creneau as autre
    on autre.centre_id    = nouveau.centre_id
   and autre.cours_id    <> nouveau.cours_id
   and autre.jour_semaine = nouveau.jour_semaine
   and nouveau.heure_debut < autre.heure_fin
   and autre.heure_debut   < nouveau.heure_fin
  join public.cours as autre_cours on autre_cours.id = autre.cours_id
  where nouveau.cours_id = v_cours.id
  limit 1;

  if v_libelle is not null then
    raise exception 'Ce créneau chevauche le cours « % ».', v_libelle using errcode = 'P0003';
  end if;

  return v_cours;
end;
$$;

comment on function public.enregistrer_cours(jsonb, jsonb, uuid) is
  'Enregistre un cours et ses créneaux dans une seule transaction, et refuse tout chevauchement avec un autre cours du même centre (CLAUDE.md §5.1).';

-- =============================================================================
-- 11. Droits
--
-- Postgres accorde EXECUTE à PUBLIC sur toute nouvelle fonction : on repart d'un
-- droit explicite. `anon` ne gagne rien — sa seule porte reste `cours_public`.
-- =============================================================================
revoke all on function public.enregistrer_cours(jsonb, jsonb, uuid) from public;
revoke all on function public.centre_courant() from public;
revoke all on function public.est_responsable() from public;
revoke all on function public.cours_lisibles() from public;
revoke all on function public.apprenants_lisibles() from public;
revoke all on function public.refuser_dernier_responsable() from public;
revoke all on function public.presence_hydrater_cours() from public;

grant execute on function public.enregistrer_cours(jsonb, jsonb, uuid) to authenticated;
grant execute on function public.centre_courant() to authenticated;
grant execute on function public.est_responsable() to authenticated;
grant execute on function public.cours_lisibles() to authenticated;
grant execute on function public.apprenants_lisibles() to authenticated;

/*
 * Les nouvelles tables : rien pour `anon`, le strict nécessaire pour
 * `authenticated`.
 *
 * On repart de ZÉRO plutôt que d'ajouter des droits : Supabase accorde `all` à
 * `authenticated` sur toute nouvelle table du schéma `public` (via
 * `alter default privileges`). Se contenter d'un `grant update (note_bareme)`
 * ne restreindrait rien — le privilège de TABLE couvrirait déjà toutes les
 * colonnes, et un enseignant se poserait `role = 'responsable'`.
 */
revoke all on public.centre from anon, authenticated;
revoke all on public.membre from anon, authenticated;

grant select on public.centre to authenticated;
grant select on public.membre to authenticated;

/*
 * L'unique colonne de `membre` qu'un client peut écrire. C'est ce privilège de
 * colonne — et non la policy `membre_update_soi` — qui empêche quiconque de se
 * promouvoir responsable ou de changer de centre : `role` et `centre_id` ne
 * sont accordés à personne en écriture.
 */
grant update (note_bareme) on public.membre to authenticated;

/*
 * Le jeton d'inscription n'est jamais écrit par le client : il sera tiré côté
 * serveur le jour où l'espace apprenant existera.
 *
 * ⚠️ `revoke update (jeton)` seul est SANS EFFET : un privilège de colonne ne
 * retire rien tant qu'un privilège de TABLE le couvre. Il faut retirer le
 * privilège de table, puis le re-accorder colonne par colonne — en omettant
 * `jeton`. Sans cela un responsable pourrait poser un secret prévisible.
 *
 * `owner_id` est volontairement absent de la liste : le client ne l'a jamais
 * écrit (la base le posait par défaut), et il disparaît en 0013.
 */
revoke insert, update on public.inscription from authenticated;
grant insert (id, centre_id, apprenant_id, cours_id, note_examen, examen_bareme, created_at, updated_at)
  on public.inscription to authenticated;
grant update (id, centre_id, apprenant_id, cours_id, note_examen, examen_bareme, created_at, updated_at)
  on public.inscription to authenticated;

notify pgrst, 'reload schema';
