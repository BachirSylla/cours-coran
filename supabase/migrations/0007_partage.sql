-- =============================================================================
-- 0007_partage.sql — lien de consultation publique d'un cours
--
-- Un apprenant NON CONNECTÉ ouvre https://site/c/<jeton> et n'y voit que ce qui
-- lui sert : libellé du cours, type, lien de visioconférence, créneaux
-- hebdomadaires, période, statut et dernier exercice donné. Rien d'autre ne peut
-- sortir de la base.
--
-- Montage : le rôle `anon` n'a AUCUN droit sur AUCUNE table (voir la section
-- « Droits » en fin de fichier) ; il ne peut appeler que public.cours_public(),
-- en security definer, dont le corps est figé et corrélé au seul cours désigné
-- par un jeton de 122 bits.
--
-- Pourquoi pas une vue : une vue s'exécute avec les droits de son propriétaire
-- et n'oblige en rien le client à filtrer sur le jeton — `anon` ferait
-- `GET /rest/v1/la_vue?select=*` et récupérerait TOUS les cours et TOUS les
-- liens Meet. Seule une fonction impose le prédicat côté serveur.
--
-- Le partage est OPT-IN : `jeton_partage` naît NULL (CLAUDE.md §4).
--
-- ⚠️ La fonction publique lit les tables parce que son propriétaire (`postgres`)
--    possède ces tables — la RLS ne s'applique pas au propriétaire. Poser un
--    jour `alter table ... force row level security` sur cours / creneau /
--    seance / type_cours ferait renvoyer zéro ligne à la page publique, sans
--    aucune erreur. D'où le `alter function ... owner to postgres` explicite.
--
-- Migration idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- cours.jeton_partage — le secret de l'URL publique
-- -----------------------------------------------------------------------------
alter table public.cours add column if not exists jeton_partage uuid;

comment on column public.cours.jeton_partage is
  'Secret de l''URL publique /c/<jeton> ; NULL = partage désactivé (défaut). Tiré par gen_random_uuid() côté serveur, jamais par le navigateur';

-- Index unique PARTIEL : il porte l'unicité demandée ET sert la recherche par
-- jeton, sans indexer les cours non partagés.
-- Les NULL d'un index unique sont tous considérés distincts : autant de cours
-- non partagés que l'on veut. Surtout pas `nulls not distinct`, qui n'en
-- autoriserait qu'un seul.
create unique index if not exists cours_jeton_partage_idx
  on public.cours (jeton_partage)
  where jeton_partage is not null;

-- -----------------------------------------------------------------------------
-- seance — accès borné au « dernier exercice »
-- -----------------------------------------------------------------------------
-- Un point d'entrée non authentifié doit avoir un coût prévisible : cet index
-- partiel donne la dernière séance faite par un simple parcours inversé, sans
-- tri. `seance_cours_id_idx` reste utile aux autres requêtes de l'application.
create index if not exists seance_cours_id_date_faite_idx
  on public.seance (cours_id, date, heure_debut)
  where statut = 'faite';

comment on column public.seance.exercices_a_faire is
  'ATTENTION : renvoyé PUBLIQUEMENT par cours_public() à quiconque détient le jeton de partage du cours. N''y écrire aucune information personnelle';

-- =============================================================================
-- Fonctions
--
-- `create or replace` refuse tout changement de la liste `returns table (...)`
-- (« cannot change return type of existing function ») comme tout renommage de
-- paramètre. On supprime donc d'abord TOUTES les surcharges de ces noms : sans
-- cela, une ancienne signature survivrait, toujours accordée à `anon`.
-- Même idiome « catalogue » que les blocs pg_constraint des migrations 0005/0006.
-- =============================================================================
do $$
declare
  v_fonction record;
begin
  for v_fonction in
    select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'cours_public', 'activer_partage', 'regenerer_partage', 'revoquer_partage'
      )
  loop
    execute format('drop function public.%I(%s)', v_fonction.proname, v_fonction.arguments);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Lecture publique — la liste des colonnes de sortie EST la liste blanche.
-- Elle apparaît telle quelle dans les types générés : toute tentative future
-- d'élargir la fuite se voit dans la revue du diff.
-- -----------------------------------------------------------------------------
create function public.cours_public(jeton uuid)
returns table (
  libelle          text,
  type_libelle     text,
  lien_meet        text,
  date_debut       date,
  date_fin         date,
  statut           text,
  creneaux         jsonb,
  dernier_exercice text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.libelle,
    t.libelle,
    -- Un cours terminé ou en pause ne donne plus accès à la visioconférence :
    -- sans cela, un lien de visio resterait joignable indéfiniment par qui a
    -- gardé l'URL. C'est la seule protection contre l'oubli de révocation.
    case
      when c.statut in ('pause', 'termine') then null
      when c.date_fin is not null and c.date_fin < current_date then null
      else c.lien_meet
    end,
    c.date_debut,
    c.date_fin,
    c.statut,
    -- jsonb_agg renvoie NULL sur zéro ligne, jamais '[]'.
    -- Les `time` sortent bruts (« 09:00:00 ») : format que le front tronque
    -- déjà partout via .slice(0, 5).
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'jour_semaine', cr.jour_semaine,
                   'heure_debut', cr.heure_debut,
                   'heure_fin', cr.heure_fin
                 )
                 order by cr.jour_semaine, cr.heure_debut
               )
        from public.creneau as cr
        where cr.cours_id = c.id
      ),
      '[]'::jsonb
    ),
    -- Le dernier exercice RÉELLEMENT donné : une séance saisie sans exercice ne
    -- doit pas effacer celui de la séance précédente. Et une séance pré-remplie
    -- dans le futur ne doit pas publier son contenu par avance.
    (
      select s.exercices_a_faire
      from public.seance as s
      where s.cours_id = c.id
        and s.statut = 'faite'
        and s.date <= current_date
        and btrim(coalesce(s.exercices_a_faire, '')) <> ''
      order by s.date desc, s.heure_debut desc
      limit 1
    )
  -- Jointure interne sûre : type_cours_id est `not null` / `on delete restrict`.
  from public.cours as c
  join public.type_cours as t on t.id = c.type_cours_id
  -- `= null` vaut NULL et jamais TRUE : la garde est redondante, mais explicite.
  where jeton is not null
    and c.jeton_partage = jeton;
$$;

comment on function public.cours_public(uuid) is
  'Consultation publique d''un cours par son jeton de partage. Corps figé, corrélé au seul cours désigné : ne renvoie jamais owner_id, prix, apprenants ni notes.';

-- Le propriétaire décide de ce que la fonction peut lire : on ne dépend pas du
-- rôle qui applique la migration.
alter function public.cours_public(uuid) owner to postgres;

-- -----------------------------------------------------------------------------
-- Activation / révocation — enseignant connecté.
--
-- `security invoker` : la policy `cours_update_own` fait le contrôle d'accès,
-- exactement comme `enregistrer_cours` (migration 0002). Renvoyer NULL signifie
-- « cours introuvable, ou masqué par la RLS ».
--
-- Le jeton est tiré par le CSPRNG du serveur : ni le navigateur ni le réseau ne
-- choisissent le secret, et l'opération reste atomique (un `update` PostgREST
-- imposerait un lire-puis-écrire).
-- -----------------------------------------------------------------------------
create function public.activer_partage(p_cours_id uuid)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  -- Idempotent : un lien déjà actif n'est pas remplacé.
  update public.cours
  set jeton_partage = coalesce(jeton_partage, gen_random_uuid())
  where id = p_cours_id
  returning jeton_partage;
$$;

comment on function public.activer_partage(uuid) is
  'Active le partage d''un cours et renvoie son jeton. Idempotent : ne remplace pas un lien déjà actif.';

create function public.regenerer_partage(p_cours_id uuid)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.cours
  set jeton_partage = gen_random_uuid()
  where id = p_cours_id
  returning jeton_partage;
$$;

comment on function public.regenerer_partage(uuid) is
  'Fait tourner le jeton de partage : l''ancien lien cesse immédiatement de fonctionner.';

create function public.revoquer_partage(p_cours_id uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.cours set jeton_partage = null where id = p_cours_id;
$$;

comment on function public.revoquer_partage(uuid) is
  'Désactive le partage d''un cours. Le lien distribué cesse immédiatement de fonctionner.';

-- =============================================================================
-- Droits — `anon` n'a qu'une seule porte, et elle est explicite.
--
-- Constat à l'application de cette migration : Supabase avait accordé à `anon`
-- select/insert/update/delete sur TOUTES les tables de `public`, via
-- `alter default privileges`. La RLS les neutralisait (aucune policy `to anon`),
-- mais elle était alors l'unique rempart. On ne laisse pas la confidentialité
-- reposer sur une seule couche, a fortiori en ouvrant un accès non authentifié.
--
-- Sans effet sur l'application : elle est intégralement authentifiée, et la
-- connexion passe par GoTrue, pas par PostgREST.
-- =============================================================================
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Postgres accorde EXECUTE à PUBLIC sur toute nouvelle fonction — donc à tout
-- rôle présent comme futur. On repart d'un droit explicite et auditable.
--
-- `set_updated_at` (migration 0001) en héritait aussi. C'est une fonction
-- trigger : l'appeler directement lève « trigger functions can only be called as
-- triggers », elle n'expose donc rien. On la ferme malgré tout pour que l'audit
-- des droits de `anon` se lise d'un coup d'œil — une seule porte, pas deux dont
-- une inoffensive. Sans effet sur les triggers : le privilège n'est vérifié qu'à
-- la création du trigger, et `postgres`, propriétaire, le conserve toujours.
revoke all on function public.set_updated_at() from public;

revoke all on function public.cours_public(uuid) from public;
revoke all on function public.activer_partage(uuid) from public;
revoke all on function public.regenerer_partage(uuid) from public;
revoke all on function public.revoquer_partage(uuid) from public;

grant execute on function public.cours_public(uuid) to anon, authenticated;
grant execute on function public.activer_partage(uuid) to authenticated;
grant execute on function public.regenerer_partage(uuid) to authenticated;
grant execute on function public.revoquer_partage(uuid) to authenticated;

-- Rafraîchit le cache de schéma de PostgREST (automatique sur Supabase Cloud).
notify pgrst, 'reload schema';
