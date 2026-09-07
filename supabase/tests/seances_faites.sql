-- =============================================================================
-- seances_faites.sql — le compteur de séances tenues, et son cloisonnement
--
-- `seances_faites_par_cours` est `security INVOKER` : c'est la policy
-- `seance_select` (`cours_lisibles()`) qui décide de ce que chacun compte, et
-- rien d'autre. Ce qu'il faut prouver :
--
--   * un responsable compte les cours de son centre ;
--   * un enseignant ne compte QUE les siens — pas le cours d'un collègue, pas
--     un cours sans enseignant ;
--   * seules les séances `faite` entrent dans le compte.
--
-- ⚠️ Les vérifications se font sous le RÔLE `authenticated`, pas seulement avec
-- un JWT posé : en superuser la RLS ne s'applique pas, et le test serait vert
-- au-dessus de rien. C'est la faute qui a été commise en écrivant ce fichier.
--
-- Tout se déroule dans une transaction ANNULÉE à la fin.
--
-- Exécution :
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/seances_faites.sql
-- =============================================================================

\set ON_ERROR_STOP on
begin;

create table public.t_ids (cle text primary key, val uuid);
create function public.__id(c text) returns uuid language sql stable as $$
  select val from public.t_ids where cle = c $$;

insert into public.t_ids (cle, val) values ('u_r', gen_random_uuid()), ('u_e', gen_random_uuid());
insert into auth.users (id, email) select val, cle || '@faites.invalid' from public.t_ids;

with c as (insert into public.centre (nom) values ('Centre FAITES') returning id)
insert into public.t_ids select 'centre', id from c;

insert into public.membre (centre_id, user_id, role, nom_affiche) values
  (public.__id('centre'), public.__id('u_r'), 'responsable', 'R'),
  (public.__id('centre'), public.__id('u_e'), 'enseignant',  'E');

update public.session set nom = 'S', date_debut = '2026-01-05'
where centre_id = public.__id('centre');
insert into public.t_ids select 's', id from public.session where centre_id = public.__id('centre');

-- Deux cours : l'un animé par E, l'autre par personne.
with c as (
  insert into public.cours (centre_id, session_id, enseignant_id, libelle, type_cours_id, format, date_debut)
  select public.__id('centre'), public.__id('s'), public.__id('u_e'), 'Cours de E', id, 'groupe', '2026-01-05'
  from public.type_cours limit 1 returning id)
insert into public.t_ids select 'c_e', id from c;

with c as (
  insert into public.cours (centre_id, session_id, libelle, type_cours_id, format, date_debut)
  select public.__id('centre'), public.__id('s'), 'Cours orphelin', id, 'groupe', '2026-01-05'
  from public.type_cours limit 1 returning id)
insert into public.t_ids select 'c_o', id from c;

/*
 * ⚠️ UNE SECONDE SESSION, avec son cours et ses séances. Sans elle, retirer le
 * filtre `session_id` de la fonction ne changerait rien au résultat, et
 * l'assertion serait verte au-dessus d'une garde absente.
 */
with c as (
  insert into public.session (centre_id, nom, date_debut, statut)
  values (public.__id('centre'), 'Autre session', '2025-01-05', 'en_cours') returning id)
insert into public.t_ids select 's_autre', id from c;

with c as (
  insert into public.cours (centre_id, session_id, enseignant_id, libelle, type_cours_id, format, date_debut)
  select public.__id('centre'), public.__id('s_autre'), public.__id('u_e'), 'Cours d''avant', id, 'groupe', '2025-01-05'
  from public.type_cours limit 1 returning id)
insert into public.t_ids select 'c_avant', id from c;

insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut) values
  (public.__id('centre'), public.__id('c_avant'), '2025-01-06', '09:00', '10:00', 'faite'),
  (public.__id('centre'), public.__id('c_avant'), '2025-01-13', '09:00', '10:00', 'faite'),
  (public.__id('centre'), public.__id('c_avant'), '2025-01-20', '09:00', '10:00', 'faite'),
  (public.__id('centre'), public.__id('c_avant'), '2025-01-27', '09:00', '10:00', 'faite');

-- 3 faites + 1 annulée sur le cours de E ; 2 faites sur l'orphelin.
insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut) values
  (public.__id('centre'), public.__id('c_e'), '2026-01-06', '09:00', '10:00', 'faite'),
  (public.__id('centre'), public.__id('c_e'), '2026-01-13', '09:00', '10:00', 'faite'),
  (public.__id('centre'), public.__id('c_e'), '2026-01-20', '09:00', '10:00', 'faite'),
  (public.__id('centre'), public.__id('c_e'), '2026-01-27', '09:00', '10:00', 'annulee'),
  (public.__id('centre'), public.__id('c_o'), '2026-01-06', '11:00', '12:00', 'faite'),
  (public.__id('centre'), public.__id('c_o'), '2026-01-13', '11:00', '12:00', 'faite');

create function public.__devenir(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', u), true); end $$;

-- ⚠️ Le rôle, pas seulement le JWT : en superuser la RLS ne s'applique pas, et
-- le test serait vert au-dessus de rien.
reset role;
set local role authenticated;

do $$
declare v_total bigint; v_lignes bigint;
begin
  -- LE RESPONSABLE voit les deux cours, et ne compte QUE les séances faites.
  perform public.__devenir(public.__id('u_r'));
  select count(*), coalesce(sum(faites), 0) into v_lignes, v_total
  from public.seances_faites_par_cours(public.__id('s'));

  -- 2 cours dans CETTE session, 5 séances faites. Le cours d'une autre session
  -- (4 séances faites) ne doit pas entrer dans le compte.
  if v_lignes <> 2 or v_total <> 5 then
    raise exception 'Responsable : 2 cours / 5 séances attendus, obtenu % / %', v_lignes, v_total;
  end if;

  -- ⚠️ L'ENSEIGNANT ne compte que SES cours. `cours_lisibles()` fait le
  -- cloisonnement : la fonction est `security invoker`, elle n'ouvre rien.
  perform public.__devenir(public.__id('u_e'));
  select count(*), coalesce(sum(faites), 0) into v_lignes, v_total
  from public.seances_faites_par_cours(public.__id('s'));

  if v_lignes <> 1 or v_total <> 3 then
    raise exception 'Enseignant : 1 cours / 3 séances attendus, obtenu % / %', v_lignes, v_total;
  end if;
end;
$$;

reset role;
select '✅ TOUTES LES ASSERTIONS PASSENT — compteur de séances tenues' as resultat;
rollback;
