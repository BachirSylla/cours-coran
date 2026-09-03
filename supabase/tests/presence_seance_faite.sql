-- =============================================================================
-- presence_seance_faite.sql — l'invariant de la migration 0020
--
--     une ligne `presence` n'existe QUE si sa séance est `statut = 'faite'`.
--
-- Il se viole dans DEUX sens, et une garde qui n'en couvre qu'un ne sert à rien :
--
--   * écrire une présence sur une séance qui n'a pas eu lieu ;
--   * faire sortir de « faite » une séance qui porte déjà des présences.
--
-- Ce fichier éprouve les deux, plus les cas qui doivent rester ACCEPTÉS — une
-- garde trop large casse la saisie ordinaire, et c'est une régression aussi
-- grave qu'une garde absente.
--
-- Tout se déroule dans une transaction ANNULÉE à la fin.
--
-- Exécution :
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/presence_seance_faite.sql
--
-- Succès = aucune exception, et la ligne finale « TOUTES LES ASSERTIONS PASSENT ».
-- =============================================================================

\set ON_ERROR_STOP on
begin;

-- -----------------------------------------------------------------------------
-- Outillage
-- -----------------------------------------------------------------------------
create function public.__refus(p_sql text, p_etat text, p_message text)
returns void language plpgsql security invoker as $$
declare v_etat text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_etat = returned_sqlstate;
    if v_etat <> p_etat then
      raise exception 'MAUVAIS REFUS — % : attendu %, obtenu % (%)',
        p_message, p_etat, v_etat, sqlerrm;
    end if;
    return;
  end;

  raise exception 'FAILLE — % : l''appel a été ACCEPTÉ', p_message;
end;
$$;

create function public.__accepte(p_sql text, p_message text)
returns void language plpgsql security invoker as $$
begin
  execute p_sql;
exception when others then
  raise exception 'RÉGRESSION — % : refusé (% / %)', p_message, sqlstate, sqlerrm;
end;
$$;

create function public.__attendre(p_sql text, p_attendu bigint, p_message text)
returns void language plpgsql security invoker as $$
declare v_n bigint;
begin
  execute p_sql into v_n;
  if v_n is distinct from p_attendu then
    raise exception 'ÉCART — % : % au lieu de %', p_message, v_n, p_attendu;
  end if;
end;
$$;

create function public.__devenir(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', p_user), true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Le décor. Repéré par `returning` : la base contient de vraies données, et une
-- homonymie ferait remonter la ligne de quelqu'un d'autre.
-- -----------------------------------------------------------------------------
create table public.t_ids (cle text primary key, val uuid);

insert into public.t_ids (cle, val) values ('u_ens', gen_random_uuid());
insert into auth.users (id, email) select val, 'ens@presence.invalid' from public.t_ids;

with cree as (
  insert into public.centre (nom) values ('Centre Présence') returning id
)
insert into public.t_ids (cle, val) select 'centre', id from cree;

create function public.__id(p_cle text) returns uuid
language sql stable as $$ select val from public.t_ids where cle = p_cle $$;

/*
 * La session du centre, créée au premier appel (migration 0022).
 *
 * `cours.session_id` est `not null` : chaque décor doit donc en avoir une. Un
 * helper plutôt qu'une insertion en dur dans chaque fichier — il y a plusieurs
 * centres dans certains décors, et en oublier un donnerait une erreur de
 * contrainte bien loin de sa cause.
 */
create function public.__session(p_centre uuid) returns uuid
language plpgsql as $__s$
declare v_id uuid;
begin
  select id into v_id from public.session where centre_id = p_centre;

  if v_id is null then
    insert into public.session (centre_id, nom, date_debut, statut)
    values (p_centre, 'Session du décor', '2026-01-01', 'en_cours')
    returning id into v_id;
  end if;

  return v_id;
end;
$__s$;

-- Responsable ET enseignant : il a donc tous les droits, et ce qui sera refusé
-- plus bas le sera par l'INVARIANT, jamais par une question de permission.
insert into public.membre (centre_id, user_id, role, nom_affiche)
values (public.__id('centre'), public.__id('u_ens'), 'responsable', 'Ens');

with cree as (
  insert into public.cours
  (centre_id, session_id, enseignant_id, libelle, type_cours_id, format, date_debut)
  select public.__id('centre'), public.__session(public.__id('centre')), public.__id('u_ens'), 'Cours Présence', id, 'groupe', '2026-01-05'
  from public.type_cours limit 1
  returning id
)
insert into public.t_ids (cle, val) select 'cours', id from cree;

with cree as (
  insert into public.apprenant (centre_id, nom, prenom)
  values (public.__id('centre'), 'Diallo', 'Aïcha')
  returning id
)
insert into public.t_ids (cle, val) select 'aicha', id from cree;

insert into public.inscription (centre_id, apprenant_id, cours_id)
values (public.__id('centre'), public.__id('aicha'), public.__id('cours'));

-- Une séance par statut : c'est la matrice complète, et « absence » compte
-- autant que « annulée » — c'est un statut de SÉANCE, pas un pointage.
with cree as (
  insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut)
  values
    (public.__id('centre'), public.__id('cours'), '2026-01-05', '09:00', '10:00', 'faite'),
    (public.__id('centre'), public.__id('cours'), '2026-01-12', '09:00', '10:00', 'annulee'),
    (public.__id('centre'), public.__id('cours'), '2026-01-19', '09:00', '10:00', 'reportee'),
    (public.__id('centre'), public.__id('cours'), '2026-01-26', '09:00', '10:00', 'absence')
  returning id, statut
)
insert into public.t_ids (cle, val) select 's_' || statut, id from cree;

-- =============================================================================
-- 1. Premier sens — écrire une présence sur une séance non tenue
-- =============================================================================
set local role authenticated;

do $$
begin
  perform public.__devenir(public.__id('u_ens'));

  -- Le cas normal doit passer : une garde qui casse la saisie ordinaire est une
  -- régression aussi grave qu'une garde absente.
  perform public.__accepte(
    format($sql$insert into public.presence (seance_id, apprenant_id, present, etat, note, note_bareme)
                values (%L, %L, true, 'present', 17, 20)$sql$,
           public.__id('s_faite'), public.__id('aicha')),
    'pointer un présent sur une séance FAITE');

  -- Et les trois autres statuts sont refusés, chacun pour lui-même.
  perform public.__refus(
    format($sql$insert into public.presence (seance_id, apprenant_id, present, etat)
                values (%L, %L, false, 'absent')$sql$,
           public.__id('s_annulee'), public.__id('aicha')),
    'P0050', 'pointer une présence sur une séance ANNULÉE');

  perform public.__refus(
    format($sql$insert into public.presence (seance_id, apprenant_id, present, etat)
                values (%L, %L, false, 'absent')$sql$,
           public.__id('s_reportee'), public.__id('aicha')),
    'P0050', 'pointer une présence sur une séance REPORTÉE');

  /*
   * « Absence » est un statut de SÉANCE — la séance n'a pas eu lieu — et non le
   * pointage d'un apprenant. Le confondre est précisément ce qui a produit les
   * 11 lignes vides que 0020 a nettoyées.
   */
  perform public.__refus(
    format($sql$insert into public.presence (seance_id, apprenant_id, present, etat)
                values (%L, %L, false, 'absent')$sql$,
           public.__id('s_absence'), public.__id('aicha')),
    'P0050', 'pointer une présence sur une séance marquée ABSENCE');
end;
$$;

-- =============================================================================
-- 2. L'UPDATE compte autant que l'INSERT
--
-- Noter quelqu'un passe par un `upsert` : sur une ligne existante, c'est un
-- UPDATE. Un trigger posé sur le seul INSERT laisserait donc passer toutes les
-- notes.
-- =============================================================================
do $$
begin
  perform public.__accepte(
    format($sql$update public.presence set note = 18, commentaire = 'Mieux.'
                where seance_id = %L and apprenant_id = %L$sql$,
           public.__id('s_faite'), public.__id('aicha')),
    'modifier une note sur une séance FAITE');

  perform public.__attendre(
    format($sql$select count(*) from public.presence where seance_id = %L$sql$,
           public.__id('s_faite')),
    1::bigint, 'la présence de la séance faite a disparu');
end;
$$;

-- =============================================================================
-- 3. Second sens — sortir de « faite » une séance qui porte des présences
-- =============================================================================
do $$
begin
  perform public.__refus(
    format($sql$update public.seance set statut = 'annulee' where id = %L$sql$,
           public.__id('s_faite')),
    'P0051', 'annuler une séance qui porte des présences');

  perform public.__refus(
    format($sql$update public.seance set statut = 'reportee' where id = %L$sql$,
           public.__id('s_faite')),
    'P0051', 'reporter une séance qui porte des présences');

  -- Modifier autre chose reste possible : la garde porte sur le statut, pas sur
  -- la séance. Sans cela, une séance notée deviendrait inéditable.
  perform public.__accepte(
    format($sql$update public.seance set contenu_aborde = 'Al-Fatiha' where id = %L$sql$,
           public.__id('s_faite')),
    'corriger le contenu d''une séance qui porte des présences');

  perform public.__accepte(
    format($sql$update public.seance set statut = 'faite', motif = null where id = %L$sql$,
           public.__id('s_faite')),
    'réaffirmer « faite » sur une séance qui porte des présences');
end;
$$;

-- =============================================================================
-- 4. La sortie existe — et elle est explicite
--
-- Retirer les pointages débloque le changement de statut. C'est le chemin que
-- l'interface propose, et refuser plutôt que supprimer en silence est ce qui
-- garantit que personne ne perd du travail sans l'avoir demandé.
-- =============================================================================
do $$
begin
  perform public.__accepte(
    format($sql$delete from public.presence where seance_id = %L$sql$,
           public.__id('s_faite')),
    'retirer les pointages');

  perform public.__accepte(
    format($sql$update public.seance set statut = 'annulee', motif = 'Enseignant souffrant.'
                where id = %L$sql$, public.__id('s_faite')),
    'annuler une fois les pointages retirés');

  perform public.__attendre(
    format($sql$select count(*) from public.seance where id = %L and motif = 'Enseignant souffrant.'$sql$,
           public.__id('s_faite')),
    1::bigint, 'le motif ne s''écrit pas');

  -- Et le retour en arrière : une séance annulée sans présence redevient faite.
  perform public.__accepte(
    format($sql$update public.seance set statut = 'faite', motif = null where id = %L$sql$,
           public.__id('s_faite')),
    'repasser une séance annulée en faite');

  perform public.__accepte(
    format($sql$insert into public.presence (seance_id, apprenant_id, present, etat)
                values (%L, %L, true, 'present')$sql$,
           public.__id('s_faite'), public.__id('aicha')),
    'repointer une fois la séance redevenue faite');
end;
$$;

-- =============================================================================
-- 5. La FORME de la garde — le `for update` qui ferme la course
--
-- Deux transactions concurrentes, l'une insérant une présence et l'autre
-- annulant la séance, franchiraient chacune sa garde en READ COMMITTED : ni
-- l'une ni l'autre ne voit le travail non validé de sa voisine, et les deux
-- commettent. C'est la leçon de 0018 (CLAUDE.md §5.13).
--
-- Une course ne se rejoue pas dans une session psql unique : on vérifie donc la
-- FORME de la fonction, comme `invitation.sql` le fait pour son usage unique.
-- Le jour où quelqu'un « simplifiera » le verrou, cette assertion tombe.
-- =============================================================================
reset role;

do $$
declare v_corps text;
begin
  select pg_get_functiondef(p.oid) into v_corps
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'presence_exige_seance_faite';

  if v_corps is null then
    raise exception 'La fonction de garde des présences a disparu.';
  end if;

  if v_corps !~* 'for\s+update' then
    raise exception
      'RÉGRESSION : `presence_exige_seance_faite` ne verrouille plus la séance. Sans `for update`, deux transactions concurrentes replacent une présence sur une séance annulée.';
  end if;

  if v_corps !~* 'security\s+definer' then
    raise exception
      'RÉGRESSION : la garde est repassée en `invoker` — elle ne verrait plus qu''une partie des lignes.';
  end if;
end
$$;

-- =============================================================================
-- 6. Aucune présence ne subsiste sur une séance non tenue, nulle part
--
-- L'assertion globale : elle vaut pour le décor de ce test comme pour les vraies
-- données de la base, puisque la transaction lit tout.
-- =============================================================================
do $$
begin
  perform public.__attendre(
    $sql$select count(*) from public.presence as p
         join public.seance as s on s.id = p.seance_id
         where s.statut <> 'faite'$sql$,
    0::bigint, 'des présences subsistent sur des séances non tenues');
end;
$$;

select ' ✅ TOUTES LES ASSERTIONS PASSENT — présence réservée aux séances faites' as resultat;

rollback;
