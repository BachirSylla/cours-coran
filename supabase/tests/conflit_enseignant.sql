-- =============================================================================
-- conflit_enseignant.sql — le garde-fou de chevauchement, mis à l'épreuve
--
-- La règle (CLAUDE.md §5.1) : deux créneaux entrent en conflit s'ils se
-- recouvrent dans le temps **ET** relèvent du même enseignant. La ressource
-- rare est la personne, pas le centre.
--
-- Ce script éprouve la source de vérité — `enregistrer_cours`, atomique — et
-- non l'aperçu du navigateur. Tout se déroule dans une transaction ANNULÉE à la
-- fin : la base de production ressort inchangée.
--
-- Exécution :
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/conflit_enseignant.sql
--
-- Succès = aucune exception, et la ligne finale « TOUTES LES ASSERTIONS PASSENT ».
-- =============================================================================

\set ON_ERROR_STOP on
begin;

-- -----------------------------------------------------------------------------
-- Outillage
-- -----------------------------------------------------------------------------

/* L'enregistrement doit être REFUSÉ, et avec le bon code (P0003 = conflit). */
create function public.__conflit_attendu(p_sql text, p_message text)
returns void language plpgsql security invoker as $$
begin
  begin
    execute p_sql;
  exception
    when sqlstate 'P0003' then return;
  end;

  raise exception 'FAILLE — % : le chevauchement a été ACCEPTÉ', p_message;
end;
$$;

/* L'enregistrement doit PASSER. Un refus est une régression, pas une sécurité. */
create function public.__accepte(p_sql text, p_message text)
returns void language plpgsql security invoker as $$
begin
  execute p_sql;
exception
  when others then
    raise exception 'RÉGRESSION — % : refusé (% / %)', p_message, sqlstate, sqlerrm;
end;
$$;

/* Raccourci d'appel : un cours, un créneau. */
create function public.__enregistrer(
  p_libelle text, p_jour int, p_debut text, p_fin text, p_cours_id uuid default null
) returns text language sql as $$
  select format(
    $sql$select public.enregistrer_cours(
      jsonb_build_object('libelle', %L,
                         'type_cours_id', (select id from public.type_cours limit 1),
                         'format', 'individuel', 'date_debut', '2026-01-05'),
      jsonb_build_array(jsonb_build_object('jour_semaine', %s,
                                           'heure_debut', %L,
                                           'heure_fin', %L)),
      %L::uuid)$sql$,
    p_libelle, p_jour, p_debut, p_fin, p_cours_id
  );
$$;

-- -----------------------------------------------------------------------------
-- Le décor : un centre, un responsable, deux enseignants
-- -----------------------------------------------------------------------------
create table public.t_ids (cle text primary key, val uuid);
grant select on public.t_ids to authenticated;

insert into public.t_ids (cle, val)
values ('u_r1', gen_random_uuid()), ('u_a', gen_random_uuid()), ('u_b', gen_random_uuid());

insert into auth.users (id, email)
select val, cle || '@conflit.invalid' from public.t_ids;

insert into public.centre (nom) values ('Centre Conflit');

insert into public.t_ids (cle, val)
select 'centre', id from public.centre where nom = 'Centre Conflit';

create function public.__id(p_cle text) returns uuid
language sql stable as $$ select val from public.t_ids where cle = p_cle $$;

insert into public.membre (centre_id, user_id, role, nom_affiche) values
  (public.__id('centre'), public.__id('u_r1'), 'responsable', 'R1'),
  (public.__id('centre'), public.__id('u_a'),  'enseignant',  'Amina'),
  (public.__id('centre'), public.__id('u_b'),  'enseignant',  'Bilal');

-- Amina a déjà cours le lundi de 10:00 à 11:00. Bilal n'a rien.
insert into public.cours (centre_id, enseignant_id, libelle, type_cours_id, format, date_debut)
select public.__id('centre'), public.__id('u_a'), 'Amina-lundi', id, 'individuel', '2026-01-05'
from public.type_cours limit 1;

insert into public.cours (centre_id, enseignant_id, libelle, type_cours_id, format, date_debut)
select public.__id('centre'), public.__id('u_b'), 'Bilal-libre', id, 'individuel', '2026-01-05'
from public.type_cours limit 1;

insert into public.t_ids (cle, val)
select 'cours_amina', id from public.cours where libelle = 'Amina-lundi'
union all select 'cours_bilal', id from public.cours where libelle = 'Bilal-libre';

insert into public.creneau (centre_id, cours_id, jour_semaine, heure_debut, heure_fin)
values (public.__id('centre'), public.__id('cours_amina'), 1, '10:00', '11:00');

-- Tout se joue depuis le responsable : c'est lui qui pose les plannings.
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', public.__id('u_r1')), true);
end;
$$;

-- =============================================================================
-- 1. L'intention du lot : deux enseignants, un même horaire
-- =============================================================================
do $$
begin
  perform public.__accepte(
    public.__enregistrer('Bilal-libre', 1, '10:00', '11:00', public.__id('cours_bilal')),
    'Bilal prend le lundi 10:00–11:00, déjà occupé par Amina');

  -- Et il l'a bien pris : le refus n'a pas été remplacé par un silence.
  if not exists (
    select 1 from public.creneau
    where cours_id = public.__id('cours_bilal') and jour_semaine = 1 and heure_debut = '10:00'
  ) then
    raise exception 'RÉGRESSION : le créneau de Bilal n''a pas été enregistré.';
  end if;
end;
$$;

-- =============================================================================
-- 2. Le double-booking d'un même enseignant reste refusé
-- =============================================================================
insert into public.cours (centre_id, enseignant_id, libelle, type_cours_id, format, date_debut)
select public.__id('centre'), public.__id('u_a'), 'Amina-second', id, 'individuel', '2026-01-05'
from public.type_cours limit 1;

insert into public.t_ids (cle, val)
select 'cours_amina2', id from public.cours where libelle = 'Amina-second';

do $$
begin
  perform public.__conflit_attendu(
    public.__enregistrer('Amina-second', 1, '10:30', '11:30', public.__id('cours_amina2')),
    'Amina serait à deux endroits le lundi à 10:30');

  -- Rien ne doit subsister : la fonction est atomique.
  if exists (select 1 from public.creneau where cours_id = public.__id('cours_amina2')) then
    raise exception 'FAILLE : un créneau a survécu au refus de chevauchement.';
  end if;

  -- La frontière reste stricte : 11:00 finit là où 11:00 commence.
  perform public.__accepte(
    public.__enregistrer('Amina-second', 1, '11:00', '12:00', public.__id('cours_amina2')),
    'Amina enchaîne à 11:00, adjacent et non chevauchant');
end;
$$;

-- =============================================================================
-- 3. Non-régression mono-enseignant : R1 se gêne toujours lui-même
--
-- C'est la situation d'aujourd'hui — un compte qui enseigne tous ses cours.
-- `enregistrer_cours` affecte un cours neuf à son créateur.
-- =============================================================================
do $$
begin
  perform public.__accepte(
    public.__enregistrer('R1-premier', 3, '14:00', '15:00'),
    'R1 crée son premier cours du mercredi');

  perform public.__conflit_attendu(
    public.__enregistrer('R1-second', 3, '14:30', '15:30'),
    'R1 se double-booke le mercredi');

  perform public.__accepte(
    public.__enregistrer('R1-troisieme', 3, '15:00', '16:00'),
    'R1 enchaîne à 15:00, adjacent');

  -- Un cours neuf est affecté à son créateur : sans cela, tout ce qui précède
  -- tomberait dans le groupe « sans enseignant » et ne prouverait rien.
  if not exists (
    select 1 from public.cours
    where libelle = 'R1-premier' and enseignant_id = public.__id('u_r1')
  ) then
    raise exception 'RÉGRESSION : un cours créé n''est plus affecté à son créateur.';
  end if;

  -- Et voici le cœur de l'invariant 1 : le contrôle vise l'enseignant AFFECTÉ,
  -- jamais `auth.uid()`. R1 agit, R1 est pris le mercredi à 14:00 — et pourtant
  -- le cours d'Amina passe, parce que c'est l'agenda d'Amina qui compte.
  perform public.__accepte(
    public.__enregistrer('Amina-second', 3, '14:00', '15:00', public.__id('cours_amina2')),
    'R1 pose sur Amina un créneau où R1 lui-même est pris');
end;
$$;

-- =============================================================================
-- 4. Le message nomme l'enseignant occupé — mais seulement quand c'est un autre
--
-- Un responsable qui pose le planning de quelqu'un d'autre doit comprendre le
-- refus sans aller lire la table. En revanche, s'entendre dire « Untel est déjà
-- pris » quand cet Untel est soi-même se lit mal — et c'est le cas de
-- l'enseignant seul, donc le cas courant.
-- =============================================================================
do $$
declare v_message text;
begin
  -- (a) Le planning d'Amina, posé par R1 : le nom aide.
  begin
    execute public.__enregistrer('Amina-second', 1, '10:15', '10:45', public.__id('cours_amina2'));
    raise exception 'FAILLE : chevauchement accepté.';
  exception
    when sqlstate 'P0003' then get stacked diagnostics v_message = message_text;
  end;

  if v_message not like '%Amina%' or v_message not like '%Amina-lundi%' then
    raise exception 'Le refus doit nommer l''enseignant ET le cours en travers. Obtenu : %',
      v_message;
  end if;

  -- (b) Son propre planning : formulation d'avant le lot 2, mot pour mot.
  begin
    execute public.__enregistrer('R1-quatrieme', 3, '14:30', '15:30');
    raise exception 'FAILLE : chevauchement accepté.';
  exception
    when sqlstate 'P0003' then get stacked diagnostics v_message = message_text;
  end;

  if v_message <> 'Ce créneau chevauche le cours « R1-premier ».' then
    raise exception 'Sur son propre planning, le refus doit rester celui d''avant. Obtenu : %',
      v_message;
  end if;
end;
$$;

reset role;
select '✅ TOUTES LES ASSERTIONS PASSENT — conflit scopé par enseignant' as resultat;

rollback;
