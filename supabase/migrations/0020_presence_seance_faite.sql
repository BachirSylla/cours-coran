-- =============================================================================
-- 0020_presence_seance_faite.sql — une présence n'existe que sur une séance tenue
--
-- Le formulaire de séance proposait la présence et les notes quel que soit le
-- statut. Résultat en base : des apprenants « absents » à des séances qui
-- n'avaient jamais eu lieu — un pointage qui ne veut rien dire, et que le
-- rapport de session comme la page de suivi écartent déjà (tous deux filtrent
-- `statut = 'faite'`). L'interface produisait donc une donnée que le reste de
-- l'application refuse de lire.
--
-- Cette migration pose l'invariant là où il tient vraiment :
--
--     une ligne `presence` n'existe QUE si sa séance est `statut = 'faite'`.
--
-- Il ne peut pas être une contrainte `check` : elle porterait sur une autre
-- table. Il faut donc deux triggers, un par sens de la violation — écrire une
-- présence sur une séance non tenue, et faire sortir de « faite » une séance qui
-- porte déjà des présences.
--
-- ⚠️ La garde « la séance n'a pas encore eu lieu » n'est PAS ici, délibérément :
-- `current_date` est en UTC côté serveur, alors que « aujourd'hui » pour
-- l'enseignant est celui de son navigateur. Une garde de date en base refuserait
-- à tort une saisie faite en soirée depuis un fuseau en avance. La base sait le
-- STATUT, le client sait le JOUR — et rien ne fuit de toute façon, puisque
-- `suivi_apprenant` (0019) ne publie rien dont la date est à venir.
--
-- Migration idempotente.
-- =============================================================================

-- =============================================================================
-- 1. Le motif — une colonne à elle, et pas `observations` détourné
--
-- `observations` est une remarque PÉDAGOGIQUE sur une séance qui a eu lieu. Y
-- loger la raison d'une annulation les mélangerait pour toujours : repasser la
-- séance en « faite » laisserait le motif d'annulation en guise d'observation,
-- sans que rien ne signale la bascule, et plus aucune requête ne pourrait
-- répondre à « pourquoi cette séance a-t-elle été annulée ». Une colonne coûte
-- trois lignes ; le mélange coûte pour toujours.
--
-- `seance` porte des `grant` de TABLE, sans ACL de colonne (vérifié dans
-- `pg_class.relacl` / `pg_attribute.attacl`) : la nouvelle colonne est donc
-- écrite par `authenticated` sans re-`grant`. Ce n'est pas le cas de `cours` ni
-- d'`inscription` — ne pas transposer sans vérifier (CLAUDE.md §5.12).
-- =============================================================================
alter table public.seance add column if not exists motif text;

comment on column public.seance.motif is
  'Raison du statut, quand la séance n''a pas eu lieu (annulée, reportée, absence). Vidé dès que la séance repasse en « faite » : le motif ne survit pas à ce qu''il explique.';

-- =============================================================================
-- 2. Le passif — supprimé, mais jamais en aveugle
--
-- Ces lignes sont l'artefact du défaut corrigé ici : elles n'ont jamais été
-- voulues, et rien ne les lit. On les retire pour que les triggers puissent
-- s'appliquer — sinon toute modification ultérieure de ces séances serait
-- refusée par une contrainte qu'elles violaient avant même son existence.
--
-- ⚠️ On ne supprime QUE ce qui ne porte rien. Si une seule ligne portait une
-- note, un commentaire ou un passage évalué, la migration s'arrête : décider de
-- détruire le travail de quelqu'un n'est pas le rôle d'un script.
-- =============================================================================
do $$
declare v_avec_contenu bigint;
begin
  select count(*) into v_avec_contenu
  from public.presence as p
  join public.seance as s on s.id = p.seance_id
  where s.statut <> 'faite'
    and (
      p.note is not null
      or nullif(btrim(coalesce(p.commentaire, '')), '') is not null
      or nullif(btrim(coalesce(p.passage_evalue, '')), '') is not null
    );

  if v_avec_contenu > 0 then
    raise exception
      'MIGRATION INTERROMPUE : % présence(s) sur des séances non tenues portent une note ou un commentaire. Décidez de leur sort à la main (repasser la séance en « faite », ou supprimer la présence) avant de rejouer.',
      v_avec_contenu
      using errcode = 'P0052';
  end if;
end
$$;

delete from public.presence as p
using public.seance as s
where s.id = p.seance_id
  and s.statut <> 'faite';

-- =============================================================================
-- 3. Premier sens — écrire une présence sur une séance non tenue
--
-- ⚠️ `for update` sur la ligne `seance`, et ce n'est pas de la superstition.
-- Sans lui, deux transactions concurrentes franchissent chacune sa garde et
-- l'invariant tombe : A insère une présence pendant que B passe la séance en
-- « annulée » ; en READ COMMITTED, aucune des deux ne voit le travail non validé
-- de l'autre, et les deux commettent. C'est exactement la leçon de 0018
-- (CLAUDE.md §5.13 : « ne pas se fier à un `select` de trigger pour arbitrer une
-- concurrence »).
--
-- Le verrou fait attendre l'une des deux, qui réévalue ensuite sur l'état
-- validé et refuse. Il sérialise les écritures de présence d'une MÊME séance —
-- sans conséquence ici : elles viennent d'un formulaire, une ligne à la fois.
--
-- Aucun risque d'interblocage : le trigger de `seance` ne verrouille jamais de
-- ligne `presence`, donc il n'existe pas de cycle d'attente.
-- =============================================================================
create or replace function public.presence_exige_seance_faite()
returns trigger
language plpgsql
/*
 * `security definer`, et non `invoker`.
 *
 * Un trigger `invoker` verrait la base à travers la RLS de l'appelant : le
 * `select ... for update` sur `seance` déclencherait en plus la policy d'UPDATE
 * de cette table, et le comptage des présences pourrait sous-compter ce que
 * l'appelant n'a pas le droit de lire. Une garde qui ne voit qu'une partie de la
 * vérité n'est pas une garde. Ces deux fonctions ne lisent qu'un statut et un
 * décompte, et ne renvoient rien à l'appelant : il n'y a rien à divulguer.
 */
security definer
set search_path = ''
as $$
declare v_statut text;
begin
  select s.statut into v_statut
  from public.seance as s
  where s.id = new.seance_id
  for update;

  if v_statut is distinct from 'faite' then
    raise exception
      'La présence et les notes ne se saisissent que sur une séance faite. Cette séance est marquée « % ».',
      coalesce(v_statut, 'inconnue')
      using errcode = 'P0050';
  end if;

  return new;
end;
$$;

alter function public.presence_exige_seance_faite() owner to postgres;

drop trigger if exists presence_exige_seance_faite on public.presence;
create trigger presence_exige_seance_faite
  before insert or update on public.presence
  for each row execute function public.presence_exige_seance_faite();

-- =============================================================================
-- 4. Second sens — sortir de « faite » une séance qui porte des présences
--
-- Refuser plutôt que supprimer en silence : ce pointage est du travail saisi, et
-- une migration comme un trigger n'ont pas à en décider. Le message dit la
-- sortie — retirer les présences — que l'interface propose.
--
-- L'UPDATE verrouille déjà la ligne `seance` : le `select` sur `presence` voit
-- donc l'état validé une fois l'attente terminée. C'est l'autre moitié de la
-- paire du §3, et les deux ensemble ferment la course dans les deux ordres.
-- =============================================================================
create or replace function public.seance_refuser_sortie_de_faite()
returns trigger
language plpgsql
/*
 * `security definer`, et non `invoker`.
 *
 * Un trigger `invoker` verrait la base à travers la RLS de l'appelant : le
 * `select ... for update` sur `seance` déclencherait en plus la policy d'UPDATE
 * de cette table, et le comptage des présences pourrait sous-compter ce que
 * l'appelant n'a pas le droit de lire. Une garde qui ne voit qu'une partie de la
 * vérité n'est pas une garde. Ces deux fonctions ne lisent qu'un statut et un
 * décompte, et ne renvoient rien à l'appelant : il n'y a rien à divulguer.
 */
security definer
set search_path = ''
as $$
declare v_presences bigint;
begin
  if new.statut = 'faite' then
    return new;
  end if;

  select count(*) into v_presences
  from public.presence as p
  where p.seance_id = new.id;

  if v_presences > 0 then
    raise exception
      'Cette séance porte % pointage(s) de présence : retirez-les avant de la marquer autrement que « faite ».',
      v_presences
      using errcode = 'P0051';
  end if;

  return new;
end;
$$;

alter function public.seance_refuser_sortie_de_faite() owner to postgres;

drop trigger if exists seance_refuser_sortie_de_faite on public.seance;
create trigger seance_refuser_sortie_de_faite
  before update on public.seance
  for each row execute function public.seance_refuser_sortie_de_faite();

-- Ces fonctions ne sont appelables que par le moteur de triggers ; personne n'a
-- de raison de les invoquer directement.
revoke all on function public.presence_exige_seance_faite() from public, anon, authenticated;
revoke all on function public.seance_refuser_sortie_de_faite() from public, anon, authenticated;
