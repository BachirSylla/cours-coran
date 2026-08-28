-- =============================================================================
-- 0016_invitations.sql — un responsable ajoute un enseignant sans SQL
--
-- Le responsable génère un CODE depuis l'application, le transmet hors bande
-- (WhatsApp, en personne), et l'enseignant l'échange après avoir créé son
-- compte. L'échange le rattache au centre, au rôle porté par le code.
--
-- Ce qui rend acceptable d'ouvrir l'inscription Supabase est l'INERTIE : un
-- compte sans ligne `membre` a `centre_courant() = null`, donc ne voit rien,
-- n'écrit rien, et n'existe pour aucune policy. C'est l'état déjà éprouvé par
-- `rls_etancheite.sql` sous le nom « compte sans centre ».
--
-- Migration idempotente.
-- =============================================================================

-- Supabase la préinstalle, mais rien dans ce dépôt ne le disait : sur un
-- Postgres neuf, `digest` et `gen_random_bytes` manqueraient.
create extension if not exists pgcrypto with schema extensions;

-- =============================================================================
-- 1. La table
--
-- Elle ne contient QUE le SHA-256 du code, jamais le code lui-même. Le clair
-- n'existe qu'une fois, dans la valeur de retour de `creer_invitation` : l'écran
-- l'affiche, et il n'est plus jamais récupérable. Perdu = révoquer et réémettre.
-- Une fuite de la table ne donne alors accès à rien.
--
-- Ce que cela ne protège PAS, et qu'il vaut mieux savoir :
--   * le clair transite en littéral de requête RPC — les journaux de requêtes
--     du dashboard peuvent en garder trace. Le hachage protège la table, pas
--     les journaux ;
--   * `service_role` garde `all` par défaut sur toute table du schéma `public`
--     et lit donc l'empreinte. « Accordé à personne » vaut pour les rôles
--     clients, `anon` et `authenticated` ;
--   * le SHA-256 est nu, sans sel ni dérivation. Toute la marge tient aux
--     60 bits d'entropie du code et à son expiration — pas au coût du calcul.
--
-- Pas de colonne `statut` — même raison que `paiement` (CLAUDE.md §4) :
-- « active / expirée / utilisée / révoquée » se déduit de trois horodatages et
-- de `now()`. La stocker la figerait, et elle deviendrait fausse toute seule au
-- passage de l'expiration.
-- =============================================================================
create table if not exists public.invitation (
  id          uuid primary key default gen_random_uuid(),
  centre_id   uuid not null references public.centre (id) on delete cascade,
  -- Une SEULE valeur, et c'est délibéré. `racheter_invitation` recopie ce rôle
  -- dans `membre` sans le questionner — c'est ce qui garantit qu'il ne vient
  -- jamais du client. Mais cela ne laisse alors qu'une ligne de défense : le
  -- littéral `'enseignant'` de `creer_invitation`. La contrainte est la
  -- seconde. Ouvrir l'invitation d'un co-responsable devra être une migration
  -- délibérée, pas une faute de frappe.
  role        text not null default 'enseignant' check (role = 'enseignant'),
  code_hash   text not null unique,
  cree_par    uuid references auth.users (id) on delete set null,
  expire_le   timestamptz not null,
  utilise_le  timestamptz,
  utilise_par uuid references auth.users (id) on delete set null,
  revoquee_le timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

/*
 * Convergence, et pas seulement idempotence de re-jeu : `create table if not
 * exists` saute en silence si la table préexiste, y compris avec une contrainte
 * plus permissive. Ce bloc la ramène à sa forme voulue.
 */
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.invitation'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) <> 'CHECK ((role = ''enseignant''::text))'
      and conname = 'invitation_role_check'
  ) then
    alter table public.invitation drop constraint invitation_role_check;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invitation'::regclass and conname = 'invitation_role_check'
  ) then
    alter table public.invitation add constraint invitation_role_check check (role = 'enseignant');
  end if;
end
$$;

create index if not exists invitation_centre_id_idx on public.invitation (centre_id);

drop trigger if exists invitation_set_updated_at on public.invitation;
create trigger invitation_set_updated_at
  before update on public.invitation
  for each row execute function public.set_updated_at();

comment on column public.invitation.code_hash is
  'SHA-256 du code normalisé. Le code en clair n''est jamais stocké, et cette colonne n''est accordée à personne en lecture.';

-- =============================================================================
-- 2. Le code : forme, normalisation, empreinte
--
-- Alphabet de Crockford (base 32) : les chiffres, et les lettres sauf I, L, O
-- et U. 12 caractères = 60 bits — non énumérable — présentés en XXXX-XXXX-XXXX.
--
-- `normaliser_code` rend la saisie tolérante : majuscules, ponctuation ignorée,
-- et les confusions classiques rabattues (O → 0, I et L → 1). L'enseignant peut
-- retaper le code comme il le lit.
-- =============================================================================
create or replace function public.normaliser_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')), 'OIL', '011');
$$;

/*
 * `security invoker` — délibérément. Cette fonction n'a besoin d'aucun
 * privilège : `extensions.digest` est ouverte à tous et `normaliser_code` n'est
 * qu'un `translate`. La marquer `definer` n'aurait rien apporté qu'une
 * apparence de protection, là où la seule chose qui ferme cet oracle à codes
 * est le `revoke` plus bas.
 */
create or replace function public.empreinte_code(p_code text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select encode(extensions.digest(public.normaliser_code(p_code), 'sha256'), 'hex');
$$;

-- =============================================================================
-- 3. Création — réservée au responsable, pour SON centre
--
-- `security definer` : la table n'accorde aucune écriture à personne, pas même
-- au responsable. Toute insertion passe donc par ici, ce qui rend le garde-fou
-- inévitable plutôt que simplement présent.
--
-- Aucun paramètre `centre_id` ni `role` : le centre vient de `centre_courant()`,
-- le rôle est `'enseignant'` en dur. C'est l'analogue exact du garde-fou
-- anti-escalade du lot 1 — ce que le client ne peut pas nommer, il ne peut pas
-- le forcer. (La colonne accepte `responsable` pour plus tard ; aucun chemin ne
-- l'écrit aujourd'hui.)
-- =============================================================================
create or replace function public.creer_invitation(p_jours integer default 7)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_centre   uuid;
  v_octets   bytea;
  v_code     text := '';
  v_jours    integer := least(greatest(coalesce(p_jours, 7), 1), 90);
  i          integer;
begin
  if not (select public.est_responsable()) then
    raise exception 'Seul le responsable du centre peut inviter un enseignant.'
      using errcode = 'P0010';
  end if;

  v_centre := (select public.centre_courant());

  if v_centre is null then
    raise exception 'Aucun centre associé à ce compte.' using errcode = 'P0010';
  end if;

  -- 256 est un multiple exact de 32 : prendre chaque octet modulo 32 donne une
  -- distribution uniforme, sans le biais qu'aurait un alphabet non-puissance de 2.
  v_octets := extensions.gen_random_bytes(12);

  for i in 0..11 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_octets, i) % 32) + 1, 1);
  end loop;

  insert into public.invitation (centre_id, role, code_hash, cree_par, expire_le)
  values (
    v_centre,
    'enseignant',
    public.empreinte_code(v_code),
    (select auth.uid()),
    now() + make_interval(days => v_jours)
  );

  -- Seule et unique apparition du code en clair.
  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4);
end;
$$;

-- =============================================================================
-- 4. Rachat — le seul chemin qui crée une ligne `membre`
--
-- `membre` n'accorde à `authenticated` que `select` et `update (note_bareme)`
-- (migration 0012) : aucun client ne peut s'y insérer. Cette fonction est donc
-- la porte unique, et elle ne prend NI centre NI rôle en paramètre — les deux
-- viennent de la ligne `invitation`.
-- =============================================================================
create or replace function public.racheter_invitation(p_code text, p_nom_affiche text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utilisateur uuid := (select auth.uid());
  v_nom         text := nullif(btrim(coalesce(p_nom_affiche, '')), '');
  v_hash        text;
  v_centre      uuid;
  v_role        text;
  v_ligne       record;
begin
  if v_utilisateur is null then
    raise exception 'Connectez-vous avant de rejoindre un centre.' using errcode = 'P0011';
  end if;

  if v_nom is null then
    raise exception 'Indiquez le nom sous lequel vos collègues vous verront.'
      using errcode = 'P0011';
  end if;

  v_nom := left(v_nom, 80);

  -- AVANT de toucher au code : appartenir déjà à un centre est un refus, pas un
  -- échec. Le vérifier ici évite de brûler une invitation pour rien.
  if exists (select 1 from public.membre where user_id = v_utilisateur) then
    raise exception 'Ce compte appartient déjà à un centre.' using errcode = 'P0012';
  end if;

  v_hash := public.empreinte_code(p_code);

  /*
   * Revendication ATOMIQUE — une seule instruction, la garde dans le `where`.
   *
   * L'UPDATE pose un verrou de ligne. En READ COMMITTED, une seconde
   * transaction concurrente attend la première, puis RÉÉVALUE son `where` sur la
   * ligne mise à jour : `utilise_le is null` est alors faux, elle touche zéro
   * ligne. Il n'y a pas de fenêtre parce qu'il n'y a pas de lecture-puis-écriture.
   *
   * ⚠️ Ne jamais réécrire ceci en « select … then update » : ce serait
   * exactement la course que cette forme supprime.
   */
  update public.invitation
  set utilise_le  = now(),
      utilise_par = v_utilisateur
  where code_hash = v_hash
    and utilise_le is null
    and revoquee_le is null
    and expire_le > now()
  returning centre_id, role into v_centre, v_role;

  if v_centre is null then
    -- Rien revendiqué : dire POURQUOI. Cela ne divulgue rien — il a fallu
    -- présenter le code exact pour arriver jusqu'ici.
    select utilise_le, revoquee_le, expire_le into v_ligne
    from public.invitation where code_hash = v_hash;

    if not found then
      raise exception 'Ce code est inconnu. Vérifiez la saisie.' using errcode = 'P0011';
    elsif v_ligne.revoquee_le is not null then
      raise exception 'Ce code a été révoqué. Demandez-en un nouveau.' using errcode = 'P0011';
    elsif v_ligne.utilise_le is not null then
      raise exception 'Ce code a déjà été utilisé. Demandez-en un nouveau.' using errcode = 'P0011';
    else
      raise exception 'Ce code a expiré. Demandez-en un nouveau.' using errcode = 'P0011';
    end if;
  end if;

  begin
    insert into public.membre (centre_id, user_id, role, nom_affiche)
    values (v_centre, v_utilisateur, v_role, v_nom);
  exception
    when unique_violation then
      -- Course avec un autre rachat du même compte. On LÈVE : toute la fonction
      -- est annulée, y compris la revendication — le code reste utilisable.
      raise exception 'Ce compte appartient déjà à un centre.' using errcode = 'P0012';
  end;

  return (select nom from public.centre where id = v_centre);
end;
$$;

-- =============================================================================
-- 5. Révocation — une invitation non utilisée cesse d'être rachetable
-- =============================================================================
create or replace function public.revoquer_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_touchees integer;
begin
  if not (select public.est_responsable()) then
    raise exception 'Seul le responsable du centre peut révoquer une invitation.'
      using errcode = 'P0010';
  end if;

  update public.invitation
  set revoquee_le = now()
  where id = p_id
    and centre_id = (select public.centre_courant())
    and utilise_le is null
    and revoquee_le is null;

  get diagnostics v_touchees = row_count;

  if v_touchees = 0 then
    raise exception 'Invitation introuvable, déjà utilisée ou déjà révoquée.'
      using errcode = 'P0011';
  end if;
end;
$$;

alter function public.normaliser_code(text)              owner to postgres;
alter function public.empreinte_code(text)               owner to postgres;
alter function public.creer_invitation(integer)          owner to postgres;
alter function public.racheter_invitation(text, text)    owner to postgres;
alter function public.revoquer_invitation(uuid)          owner to postgres;

-- =============================================================================
-- 6. Droits et policy
--
-- La table n'accorde QUE le SELECT, et seulement au responsable de son centre.
-- Aucun `insert`, `update` ni `delete` n'est accordé à qui que ce soit : les
-- trois fonctions ci-dessus sont les seules écritures possibles.
--
-- `code_hash` est exclu du `grant select` : l'empreinte ne sort jamais de la
-- base, pas même vers celui qui a créé l'invitation.
-- =============================================================================
alter table public.invitation enable row level security;

revoke all on public.invitation from anon, authenticated;

grant select (id, centre_id, role, cree_par, expire_le, utilise_le, utilise_par,
              revoquee_le, created_at, updated_at)
  on public.invitation to authenticated;

drop policy if exists "invitation_select_responsable" on public.invitation;
create policy "invitation_select_responsable"
  on public.invitation for select to authenticated
  using (
    centre_id = (select public.centre_courant())
    and (select public.est_responsable())
  );

/*
 * ⚠️ `revoke ... from public` ne suffit pas : Supabase pose un
 * `alter default privileges ... grant execute on functions to authenticated`,
 * qui est un privilège NOMMÉ, indépendant de celui de PUBLIC. Sans le retirer
 * explicitement, `empreinte_code` resterait appelable — soit un oracle
 * permettant d'éprouver des codes hors de tout garde-fou.
 */
revoke all on function public.normaliser_code(text) from public, anon, authenticated;
revoke all on function public.empreinte_code(text) from public, anon, authenticated;
revoke all on function public.creer_invitation(integer) from public, anon, authenticated;
revoke all on function public.racheter_invitation(text, text) from public, anon, authenticated;
revoke all on function public.revoquer_invitation(uuid) from public, anon, authenticated;

-- Seules les trois portes du flux sont rouvertes, et seulement aux connectés.
grant execute on function public.creer_invitation(integer) to authenticated;
grant execute on function public.racheter_invitation(text, text) to authenticated;
grant execute on function public.revoquer_invitation(uuid) to authenticated;

notify pgrst, 'reload schema';
