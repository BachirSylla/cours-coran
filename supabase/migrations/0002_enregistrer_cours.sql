-- =============================================================================
-- 0002_enregistrer_cours.sql
--
-- Écriture ATOMIQUE d'un cours et de ses créneaux (CLAUDE.md §4, §5.1).
-- Un cours a 1..N créneaux : les enregistrer en deux appels séparés laisserait,
-- en cas d'échec du second, un cours sans créneau — invisible dans la grille.
--
-- La fonction porte aussi le garde-fou serveur de la règle de conflit : la
-- vérification côté client sert l'ergonomie, celle-ci fait foi (elle résiste à
-- deux onglets qui enregistrent en même temps).
--
-- Migration idempotente.
-- =============================================================================

create or replace function public.enregistrer_cours(
  p_cours    jsonb,
  p_creneaux jsonb,
  p_cours_id uuid default null
)
returns public.cours
language plpgsql
security invoker            -- RLS et default auth.uid() s'appliquent normalement
set search_path = ''
as $$
declare
  v_cours    public.cours;
  v_creneau  jsonb;
  v_libelle  text;
begin
  if p_creneaux is null or jsonb_array_length(p_creneaux) = 0 then
    raise exception 'Un cours doit avoir au moins un créneau.' using errcode = 'P0001';
  end if;

  -- 1. Création ou mise à jour du cours.
  --    owner_id n'est jamais fourni : le default auth.uid() de la table le pose.
  if p_cours_id is null then
    insert into public.cours (
      libelle, type_cours_id, format, date_debut, date_fin,
      lien_meet, prix_mensuel, devise, statut
    )
    select
      c.libelle, c.type_cours_id, c.format, c.date_debut, c.date_fin,
      c.lien_meet, c.prix_mensuel, coalesce(c.devise, 'XOF'), coalesce(c.statut, 'actif')
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

    -- Ligne absente, ou masquée par RLS : dans les deux cas, rien à modifier.
    if v_cours.id is null then
      raise exception 'Cours introuvable.' using errcode = 'P0002';
    end if;
  end if;

  -- 2. Les créneaux du formulaire font foi : on remplace l'ensemble.
  delete from public.creneau where cours_id = v_cours.id;

  for v_creneau in select * from jsonb_array_elements(p_creneaux)
  loop
    insert into public.creneau (owner_id, cours_id, jour_semaine, heure_debut, heure_fin)
    values (
      v_cours.owner_id,
      v_cours.id,
      (v_creneau ->> 'jour_semaine')::smallint,
      (v_creneau ->> 'heure_debut')::time,
      (v_creneau ->> 'heure_fin')::time
    );
  end loop;

  -- 3. Garde-fou : règle de conflit du CLAUDE.md §5.1.
  --    Bornes strictes, aucune marge : deux créneaux adjacents ne s'opposent pas.
  select autre_cours.libelle
  into v_libelle
  from public.creneau as nouveau
  join public.creneau as autre
    on autre.owner_id     = nouveau.owner_id
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
  'Enregistre un cours et ses créneaux dans une seule transaction, et refuse tout chevauchement avec un autre cours du même propriétaire (CLAUDE.md §5.1).';

-- La fonction est en security invoker : elle n'accorde aucun droit supplémentaire,
-- les policies RLS de cours et creneau s'appliquent à chaque instruction.
revoke all on function public.enregistrer_cours(jsonb, jsonb, uuid) from public;
grant execute on function public.enregistrer_cours(jsonb, jsonb, uuid) to authenticated;
