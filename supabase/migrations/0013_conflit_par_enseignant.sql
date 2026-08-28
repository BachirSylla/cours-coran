-- =============================================================================
-- 0013_conflit_par_enseignant.sql — le conflit se scope sur l'enseignant
--
-- La migration 0012 a transposé le garde-fou de chevauchement du propriétaire
-- au CENTRE : identique tant qu'il n'y a qu'un enseignant, mais deux
-- enseignants d'un même centre se gênaient à tort. La ressource rare est la
-- personne, pas le centre : nul ne peut être à deux endroits à la fois, mais
-- deux enseignants tiennent très bien cours à la même heure.
--
-- **Aucun changement de schéma** : pas de colonne, pas de contrainte, pas de
-- policy. L'enseignant est résolu par une jointure `creneau → cours` au moment
-- du contrôle. Ce contrôle a lieu une fois par enregistrement de cours, pas par
-- ligne lue : la jointure est sans conséquence, et elle évite une
-- dénormalisation qu'il faudrait ensuite tenir cohérente à chaque réaffectation.
--
-- Migration idempotente.
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
  v_cours      public.cours;
  v_creneau    jsonb;
  v_libelle    text;
  v_enseignant text;
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

  /*
   * Garde-fou de conflit (CLAUDE.md §5.1) — source de vérité, atomique.
   *
   * Bornes STRICTES et aucune marge : deux créneaux adjacents ne se chevauchent
   * pas. La clôture par `centre_id` reste, même si elle est désormais
   * redondante — un membre n'appartient qu'à un centre — parce qu'elle borne le
   * balayage et documente l'invariant.
   *
   * `is not distinct from` et non `=` : deux cours SANS enseignant affecté
   * forment un groupe qui se contrôle contre lui-même. Avec `=`, la comparaison
   * vaudrait NULL et l'on cesserait silencieusement de contrôler quoi que ce
   * soit dès qu'un membre est supprimé (`enseignant_id` passe alors à NULL).
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
  -- Le nom n'est ramené que si le cours est celui de QUELQU'UN D'AUTRE : se
  -- voir dire « Untel est déjà pris » quand cet Untel est soi-même se lit mal,
  -- et c'est le cas de l'enseignant seul — donc le cas courant.
  left join public.membre as membre
    on membre.user_id = v_cours.enseignant_id
   and membre.centre_id = v_cours.centre_id
   and membre.user_id is distinct from (select auth.uid())
  where nouveau.cours_id = v_cours.id
  limit 1;

  if v_libelle is not null then
    -- Nommer l'enseignant compte dès qu'un responsable pose le planning de
    -- quelqu'un d'autre : sans lui, le refus paraît arbitraire.
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
  'Enregistre un cours et ses créneaux dans une seule transaction, et refuse tout chevauchement avec un autre cours du MÊME ENSEIGNANT (CLAUDE.md §5.1).';

revoke all on function public.enregistrer_cours(jsonb, jsonb, uuid) from public;
grant execute on function public.enregistrer_cours(jsonb, jsonb, uuid) to authenticated;

notify pgrst, 'reload schema';
