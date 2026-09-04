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


/*
 * ============================ LE PARCOURS (0025) ============================
 *
 * Aïcha ne suit pas qu'un cours : elle en suit deux dans la session en cours, et
 * un troisième dans la SUIVANTE. Son jeton doit désormais rendre les trois, dans
 * l'ordre du temps — c'est tout l'objet de cette migration.
 */
/*
 * ⚠️ La session que le trigger de 0022 pose à la création du centre démarre
 * AUJOURD'HUI. La laisser telle quelle ferait dépendre l'ordre du parcours de la
 * date d'exécution : le test passerait ou non selon le jour. On fixe donc la
 * chronologie du décor de bout en bout.
 */
update public.session
set nom = 'Session initiale', date_debut = '2026-01-01', date_fin = '2026-05-31'
where centre_id = public.__id('centre');

with cree as (
  insert into public.session (centre_id, nom, date_debut, statut)
  values (public.__id('centre'), 'Session suivante', '2026-06-01', 'en_cours')
  returning id
)
insert into public.t_ids (cle, val) select 's2', id from cree;

with cree as (
  insert into public.cours
  (centre_id, session_id, enseignant_id, libelle, type_cours_id, format, date_debut, niveau)
  select public.__id('centre'), public.__id('s2'), public.__id('u_a'),
         'Coran C', id, 'groupe', '2026-06-01', 'Niveau 2'
  from public.type_cours limit 1
  returning id
)
insert into public.t_ids (cle, val) select 'cours_c', id from cree;

insert into public.inscription (centre_id, apprenant_id, cours_id, note_examen, examen_bareme)
values (public.__id('centre'), public.__id('aicha'), public.__id('cours_c'), 18, 20);

/*
 * ⚠️ LE DÉCOR DU CAS « DEUX SESSIONS, MÊME DATE DE DÉBUT ».
 *
 * `now()` étant le temps de TRANSACTION, ces sessions partagent aussi leur
 * `created_at` à la microseconde près — exactement l'état qu'une reconduction
 * produit. Sans départage par identifiant, l'ordre retombait sur le libellé du
 * cours et entrelaçait les deux sessions.
 *
 * « Coran E » est là pour que l'entrelacement soit VISIBLE : avec un seul cours
 * par session, aucun mélange ne peut se produire, et le test ne prouverait rien.
 */
with cree as (
  insert into public.session (centre_id, nom, date_debut, statut)
  values (public.__id('centre'), 'Session de rattrapage', '2026-06-01', 'en_cours')
  returning id
)
insert into public.t_ids (cle, val) select 's3', id from cree;

with cree as (
  insert into public.cours
  (centre_id, session_id, enseignant_id, libelle, type_cours_id, format, date_debut)
  select public.__id('centre'), public.__id('s3'), public.__id('u_a'),
         'Coran D', id, 'groupe', '2026-06-01'
  from public.type_cours limit 1
  returning id
)
insert into public.t_ids (cle, val) select 'cours_d', id from cree;

with cree as (
  insert into public.cours
  (centre_id, session_id, enseignant_id, libelle, type_cours_id, format, date_debut)
  select public.__id('centre'), public.__id('s2'), public.__id('u_a'),
         'Coran E', id, 'groupe', '2026-06-01'
  from public.type_cours limit 1
  returning id
)
insert into public.t_ids (cle, val) select 'cours_e', id from cree;

insert into public.inscription (centre_id, apprenant_id, cours_id) values
  (public.__id('centre'), public.__id('aicha'), public.__id('cours_d')),
  (public.__id('centre'), public.__id('aicha'), public.__id('cours_e'));

with cree as (
  insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut, sourate)
  values (public.__id('centre'), public.__id('cours_c'), '2026-06-08', '09:00', '10:00',
          'faite', 'An-Naba')
  returning id
)
insert into public.t_ids (cle, val) select 's_c1', id from cree;

insert into public.presence (centre_id, seance_id, apprenant_id, present, etat, note, note_bareme, commentaire)
values (public.__id('centre'), public.__id('s_c1'), public.__id('aicha'), true, 'present',
        19, 20, 'NOTE SESSION SUIVANTE.');

/*
 * ⚠️ LES MÊMES PIÈGES, SUR LA SECONDE SESSION.
 *
 * Les triggers de 0020 refusent une présence sur une séance non tenue : le décor
 * les suspend le temps de poser un état que l'application ne produirait pas,
 * exactement comme plus haut pour `cours_a`.
 */
alter table public.presence disable trigger presence_exige_seance_faite;
alter table public.seance disable trigger seance_refuser_sortie_de_faite;

with future as (
  insert into public.seance
  (centre_id, cours_id, date, heure_debut, heure_fin, statut, sourate, exercices_a_faire)
  values (public.__id('centre'), public.__id('cours_c'), current_date + 21,
          '09:00', '10:00', 'faite', 'Al-Mulk', 'SECRET FUTUR S2 : le devoir de la rentrée.')
  returning id
)
insert into public.presence
  (centre_id, seance_id, apprenant_id, present, etat, note, note_bareme, commentaire)
select public.__id('centre'), id, public.__id('aicha'), true, 'present', 20, 20,
       'NOTE FUTURE S2.'
from future;

with annulee as (
  insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut, sourate)
  values (public.__id('centre'), public.__id('cours_c'), '2026-06-15',
          '09:00', '10:00', 'annulee', 'Al-Qalam')
  returning id
)
insert into public.presence
  (centre_id, seance_id, apprenant_id, present, etat, note, note_bareme, commentaire)
select public.__id('centre'), id, public.__id('aicha'), true, 'present', 4, 20,
       'NOTE ANNULEE S2.'
from annulee;

alter table public.presence enable trigger presence_exige_seance_faite;
alter table public.seance enable trigger seance_refuser_sortie_de_faite;

/*
 * ⚠️ LE DÉCOR DU TEST CAPITAL : un centre voisin, avec son propre apprenant,
 * sa propre session et son propre cours. Rien de tout cela ne doit jamais
 * apparaître dans le parcours d'Aïcha.
 */
with cree as (
  insert into public.apprenant (centre_id, nom, prenom)
  values (public.__id('centre_voisin'), 'Voisine', 'Fatou')
  returning id
)
insert into public.t_ids (cle, val) select 'voisine', id from cree;

with cree as (
  insert into public.cours
  (centre_id, session_id, enseignant_id, libelle, type_cours_id, format, date_debut)
  select public.__id('centre_voisin'),
         public.__session(public.__id('centre_voisin')),
         public.__id('u_voisin'), 'COURS DU VOISIN', id, 'groupe', '2026-01-05'
  from public.type_cours limit 1
  returning id
)
insert into public.t_ids (cle, val) select 'cours_voisin', id from cree;

insert into public.inscription (centre_id, apprenant_id, cours_id)
values (public.__id('centre_voisin'), public.__id('voisine'), public.__id('cours_voisin'));

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
-- 3. LE PARCOURS — ce que le jeton fait sortir, et ce qu'il ne fait pas sortir
--
-- Le jeton résout désormais vers un APPRENANT (0025) : il rend tout son parcours
-- dans ce centre, une ligne par cours, du plus ancien au plus récent. Ce sont
-- SES résultats via SON lien — les agréger est le but.
--
-- Ce qui reste absolument interdit : un AUTRE apprenant, un AUTRE centre.
-- =============================================================================
reset role;
set local role anon;

do $$
declare
  v_jeton   uuid := (select jeton from public.t_jetons where cle = 'aicha_a');
  v_lignes  jsonb;
  v_cles    text;
  v_premier jsonb;
begin
  select jsonb_agg(to_jsonb(ligne)) into v_lignes
  from public.suivi_apprenant(v_jeton) as ligne;

  if v_lignes is null then
    raise exception 'RÉGRESSION : un jeton valide ne renvoie rien.';
  end if;

  -- Cinq cours : deux dans la session initiale, deux dans la suivante, un dans
  -- la session de rattrapage.
  if jsonb_array_length(v_lignes) <> 5 then
    raise exception 'Cinq cours attendus dans le parcours, % obtenu(s) : %',
      jsonb_array_length(v_lignes), v_lignes;
  end if;

  v_premier := v_lignes -> 0;

  /*
   * LA LISTE BLANCHE, clé par clé. Agréger plusieurs sessions ajoute des LIGNES,
   * jamais des colonnes : la surface exposée à `anon` ne doit pas s'élargir d'un
   * octet. C'est l'assertion la plus importante du fichier.
   */
  select string_agg(cle, ',' order by cle) into v_cles
  from (select jsonb_object_keys(v_premier) as cle) as k;

  if v_cles <> 'apprenant,assiduite,centre_nom,cours_libelle,enseignant,evaluations,examen,exercices,logo,statut,type_libelle' then
    raise exception 'FAILLE — le payload de `suivi_apprenant` a changé : %', v_cles;
  end if;

  -- La bonne personne, partout.
  if exists (
    select 1 from jsonb_array_elements(v_lignes) as l
    where l ->> 'apprenant' <> 'Aïcha Diallo'
  ) then
    raise exception 'Une ligne du parcours porte un autre apprenant : %', v_lignes;
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_lignes) as l
    where l ->> 'centre_nom' <> 'Centre Al-Fourqane'
  ) then
    raise exception 'Une ligne du parcours porte un autre centre : %', v_lignes;
  end if;

  /*
   * L'ORDRE CHRONOLOGIQUE. « Coran A » et « Coran B » sont dans la session la
   * plus ancienne, « Coran C » dans la suivante — il vient donc en dernier.
   * L'ordre est déterministe : date de début, puis création de la session, puis
   * libellé du cours, puis identifiant.
   */
  if v_premier ->> 'cours_libelle' <> 'Coran A'
     or (v_lignes -> 1 ->> 'cours_libelle') <> 'Coran B' then
    raise exception 'Le parcours n''est pas dans l''ordre attendu : %',
      (select string_agg(l ->> 'cours_libelle', ' → ')
       from jsonb_array_elements(v_lignes) with ordinality as t(l, n));
  end if;

  -- La session initiale d'abord, en bloc : les trois cours de juin suivent.
  if (v_lignes -> 2 ->> 'cours_libelle') in ('Coran A', 'Coran B') then
    raise exception 'La session initiale déborde sur les suivantes : %',
      (select string_agg(l ->> 'cours_libelle', ' → ')
       from jsonb_array_elements(v_lignes) with ordinality as t(l, n));
  end if;

  -- Chaque bloc porte SES données : l'agrégation ne mélange pas les cours.
  if v_premier ->> 'enseignant' <> 'Amina Bâ' then
    raise exception 'Mauvais enseignant sur le premier bloc : %', v_premier ->> 'enseignant';
  end if;

  -- Le logo du COURS l'emporte sur celui du centre (règle de 0011) ; le repli
  -- s'éprouve sur « Coran B », qui n'a pas de logo à lui.
  if v_premier ->> 'logo' is distinct from 'data:image/png;base64,LOGOCOURS' then
    raise exception 'Le logo du cours doit primer, obtenu : %', v_premier ->> 'logo';
  end if;

  if (v_lignes -> 1 ->> 'logo') is distinct from 'data:image/png;base64,LOGOCENTRE' then
    raise exception 'Sans logo de cours, celui du centre doit servir de repli, obtenu : %',
      v_lignes -> 1 ->> 'logo';
  end if;

  -- L'examen de CHAQUE cours, pas celui du voisin de ligne.
  if (v_premier -> 'examen' ->> 'note')::numeric <> 15
     or (v_lignes -> 1 -> 'examen' ->> 'note')::numeric <> 8 then
    raise exception 'Les examens ne suivent pas leur cours : %', v_lignes;
  end if;

  -- L'examen de « Coran C » vaut 18, et lui seul le porte parmi les cours de juin.
  if (select count(*) from jsonb_array_elements(v_lignes) as l
      where l ->> 'cours_libelle' = 'Coran C'
        and (l -> 'examen' ->> 'note')::numeric = 18) <> 1 then
    raise exception 'L''examen de Coran C ne suit pas son cours : %', v_lignes;
  end if;

  /*
   * ⚠️ LE TEST CAPITAL : rien d'un AUTRE apprenant, rien d'un AUTRE centre.
   * Le centre voisin a un apprenant, une session et un cours — la moindre
   * jointure qui oublierait `centre_id` les ferait remonter ici.
   */
  if v_lignes::text like '%COURS DU VOISIN%' then
    raise exception 'FUITE INTER-CENTRE : le cours d''un autre centre est sorti.';
  end if;
  if v_lignes::text like '%Centre Voisin%' then
    raise exception 'FUITE INTER-CENTRE : le nom d''un autre centre est sorti.';
  end if;
  if v_lignes::text like '%Fatou%' then
    raise exception 'FUITE INTER-CENTRE : un apprenant d''un autre centre est sorti.';
  end if;

  -- Rien d'un autre apprenant du MÊME centre non plus.
  if v_lignes::text like '%Confidentiel Omar%' then
    raise exception 'FUITE : le travail d''un AUTRE apprenant est sorti.';
  end if;

  /*
   * LES FILTRES PAR SÉANCE, sur CHAQUE session agrégée. Une séance à venir est
   * « faite » par défaut (0003) : sans la garde de date, l'apprenant lirait
   * aujourd'hui la note et le sujet préparés pour plus tard.
   */
  if v_lignes::text like '%NOTE FUTURE%' then
    raise exception 'FUITE : une note d''une séance À VENIR est publiée.';
  end if;
  if v_lignes::text like '%SECRET FUTUR%' then
    raise exception 'FUITE : les exercices d''une séance À VENIR sont publiés.';
  end if;
  if v_lignes::text like '%NOTE ANNULEE%' then
    raise exception 'FUITE : une note d''une séance ANNULÉE est publiée.';
  end if;

  -- Et la note de la session SUIVANTE, elle, est bien là : c'est le parcours.
  if v_lignes::text not like '%NOTE SESSION SUIVANTE%' then
    raise exception 'Le parcours ne remonte pas la session suivante.';
  end if;

  -- Les évaluations de « Coran A » : deux séances notées, et rien d'autre.
  if jsonb_array_length(v_premier -> 'evaluations') <> 2 then
    raise exception 'Deux évaluations attendues sur Coran A, % obtenue(s)',
      jsonb_array_length(v_premier -> 'evaluations');
  end if;

  if v_premier -> 'evaluations' -> 0 ->> 'contenu' <> 'Al-Fatiha'
     or v_premier -> 'evaluations' -> 1 ->> 'contenu' <> 'Al-Baqara v1–5' then
    raise exception 'Le contenu récité ne suit pas la règle de `libelleContenuSeance`.';
  end if;

  -- L'assiduité de « Coran A » porte sur ses seules séances tenues.
  if (v_premier -> 'assiduite' ->> 'seances')::int <> 3 then
    raise exception 'Trois séances tenues attendues sur Coran A : %',
      v_premier -> 'assiduite';
  end if;

  if v_premier ->> 'exercices' <> 'Réviser la page 72.' then
    raise exception 'Exercices attendus, obtenu : %', v_premier ->> 'exercices';
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
-- 3 bis bis. DEUX SESSIONS À LA MÊME DATE DE DÉBUT ne s'entrelacent pas
--
-- §5.15 l'autorise expressément — « une session de rattrapage n'attend pas la
-- fin de la précédente » — et `reconduire_session` n'impose rien entre les deux
-- périodes. Or `session.created_at` a pour défaut `now()`, qui est le temps de
-- TRANSACTION : deux sessions créées d'un même geste portent le même
-- horodatage. Le tri retombait alors sur le libellé du cours, et les blocs des
-- deux sessions s'entremêlaient — le liseré « ici commence le passé » de la page
-- se posant au mauvais endroit, et la fiche interne affichant deux fois le même
-- en-tête.
--
-- Ce qu'on vérifie : chaque session occupe une PLAGE CONTINUE du parcours. On ne
-- vérifie pas laquelle vient d'abord — le départage par identifiant est
-- arbitraire, et c'est assumé : la propriété qui compte est la continuité.
-- =============================================================================
reset role;

do $$
declare
  v_jeton   uuid := (select jeton from public.t_jetons where cle = 'aicha_a');
  v_coupees text;
begin
  perform public.__attendre(
    format($sql$select count(distinct date_debut) from public.session
                where centre_id = %L and date_debut = '2026-06-01'$sql$,
           public.__id('centre')),
    1::bigint, 'le décor n''a pas deux sessions à la même date');

  perform public.__attendre(
    format($sql$select count(*) from public.session
                where centre_id = %L and date_debut = '2026-06-01'$sql$,
           public.__id('centre')),
    2::bigint, 'le décor n''a pas DEUX sessions au 2026-06-01');

  /*
   * Le payload ne porte aucun identifiant — c'est la liste blanche, et elle ne
   * bougera pas pour un test. On rapproche donc chaque bloc de sa session par le
   * libellé du cours, qui est unique dans ce décor.
   */
  select string_agg(s.nom, ', ') into v_coupees
  from (
    select ligne.cours_libelle, ligne.ordinality as rang
    from public.suivi_apprenant(v_jeton) with ordinality as ligne
  ) as sortie
  join public.cours as c
    on c.libelle = sortie.cours_libelle and c.centre_id = public.__id('centre')
  join public.session as s on s.id = c.session_id
  group by s.id, s.nom
  having max(sortie.rang) - min(sortie.rang) + 1 <> count(*);

  if v_coupees is not null then
    raise exception
      'Les blocs d''une même session ne se suivent pas — session(s) coupée(s) : %. Ordre obtenu : %',
      v_coupees,
      (select string_agg(l.cours_libelle, ' → ' order by l.ordinality)
       from public.suivi_apprenant(v_jeton) with ordinality as l);
  end if;
end;
$$;

-- =============================================================================
-- 3 bis. TOUS les jetons d'un apprenant sont désormais équivalents
--
-- C'est la conséquence directe de 0025, et elle doit être dite : le lien ouvert
-- sur « Coran B » montre le MÊME parcours que celui ouvert sur « Coran A ».
-- Couper l'accès suppose donc de les révoquer TOUS — d'où
-- `revoquer_suivi_apprenant`, éprouvée plus bas.
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
declare
  v_par_a jsonb;
  v_par_b jsonb;
begin
  select jsonb_agg(to_jsonb(l) order by l.cours_libelle) into v_par_a
  from public.suivi_apprenant((select jeton from public.t_jetons where cle = 'aicha_a')) as l;

  select jsonb_agg(to_jsonb(l) order by l.cours_libelle) into v_par_b
  from public.suivi_apprenant((select jeton from public.t_jetons where cle = 'aicha_b')) as l;

  if v_par_a is distinct from v_par_b then
    raise exception 'Les deux jetons du même apprenant ne rendent pas le même parcours.';
  end if;
end;
$$;

-- =============================================================================
-- 3 ter. Un apprenant MONO-SESSION — aucune régression
--
-- Omar ne suit qu'un cours. Son parcours doit être un seul bloc : l'agrégation
-- ne doit rien inventer pour qui n'a rien de plus.
-- =============================================================================
reset role;
set local role authenticated;

do $$
begin
  perform public.__devenir(public.__id('u_a'));
  perform public.__accepte(
    format($sql$select public.activer_suivi(%L)$sql$, public.__id('insc_omar_a')),
    'A ouvre le suivi d''Omar');
end;
$$;

reset role;

insert into public.t_jetons (cle, jeton)
select 'omar', jeton from public.inscription where id = public.__id('insc_omar_a');

set local role anon;

do $$
declare v_lignes jsonb;
begin
  select jsonb_agg(to_jsonb(l)) into v_lignes
  from public.suivi_apprenant((select jeton from public.t_jetons where cle = 'omar')) as l;

  if jsonb_array_length(v_lignes) <> 1 then
    raise exception 'Un apprenant mono-session doit rendre UN bloc, % obtenu(s)',
      jsonb_array_length(v_lignes);
  end if;

  if v_lignes -> 0 ->> 'apprenant' <> 'Omar Ndiaye' then
    raise exception 'Mauvais apprenant : %', v_lignes -> 0 ->> 'apprenant';
  end if;

  -- Et rien d'Aïcha, qui suit pourtant le même cours.
  if v_lignes::text like '%Belle fluidité%' then
    raise exception 'FUITE : le travail d''un autre apprenant du même cours est sorti.';
  end if;
end;
$$;

-- =============================================================================
-- 3 quater. Une session PERPÉTUELLE — `date_fin` nulle ne fait rien planter
--
-- C'est le cas de tout centre qui n'utilise pas les sessions : celle que le
-- backfill de 0022 lui a posée n'a pas de fin. Elle doit s'ordonner et se rendre
-- comme les autres.
-- =============================================================================
reset role;

do $$
begin
  /*
   * Le décor porte les DEUX formes : une session bornée (janvier–mai) et deux
   * perpétuelles. Sans ce mélange, l'assertion ne distinguerait rien — c'est
   * précisément le défaut qu'elle avait.
   */
  perform public.__attendre(
    format($sql$select count(*) from public.session where centre_id = %L and date_fin is null$sql$,
           public.__id('centre')),
    2::bigint, 'le décor n''a pas de session perpétuelle');

  perform public.__attendre(
    format($sql$select count(*) from public.session where centre_id = %L and date_fin is not null$sql$,
           public.__id('centre')),
    1::bigint, 'le décor n''a pas de session BORNÉE : le cas perpétuel ne distingue rien');
end;
$$;

set local role anon;

do $$
declare v_jeton uuid;
begin
  -- Le jeton est lu AVANT de raisonner en `anon`, qui n'a aucun droit de table.
  select jeton into v_jeton from public.t_jetons where cle = 'aicha_a';

  perform public.__attendre(
    format($sql$select count(*) from public.suivi_apprenant(%L)$sql$, v_jeton),
    5::bigint, 'une session sans date de fin casse le parcours');
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
    5::bigint, 'le nouveau lien ne fonctionne pas');
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

  /*
   * ⚠️ LA CONSÉQUENCE DE 0025, ET ELLE DOIT ÊTRE DITE NOIR SUR BLANC.
   *
   * Révoquer UN lien ne coupe plus l'accès : le jeton du cours de B montre le
   * même parcours entier. Ce n'est pas un défaut, c'est la contrepartie du lien
   * unique — mais quiconque croirait avoir refermé la porte se tromperait.
   * C'est exactement ce que `revoquer_suivi_apprenant` existe pour résoudre, et
   * ce que l'interface doit dire.
   */
  perform public.__attendre(
    format('select count(*) from public.suivi_apprenant(%L)',
           (select jeton from public.t_jetons where cle = 'aicha_b')),
    5::bigint, 'RÉGRESSION : l''autre lien du même apprenant ne montre plus le parcours');
end;
$$;

-- =============================================================================
-- 4 bis. Fermer TOUS les liens — `revoquer_suivi_apprenant`
--
-- Même garde que l'ouverture, et pour la même raison : qui peut publier peut
-- dépublier. Elle se vérifie donc aux mêmes bornes — un enseignant d'un autre
-- centre, et un responsable qui n'anime aucun des cours de cet apprenant.
-- =============================================================================
reset role;
set local role authenticated;

do $$
begin
  perform public.__devenir(public.__id('u_voisin'));
  perform public.__refus(
    format('select public.revoquer_suivi_apprenant(%L)', public.__id('aicha')),
    'P0040', 'un enseignant d''un AUTRE centre ferme les liens');

  /*
   * R1 est responsable, mais n'anime aucun des cours d'Aïcha : `cours_animables()`
   * ne lui rend que les cours SANS enseignant. Il doit s'affecter le cours pour
   * y toucher — c'est la frontière de 0017, et elle vaut ici comme ailleurs.
   */
  perform public.__devenir(public.__id('u_r1'));
  perform public.__refus(
    format('select public.revoquer_suivi_apprenant(%L)', public.__id('aicha')),
    'P0040', 'un responsable qui n''anime aucun cours de cet apprenant ferme ses liens');
end;
$$;

do $$
declare v_fermes integer;
begin
  perform public.__devenir(public.__id('u_a'));

  select public.revoquer_suivi_apprenant(public.__id('aicha')) into v_fermes;

  -- Le lien de A est déjà révoqué : il reste celui de B. La fonction rend le
  -- nombre réellement fermé, pour que l'interface puisse le dire.
  if v_fermes <> 1 then
    raise exception 'Un lien restait ouvert, % fermé(s) rapporté(s)', v_fermes;
  end if;

  -- Idempotente : refermer ne ferme plus rien, et ne lève pas.
  select public.revoquer_suivi_apprenant(public.__id('aicha')) into v_fermes;
  if v_fermes <> 0 then
    raise exception 'La fermeture n''est pas idempotente : % ferme(s) au second appel', v_fermes;
  end if;
end;
$$;

reset role;
set local role anon;

do $$
begin
  perform public.__attendre(
    format('select count(*) from public.suivi_apprenant(%L)',
           (select jeton from public.t_jetons where cle = 'aicha_b')),
    0::bigint, 'un lien survit à la fermeture de TOUS les liens');

  -- Omar n'est pas Aïcha : fermer les liens de l'une ne touche pas l'autre.
  perform public.__attendre(
    format('select count(*) from public.suivi_apprenant(%L)',
           (select jeton from public.t_jetons where cle = 'omar')),
    1::bigint, 'la fermeture a débordé sur un autre apprenant');
end;
$$;

-- =============================================================================
-- 4 ter. L'ÉTANCHÉITÉ INTER-CENTRE, prouvée là où elle vit
--
-- Aucune sonde de données ne peut faire tomber les gardes `centre_id` des
-- jointures : les clés étrangères COMPOSITES les rendent déjà vraies. Une
-- inscription ne PEUT pas pointer un cours d'un autre centre, un cours ne PEUT
-- pas pointer la session d'un autre. Construire un décor qui les prendrait en
-- défaut supposerait de désactiver ces clés — le test ne prouverait alors plus
-- rien du schéma réel.
--
-- Deux assertions, donc, et elles se complètent :
--
--   * les clés composites EXISTENT — c'est la garde structurelle, et c'est elle
--     qui protège vraiment aujourd'hui ;
--   * la fonction porte quand même `centre_id` sur chaque jointure — c'est la
--     ceinture, et elle doit survivre à toute réécriture, parce que le jour où
--     une clé passerait à `(id)` seul, elle serait la seule chose entre un
--     apprenant et le cours d'un autre centre.
--
-- Une garde qu'aucun test ne surveille finit par disparaître à la première
-- relecture qui la trouve « redondante ».
-- =============================================================================
reset role;

do $$
declare
  v_def text := pg_get_functiondef('public.suivi_apprenant(uuid)'::regprocedure);
  v_manque text;
begin
  select string_agg(garde, ', ') into v_manque
  from (values
    ('i.centre_id    = porte.centre_id'),
    ('a.centre_id = porte.centre_id'),
    ('c.centre_id = porte.centre_id'),
    ('sess.centre_id = porte.centre_id'),
    ('m.centre_id = porte.centre_id'),
    ('ce.id = porte.centre_id'),
    ('p.centre_id = porte.centre_id')
  ) as g(garde)
  where position(garde in v_def) = 0;

  if v_manque is not null then
    raise exception
      'FAILLE — `suivi_apprenant` a perdu la garde de centre sur : %', v_manque;
  end if;

  -- Et le couple (apprenant, centre) doit rester figé par la CTE, pas repris
  -- d'une ligne jointe : c'est ce qui empêche la requête de dériver.
  if position('with porteur as' in v_def) = 0 then
    raise exception 'FAILLE — la CTE `porteur` a disparu : le centre n''est plus figé.';
  end if;
end;
$$;

do $$
declare v_manque text;
begin
  select string_agg(attendu, ' | ') into v_manque
  from (values
    ('inscription', 'FOREIGN KEY (cours_id, centre_id) REFERENCES cours(id, centre_id)%'),
    ('inscription', 'FOREIGN KEY (apprenant_id, centre_id) REFERENCES apprenant(id, centre_id)%'),
    ('cours',       'FOREIGN KEY (session_id, centre_id) REFERENCES session(id, centre_id)%')
  ) as f(tbl, attendu)
  where not exists (
    select 1 from pg_constraint as k
    where k.contype = 'f'
      and k.conrelid = ('public.' || f.tbl)::regclass
      and pg_get_constraintdef(k.oid) like f.attendu
  );

  if v_manque is not null then
    raise exception
      'FAILLE — une clé étrangère ne transporte plus le centre : %', v_manque;
  end if;
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
  perform public.__refus_droit(
    format('select public.revoquer_suivi_apprenant(%L)', gen_random_uuid()),
    'anon ferme tous les liens d''un apprenant');
end;
$$;

reset role;
select '✅ TOUTES LES ASSERTIONS PASSENT — suivi apprenant, payload et étanchéité' as resultat;

rollback;
