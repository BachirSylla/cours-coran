-- =============================================================================
-- 0011_surcharges_cours.sql — réglages de notation et logo, par cours
--
-- Les réglages étaient globaux : un seul jeu pour tous les cours. Chaque cours
-- peut désormais SURCHARGER ce qu'il veut, et hérite du reste.
--
-- **NULL = hériter du global.** Toutes les colonnes ajoutées à `cours` sont donc
-- nullables et sans défaut : les cours existants gardent exactement le
-- comportement d'aujourd'hui, sans aucune reprise de données.
--
-- Il n'y a volontairement PAS de `cours.bareme_academique` : la part académique
-- se déduit (20 − assiduité), comme sur l'écran global. Une surcharge partielle
-- la rendrait fausse — global 17/3, un cours qui ne règle que l'assiduité à 5
-- donnerait 17 + 5 = 22. La contrainte `somme = 20` de la migration 0008 reste
-- ainsi vraie sans avoir à bouger.
--
-- Les types reprennent ceux de `parametres` : un barème à 2,5 serait sinon
-- accepté par cours et refusé globalement.
--
-- Migration idempotente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- parametres — l'assiduité entre-t-elle dans la note finale ?
--
-- Quand elle est inactive, la part académique prend tout et la note finale reste
-- sur 20 : deux rapports restent comparables, et un bulletin « /17 » se lirait
-- mal. Le calcul vit dans shared/lib/rapport.ts.
-- -----------------------------------------------------------------------------
alter table public.parametres
  add column if not exists assiduite_active boolean not null default true;

comment on column public.parametres.assiduite_active is
  'false : l''assiduité ne compte pas, la part académique prend tout et la note finale reste sur 20';

-- -----------------------------------------------------------------------------
-- cours — surcharges. NULL partout = hériter du global.
-- -----------------------------------------------------------------------------
alter table public.cours
  add column if not exists logo text,
  add column if not exists assiduite_active boolean,
  add column if not exists base_academique text,
  add column if not exists bareme_assiduite smallint,
  add column if not exists penalite_absence numeric(4, 2),
  add column if not exists penalite_retard numeric(4, 2),
  add column if not exists penaliser_absences_excusees boolean;

do $$
begin
  -- Exactement la contrainte de `parametres.logo` (migration 0010) : cette
  -- colonne finit elle aussi dans un `<img src>` du rapport, donc ni URL
  -- distante, ni `data:text/html`, ni SVG porteur de script.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cours'::regclass and conname = 'cours_logo_valide'
  ) then
    alter table public.cours
      add constraint cours_logo_valide
      check (
        logo is null
        or (
          logo ~ '^data:image/(png|jpeg|webp);base64,'
          and char_length(logo) <= 200000
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cours'::regclass and conname = 'cours_base_academique_connue'
  ) then
    alter table public.cours
      add constraint cours_base_academique_connue
      check (
        base_academique is null
        or base_academique in ('examen_seul', 'moyenne_devoirs_examen')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cours'::regclass and conname = 'cours_bareme_assiduite_borne'
  ) then
    alter table public.cours
      add constraint cours_bareme_assiduite_borne
      check (bareme_assiduite is null or bareme_assiduite between 0 and 20);
  end if;

  -- Bornes HAUTES, et pas seulement `>= 0` : `numeric` accepte 'NaN' quel que
  -- soit le typmod, et NaN >= 0 vaut true en Postgres. Même garde-fou qu'en
  -- 0008 pour les pénalités globales.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cours'::regclass and conname = 'cours_penalites_bornees'
  ) then
    alter table public.cours
      add constraint cours_penalites_bornees
      check (
        (penalite_absence is null or penalite_absence between 0 and 20)
        and (penalite_retard is null or penalite_retard between 0 and 20)
      );
  end if;
end
$$;

comment on column public.cours.logo is
  'Logo propre à ce cours, data URL base64. NULL = celui du centre (parametres.logo)';
comment on column public.cours.assiduite_active is
  'NULL = hériter de parametres.assiduite_active';
comment on column public.cours.base_academique is
  'NULL = hériter de parametres.base_academique';
comment on column public.cours.bareme_assiduite is
  'NULL = hériter. La part académique n''est pas stockée : elle se déduit (20 − assiduité)';
comment on column public.cours.penalite_absence is
  'NULL = hériter de parametres.penalite_absence';
comment on column public.cours.penalite_retard is
  'NULL = hériter de parametres.penalite_retard';
comment on column public.cours.penaliser_absences_excusees is
  'NULL = hériter de parametres.penaliser_absences_excusees';

-- Rafraîchit le cache de schéma de PostgREST (automatique sur Supabase Cloud).
notify pgrst, 'reload schema';
