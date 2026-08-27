-- =============================================================================
-- 0010_logo.sql — logo du centre, en en-tête du rapport de session
--
-- L'image est stockée **dans la colonne**, encodée en base64, et non dans un
-- bucket Storage : quelques dizaines de kilo-octets ne justifient pas tout un
-- étage d'infrastructure, avec ses droits d'accès et sa révocation. Le client
-- redimensionne à 400 px de grand côté avant d'envoyer.
--
-- Migration idempotente.
-- =============================================================================

alter table public.parametres add column if not exists logo text;

do $$
begin
  -- Deux garde-fous en une contrainte.
  --
  -- Le préfixe : cette colonne finit dans un `<img src>` du rapport. La base
  -- n'accepte donc qu'une image réellement encodée — ni URL distante, ni
  -- `data:text/html`, ni SVG (qui peut porter du script).
  --
  -- La longueur : `parametres` est relue par useParametres, que montent la
  -- fiche de séance, la section examen et le rapport. Une ligne de plusieurs
  -- mégaoctets pèserait sur toute l'application. Après redimensionnement un
  -- logo tient très largement sous cette borne — c'est un garde-fou contre une
  -- écriture directe, pas une limite que l'interface approche.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.parametres'::regclass
      and conname = 'parametres_logo_valide'
  ) then
    alter table public.parametres
      add constraint parametres_logo_valide
      check (
        logo is null
        or (
          logo ~ '^data:image/(png|jpeg|webp);base64,'
          and char_length(logo) <= 200000
        )
      );
  end if;
end
$$;

comment on column public.parametres.logo is
  'Logo du centre, data URL base64 (png | jpeg | webp), redimensionné côté client. Affiché en en-tête du rapport de session ; NULL = aucun logo, l''en-tête n''affiche alors aucun emblème';

-- Rafraîchit le cache de schéma de PostgREST (automatique sur Supabase Cloud).
notify pgrst, 'reload schema';
