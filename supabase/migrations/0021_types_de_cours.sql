-- =============================================================================
-- 0021_types_de_cours.sql — élargir la référence des types de cours
--
-- Le centre n'enseigne pas que la lecture et la mémorisation : Tadjwîd, Fiqh,
-- Tawhîd, Tafsîr et l'initiation à la langue arabe sont déjà donnés, faute de
-- mieux sous un type approchant.
--
-- `type_cours` est une référence GLOBALE (CLAUDE.md §4) : pas de `centre_id`,
-- lecture seule pour les utilisateurs authentifiés, aucune policy d'écriture.
-- L'enrichir passe donc par une migration, et c'est voulu — un libellé de
-- référence se relit, se pèse et se corrige une bonne fois, il ne se saisit pas
-- à la volée dans un formulaire.
--
-- ⚠️ Convention d'orthographe, à suivre pour toute addition future :
--
--   * translittération française avec voyelles longues en accent circonflexe
--     (â, î, û) — même registre que `murâja'a` dans LIBELLES_TYPE_TRAVAIL ;
--   * `q` pour ق et `h` pour ه/ح : « Fiqh », jamais « Fikh » ;
--   * `dj` pour ج, rendu courant en français : « Tadjwîd » (la variante
--     savante « Tajwîd » est également correcte — ne pas mélanger les deux dans
--     la table, la contrainte d'unicité porte sur le libellé et laisserait
--     coexister deux lignes pour une même matière) ;
--   * majuscule au seul premier mot, l'adjectif de langue restant en minuscule :
--     « Initiation à la langue arabe ».
--
-- Migration idempotente : `on conflict (libelle) do nothing` la rend rejouable,
-- et surtout elle ne TOUCHE à aucune ligne existante. Renommer un libellé déjà
-- utilisé changerait rétroactivement le type des cours qui le pointent.
-- =============================================================================
insert into public.type_cours (libelle)
values
  ('Tadjwîd'),
  ('Fiqh'),
  ('Tawhîd'),
  ('Tafsîr'),
  ('Initiation à la langue arabe')
on conflict (libelle) do nothing;

comment on table public.type_cours is
  'Référence GLOBALE des types de cours : pas de centre_id, lecture seule pour `authenticated`, aucune policy d''écriture. S''enrichit par migration (voir 0021 pour la convention d''orthographe). `on delete restrict` depuis `cours` : un type utilisé ne peut pas disparaître sous les cours qui le pointent.';
