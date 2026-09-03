-- =============================================================================
-- sessions.sql — la session, et le scope de conflit qu'elle introduit (0022)
--
-- Trois familles d'invariants :
--
--   A. RLS — le responsable écrit les sessions, l'enseignant les lit, un autre
--      centre ne voit rien ;
--   B. le CONFLIT scopé par session : même créneau en S1 et S2 ACCEPTÉ, même
--      créneau dans la MÊME session REFUSÉ. C'est ce qui rend la reconduction
--      possible — sans lui, reconduire aux mêmes heures se heurterait à son
--      propre modèle ;
--   C. la session comme appartenance obligatoire, et la clôture qui ferme la
--      structure.
--
-- ⚠️ L'invariant de conflit vit à TROIS endroits qui ne partagent aucun code :
-- `enregistrer_cours`, `shared/lib/conflits.ts` et le contrôle final de
-- `retirer_membre`. Ce fichier couvre le premier et le troisième ; le second a
-- ses tests Vitest. Les trois doivent bouger ensemble.
--
-- Tout se déroule dans une transaction ANNULÉE à la fin.
--
-- Exécution :
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sessions.sql
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
-- Décor : un centre avec deux sessions, un centre voisin.
-- Repéré par `returning` — la base contient de vraies données.
-- -----------------------------------------------------------------------------
create table public.t_ids (cle text primary key, val uuid);

insert into public.t_ids (cle, val) values
  ('u_resp', gen_random_uuid()), ('u_ens', gen_random_uuid()), ('u_voisin', gen_random_uuid());

insert into auth.users (id, email) select val, cle || '@sessions.invalid' from public.t_ids;

with cree as (insert into public.centre (nom) values ('Centre Sessions') returning id)
insert into public.t_ids (cle, val) select 'centre', id from cree;

create function public.__id(p_cle text) returns uuid
language sql stable as $$ select val from public.t_ids where cle = p_cle $$;

with cree as (insert into public.centre (nom) values ('Centre Voisin S') returning id)
insert into public.t_ids (cle, val) select 'centre_voisin', id from cree;

insert into public.membre (centre_id, user_id, role, nom_affiche) values
  (public.__id('centre'), public.__id('u_resp'), 'responsable', 'Resp'),
  (public.__id('centre'), public.__id('u_ens'),  'enseignant',  'Ens'),
  (public.__id('centre_voisin'), public.__id('u_voisin'), 'responsable', 'Voisin');

/*
 * ⚠️ Chaque centre est NÉ avec sa session : le trigger `centre_session_par_defaut`
 * de 0022 s'en charge. Sans lui, un centre créé après la migration n'aurait
 * aucune session, et `cours.session_id not null` interdirait à son responsable
 * de créer son premier cours — l'application serait morte à l'ouverture.
 *
 * On l'éprouve ici plutôt que de le supposer, puis on renomme cette session
 * pour la suite du décor.
 */
do $$
begin
  perform public.__attendre(
    format($sql$select count(*) from public.session where centre_id = %L$sql$,
           public.__id('centre')),
    1::bigint, 'un centre neuf n''a pas reçu sa session automatiquement');

  perform public.__attendre(
    format($sql$select count(*) from public.session where centre_id = %L$sql$,
           public.__id('centre_voisin')),
    1::bigint, 'le centre voisin n''a pas reçu sa session automatiquement');
end;
$$;

update public.session set nom = 'Session 17', date_debut = '2026-01-05'
where centre_id = public.__id('centre');

insert into public.t_ids (cle, val)
select 's17', id from public.session where centre_id = public.__id('centre');

with cree as (
  insert into public.session (centre_id, nom, date_debut, statut)
  values (public.__id('centre'), 'Session 18', '2026-06-01', 'en_cours') returning id
)
insert into public.t_ids (cle, val) select 's18', id from cree;

update public.session set nom = 'Chez le voisin'
where centre_id = public.__id('centre_voisin');

insert into public.t_ids (cle, val)
select 's_voisin', id from public.session where centre_id = public.__id('centre_voisin');

-- =============================================================================
-- A. RLS — qui écrit, qui lit
-- =============================================================================
set local role authenticated;

do $$
begin
  -- L'enseignant LIT les sessions de son centre : il en a besoin pour se repérer.
  perform public.__devenir(public.__id('u_ens'));
  perform public.__attendre(
    'select count(*) from public.session', 2::bigint,
    'l''enseignant ne voit pas les deux sessions de son centre');

  -- ... et n'en écrit aucune : la session est de la STRUCTURE (§5.13).
  perform public.__refus(
    format($sql$insert into public.session (centre_id, nom, date_debut)
                values (%L, 'Session pirate', '2026-01-01')$sql$, public.__id('centre')),
    '42501', 'l''enseignant crée une session');

  /*
   * ⚠️ Un UPDATE que la RLS écarte ne LÈVE PAS : il touche zéro ligne, en
   * silence. On ne peut donc pas l'éprouver comme un refus — il faut compter
   * les lignes affectées, et vérifier que le nom n'a pas bougé.
   */
  perform public.__attendre(
    format($sql$with m as (update public.session set nom = 'Renommée' where id = %L returning 1)
                select count(*) from m$sql$, public.__id('s17')),
    0::bigint, 'l''enseignant a pu renommer une session');

  perform public.__attendre(
    format($sql$select count(*) from public.session where id = %L and nom = 'Session 17'$sql$,
           public.__id('s17')),
    1::bigint, 'le nom de la session a changé');
end;
$$;

do $$
begin
  -- Le responsable écrit les siennes.
  perform public.__devenir(public.__id('u_resp'));
  perform public.__accepte(
    format($sql$update public.session set date_fin = '2026-05-31' where id = %L$sql$,
           public.__id('s17')),
    'le responsable fixe une date de fin prévisionnelle');

  -- Le centre voisin n'existe pas pour lui, ni en lecture ni en écriture.
  perform public.__attendre(
    format($sql$select count(*) from public.session where id = %L$sql$,
           public.__id('s_voisin')),
    0::bigint, 'une session d''un AUTRE centre est visible');

  perform public.__devenir(public.__id('u_voisin'));
  perform public.__attendre(
    'select count(*) from public.session', 1::bigint,
    'le voisin voit plus que sa propre session');
end;
$$;

-- Personne ne supprime une session : aucune policy de DELETE n'est accordée.
do $$
begin
  perform public.__devenir(public.__id('u_resp'));
  perform public.__attendre(
    format($sql$with d as (delete from public.session where id = %L returning 1)
                select count(*) from d$sql$, public.__id('s18')),
    0::bigint, 'une session a pu être SUPPRIMÉE');
end;
$$;

-- =============================================================================
-- B. Le conflit, scopé par session
--
-- Le cœur de 0022. Sans ce scope, reconduire un cours aux mêmes heures dans la
-- session suivante se heurterait à son propre modèle resté dans la précédente.
-- =============================================================================
reset role;
set local role authenticated;

do $$
declare v_type uuid := (select id from public.type_cours limit 1);
begin
  perform public.__devenir(public.__id('u_resp'));

  -- Le cours de référence, lundi 10:00–11:00 en Session 17.
  perform public.__accepte(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle','Coran S17','type_cours_id',%L,'format','groupe',
                                'date_debut','2026-01-05','statut','actif',
                                'enseignant_id',%L,'session_id',%L,'niveau','Niveau 1'),
             jsonb_build_array(jsonb_build_object('jour_semaine',1,'heure_debut','10:00','heure_fin','11:00')))$sql$,
           v_type, public.__id('u_ens'), public.__id('s17')),
    'créer un cours en Session 17');

  -- MÊME session, même enseignant, même heure : refusé.
  perform public.__refus(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle','Doublon S17','type_cours_id',%L,'format','groupe',
                                'date_debut','2026-01-05','statut','actif',
                                'enseignant_id',%L,'session_id',%L),
             jsonb_build_array(jsonb_build_object('jour_semaine',1,'heure_debut','10:00','heure_fin','11:00')))$sql$,
           v_type, public.__id('u_ens'), public.__id('s17')),
    'P0003', 'même créneau, MÊME session');

  /*
   * AUTRE session : accepté. C'est l'assertion qui rend la reconduction
   * possible, et celle qui tombe si quelqu'un retire le scope.
   */
  perform public.__accepte(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle','Coran S18','type_cours_id',%L,'format','groupe',
                                'date_debut','2026-06-01','statut','actif',
                                'enseignant_id',%L,'session_id',%L,'niveau','Niveau 2'),
             jsonb_build_array(jsonb_build_object('jour_semaine',1,'heure_debut','10:00','heure_fin','11:00')))$sql$,
           v_type, public.__id('u_ens'), public.__id('s18')),
    'même créneau, AUTRE session');

  insert into public.t_ids (cle, val)
  select 'cours_s18', id from public.cours
  where centre_id = public.__id('centre') and libelle = 'Coran S18';

  /*
   * Le niveau, écrit ET taillé. Borné au centre du décor : compter sur toute la
   * table `cours` reviendrait à se repérer par libellé dans les VRAIES données
   * (CLAUDE.md §8), et l'épreuve tomberait le jour où un centre saisit
   * « Niveau 1 ».
   */
  perform public.__attendre(
    format($sql$select count(*) from public.cours
                where centre_id = %L and niveau in ('Niveau 1','Niveau 2')$sql$,
           public.__id('centre')),
    2::bigint, 'le niveau n''est pas enregistré');

  -- Les espaces sont retirés, et un niveau vide vaut « pas de niveau » : deux
  -- représentations d'un même état finissent toujours par diverger.
  perform public.__accepte(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle','Niveau taillé','type_cours_id',%L,'format','groupe',
                                'date_debut','2026-01-05','statut','actif',
                                'enseignant_id',%L,'session_id',%L,'niveau','   Niveau 3   '),
             jsonb_build_array(jsonb_build_object('jour_semaine',5,'heure_debut','10:00','heure_fin','11:00')))$sql$,
           v_type, public.__id('u_ens'), public.__id('s17')),
    'créer un cours avec un niveau entouré d''espaces');

  perform public.__attendre(
    format($sql$select count(*) from public.cours
                where centre_id = %L and niveau = 'Niveau 3'$sql$, public.__id('centre')),
    1::bigint, 'le niveau n''a pas été taillé');

  perform public.__accepte(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle','Niveau vide','type_cours_id',%L,'format','groupe',
                                'date_debut','2026-01-05','statut','actif',
                                'enseignant_id',%L,'session_id',%L,'niveau','   '),
             jsonb_build_array(jsonb_build_object('jour_semaine',5,'heure_debut','14:00','heure_fin','15:00')))$sql$,
           v_type, public.__id('u_ens'), public.__id('s17')),
    'créer un cours avec un niveau vide');

  perform public.__attendre(
    format($sql$select count(*) from public.cours
                where centre_id = %L and libelle = 'Niveau vide' and niveau is null$sql$,
           public.__id('centre')),
    1::bigint, 'un niveau vide n''est pas ramené à null');
end;
$$;

-- =============================================================================
-- C. Appartenance obligatoire, et clôture
-- =============================================================================
do $$
declare v_type uuid := (select id from public.type_cours limit 1);
begin
  perform public.__devenir(public.__id('u_resp'));

  perform public.__refus(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle','Sans session','type_cours_id',%L,'format','groupe',
                                'date_debut','2026-01-05','statut','actif'),
             jsonb_build_array(jsonb_build_object('jour_semaine',2,'heure_debut','10:00','heure_fin','11:00')))$sql$,
           v_type),
    'P0060', 'créer un cours sans session');

  -- Un cours ne peut pas pointer la session d'un AUTRE centre : la clé
  -- étrangère est composite, et le centre est posé par défaut.
  perform public.__refus(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle','Session d''ailleurs','type_cours_id',%L,'format','groupe',
                                'date_debut','2026-01-05','statut','actif','session_id',%L),
             jsonb_build_array(jsonb_build_object('jour_semaine',2,'heure_debut','10:00','heure_fin','11:00')))$sql$,
           v_type, public.__id('s_voisin')),
    '23503', 'rattacher un cours à la session d''un autre centre');

  -- Clôture : la structure se ferme.
  perform public.__accepte(
    format($sql$update public.session set statut = 'terminee' where id = %L$sql$,
           public.__id('s18')),
    'clôturer une session');

  perform public.__refus(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle','Dans session close','type_cours_id',%L,'format','groupe',
                                'date_debut','2026-06-01','statut','actif','session_id',%L),
             jsonb_build_array(jsonb_build_object('jour_semaine',2,'heure_debut','10:00','heure_fin','11:00')))$sql$,
           v_type, public.__id('s18')),
    'P0061', 'créer un cours dans une session clôturée');

  /*
   * ⚠️ LE CONTOURNEMENT TROUVÉ EN RELECTURE. À la modification, `session_id` est
   * facultatif — « le silence n'est pas un déplacement ». Ne contrôler que la
   * session VISÉE laissait donc renommer un cours, ou remplacer ses créneaux,
   * dans une session clôturée : il suffisait d'omettre la clé.
   */
  perform public.__refus(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle','Renommé en douce','type_cours_id',%L,'format','groupe',
                                'date_debut','2026-06-01','statut','actif'),
             jsonb_build_array(jsonb_build_object('jour_semaine',1,'heure_debut','10:00','heure_fin','11:00')),
             %L::uuid)$sql$,
           v_type, public.__id('cours_s18')),
    'P0061', 'modifier un cours d''une session clôturée en OMETTANT session_id');

  -- Et on n'en sort pas non plus vers une session ouverte.
  perform public.__refus(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle','Évadé','type_cours_id',%L,'format','groupe',
                                'date_debut','2026-06-01','statut','actif','session_id',%L),
             jsonb_build_array(jsonb_build_object('jour_semaine',1,'heure_debut','10:00','heure_fin','11:00')),
             %L::uuid)$sql$,
           v_type, public.__id('s17'), public.__id('cours_s18')),
    'P0061', 'sortir un cours d''une session clôturée');

  -- Réouvrable, et tout redevient possible.
  perform public.__accepte(
    format($sql$update public.session set statut = 'en_cours' where id = %L$sql$,
           public.__id('s18')),
    'rouvrir une session');

  /*
   * « Le silence n'est pas un déplacement, ni un effacement. » C'est ce qu'un
   * client ancien — ou un appel partiel — exerce en premier.
   */
  perform public.__accepte(
    format($sql$select public.enregistrer_cours(
             jsonb_build_object('libelle','Coran S18 renommé','type_cours_id',%L,'format','groupe',
                                'date_debut','2026-06-01','statut','actif'),
             jsonb_build_array(jsonb_build_object('jour_semaine',1,'heure_debut','10:00','heure_fin','11:00')),
             %L::uuid)$sql$,
           v_type, public.__id('cours_s18')),
    'modifier un cours sans mentionner sa session');

  perform public.__attendre(
    format($sql$select count(*) from public.cours
                where id = %L and session_id = %L and niveau = 'Niveau 2'$sql$,
           public.__id('cours_s18'), public.__id('s18')),
    1::bigint, 'omettre session_id ou niveau les a modifiés');
end;
$$;

-- =============================================================================
-- D. `retirer_membre` — le troisième porteur de l'invariant
--
-- Sans le scope de session dans son contrôle final, transférer les cours d'un
-- partant serait refusé dès que deux sessions emploient le même créneau —
-- c'est-à-dire dès la première reconduction. Ici l'enseignant a deux cours au
-- même créneau, en S17 et S18 : les transférer au responsable doit PASSER.
-- =============================================================================
do $$
declare v_repris integer;
begin
  perform public.__devenir(public.__id('u_resp'));

  perform public.__attendre(
    format($sql$select count(*) from public.cours where enseignant_id = %L$sql$,
           public.__id('u_ens')),
    4::bigint, 'le décor n''a pas les quatre cours attendus');

  select public.retirer_membre(public.__id('u_ens'), public.__id('u_resp')) into v_repris;

  if v_repris <> 4 then
    raise exception 'ÉCART — retirer_membre a repris % cours au lieu de 4', v_repris;
  end if;

  perform public.__attendre(
    format($sql$select count(*) from public.cours where enseignant_id = %L$sql$,
           public.__id('u_resp')),
    4::bigint, 'les cours ne sont pas revenus au responsable');
end;
$$;

-- =============================================================================
-- C bis. La clôture ferme la SAISIE, jamais la lecture (migration 0023)
--
-- 0022 avait fermé la structure (P0061) ; 0023 ferme la pédagogie (P0062). Ce
-- qui reste ouvert compte autant que ce qui se ferme : tout se lit, le rapport
-- s'imprime, et un pointage posé par erreur se retire encore.
-- =============================================================================
do $$
declare
  v_apprenant uuid;
  v_seance    uuid;
begin
  perform public.__devenir(public.__id('u_resp'));

  -- Un apprenant, une séance et un pointage, session OUVERTE.
  insert into public.apprenant (centre_id, nom, prenom)
  values (public.__id('centre'), 'Sow', 'Fatou') returning id into v_apprenant;

  insert into public.inscription (centre_id, apprenant_id, cours_id)
  values (public.__id('centre'), v_apprenant, public.__id('cours_s18'));

  insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut)
  values (public.__id('centre'), public.__id('cours_s18'), '2026-06-08', '10:00', '11:00', 'faite')
  returning id into v_seance;

  insert into public.presence (centre_id, seance_id, apprenant_id, present, etat, note, note_bareme)
  values (public.__id('centre'), v_seance, v_apprenant, true, 'present', 15, 20);

  insert into public.t_ids (cle, val) values ('apprenant', v_apprenant), ('seance', v_seance);
end;
$$;

do $$
begin
  perform public.__devenir(public.__id('u_resp'));
  perform public.__accepte(
    format($sql$update public.session set statut = 'terminee' where id = %L$sql$,
           public.__id('s18')),
    'clôturer une session qui porte des séances et des notes');

  -- --- Ce qui se FERME -----------------------------------------------------
  perform public.__refus(
    format($sql$insert into public.seance (centre_id, cours_id, date, heure_debut, heure_fin, statut)
                values (%L, %L, '2026-06-15', '10:00', '11:00', 'faite')$sql$,
           public.__id('centre'), public.__id('cours_s18')),
    'P0062', 'créer une séance dans une session clôturée');

  perform public.__refus(
    format($sql$update public.seance set contenu_aborde = 'Après coup' where id = %L$sql$,
           public.__id('seance')),
    'P0062', 'modifier une séance d''une session clôturée');

  perform public.__refus(
    format($sql$update public.presence set note = 20
                where seance_id = %L and apprenant_id = %L$sql$,
           public.__id('seance'), public.__id('apprenant')),
    'P0062', 'renoter un apprenant dans une session clôturée');

  perform public.__refus(
    format($sql$insert into public.presence (seance_id, apprenant_id, present, etat)
                values (%L, %L, true, 'present')$sql$,
           public.__id('seance'), public.__id('aicha')),
    'P0062', 'pointer un apprenant de plus dans une session clôturée');

  -- --- Ce qui reste OUVERT -------------------------------------------------
  perform public.__attendre(
    format($sql$select count(*) from public.seance where id = %L$sql$, public.__id('seance')),
    1::bigint, 'la séance d''une session clôturée n''est plus lisible');

  perform public.__attendre(
    format($sql$select count(*) from public.presence
                where seance_id = %L and note = 15$sql$, public.__id('seance')),
    1::bigint, 'la note d''une session clôturée n''est plus lisible');

  /*
   * La matière du RAPPORT, qui doit rester téléchargeable indéfiniment — c'est
   * la raison d'être d'une session close : on la consulte et on l'imprime.
   */
  perform public.__attendre(
    format($sql$select count(*) from public.cours as c
                join public.seance as s on s.cours_id = c.id
                join public.presence as p on p.seance_id = s.id
                where c.id = %L$sql$, public.__id('cours_s18')),
    1::bigint, 'le rapport d''une session clôturée n''a plus de matière');

  -- Retirer un pointage posé par erreur reste possible : une garde qui empêche
  -- aussi de réparer force à rouvrir la session pour une faute de frappe.
  perform public.__accepte(
    format($sql$delete from public.presence where seance_id = %L and apprenant_id = %L$sql$,
           public.__id('seance'), public.__id('apprenant')),
    'retirer un pointage d''une session clôturée');

  -- --- Et la réouverture rend tout ------------------------------------------
  perform public.__accepte(
    format($sql$update public.session set statut = 'en_cours' where id = %L$sql$,
           public.__id('s18')),
    'rouvrir la session');

  perform public.__accepte(
    format($sql$insert into public.presence (seance_id, apprenant_id, present, etat, note, note_bareme)
                values (%L, %L, true, 'present', 15, 20)$sql$,
           public.__id('seance'), public.__id('apprenant')),
    'repointer une fois la session rouverte');
end;
$$;

-- =============================================================================
-- E. La FORME du scope — pour que personne ne le retire par « simplification »
-- =============================================================================
reset role;

do $$
declare v_corps text;
begin
  select pg_get_functiondef(oid) into v_corps
  from pg_proc where proname = 'enregistrer_cours' and pronamespace = 'public'::regnamespace;

  if v_corps !~ 'session_id\s*=\s*v_cours\.session_id' then
    raise exception
      'RÉGRESSION : `enregistrer_cours` ne scope plus le conflit sur la session. La reconduction aux mêmes heures deviendrait impossible.';
  end if;

  select pg_get_functiondef(oid) into v_corps
  from pg_proc where proname = 'retirer_membre' and pronamespace = 'public'::regnamespace;

  if v_corps !~ 'a_cours\.session_id\s*=\s*b_cours\.session_id' then
    raise exception
      'RÉGRESSION : `retirer_membre` ne scope plus son contrôle de chevauchement sur la session.';
  end if;
end
$$;

-- =============================================================================
-- F. Le backfill tient, sur les VRAIES données
-- =============================================================================
do $$
begin
  /*
   * ⚠️ « count(*) where session_id is null » ne prouverait RIEN : la colonne est
   * `not null`, le planificateur réduit le prédicat à `false` et l'assertion ne
   * peut pas échouer. Elle éprouverait la contrainte, pas le backfill.
   *
   * Ce qui se vérifie vraiment : que chaque cours pointe une session de SON
   * centre — c'est ce que la clé étrangère composite garantit, et c'est la
   * propriété que le backfill devait établir sur les lignes existantes.
   */
  perform public.__attendre(
    $sql$select count(*) from public.cours as c
         join public.session as s on s.id = c.session_id
         where s.centre_id <> c.centre_id$sql$,
    0::bigint, 'un cours pointe la session d''un AUTRE centre');

  perform public.__attendre(
    'select count(*) from public.centre where not exists (select 1 from public.session s where s.centre_id = centre.id)',
    0::bigint, 'un centre n''a pas de session — son responsable ne pourrait créer aucun cours');
end;
$$;

select ' ✅ TOUTES LES ASSERTIONS PASSENT — sessions, scope de conflit et backfill' as resultat;

rollback;
