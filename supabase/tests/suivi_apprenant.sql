-- =============================================================================
-- suivi_apprenant.sql — la deuxième porte de `anon`, mise à l'épreuve
--
-- Cette page publie des NOTES NOMINATIVES à qui détient une URL. Ce qu'il faut
-- prouver n'est donc pas seulement « le bon jeton renvoie la bonne chose », mais
-- surtout :
--
--   * qu'un jeton ne fait jamais sortir un AUTRE apprenant, ni un autre cours ;
--   * que la liste des clés est EXACTEMENT celle qu'on a décidée — un ajout par
--     inadvertance publierait ce qu'il ne faut pas ;
--   * qu'un jeton mort ne se distingue pas d'un jeton inventé ;
--   * que `anon` n'a toujours aucun droit table, et n'atteint pas les écritures.
--
-- Tout se déroule dans une transaction ANNULÉE à la fin.
--
-- Exécution :
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/suivi_apprenant.sql
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

create function public.__refus_droit(p_sql text, p_message text)
returns void language plpgsql security invoker as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then return;
  end;

  raise exception 'FAILLE — % : c''est ACCESSIBLE', p_message;
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
-- Le décor
--
--   Centre : R1 responsable (n'enseigne rien), A et B enseignants.
--   A enseigne « Coran A » ; B enseigne « Coran B ».
--   AÏCHA suit les DEUX cours — c'est le cas qui compte : son jeton pour le
--   cours de A ne doit rien laisser voir de son travail chez B.
--   OMAR suit le cours de A : son travail ne doit pas fuir par le jeton d'Aïcha.
-- -----------------------------------------------------------------------------
create table public.t_ids (cle text primary key, val uuid);
grant select on public.t_ids to authenticated;

insert into public.t_ids (cle, val)
values ('u_r1', gen_random_uuid()), ('u_a', gen_random_uuid()), ('u_b', gen_random_uuid());

insert into auth.users (id, email)
select val, cle || '@suivi.invalid' from public.t_ids;

/*
 * ⚠️ Le décor se repère par `returning`, jamais par un `where nom = …` : la base
 * de production contient de vrais centres, cours et apprenants, et une
 * homonymie ferait remonter plusieurs lignes — ou pire, celles de quelqu'un
 * d'autre.
 */
with cree as (
  insert into public.centre (nom) values ('Centre Al-Fourqane') returning id
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

insert into public.membre (centre_id, user_id, role, nom_affiche) values
  (public.__id('centre'), public.__id('u_r1'), 'responsable', 'R1'),
  (public.__id('centre'), public.__id('u_a'),  'enseignant',  'Amina Bâ'),
  (public.__id('centre'), public.__id('u_b'),  'enseignant',  'Bilal Sow');

insert into public.parametres (centre_id, note_bareme, logo)
values (public.__id('centre'), 20, 'data:image/png;base64,LOGOCENTRE');

with cree as (
  insert into public.cours
  (centre_id, session_id, enseignant_id, libelle, type_cours_id, format, date_debut)
  select public.__id('centre'), public.__session(public.__id('centre')), public.__id('u_a'), 'Coran A', id, 'groupe', '2026-01-05'
  from public.type_cours limit 1
  returning id
)
insert into public.t_ids (cle, val) select 'cours_a', id from cree;

-- Le cours porte SON logo, le centre le sien : c'est ce qui permet d'éprouver le
-- sens du `coalesce`. Sans cela, l'inverser laisserait le test vert.
update public.cours set logo = 'data:image/png;base64,LOGOCOURS'
where id = public.__id('cours_a');

with cree as (
  insert into public.cours
  (centre_id, session_id, enseignant_id, libelle, type_cours_id, format, date_debut)
  select public.__id('centre'), public.__session(public.__id('centre')), public.__id('u_b'), 'Coran B', id, 'groupe', '2026-01-05'
  from public.type_cours limit 1
  returning id
)
insert into public.t_ids (cle, val) select 'cours_b', id from cree;

with cree as (
  insert into public.apprenant (centre_id, nom, prenom)
  values (public.__id('centre'), 'Diallo', 'Aïcha')
  returning id
)
insert into public.t_ids (cle, val) select 'aicha', id from cree;

with cree as (
  insert into public.apprenant (centre_id, nom, prenom)
  values (public.__id('centre'), 'Ndiaye', 'Omar')
  returning id
)
insert into public.t_ids (cle, val) select 'omar', id from cree;

insert into public.inscription (centre_id, apprenant_id, cours_id, note_examen, examen_bareme) values
  (public.__id('centre'), public.__id('aicha'), public.__id('cours_a'), 15, 20),
  (public.__id('centre'), public.__id('aicha'), public.__id('cours_b'), 8,  20),
  (public.__id('centre'), public.__id('omar'),  public.__id('cours_a'), 11, 20);

insert into public.t_ids (cle, val)
select 'insc_aicha_a', id from public.inscription
  where apprenant_id = public.__id('aicha') and cours_id = public.__id('cours_a')
union all
select 'insc_aicha_b', id from public.inscription
  where apprenant_id = public.__id('aicha') and cours_id = public.__id('cours_b')
union all
select 'insc_omar_a', id from public.inscription
  where apprenant_id = public.__id('omar') and cours_id = public.__id('cours_a');

-- Séances du cours de A : deux tenues, une annulée (elle ne doit pas compter
-- comme une absence), plus des exercices sur la plus récente.
insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut, sourate, versets_de, versets_a, exercices_a_faire) values
  (public.__id('centre'), public.__id('cours_a'), '2026-01-05', '09:00', '10:00', 'faite', 'Al-Fatiha', null, null, null),
  (public.__id('centre'), public.__id('cours_a'), '2026-01-12', '09:00', '10:00', 'faite', 'Al-Baqara', 1, 5, 'Réviser la page 72.'),
  (public.__id('centre'), public.__id('cours_a'), '2026-01-19', '09:00', '10:00', 'annulee', null, null, null, null);

insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut, contenu_aborde) values
  (public.__id('centre'), public.__id('cours_b'), '2026-01-06', '14:00', '15:00', 'faite', 'Tadjwîd : les règles du noun sâkin');

insert into public.t_ids (cle, val)
select 's_a1', id from public.seance where cours_id = public.__id('cours_a') and date = '2026-01-05'
union all select 's_a2', id from public.seance where cours_id = public.__id('cours_a') and date = '2026-01-12'
union all select 's_a3', id from public.seance where cours_id = public.__id('cours_a') and date = '2026-01-19'
union all select 's_b1', id from public.seance where cours_id = public.__id('cours_b');

/*
 * ⚠️ LES GARDES DE 0020 SONT SUSPENDUES LE TEMPS DU DÉCOR.
 *
 * Ce fichier construit délibérément des états que la migration 0020 interdit
 * désormais : une présence sur une séance annulée, une note sur une séance qui
 * n'a pas encore eu lieu. C'est exactement ce que `suivi_apprenant` doit ne pas
 * publier, et on ne peut l'éprouver qu'en le fabriquant.
 *
 * Ce n'est pas un contournement de confort. Les filtres `statut = 'faite'` et
 * `date <= current_date` de `suivi_apprenant` restent nécessaires pour les
 * lignes ANTÉRIEURES à 0020 — la base en contenait onze — et pour tout chemin
 * qui ne passe pas par les triggers (`service_role`, SQL d'administration). Les
 * retirer sous prétexte que « la base l'empêche » ferait reposer la
 * confidentialité sur une barrière unique.
 *
 * L'`alter table` est annulé avec la transaction, comme le reste du décor.
 */
alter table public.presence disable trigger presence_exige_seance_faite;
alter table public.seance disable trigger seance_refuser_sortie_de_faite;

/*
 * Le travail d'Aïcha chez A : deux notes, dont une séance en retard, plus une
 * séance annulée où elle est marquée absente — elle ne doit compter nulle part.
 * Chez B : une note de 4, qui ne doit JAMAIS apparaître dans le suivi du cours A.
 * Omar chez A : une note de 3, qui ne doit jamais apparaître non plus.
 */
insert into public.presence (centre_id, seance_id, apprenant_id, present, etat, note, note_bareme, commentaire) values
  (public.__id('centre'), public.__id('s_a1'), public.__id('aicha'), true, 'present', 17, 20, 'Belle fluidité.'),
  (public.__id('centre'), public.__id('s_a2'), public.__id('aicha'), true, 'retard',  16, 20, null),
  (public.__id('centre'), public.__id('s_a3'), public.__id('aicha'), false, 'absent', null, null, null),
  (public.__id('centre'), public.__id('s_b1'), public.__id('aicha'), true, 'present', 4, 20, 'À retravailler.'),
  (public.__id('centre'), public.__id('s_a1'), public.__id('omar'),  true, 'present', 3, 20, 'Confidentiel Omar.');

/*
 * ⚠️ LE PIÈGE QUI A LAISSÉ PASSER UNE FUITE : tout le décor ci-dessus est daté au
 * passé, donc aveugle à l'absence de garde `date <= current_date`.
 *
 * `seance.statut` vaut `'faite'` PAR DÉFAUT (0003), et le formulaire le pose
 * aussi en dur : une séance générée pour la semaine prochaine est « faite » sans
 * que personne l'ait décidé. Celle-ci porte donc tout ce qui ne doit pas sortir
 * par avance — un exercice, une note pré-remplie, une présence.
 */
insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut, sourate, exercices_a_faire)
values (public.__id('centre'), public.__id('cours_a'), current_date + 14, '09:00', '10:00',
        'faite', 'An-Nas', 'SECRET FUTUR : sujet du contrôle surprise.');

insert into public.presence (centre_id, seance_id, apprenant_id, present, etat, note, note_bareme, commentaire)
select public.__id('centre'), s.id, public.__id('aicha'), true, 'present', 18, 20, 'NOTE FUTURE.'
from public.seance as s
where s.cours_id = public.__id('cours_a') and s.date = current_date + 14;

/*
 * Une séance PASSÉE, notée, puis annulée après coup. Le rapport de session
 * l'écarte (`rapportSession.ts`) : si la page publique la gardait, l'apprenant
 * verrait une note s'évaporer entre les deux documents.
 */
insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut, sourate)
values (public.__id('centre'), public.__id('cours_a'), '2026-02-02', '09:00', '10:00',
        'annulee', 'Al-Ikhlas');

insert into public.presence (centre_id, seance_id, apprenant_id, present, etat, note, note_bareme, commentaire)
select public.__id('centre'), s.id, public.__id('aicha'), true, 'present', 9, 20, 'NOTE ANNULEE.'
from public.seance as s
where s.cours_id = public.__id('cours_a') and s.date = '2026-02-02';

-- Une séance TENUE sans note : elle compte dans l'assiduité, jamais dans les
-- évaluations. C'est ce qui distingue les deux comptages.
insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut) values
  (public.__id('centre'), public.__id('cours_a'), '2026-01-26', '09:00', '10:00', 'faite');

insert into public.presence (centre_id, seance_id, apprenant_id, present, etat)
select public.__id('centre'), s.id, public.__id('aicha'), true, 'present'
from public.seance as s where s.cours_id = public.__id('cours_a') and s.date = '2026-01-26';

-- Décor terminé : les gardes reprennent, et tout ce qui suit s'exécute sous
-- leur régime normal.
alter table public.presence enable trigger presence_exige_seance_faite;
alter table public.seance enable trigger seance_refuser_sortie_de_faite;

/*
 * Un centre voisin, complet et sans aucun lien avec le premier. Le fichier
 * éprouvait le cross-COURS ; il n'éprouvait pas le cross-CENTRE, qui est
 * pourtant la propriété que `cours_animables()` borne par `centre_courant()`.
 */
insert into public.t_ids (cle, val) values ('u_voisin', gen_random_uuid());
insert into auth.users (id, email) select val, 'voisin@suivi.invalid'
from public.t_ids where cle = 'u_voisin';

with cree as (
  insert into public.centre (nom) values ('Centre Voisin') returning id
)
insert into public.t_ids (cle, val) select 'centre_voisin', id from cree;

insert into public.membre (centre_id, user_id, role, nom_affiche)
values (public.__id('centre_voisin'), public.__id('u_voisin'), 'responsable', 'Voisin');

-- =============================================================================
-- 1. Qui peut ouvrir un suivi
-- =============================================================================
set local role authenticated;

do $$
begin
  -- Le responsable n'enseigne pas ce cours : le suivi est du pédagogique (0017).
  perform public.__devenir(public.__id('u_r1'));
  perform public.__refus(
    format('select public.activer_suivi(%L)', public.__id('insc_aicha_a')),
    'P0040', 'R1, responsable non-enseignant, ouvre un suivi');

  -- B enseigne un AUTRE cours : la RPC remonte jusqu'au cours, il est refusé.
  perform public.__devenir(public.__id('u_b'));
  perform public.__refus(
    format('select public.activer_suivi(%L)', public.__id('insc_aicha_a')),
    'P0040', 'B ouvre un suivi sur une inscription du cours de A');

  perform public.__refus(
    format('select public.regenerer_suivi(%L)', public.__id('insc_aicha_a')),
    'P0040', 'B régénère un lien du cours de A');

  perform public.__refus(
    format('select public.revoquer_suivi(%L)', public.__id('insc_aicha_a')),
    'P0040', 'B révoque un lien du cours de A');

  perform public.__refus(
    format('select public.activer_suivi(%L)', gen_random_uuid()),
    'P0040', 'une inscription qui n''existe pas');

  /*
   * Le responsable d'un AUTRE centre. Il est responsable chez lui, donc
   * `est_responsable()` lui dit oui — c'est `centre_courant()`, dans
   * `cours_animables()`, qui l'arrête. Le message est le même que pour un
   * inconnu : pas d'oracle inter-centres.
   */
  perform public.__devenir(public.__id('u_voisin'));
  perform public.__refus(
    format('select public.activer_suivi(%L)', public.__id('insc_aicha_a')),
    'P0040', 'le responsable d''un AUTRE centre ouvre un suivi');
  perform public.__refus(
    format('select public.regenerer_suivi(%L)', public.__id('insc_aicha_a')),
    'P0040', 'le responsable d''un AUTRE centre régénère un lien');
  perform public.__refus(
    format('select public.revoquer_suivi(%L)', public.__id('insc_aicha_a')),
    'P0040', 'le responsable d''un AUTRE centre révoque un lien');

  -- A, enseignant du cours, y a droit.
  perform public.__devenir(public.__id('u_a'));
  perform public.__accepte(
    format('select public.activer_suivi(%L)', public.__id('insc_aicha_a')),
    'A ouvre le suivi d''un de ses inscrits');

  -- Et personne n'écrit `jeton` à la main : c'est le CSPRNG du serveur.
  perform public.__refus_droit(
    format('update public.inscription set jeton = gen_random_uuid() where id = %L',
           public.__id('insc_aicha_a')),
    'A choisit lui-même le jeton');
end;
$$;

-- =============================================================================
-- 2. Idempotence de l'activation, et régénération
-- =============================================================================
reset role;

create table public.t_jetons (cle text primary key, jeton uuid);
grant select on public.t_jetons to authenticated, anon;

insert into public.t_jetons (cle, jeton)
select 'aicha_a', jeton from public.inscription where id = public.__id('insc_aicha_a');

set local role authenticated;

do $$
declare v_bis uuid;
begin
  perform public.__devenir(public.__id('u_a'));

  -- Ré-activer ne remplace pas un lien déjà distribué.
  select public.activer_suivi(public.__id('insc_aicha_a')) into v_bis;

  if v_bis is distinct from (select jeton from public.t_jetons where cle = 'aicha_a') then
    raise exception 'FAILLE : ré-activer a changé le jeton, invalidant un lien déjà transmis.';
  end if;
end;
$$;

-- =============================================================================
-- 3. Ce que le jeton fait sortir — et surtout ce qu'il ne fait pas sortir
-- =============================================================================
reset role;
set local role anon;

do $$
declare
  v_jeton uuid := (select jeton from public.t_jetons where cle = 'aicha_a');
  v_ligne record;
  v_cles  text;
begin
  select * into v_ligne from public.suivi_apprenant(v_jeton);

  if not found then
    raise exception 'RÉGRESSION : un jeton valide ne renvoie rien.';
  end if;

  -- La bonne personne, le bon cours.
  if v_ligne.apprenant <> 'Aïcha Diallo' then
    raise exception 'Mauvais apprenant : %', v_ligne.apprenant;
  end if;
  if v_ligne.cours_libelle <> 'Coran A' then
    raise exception 'Mauvais cours : %', v_ligne.cours_libelle;
  end if;
  if v_ligne.enseignant <> 'Amina Bâ' then
    raise exception 'Mauvais enseignant : %', v_ligne.enseignant;
  end if;
  if v_ligne.centre_nom <> 'Centre Al-Fourqane' then
    raise exception 'Mauvais centre : %', v_ligne.centre_nom;
  end if;
  -- Le logo du COURS l'emporte sur celui du centre (règle de 0011). Le repli sur
  -- le centre est éprouvé plus bas, par le jeton du cours B, qui n'a pas de logo.
  if v_ligne.logo is distinct from 'data:image/png;base64,LOGOCOURS' then
    raise exception 'Le logo du cours doit primer sur celui du centre, obtenu : %',
      v_ligne.logo;
  end if;

  -- LA LISTE BLANCHE, clé par clé. Un ajout par inadvertance publierait ce
  -- qu'il ne faut pas — c'est l'assertion la plus importante du fichier.
  select string_agg(cle, ',' order by cle) into v_cles
  from (select jsonb_object_keys(to_jsonb(v_ligne)) as cle) as k;

  if v_cles <> 'apprenant,assiduite,centre_nom,cours_libelle,enseignant,evaluations,examen,exercices,logo,statut,type_libelle' then
    raise exception 'FAILLE — le payload de `suivi_apprenant` a changé : %', v_cles;
  end if;

  -- Deux évaluations : les séances notées du cours A, et rien d'autre.
  if jsonb_array_length(v_ligne.evaluations) <> 2 then
    raise exception 'Deux évaluations attendues, % obtenue(s) : %',
      jsonb_array_length(v_ligne.evaluations), v_ligne.evaluations;
  end if;

  -- ⚠️ Le cœur de la confidentialité : rien de l'autre cours, rien de l'autre
  -- élève. Les notes de 4 (Aïcha chez B) et 3 (Omar chez A) existent en base.
  if v_ligne.evaluations::text like '%À retravailler%' then
    raise exception 'FUITE : un commentaire du cours de B est sorti par le jeton du cours A.';
  end if;
  if v_ligne.evaluations::text like '%Confidentiel Omar%' then
    raise exception 'FUITE : le travail d''un AUTRE apprenant est sorti.';
  end if;
  if v_ligne.evaluations::text like '%Tadjwîd%' then
    raise exception 'FUITE : le contenu d''une séance de l''autre cours est sorti.';
  end if;

  /*
   * ⚠️ Le FUTUR. Une séance datée de dans deux semaines est « faite » par défaut :
   * sans `date <= current_date`, l'apprenant lirait aujourd'hui la note et le
   * sujet préparés pour plus tard. Trois surfaces, pas une.
   */
  if v_ligne.evaluations::text like '%NOTE FUTURE%' then
    raise exception 'FUITE : une note d''une séance À VENIR est publiée.';
  end if;
  if v_ligne.exercices like '%SECRET FUTUR%' then
    raise exception 'FUITE : les exercices d''une séance À VENIR sont publiés.';
  end if;

  -- Et la séance annulée APRÈS avoir été notée : le rapport l'écarte, la page
  -- publique doit l'écarter aussi, sans quoi la note « s'évaporerait ».
  if v_ligne.evaluations::text like '%NOTE ANNULEE%' then
    raise exception 'FUITE : une note d''une séance ANNULÉE est publiée.';
  end if;

  -- Le contenu récité suit la règle de `libelleContenuSeance`.
  if v_ligne.evaluations -> 0 ->> 'contenu' <> 'Al-Fatiha' then
    raise exception 'Contenu attendu « Al-Fatiha », obtenu %', v_ligne.evaluations -> 0 ->> 'contenu';
  end if;
  if v_ligne.evaluations -> 1 ->> 'contenu' <> 'Al-Baqara v1–5' then
    raise exception 'Contenu attendu « Al-Baqara v1–5 », obtenu %',
      v_ligne.evaluations -> 1 ->> 'contenu';
  end if;
  if v_ligne.evaluations -> 1 ->> 'etat' <> 'retard' then
    raise exception 'L''état de présence doit accompagner la note.';
  end if;

  /*
   * L'assiduité porte sur les séances TENUES : deux notées + une sans note = 3.
   * La séance ANNULÉE du 19 est exclue — la compter comme une absence serait un
   * reproche injuste.
   */
  if (v_ligne.assiduite ->> 'seances')::int <> 3 then
    raise exception 'Trois séances tenues attendues, % comptée(s) : %',
      v_ligne.assiduite ->> 'seances', v_ligne.assiduite;
  end if;
  if (v_ligne.assiduite ->> 'absent')::int <> 0 then
    raise exception 'La séance annulée ne doit pas compter comme une absence : %', v_ligne.assiduite;
  end if;
  if (v_ligne.assiduite ->> 'retard')::int <> 1 then
    raise exception 'Un retard attendu : %', v_ligne.assiduite;
  end if;

  -- L'examen de CE cours (15), pas celui de l'autre (8).
  if (v_ligne.examen ->> 'note')::numeric <> 15 then
    raise exception 'Note d''examen attendue 15, obtenue % — celle de l''autre cours a fuité ?',
      v_ligne.examen ->> 'note';
  end if;

  if v_ligne.exercices <> 'Réviser la page 72.' then
    raise exception 'Exercices attendus, obtenu : %', v_ligne.exercices;
  end if;
end;
$$;

-- 0007 portait une garde explicite `jeton is not null` que 0019 n'a pas reprise.
-- Le comportement reste correct — `i.jeton = null` vaut NULL — mais plus rien ne
-- l'ancrait.
do $$
begin
  perform public.__attendre(
    'select count(*) from public.suivi_apprenant(null)', 0::bigint,
    'un jeton nul (null, pas zéro) fait sortir quelque chose');
end;
$$;

-- =============================================================================
-- 3 bis. Le SECOND cours du MÊME apprenant
--
-- Aïcha suit A et B. Son jeton pour B doit montrer B — et rien de A. C'est
-- l'étanchéité dans l'autre sens, et c'est aussi le seul endroit où le repli du
-- logo sur le centre s'éprouve : `Coran B` n'a pas de logo à lui.
-- =============================================================================
reset role;
set local role authenticated;

do $$
begin
  perform public.__devenir(public.__id('u_b'));
  perform public.__accepte(
    format('select public.activer_suivi(%L)', public.__id('insc_aicha_b')),
    'B ouvre le suivi sur SON cours');
end;
$$;

reset role;

insert into public.t_jetons (cle, jeton)
select 'aicha_b', jeton from public.inscription where id = public.__id('insc_aicha_b');

set local role anon;

do $$
declare v_ligne record;
begin
  select * into v_ligne
  from public.suivi_apprenant((select jeton from public.t_jetons where cle = 'aicha_b'));

  if not found then
    raise exception 'RÉGRESSION : le jeton du cours B ne renvoie rien.';
  end if;

  if v_ligne.cours_libelle <> 'Coran B' then
    raise exception 'Le jeton du cours B a renvoyé « % »', v_ligne.cours_libelle;
  end if;
  if v_ligne.enseignant <> 'Bilal Sow' then
    raise exception 'Mauvais enseignant sur le cours B : %', v_ligne.enseignant;
  end if;

  -- LE REPLI : `Coran B` n'a pas de logo, celui du centre prend le relais.
  -- Inverser le `coalesce` de la fonction fait tomber cette assertion-ci.
  if v_ligne.logo is distinct from 'data:image/png;base64,LOGOCENTRE' then
    raise exception 'Sans logo de cours, celui du centre doit servir de repli, obtenu : %',
      v_ligne.logo;
  end if;

  -- Son travail chez B, et RIEN de son travail chez A.
  if v_ligne.evaluations::text not like '%À retravailler%' then
    raise exception 'Le suivi du cours B doit montrer le travail fait chez B.';
  end if;
  if v_ligne.evaluations::text like '%Al-Fatiha%' then
    raise exception 'FUITE : le travail du cours A est sorti par le jeton du cours B.';
  end if;
  if v_ligne.evaluations::text like '%Belle fluidité%' then
    raise exception 'FUITE : un commentaire du cours A est sorti par le jeton du cours B.';
  end if;

  -- L'examen de B vaut 8, celui de A vaut 15.
  if (v_ligne.examen ->> 'note')::numeric <> 8 then
    raise exception 'Examen du cours B attendu 8, obtenu % — celui de A a fuité ?',
      v_ligne.examen ->> 'note';
  end if;
end;
$$;

-- =============================================================================
-- 4. Les jetons morts — une seule et même réponse
--
-- Rien ne doit distinguer « révoqué », « régénéré » et « inventé » : la page
-- affiche le même message neutre, et l'attaquant n'apprend rien.
-- =============================================================================
do $$
begin
  perform public.__attendre(
    'select count(*) from public.suivi_apprenant(gen_random_uuid())', 0::bigint,
    'un jeton inventé renvoie quelque chose');

  perform public.__attendre(
    $sql$select count(*) from public.suivi_apprenant('00000000-0000-0000-0000-000000000000')$sql$,
    0::bigint, 'un jeton nul renvoie quelque chose');
end;
$$;

reset role;
set local role authenticated;

do $$
declare v_neuf uuid;
begin
  perform public.__devenir(public.__id('u_a'));
  select public.regenerer_suivi(public.__id('insc_aicha_a')) into v_neuf;

  if v_neuf = (select jeton from public.t_jetons where cle = 'aicha_a') then
    raise exception 'FAILLE : la régénération a rendu le même jeton.';
  end if;
end;
$$;

reset role;

insert into public.t_jetons (cle, jeton)
select 'aicha_a_neuf', jeton from public.inscription where id = public.__id('insc_aicha_a');

/*
 * ⚠️ Ces vérifications se font sous `anon`, et pas sous `authenticated` : c'est
 * le rôle du scénario réel — un apprenant qui ouvre une URL. Les faire sous un
 * rôle plus puissant les rendrait complaisantes.
 */
set local role anon;

do $$
begin
  perform public.__attendre(
    format('select count(*) from public.suivi_apprenant(%L)',
           (select jeton from public.t_jetons where cle = 'aicha_a')),
    0::bigint, 'le lien régénéré laisse vivre l''ancien');

  perform public.__attendre(
    format('select count(*) from public.suivi_apprenant(%L)',
           (select jeton from public.t_jetons where cle = 'aicha_a_neuf')),
    1::bigint, 'le nouveau lien ne fonctionne pas');
end;
$$;

reset role;
set local role authenticated;

do $$
begin
  perform public.__devenir(public.__id('u_a'));
  perform public.revoquer_suivi(public.__id('insc_aicha_a'));
end;
$$;

reset role;
set local role anon;

do $$
begin
  perform public.__attendre(
    format('select count(*) from public.suivi_apprenant(%L)',
           (select jeton from public.t_jetons where cle = 'aicha_a_neuf')),
    0::bigint, 'le lien révoqué répond encore');
end;
$$;

-- =============================================================================
-- 5. `anon` n'a rien gagné d'autre
-- =============================================================================
reset role;
set local role anon;

do $$
begin
  -- Les tables restent fermées — y compris celles que la nouvelle fonction lit.
  perform public.__refus_droit('select 1 from public.presence',   'anon lit `presence`');
  perform public.__refus_droit('select 1 from public.seance',     'anon lit `seance`');
  perform public.__refus_droit('select 1 from public.inscription','anon lit `inscription`');
  perform public.__refus_droit('select 1 from public.apprenant',  'anon lit `apprenant`');
  perform public.__refus_droit('select 1 from public.membre',     'anon lit `membre`');
  perform public.__refus_droit('select 1 from public.centre',     'anon lit `centre`');
  perform public.__refus_droit('select 1 from public.parametres', 'anon lit `parametres`');

  -- Et il n'écrit rien : les trois RPC d'activation lui sont fermées.
  perform public.__refus_droit(
    format('select public.activer_suivi(%L)', gen_random_uuid()), 'anon ouvre un suivi');
  perform public.__refus_droit(
    format('select public.regenerer_suivi(%L)', gen_random_uuid()), 'anon régénère un lien');
  perform public.__refus_droit(
    format('select public.revoquer_suivi(%L)', gen_random_uuid()), 'anon révoque un lien');
end;
$$;

reset role;
select '✅ TOUTES LES ASSERTIONS PASSENT — suivi apprenant, payload et étanchéité' as resultat;

rollback;
