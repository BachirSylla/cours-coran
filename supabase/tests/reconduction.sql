-- =============================================================================
-- reconduction.sql — ouvrir la session suivante (migration 0024)
--
-- Ce qu'il faut prouver n'est pas seulement « ça recopie », mais surtout :
--
--   * que la STRUCTURE passe — libellé, type, niveau, format, enseignant,
--     créneaux, réglages, tarif ;
--   * que la PÉDAGOGIE ne passe PAS — ni inscriptions, ni séances, ni présences,
--     ni notes, ni examens. C'est ce qui fait de la progression d'un apprenant
--     une histoire sur plusieurs sessions au lieu d'un recommencement ;
--   * qu'aucun SECRET ne passe : `jeton_partage` recopié donnerait à l'ancien
--     public l'accès au nouveau cours ;
--   * que les mêmes créneaux ne déclenchent AUCUN conflit — sans quoi la
--     reconduction se gênerait elle-même et serait inutilisable ;
--   * que la session SOURCE n'est pas touchée ;
--   * que c'est TOUT OU RIEN, et gardé au responsable du bon centre.
--
-- Tout se déroule dans une transaction ANNULÉE à la fin.
--
-- Exécution :
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/reconduction.sql
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
-- Décor : un centre avec Session 17 garnie, un centre voisin.
-- -----------------------------------------------------------------------------
create table public.t_ids (cle text primary key, val uuid);

insert into public.t_ids (cle, val) values
  ('u_resp', gen_random_uuid()), ('u_ens', gen_random_uuid()),
  ('u_partant', gen_random_uuid()), ('u_voisin', gen_random_uuid());

insert into auth.users (id, email) select val, cle || '@reconduction.invalid' from public.t_ids;

with cree as (insert into public.centre (nom) values ('Centre Reconduction') returning id)
insert into public.t_ids (cle, val) select 'centre', id from cree;

create function public.__id(p_cle text) returns uuid
language sql stable as $$ select val from public.t_ids where cle = p_cle $$;

with cree as (insert into public.centre (nom) values ('Centre Voisin R') returning id)
insert into public.t_ids (cle, val) select 'centre_voisin', id from cree;

insert into public.membre (centre_id, user_id, role, nom_affiche) values
  (public.__id('centre'), public.__id('u_resp'), 'responsable', 'Resp'),
  (public.__id('centre'), public.__id('u_ens'), 'enseignant', 'Amina'),
  (public.__id('centre'), public.__id('u_partant'), 'enseignant', 'Partant'),
  (public.__id('centre_voisin'), public.__id('u_voisin'), 'responsable', 'Voisin');

-- La session posée par le trigger de 0022 devient « Session 17 ».
update public.session set nom = 'Session 17', date_debut = '2026-01-05'
where centre_id = public.__id('centre');
insert into public.t_ids (cle, val)
select 's17', id from public.session where centre_id = public.__id('centre');

set local role authenticated;

do $$
declare v_type uuid := (select id from public.type_cours limit 1);
begin
  perform public.__devenir(public.__id('u_resp'));

  -- Deux cours d'Amina, un cours du partant, tous en Session 17.
  perform public.enregistrer_cours(
    jsonb_build_object('libelle','Coran Niveau 1','type_cours_id',v_type,'format','groupe',
      'date_debut','2026-01-05','statut','actif','enseignant_id',public.__id('u_ens'),
      'session_id',public.__id('s17'),'niveau','Niveau 1',
      'prix_mensuel',15000,'prix_session',120000,'devise','XOF'),
    jsonb_build_array(jsonb_build_object('jour_semaine',1,'heure_debut','10:00','heure_fin','11:00'),
                      jsonb_build_object('jour_semaine',3,'heure_debut','10:00','heure_fin','11:00')));

  perform public.enregistrer_cours(
    jsonb_build_object('libelle','Coran Niveau 2','type_cours_id',v_type,'format','individuel',
      'date_debut','2026-01-05','statut','termine','enseignant_id',public.__id('u_ens'),
      'session_id',public.__id('s17'),'niveau','Niveau 2'),
    jsonb_build_array(jsonb_build_object('jour_semaine',2,'heure_debut','14:00','heure_fin','15:00')));

  perform public.enregistrer_cours(
    jsonb_build_object('libelle','Tadjwîd','type_cours_id',v_type,'format','groupe',
      'date_debut','2026-01-05','statut','actif','enseignant_id',public.__id('u_partant'),
      'session_id',public.__id('s17'),'niveau','Niveau 1'),
    jsonb_build_array(jsonb_build_object('jour_semaine',5,'heure_debut','09:00','heure_fin','10:00')));
end;
$$;

reset role;

insert into public.t_ids (cle, val)
select 'c_n1', id from public.cours where centre_id = public.__id('centre') and libelle = 'Coran Niveau 1';

/*
 * Des réglages de notation et un logo propres au cours : l'en-tête du fichier
 * et le dialogue les annoncent comme recopiés, encore faut-il l'éprouver.
 */
update public.cours
set bareme_assiduite = 7, penalite_absence = 1.5, penalite_retard = 0.5,
    base_academique = 'examen_seul', assiduite_active = true,
    penaliser_absences_excusees = true,
    logo = 'data:image/png;base64,LOGOCOURS'
where id = public.__id('c_n1');
insert into public.t_ids (cle, val)
select 'c_tadjwid', id from public.cours where centre_id = public.__id('centre') and libelle = 'Tadjwîd';

-- De la PÉDAGOGIE sur la session source : c'est elle qui ne doit pas suivre.
with cree as (
  insert into public.apprenant (centre_id, nom, prenom)
  values (public.__id('centre'), 'Diallo', 'Aïcha') returning id
)
insert into public.t_ids (cle, val) select 'aicha', id from cree;

insert into public.inscription (centre_id, apprenant_id, cours_id, note_examen, examen_bareme)
values (public.__id('centre'), public.__id('aicha'), public.__id('c_n1'), 16, 20);

with cree as (
  insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut, contenu_aborde)
  values (public.__id('centre'), public.__id('c_n1'), '2026-01-05', '10:00', '11:00', 'faite', 'Al-Fatiha')
  returning id
)
insert into public.t_ids (cle, val) select 'seance', id from cree;

insert into public.presence (centre_id, seance_id, apprenant_id, present, etat, note, note_bareme)
values (public.__id('centre'), public.__id('seance'), public.__id('aicha'), true, 'present', 17, 20);

-- Un lien de visio et un jeton de partage : deux choses qui ne doivent JAMAIS
-- se retrouver dans la copie.
update public.cours
set lien_meet = 'https://meet.example/ancien', jeton_partage = gen_random_uuid()
where id = public.__id('c_n1');

-- =============================================================================
-- A. Les gardes
-- =============================================================================
set local role authenticated;

do $$
begin
  -- L'enseignant n'ouvre pas de session : c'est de la structure.
  perform public.__devenir(public.__id('u_ens'));
  perform public.__refus(
    format($sql$select public.reconduire_session(%L, 'Session 18', '2026-06-01')$sql$,
           public.__id('s17')),
    'P0070', 'un enseignant reconduit une session');

  -- Le responsable d'un AUTRE centre non plus, et il l'apprend par le même
  -- message : pas d'oracle inter-centres.
  perform public.__devenir(public.__id('u_voisin'));
  perform public.__refus(
    format($sql$select public.reconduire_session(%L, 'Session 18', '2026-06-01')$sql$,
           public.__id('s17')),
    'P0070', 'le responsable d''un autre centre reconduit');

  perform public.__devenir(public.__id('u_resp'));

  perform public.__refus(
    format($sql$select public.reconduire_session(%L, '   ', '2026-06-01')$sql$,
           public.__id('s17')),
    'P0071', 'reconduire sans nom');

  perform public.__refus(
    format($sql$select public.reconduire_session(%L, 'Session 18', null)$sql$,
           public.__id('s17')),
    'P0071', 'reconduire sans date de début');

  perform public.__refus(
    format($sql$select public.reconduire_session(%L, 'Session 18', '2026-06-01', '2026-05-01')$sql$,
           public.__id('s17')),
    'P0071', 'reconduire avec une fin avant le début');

  perform public.__refus(
    format($sql$select public.reconduire_session(%L, 'Session 17', '2026-06-01')$sql$,
           public.__id('s17')),
    'P0071', 'reconduire sous un nom déjà pris');

  -- Une session inexistante donne le MÊME message qu'un refus de droit.
  perform public.__refus(
    format($sql$select public.reconduire_session(%L, 'Session 18', '2026-06-01')$sql$,
           gen_random_uuid()),
    'P0070', 'reconduire une session inexistante');
end;
$$;

-- Tout ou rien : après ces refus, aucune session neuve ne doit exister.
do $$
begin
  perform public.__attendre(
    format($sql$select count(*) from public.session where centre_id = %L$sql$,
           public.__id('centre')),
    1::bigint, 'un refus a laissé une session derrière lui');
end;
$$;

-- =============================================================================
-- B. La reconduction, et ce qu'elle emporte
-- =============================================================================
do $$
declare v_neuve uuid;
begin
  perform public.__devenir(public.__id('u_resp'));

  -- Une date de début LIBRE : cinq mois de vacances entre les deux.
  select public.reconduire_session(public.__id('s17'), 'Session 18', '2026-06-01')
  into v_neuve;

  insert into public.t_ids (cle, val) values ('s18', v_neuve);
end;
$$;

reset role;

do $$
begin
  -- --- LA STRUCTURE SUIT ----------------------------------------------------
  perform public.__attendre(
    format($sql$select count(*) from public.cours where session_id = %L$sql$, public.__id('s18')),
    3::bigint, 'les trois cours n''ont pas été recopiés');

  perform public.__attendre(
    format($sql$select count(*) from public.cours as c
                where c.session_id = %L and c.libelle = 'Coran Niveau 1'
                  and c.niveau = 'Niveau 1' and c.format = 'groupe'
                  and c.enseignant_id = %L$sql$,
           public.__id('s18'), public.__id('u_ens')),
    1::bigint, 'libellé, niveau, format ou enseignant n''ont pas suivi');

  -- Les créneaux, à l'identique — deux pour le premier cours.
  perform public.__attendre(
    format($sql$select count(*) from public.creneau as cr
                join public.cours as c on c.id = cr.cours_id
                where c.session_id = %L and c.libelle = 'Coran Niveau 1'
                  and cr.heure_debut = '10:00' and cr.heure_fin = '11:00'$sql$,
           public.__id('s18')),
    2::bigint, 'les créneaux n''ont pas suivi');

  /*
   * Les réglages de notation et le logo. Sans ces assertions, les retirer de la
   * boucle laisserait le test vert — et un cours reconduit repartirait
   * silencieusement sur les réglages par défaut du centre, ce qui changerait
   * les notes finales sans que personne s'en aperçoive.
   */
  perform public.__attendre(
    format($sql$select count(*) from public.cours
                where session_id = %L and libelle = 'Coran Niveau 1'
                  and bareme_assiduite = 7 and penalite_absence = 1.5
                  and penalite_retard = 0.5 and base_academique = 'examen_seul'
                  and assiduite_active is true and penaliser_absences_excusees is true$sql$,
           public.__id('s18')),
    1::bigint, 'les réglages de notation n''ont pas suivi');

  perform public.__attendre(
    format($sql$select count(*) from public.cours
                where session_id = %L and logo = 'data:image/png;base64,LOGOCOURS'$sql$,
           public.__id('s18')),
    1::bigint, 'le logo du cours n''a pas suivi');

  -- Le type de cours, qui décide de l'affichage et du rapport.
  perform public.__attendre(
    format($sql$select count(*) from public.cours as copie
                join public.cours as source on source.id = copie.reconduit_de
                where copie.session_id = %L and copie.type_cours_id = source.type_cours_id$sql$,
           public.__id('s18')),
    3::bigint, 'le type de cours n''a pas suivi');

  /*
   * Le tarif suit : sans lui, il faudrait ressaisir chaque prix à chaque session.
   *
   * ⚠️ LES DEUX tarifs, et l'assertion porte sur les deux ENSEMBLE. N'éprouver
   * que `prix_mensuel` a laissé passer 0026 : `prix_session` n'était pas recopié,
   * et un centre au forfait perdait tous ses prix à chaque reconduction — sans
   * que ce test cesse d'être vert. Une colonne AJOUTÉE à `tarif` doit venir
   * s'ajouter ici en même temps qu'à la fonction.
   */
  perform public.__attendre(
    format($sql$select count(*) from public.tarif as t
                join public.cours as c on c.id = t.cours_id
                where c.session_id = %L
                  and t.prix_mensuel = 15000 and t.prix_session = 120000$sql$,
           public.__id('s18')),
    1::bigint, 'le tarif n''a pas suivi — mensuel ET forfait');

  -- Un cours « terminé » repart ACTIF : on ouvre une période, on ne recopie pas
  -- un état de fin.
  perform public.__attendre(
    format($sql$select count(*) from public.cours where session_id = %L and statut = 'actif'$sql$,
           public.__id('s18')),
    3::bigint, 'un cours n''est pas reparti actif');

  -- Les dates suivent la NOUVELLE session, et la fin repart nulle.
  perform public.__attendre(
    format($sql$select count(*) from public.cours
                where session_id = %L and date_debut = '2026-06-01' and date_fin is null$sql$,
           public.__id('s18')),
    3::bigint, 'les dates ne suivent pas la nouvelle session');

  -- --- LA PÉDAGOGIE NE SUIT PAS --------------------------------------------
  perform public.__attendre(
    format($sql$select count(*) from public.inscription as i
                join public.cours as c on c.id = i.cours_id
                where c.session_id = %L$sql$, public.__id('s18')),
    0::bigint, 'FUITE : des inscriptions ont été recopiées');

  perform public.__attendre(
    format($sql$select count(*) from public.seance as s
                join public.cours as c on c.id = s.cours_id
                where c.session_id = %L$sql$, public.__id('s18')),
    0::bigint, 'FUITE : des séances ont été recopiées');

  perform public.__attendre(
    format($sql$select count(*) from public.presence as p
                join public.cours as c on c.id = p.cours_id
                where c.session_id = %L$sql$, public.__id('s18')),
    0::bigint, 'FUITE : des présences ou des notes ont été recopiées');

  -- --- AUCUN SECRET NE SUIT -------------------------------------------------
  perform public.__attendre(
    format($sql$select count(*) from public.cours
                where session_id = %L and jeton_partage is not null$sql$, public.__id('s18')),
    0::bigint, 'FUITE GRAVE : un jeton de partage a été recopié');

  perform public.__attendre(
    format($sql$select count(*) from public.cours
                where session_id = %L and lien_meet is not null$sql$, public.__id('s18')),
    0::bigint, 'un lien de visioconférence périmé a été recopié');

  /*
   * --- LE LIEN D'ORIGINE ---------------------------------------------------
   *
   * `reconduit_de` est ce qui permet, à l'inscription, de proposer les
   * apprenants du cours précédent — une aide à la saisie, puisque la
   * reconduction n'en reprend délibérément aucun. Sans ce lien, la
   * fonctionnalité ne marcherait jamais, en silence.
   */
  perform public.__attendre(
    format($sql$select count(*) from public.cours as copie
                join public.cours as source on source.id = copie.reconduit_de
                where copie.session_id = %L
                  and source.session_id = %L
                  and source.libelle = copie.libelle$sql$,
           public.__id('s18'), public.__id('s17')),
    3::bigint, 'les copies ne pointent pas leur cours d''origine');

  -- Le lien traverse le centre correctement : la clé étrangère est composite.
  perform public.__attendre(
    format($sql$select count(*) from public.cours as copie
                join public.cours as source on source.id = copie.reconduit_de
                where copie.session_id = %L and source.centre_id <> copie.centre_id$sql$,
           public.__id('s18')),
    0::bigint, 'une copie pointe un cours d''un AUTRE centre');

  -- Ni auto-lien, ni cours source qui pointerait sa propre copie.
  perform public.__attendre(
    format($sql$select count(*) from public.cours
                where session_id in (%L, %L) and reconduit_de = id$sql$,
           public.__id('s17'), public.__id('s18')),
    0::bigint, 'un cours se pointe lui-même');

  perform public.__attendre(
    format($sql$select count(*) from public.cours where session_id = %L
                  and reconduit_de is not null$sql$, public.__id('s17')),
    0::bigint, 'la session source a gagné un lien de reconduction');

  /*
   * Et c'est bien par ce lien qu'on retrouve les anciens inscrits : le cours
   * copié n'en a aucun, mais son origine en a un.
   */
  perform public.__attendre(
    format($sql$select count(*) from public.cours as copie
                join public.inscription as i on i.cours_id = copie.reconduit_de
                where copie.session_id = %L and copie.libelle = 'Coran Niveau 1'$sql$,
           public.__id('s18')),
    1::bigint, 'les anciens inscrits ne sont pas atteignables par `reconduit_de`');

  -- --- LA SOURCE N'EST PAS TOUCHÉE ------------------------------------------
  perform public.__attendre(
    format($sql$select count(*) from public.cours where session_id = %L$sql$, public.__id('s17')),
    3::bigint, 'la session source a perdu des cours');

  perform public.__attendre(
    format($sql$select count(*) from public.session
                where id = %L and statut = 'en_cours' and nom = 'Session 17'$sql$,
           public.__id('s17')),
    1::bigint, 'la session source a été modifiée');

  perform public.__attendre(
    format($sql$select count(*) from public.presence where seance_id = %L and note = 17$sql$,
           public.__id('seance')),
    1::bigint, 'l''historique de la session source a bougé');
end;
$$;

-- =============================================================================
-- C. LE CŒUR : les mêmes créneaux ne se gênent pas
--
-- Sans le scope de session sur le conflit (0022), la reconduction se heurterait
-- à son propre modèle et serait inutilisable. On le vérifie dans les deux sens :
-- la copie a bien été créée, et le cours copié reste ÉDITABLE — c'est ce second
-- point qui manquerait si le garde-fou de `enregistrer_cours` voyait large.
-- =============================================================================
set local role authenticated;

do $$
declare v_copie uuid;
begin
  perform public.__devenir(public.__id('u_resp'));

  select id into v_copie from public.cours
  where session_id = public.__id('s18') and libelle = 'Coran Niveau 1';

  perform public.__accepte(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle','Coran Niveau 1','type_cours_id',
                                (select type_cours_id from public.cours where id = %L),
                                'format','groupe','date_debut','2026-06-01','statut','actif'),
             jsonb_build_array(jsonb_build_object('jour_semaine',1,'heure_debut','10:00','heure_fin','11:00'),
                               jsonb_build_object('jour_semaine',3,'heure_debut','10:00','heure_fin','11:00')),
             %L::uuid)$sql$, v_copie, v_copie),
    'ré-enregistrer un cours reconduit aux mêmes heures');
end;
$$;

-- =============================================================================
-- D. Les trois cas limites
-- =============================================================================
do $$
declare v_neuve uuid;
begin
  perform public.__devenir(public.__id('u_resp'));

  /*
   * 1. UN ENSEIGNANT RETIRÉ ENTRE-TEMPS. `cours.enseignant_id` est
   *    `on delete set null` (0018) : ses cours sont devenus orphelins, et la
   *    copie doit l'être aussi — pas échouer sur une clé étrangère.
   */
  perform public.retirer_membre(public.__id('u_partant'), null);

  perform public.__attendre(
    format($sql$select count(*) from public.cours
                where session_id = %L and enseignant_id is null$sql$, public.__id('s17')),
    1::bigint, 'le retrait n''a pas laissé de cours orphelin');

  perform public.__accepte(
    format($sql$select public.reconduire_session(%L, 'Session 19', '2027-01-05')$sql$,
           public.__id('s17')),
    'reconduire avec un enseignant retiré entre-temps');

  select id into v_neuve from public.session
  where centre_id = public.__id('centre') and nom = 'Session 19';
  insert into public.t_ids (cle, val) values ('s19', v_neuve);

  perform public.__attendre(
    format($sql$select count(*) from public.cours
                where session_id = %L and libelle = 'Tadjwîd' and enseignant_id is null$sql$,
           v_neuve),
    1::bigint, 'le cours orphelin n''a pas été recopié orphelin');
end;
$$;

do $$
declare v_neuve uuid;
begin
  perform public.__devenir(public.__id('u_resp'));

  /*
   * 2. UN CRÉNEAU A CHANGÉ depuis la session précédente. La copie doit refléter
   *    l'état ACTUEL de la source, pas celui d'origine.
   */
  perform public.enregistrer_cours(
    jsonb_build_object('libelle','Coran Niveau 1','type_cours_id',
                       (select type_cours_id from public.cours where id = public.__id('c_n1')),
                       'format','groupe','date_debut','2026-01-05','statut','actif'),
    jsonb_build_array(jsonb_build_object('jour_semaine',6,'heure_debut','16:00','heure_fin','17:30')),
    public.__id('c_n1'));

  perform public.__accepte(
    format($sql$select public.reconduire_session(%L, 'Session 20', '2027-06-01')$sql$,
           public.__id('s17')),
    'reconduire après un changement de créneau');

  select id into v_neuve from public.session
  where centre_id = public.__id('centre') and nom = 'Session 20';

  perform public.__attendre(
    format($sql$select count(*) from public.creneau as cr
                join public.cours as c on c.id = cr.cours_id
                where c.session_id = %L and c.libelle = 'Coran Niveau 1'$sql$, v_neuve),
    1::bigint, 'la copie n''a pas suivi le changement de créneau');

  perform public.__attendre(
    format($sql$select count(*) from public.creneau as cr
                join public.cours as c on c.id = cr.cours_id
                where c.session_id = %L and c.libelle = 'Coran Niveau 1'
                  and cr.jour_semaine = 6 and cr.heure_debut = '16:00'$sql$, v_neuve),
    1::bigint, 'la copie porte l''ancien créneau');
end;
$$;

do $$
begin
  perform public.__devenir(public.__id('u_resp'));

  /*
   * 3. DOUBLE RECONDUCTION. Sous le même nom, elle est refusée — sinon on se
   *    retrouverait avec deux « Session 18 » indiscernables dans le sélecteur.
   *    Sous un autre nom, elle repart de la MÊME source, ce qui est le
   *    comportement attendu : la reconduction n'est pas un chaînage.
   */
  perform public.__refus(
    format($sql$select public.reconduire_session(%L, 'Session 18', '2027-09-01')$sql$,
           public.__id('s17')),
    'P0071', 'reconduire deux fois sous le même nom');

  perform public.__accepte(
    format($sql$select public.reconduire_session(%L, 'Session 21', '2027-09-01')$sql$,
           public.__id('s17')),
    'reconduire deux fois sous des noms différents');

  -- Reconduire la COPIE fonctionne aussi : c'est une session comme une autre.
  perform public.__accepte(
    format($sql$select public.reconduire_session(%L, 'Session 22', '2028-01-05')$sql$,
           public.__id('s18')),
    'reconduire une session déjà issue d''une reconduction');
end;
$$;

-- =============================================================================
-- E. Une session clôturée se reconduit — c'est même l'ordre naturel
-- =============================================================================
do $$
begin
  perform public.__devenir(public.__id('u_resp'));

  perform public.__accepte(
    format($sql$update public.session set statut = 'terminee' where id = %L$sql$,
           public.__id('s17')),
    'clôturer la session source');

  /*
   * ⚠️ `__accepte` ne prouve RIEN sur un UPDATE : une policy qui écarte la ligne
   * ne lève pas, elle touche zéro ligne. Sans cette vérification, le jour où la
   * clôture cesserait de s'appliquer, l'assertion suivante dégraderait en
   * silence vers « reconduire depuis une session OUVERTE » et resterait verte.
   */
  perform public.__attendre(
    format($sql$select count(*) from public.session where id = %L and statut = 'terminee'$sql$,
           public.__id('s17')),
    1::bigint, 'la session source n''est pas réellement clôturée');

  perform public.__accepte(
    format($sql$select public.reconduire_session(%L, 'Session 23', '2028-06-01')$sql$,
           public.__id('s17')),
    'reconduire depuis une session clôturée');

  -- Et la copie, elle, est bien ouverte : on reconduit pour travailler.
  perform public.__attendre(
    $sql$select count(*) from public.session where nom = 'Session 23' and statut = 'en_cours'$sql$,
    1::bigint, 'la session neuve hérite du statut clôturé de sa source');
end;
$$;

-- =============================================================================
-- F. Les deux gardes d'intégrité — atteignables, donc éprouvées
--
-- Elles protègent d'une session SOURCE bricolée en SQL : le garde-fou de
-- chevauchement (§5.1) ne vit que dans `enregistrer_cours`, et rien n'empêche un
-- `update` ou un `delete` direct. Sans ces épreuves, les retirer ne ferait
-- tomber aucune assertion.
-- =============================================================================
do $$
declare v_autre uuid;
begin
  perform public.__devenir(public.__id('u_resp'));

  perform public.__accepte(
    format($sql$update public.session set statut = 'en_cours' where id = %L$sql$,
           public.__id('s17')),
    'rouvrir la source pour la suite');

  /*
   * P0072 — deux cours du même enseignant sur le même créneau dans la source.
   * On l'obtient par un UPDATE direct de `enseignant_id`, que le garde-fou de
   * `enregistrer_cours` ne voit pas.
   */
  select id into v_autre from public.cours
  where session_id = public.__id('s17') and libelle = 'Tadjwîd';

  update public.creneau set jour_semaine = 6, heure_debut = '16:00', heure_fin = '17:30'
  where cours_id = v_autre;

  update public.cours set enseignant_id = public.__id('u_ens') where id = v_autre;

  perform public.__refus(
    format($sql$select public.reconduire_session(%L, 'Session 30', '2029-01-05')$sql$,
           public.__id('s17')),
    'P0072', 'reconduire une source qui contient un chevauchement');

  -- Tout ou rien : le refus ne laisse aucune session derrière lui.
  perform public.__attendre(
    $sql$select count(*) from public.session where nom = 'Session 30'$sql$,
    0::bigint, 'un refus P0072 a laissé une session derrière lui');

  -- On répare en le remettant orphelin, ce qu'il était : `u_partant` a été
  -- retiré du centre en section D, et la clé étrangère composite le refuserait.
  update public.cours set enseignant_id = null where id = v_autre;
end;
$$;

do $$
declare v_sans_creneau uuid;
begin
  perform public.__devenir(public.__id('u_resp'));

  /*
   * P0073 — un cours de la source sans aucun créneau. `enregistrer_cours`
   * l'interdit (P0001), mais un `delete` direct sur `creneau` le produit. Sa
   * copie serait inutilisable : ni planning, ni séance générée.
   */
  select id into v_sans_creneau from public.cours
  where session_id = public.__id('s17') and libelle = 'Coran Niveau 2';

  delete from public.creneau where cours_id = v_sans_creneau;

  perform public.__refus(
    format($sql$select public.reconduire_session(%L, 'Session 31', '2029-06-01')$sql$,
           public.__id('s17')),
    'P0073', 'reconduire une source dont un cours n''a aucun créneau');

  perform public.__attendre(
    $sql$select count(*) from public.session where nom = 'Session 31'$sql$,
    0::bigint, 'un refus P0073 a laissé une session derrière lui');
end;
$$;

reset role;

select ' ✅ TOUTES LES ASSERTIONS PASSENT — reconduction de session' as resultat;

rollback;
