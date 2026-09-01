-- =============================================================================
-- creer_centre.sql — ouvrir un NOUVEAU centre et lui donner son responsable
--
-- Ce geste n'existe pas dans l'application, et c'est délibéré (CLAUDE.md §5.11) :
-- `creer_invitation` n'a ni paramètre `centre_id` ni paramètre `role`, et
-- `invitation.role` n'accepte que `'enseignant'`. Ce que le client peut nommer,
-- il peut le forcer — donc il ne peut nommer ni l'un ni l'autre. Ouvrir un
-- centre reste une opération d'administration, faite ici, en SQL.
--
-- ⚠️ Le compte doit exister AVANT. L'inscription est ouverte et sans
-- confirmation d'e-mail (migration 0016) : la personne crée son compte
-- elle-même sur l'écran de connexion, atterrit sur « Rejoindre un centre » —
-- inerte, elle ne voit rien — et ce script la rattache.
--
-- Ne jamais fabriquer le compte à sa place en insérant dans `auth.users` : le
-- hachage du mot de passe et la ligne `auth.identities` sont l'affaire de
-- GoTrue, et une ligne posée à la main donne un compte qui ne peut pas se
-- connecter.
--
-- Usage :
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -v email="responsable@exemple.com" \
--     -v centre="Centre Al-Houda" \
--     -v nom="Ibrahima Fall" \
--     -f supabase/scripts/creer_centre.sql
--
-- Transactionnel : au moindre refus, rien n'est écrit.
-- =============================================================================

\set ON_ERROR_STOP on
begin;

/*
 * ⚠️ `psql` n'interpole PAS ses variables à l'intérieur d'un bloc `$$ … $$` :
 * `:'email'` y resterait littéral et provoquerait une erreur de syntaxe. Les
 * valeurs transitent donc par des réglages de session, posés ici — en portée
 * TRANSACTION (`true`), donc ils disparaissent avec elle.
 *
 * La ligne affichée est utile : elle montre ce que le script a compris de vos
 * arguments avant d'écrire quoi que ce soit.
 */
select
  set_config('creation.email', :'email', true)   as compte,
  set_config('creation.centre', :'centre', true) as centre,
  set_config('creation.nom', :'nom', true)       as nom_affiche;

do $$
declare
  v_email  text := current_setting('creation.email');
  v_centre text := current_setting('creation.centre');
  v_nom    text := current_setting('creation.nom');
  v_user   uuid;
  v_deja   text;
  v_id     uuid;
begin
  if btrim(coalesce(v_centre, '')) = '' or btrim(coalesce(v_nom, '')) = '' then
    raise exception 'Le nom du centre et le nom affiché sont obligatoires.';
  end if;

  -- 1. Le compte doit exister. Sinon on s'arrête ici plutôt que de créer un
  --    centre orphelin que personne ne pourrait administrer.
  select id into v_user from auth.users where lower(email) = lower(btrim(v_email));

  if v_user is null then
    raise exception
      'Aucun compte pour « % ». Demandez à la personne de créer son compte sur l''écran de connexion, puis relancez.',
      v_email;
  end if;

  -- 2. `membre` porte `unique (user_id)` : un utilisateur, un centre. C'est ce
  --    qui rend `centre_courant()` scalaire (CLAUDE.md §4). Le rattacher deux
  --    fois échouerait de toute façon — autant le dire clairement.
  select c.nom into v_deja
  from public.membre as m
  join public.centre as c on c.id = m.centre_id
  where m.user_id = v_user;

  if v_deja is not null then
    raise exception
      'Ce compte appartient déjà au centre « % ». Un utilisateur ne peut appartenir qu''à un seul centre.',
      v_deja;
  end if;

  -- 3. Le centre, puis son responsable. Dans cet ordre : `membre.centre_id`
  --    référence `centre`.
  --
  --    Les noms de centre ne sont PAS uniques — deux écoles peuvent porter le
  --    même nom sans se connaître. On avertit sans bloquer : c'est au
  --    responsable, pas au script, de trancher.
  if exists (select 1 from public.centre where lower(nom) = lower(btrim(v_centre))) then
    raise warning 'Un centre s''appelle déjà « % ». Un second est créé, distinct et isolé.', v_centre;
  end if;

  insert into public.centre (nom) values (btrim(v_centre)) returning id into v_id;

  insert into public.membre (centre_id, user_id, role, nom_affiche)
  values (v_id, v_user, 'responsable', btrim(v_nom));

  raise notice 'Centre « % » créé (%). % en est responsable.', btrim(v_centre), v_id, btrim(v_nom);
end
$$;

-- Ce que la personne verra en se reconnectant : son centre, et rien d'autre.
-- L'étanchéité entre centres est structurelle (RLS + clés étrangères composites,
-- migration 0012) et éprouvée par supabase/tests/rls_etancheite.sql — ce
-- récapitulatif ne la démontre pas, il vérifie seulement qu'on a écrit ce qu'on
-- croyait écrire.
select
  c.nom            as centre,
  m.role           as role,
  m.nom_affiche    as nom_affiche,
  u.email          as compte,
  (select count(*) from public.cours where centre_id = c.id)     as cours,
  (select count(*) from public.apprenant where centre_id = c.id) as apprenants
from public.membre as m
join public.centre as c on c.id = m.centre_id
join auth.users as u on u.id = m.user_id
where lower(u.email) = lower(btrim(current_setting('creation.email')));

commit;
