-- =============================================================================
-- 0018_retrait_membre.sql — retirer un enseignant, sans SQL et sans rien perdre
--
-- C'était le dernier geste d'administration qui demandait une console : sortir
-- quelqu'un du centre. Le responsable le fait désormais depuis l'écran, en
-- décidant dans le même mouvement qui reprend ses cours.
--
-- CE QUI NE DISPARAÎT PAS. Une seule clé étrangère du schéma pointe vers
-- `membre` — `cours.enseignant_id`, en `on delete set null` (0012). Aucune
-- table pédagogique ne référence `membre` ni `auth.users` : depuis 0015, le
-- tenant est `centre_id`, et séances, présences, notes et examens pendent du
-- COURS. Retirer un membre ne peut donc rien détruire d'autre que son propre
-- `note_bareme` — dont chaque note garde de toute façon une copie.
--
-- Le compte `auth.users` du partant survit : il redevient inerte (l'écran
-- « Rejoindre un centre » l'accueille) et un nouveau code le fera revenir.
--
-- Migration idempotente — et convergente sur la clé étrangère : elle compare sa
-- définition complète, pas seulement sa forme approximative.
-- =============================================================================

-- =============================================================================
-- 0. Le `set null` de la FK ne visait pas la bonne colonne
--
-- `cours_enseignant_du_centre_fkey` est COMPOSITE — (enseignant_id, centre_id)
-- → membre (user_id, centre_id) — et un `on delete set null` sans liste de
-- colonnes annule TOUTES les colonnes de la clé. Il tentait donc de mettre
-- `cours.centre_id` à NULL, qui est `not null` : supprimer un membre ayant des
-- cours échouait, purement et simplement.
--
-- Le commentaire de 0012 disait « supprimer un compte ne détruit plus les
-- données » — c'était vrai, mais pour la mauvaise raison : la suppression
-- n'aboutissait pas. PostgreSQL 15 permet de nommer les colonnes à annuler ;
-- on ne vise plus que `enseignant_id`, ce qui rend le cours orphelin sans
-- toucher à son centre.
-- =============================================================================
do $$
declare
  v_voulue constant text :=
    'FOREIGN KEY (enseignant_id, centre_id) REFERENCES membre(user_id, centre_id) ON DELETE SET NULL (enseignant_id)';
begin
  /*
   * On compare la DÉFINITION COMPLÈTE, pas seulement le nombre de colonnes
   * annulées : une contrainte du bon nom pointant ailleurs, ou annulant la
   * mauvaise colonne, survivrait à un test de cardinalité et serait alors prise
   * pour correcte. Même motif que la contrainte de rôle de 0016 — idempotent ne
   * suffit pas, il faut convergent.
   */
  if exists (
    select 1 from pg_constraint
    where conname = 'cours_enseignant_du_centre_fkey'
      and conrelid = 'public.cours'::regclass
      and pg_get_constraintdef(oid) <> v_voulue
  ) then
    alter table public.cours drop constraint cours_enseignant_du_centre_fkey;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cours_enseignant_du_centre_fkey'
      and conrelid = 'public.cours'::regclass
  ) then
    alter table public.cours add constraint cours_enseignant_du_centre_fkey
      foreign key (enseignant_id, centre_id)
      references public.membre (user_id, centre_id)
      on delete set null (enseignant_id);
  end if;
end
$$;

-- =============================================================================
-- 0 bis. Le trigger de 0012 lisait sans verrou
--
-- `refuser_dernier_responsable` est le filet quand la suppression ne passe PAS
-- par la RPC — `service_role`, ou la cascade d'une suppression de compte
-- `auth.users`. Mais son `select` était ordinaire : en READ COMMITTED il ne voit
-- pas la suppression non validée d'une transaction concurrente, si bien que deux
-- suppressions simultanées pouvaient laisser un centre sans aucun responsable.
--
-- `for update` verrouille les lignes des AUTRES responsables : la seconde
-- transaction attend, puis relit et constate qu'il n'en reste plus.
-- =============================================================================
create or replace function public.refuser_dernier_responsable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'responsable' and not exists (
    select 1 from public.membre
    where centre_id = old.centre_id and role = 'responsable' and id <> old.id
    for update
  ) then
    raise exception 'Un centre doit garder au moins un responsable.' using errcode = 'P0004';
  end if;

  return old;
end;
$$;

create or replace function public.retirer_membre(p_user_id uuid, p_reaffecter_a uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
  limit 1;

  if v_choc_a is not null then
    raise exception
      'Ce transfert placerait « % » et « % » sur le même créneau. Choisissez un autre enseignant, ou déplacez un créneau d''abord.',
      v_choc_a, v_choc_b using errcode = 'P0033';
  end if;

  return v_cours;
end;
$$;

comment on function public.retirer_membre(uuid, uuid) is
  'Retire un membre du centre du responsable qui appelle, en réaffectant ses cours à la cible fournie — ou en les laissant sans enseignant si elle est nulle. Renvoie le nombre de cours concernés. Le compte auth.users survit.';

alter function public.retirer_membre(uuid, uuid) owner to postgres;

-- Hygiène `definer` : `revoke from public` seul ne suffit pas, Supabase pose un
-- `alter default privileges ... grant execute ... to authenticated`.
revoke all on function public.retirer_membre(uuid, uuid) from public, anon, authenticated;
grant execute on function public.retirer_membre(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
