-- =============================================================================
-- facturation.sql — les deux modes, et ce qu'ils ne doivent jamais casser
--
-- Ce que cette épreuve doit établir :
--
--   * le défaut est `mensuel`, donc aucun centre existant ne change de
--     comportement — c'est toute la rétro-compatibilité du lot ;
--   * un règlement porte la forme de période du mode ACTIF, à la création ;
--   * un forfait suppose une session BORNÉE, dans les deux sens : on ne peut ni
--     l'enregistrer sur une session sans fin, ni retirer la fin sous lui ;
--   * changer de mode ne détruit ni ne fige aucun règlement déjà saisi ;
--   * `paiement`, l'historique d'avant bascule, n'est ni réécrit ni réinterprété ;
--   * rien ne fuit d'un centre à l'autre, et un enseignant ne voit NI règlement,
--     NI tarif — la lecture se ferme, pas seulement l'écriture.
--
-- Tout se déroule dans une transaction ANNULÉE à la fin.
--
-- Exécution :
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/facturation.sql
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

/*
 * ⚠️ Une policy qui écarte une ligne en UPDATE ne LÈVE PAS : elle touche zéro
 * ligne. Éprouver ce refus par une exception laisserait le test vert quoi qu'il
 * arrive. On compte donc les lignes affectées.
 */
create function public.__refus_update(p_sql text, p_message text)
returns void language plpgsql security invoker as $$
declare v_n integer;
begin
  execute p_sql;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    raise exception 'FAILLE — % : % ligne(s) MODIFIÉE(S)', p_message, v_n;
  end if;
exception when insufficient_privilege then
  return;
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
-- Le décor — DEUX centres, qui ne doivent jamais se voir
--
--   AL-FOURQANE  facture au MOIS.      R1 responsable, E1 enseignant.
--   AN-NOUR      facture au FORFAIT.   R2 responsable.
--
-- Chacun a une session bornée et — pour An-Nour — une session PERPÉTUELLE,
-- celle que le backfill de 0022 pose à tout centre. C'est le cas qui doit
-- refuser le forfait.
-- -----------------------------------------------------------------------------
create table public.t_ids (cle text primary key, val uuid);

create function public.__id(p_cle text) returns uuid
language sql stable as $$ select val from public.t_ids where cle = p_cle $$;

insert into public.t_ids (cle, val) values
  ('u_r1', gen_random_uuid()), ('u_e1', gen_random_uuid()), ('u_r2', gen_random_uuid());

insert into auth.users (id, email)
select val, cle || '@factu.invalid' from public.t_ids;

/*
 * ⚠️ Le décor se repère par `returning`, jamais par un `where nom = …` : la base
 * contient de vrais centres, et une homonymie ferait remonter les leurs.
 */
with cree as (insert into public.centre (nom) values ('Centre Al-Fourqane FACTU') returning id)
insert into public.t_ids (cle, val) select 'c1', id from cree;

with cree as (insert into public.centre (nom) values ('Centre An-Nour FACTU') returning id)
insert into public.t_ids (cle, val) select 'c2', id from cree;

insert into public.membre (centre_id, user_id, role, nom_affiche) values
  (public.__id('c1'), public.__id('u_r1'), 'responsable', 'R1'),
  (public.__id('c1'), public.__id('u_e1'), 'enseignant',  'E1'),
  (public.__id('c2'), public.__id('u_r2'), 'responsable', 'R2');

-- =============================================================================
-- 1. Le DÉFAUT est `mensuel` — la rétro-compatibilité tient à cela seul
--
-- Le trigger de 0022 crée une ligne `parametres` avec le centre ? Non : c'est la
-- création de la ligne qui pose le défaut. On l'insère donc comme le ferait
-- l'application, sans nommer le mode, et on vérifie ce qui en sort.
-- =============================================================================
insert into public.parametres (centre_id, note_bareme) values
  (public.__id('c1'), 20),
  (public.__id('c2'), 20);

do $$
begin
  perform public.__attendre(
    format($sql$select count(*) from public.parametres
                where centre_id in (%L, %L) and mode_facturation = 'mensuel'$sql$,
           public.__id('c1'), public.__id('c2')),
    2::bigint,
    'un centre qui ne dit rien n''est PAS en mensuel : la rétro-compatibilité est rompue');
end;
$$;

-- An-Nour bascule au forfait. Al-Fourqane reste au mois.
update public.parametres set mode_facturation = 'par_session'
where centre_id = public.__id('c2');

do $$
begin
  perform public.__refus(
    format($sql$update public.parametres set mode_facturation = 'gratuit'
                where centre_id = %L$sql$, public.__id('c1')),
    '23514', 'un mode inventé est accepté');
end;
$$;

-- -----------------------------------------------------------------------------
-- Sessions, cours, apprenants
-- -----------------------------------------------------------------------------
update public.session set nom = 'Session bornée C1', date_debut = '2026-01-05',
                          date_fin = '2026-06-30'
where centre_id = public.__id('c1');

update public.session set nom = 'Session perpétuelle C2', date_debut = '2026-01-05',
                          date_fin = null
where centre_id = public.__id('c2');

insert into public.t_ids (cle, val)
select 's1', id from public.session where centre_id = public.__id('c1')
union all
select 's2_perpetuelle', id from public.session where centre_id = public.__id('c2');

with cree as (
  insert into public.session (centre_id, nom, date_debut, date_fin, statut)
  values (public.__id('c2'), 'Session bornée C2', '2026-01-05', '2026-06-30', 'en_cours')
  returning id
)
insert into public.t_ids (cle, val) select 's2_bornee', id from cree;

with cree as (
  insert into public.cours
  (centre_id, session_id, enseignant_id, libelle, type_cours_id, format, date_debut)
  select public.__id('c1'), public.__id('s1'), public.__id('u_e1'),
         'Groupe C1', id, 'groupe', '2026-01-05'
  from public.type_cours limit 1
  returning id
)
insert into public.t_ids (cle, val) select 'cours1', id from cree;

with cree as (
  insert into public.cours
  (centre_id, session_id, libelle, type_cours_id, format, date_debut)
  select public.__id('c2'), public.__id('s2_bornee'),
         'Groupe C2', id, 'groupe', '2026-01-05'
  from public.type_cours limit 1
  returning id
)
insert into public.t_ids (cle, val) select 'cours2', id from cree;

insert into public.tarif (cours_id, centre_id, prix_mensuel, prix_session, devise) values
  (public.__id('cours1'), public.__id('c1'), 15000, null,   'XOF'),
  (public.__id('cours2'), public.__id('c2'), null,  120000, 'XOF');

with cree as (
  insert into public.apprenant (centre_id, nom, prenom)
  values (public.__id('c1'), 'Diallo', 'Aïcha') returning id
)
insert into public.t_ids (cle, val) select 'aicha', id from cree;

with cree as (
  insert into public.apprenant (centre_id, nom, prenom)
  values (public.__id('c1'), 'Ndiaye', 'Omar') returning id
)
insert into public.t_ids (cle, val) select 'omar', id from cree;

with cree as (
  insert into public.apprenant (centre_id, nom, prenom)
  values (public.__id('c2'), 'Sow', 'Fatou') returning id
)
insert into public.t_ids (cle, val) select 'fatou', id from cree;

with cree as (
  insert into public.inscription (centre_id, apprenant_id, cours_id)
  values (public.__id('c1'), public.__id('aicha'), public.__id('cours1')) returning id
)
insert into public.t_ids (cle, val) select 'i_aicha', id from cree;

with cree as (
  insert into public.inscription (centre_id, apprenant_id, cours_id)
  values (public.__id('c1'), public.__id('omar'), public.__id('cours1')) returning id
)
insert into public.t_ids (cle, val) select 'i_omar', id from cree;

with cree as (
  insert into public.inscription (centre_id, apprenant_id, cours_id)
  values (public.__id('c2'), public.__id('fatou'), public.__id('cours2')) returning id
)
insert into public.t_ids (cle, val) select 'i_fatou', id from cree;

/*
 * Un cours rattaché à la session PERPÉTUELLE de C2 — le cas que le forfait doit
 * refuser. Créé ici, dans le décor : `cours` n'a aucun privilège de TABLE, et
 * seule `enregistrer_cours` y écrit côté application.
 */
with cree as (
  insert into public.cours
  (centre_id, session_id, libelle, type_cours_id, format, date_debut)
  select public.__id('c2'), public.__id('s2_perpetuelle'), 'Cours perpétuel',
         id, 'individuel', '2026-01-05'
  from public.type_cours limit 1
  returning id
)
insert into public.t_ids (cle, val) select 'cours_perpetuel', id from cree;

with cree as (
  insert into public.inscription (centre_id, apprenant_id, cours_id)
  values (public.__id('c2'), public.__id('fatou'), public.__id('cours_perpetuel'))
  returning id
)
insert into public.t_ids (cle, val) select 'i_perpetuel', id from cree;

-- L'historique d'AVANT bascule : une ligne au grain (cours, mois).
insert into public.paiement (centre_id, cours_id, mois_concerne, montant_du, montant_recu)
values (public.__id('c1'), public.__id('cours1'), '2026-01', 120000, 40000);

-- =============================================================================
-- 2. LE GRAIN : un règlement par inscription, pas par cours
--
-- C'est la raison d'être de la table. Dans un groupe, deux inscrits ont deux
-- lignes pour le même mois — ce que l'unicité `(cours_id, mois_concerne)` de
-- `paiement` interdisait, et qui rendait « qui a payé ? » insoluble.
-- =============================================================================
reset role;
set local role authenticated;

do $$
begin
  perform public.__devenir(public.__id('u_r1'));

  perform public.__accepte(
    format($sql$insert into public.reglement (inscription_id, mois, montant_du, montant_recu)
                values (%L, '2026-02', 15000, 15000)$sql$, public.__id('i_aicha')),
    'le responsable enregistre le règlement d''Aïcha');

  perform public.__accepte(
    format($sql$insert into public.reglement (inscription_id, mois, montant_du, montant_recu)
                values (%L, '2026-02', 15000, 5000)$sql$, public.__id('i_omar')),
    'deux inscrits du MÊME cours ont chacun leur ligne pour le même mois');

  -- Mais un même inscrit ne paie pas deux fois le même mois.
  perform public.__refus(
    format($sql$insert into public.reglement (inscription_id, mois, montant_du)
                values (%L, '2026-02', 15000)$sql$, public.__id('i_aicha')),
    '23505', 'deux règlements pour le même inscrit et le même mois');
end;
$$;

-- =============================================================================
-- 3. La FORME de la période suit le mode ACTIF — à la création
-- =============================================================================
do $$
begin
  perform public.__devenir(public.__id('u_r1'));

  -- Al-Fourqane facture au mois : un forfait n'a rien à y faire.
  perform public.__refus(
    format($sql$insert into public.reglement (inscription_id, session_id, montant_du)
                values (%L, %L, 120000)$sql$, public.__id('i_aicha'), public.__id('s1')),
    'P0081', 'un forfait passe dans un centre qui facture au mois');

  perform public.__devenir(public.__id('u_r2'));

  -- An-Nour facture au forfait : un mois n'a rien à y faire.
  perform public.__refus(
    format($sql$insert into public.reglement (inscription_id, mois, montant_du)
                values (%L, '2026-02', 20000)$sql$, public.__id('i_fatou')),
    'P0081', 'un règlement mensuel passe dans un centre qui facture au forfait');
end;
$$;

-- =============================================================================
-- 4. Un forfait suppose une session BORNÉE (P0080)
--
-- Une session perpétuelle est celle que le backfill de 0022 pose à tout centre
-- qui n'utilise pas les sessions. « Payer une fois pour toute la session » n'y a
-- aucun sens : personne ne saurait jamais quand refacturer.
-- =============================================================================
do $$
begin
  perform public.__devenir(public.__id('u_r2'));

  perform public.__refus(
    format($sql$insert into public.reglement (inscription_id, session_id, montant_du)
                values (%L, %L, 120000)$sql$,
           public.__id('i_perpetuel'), public.__id('s2_perpetuelle')),
    'P0080', 'un forfait est accepté sur une session SANS DATE DE FIN');

  -- Sur une session bornée, en revanche, il passe.
  perform public.__accepte(
    format($sql$insert into public.reglement (inscription_id, session_id, montant_du, montant_recu)
                values (%L, %L, 120000, 120000)$sql$,
           public.__id('i_fatou'), public.__id('s2_bornee')),
    'le forfait est refusé sur une session pourtant bornée');
end;
$$;

-- =============================================================================
-- 5. L'AUTRE SENS de la garde (P0082)
--
-- Interdire d'écrire un forfait sur une session sans fin ne sert à rien si la
-- fin peut être effacée ensuite. Une garde à sens unique ne protège rien.
-- =============================================================================
do $$
begin
  perform public.__devenir(public.__id('u_r2'));

  perform public.__refus(
    format($sql$update public.session set date_fin = null where id = %L$sql$,
           public.__id('s2_bornee')),
    'P0082', 'la date de fin s''efface sous un forfait déjà encaissé');

  -- Une session SANS forfait garde le droit de redevenir perpétuelle.
  perform public.__accepte(
    format($sql$update public.session set date_fin = null where id = %L$sql$,
           public.__id('s2_perpetuelle')),
    'une session sans forfait ne peut plus redevenir perpétuelle');

  -- Et repousser la fin reste permis : ce n'est pas la retirer.
  perform public.__accepte(
    format($sql$update public.session set date_fin = '2026-07-31' where id = %L$sql$,
           public.__id('s2_bornee')),
    'repousser la date de fin est refusé alors qu''elle reste posée');
end;
$$;

-- =============================================================================
-- 6. CHANGER DE MODE ne détruit ni ne fige l'historique
--
-- C'est l'invariant que le propriétaire a posé comme sacré. Deux propriétés, et
-- la seconde est celle qu'on oublie : les règlements de l'ancien mode restent en
-- base, ET restent MODIFIABLES — une faute de frappe ne doit pas devenir
-- définitive parce qu'on a changé de rythme entre-temps.
-- =============================================================================
reset role;

do $$
begin
  perform public.__attendre(
    format($sql$select count(*) from public.reglement as r
                join public.inscription as i on i.id = r.inscription_id
                where i.centre_id = %L$sql$, public.__id('c1')),
    2::bigint, 'le décor d''Al-Fourqane n''a pas ses deux règlements mensuels');
end;
$$;

-- Al-Fourqane bascule au forfait, alors qu'il a déjà encaissé deux mois.
update public.parametres set mode_facturation = 'par_session'
where centre_id = public.__id('c1');

set local role authenticated;

do $$
begin
  perform public.__devenir(public.__id('u_r1'));

  -- RIEN n'a disparu.
  perform public.__attendre(
    format($sql$select count(*) from public.reglement where inscription_id in (%L, %L)$sql$,
           public.__id('i_aicha'), public.__id('i_omar')),
    2::bigint, 'la bascule de mode a DÉTRUIT des règlements');

  perform public.__attendre(
    format($sql$select montant_recu::bigint from public.reglement
                where inscription_id = %L and mois = '2026-02'$sql$, public.__id('i_aicha')),
    15000::bigint, 'la bascule a modifié un montant déjà encaissé');

  -- Et l'ancien mois reste CORRIGEABLE : la garde P0081 vise la création, pas
  -- la correction.
  perform public.__accepte(
    format($sql$update public.reglement set montant_recu = 12000
                where inscription_id = %L and mois = '2026-02'$sql$, public.__id('i_omar')),
    'corriger un règlement de l''ancien mode est devenu impossible');

  -- En revanche, on n'en CRÉE plus dans l'ancien mode.
  perform public.__refus(
    format($sql$insert into public.reglement (inscription_id, mois, montant_du)
                values (%L, '2026-03', 15000)$sql$, public.__id('i_aicha')),
    'P0081', 'un règlement du mode abandonné peut encore être créé');
end;
$$;

-- =============================================================================
-- 7. `paiement` — l'historique d'avant bascule, intact
--
-- La migration ne le réécrit pas, ne le déplace pas, ne le réinterprète pas. Il
-- reste lisible tel qu'il a été saisi, au grain du cours.
-- =============================================================================
do $$
begin
  perform public.__devenir(public.__id('u_r1'));

  perform public.__attendre(
    format($sql$select count(*) from public.paiement where cours_id = %L$sql$,
           public.__id('cours1')),
    1::bigint, 'l''historique d''avant bascule a disparu');

  perform public.__attendre(
    format($sql$select montant_recu::bigint from public.paiement
                where cours_id = %L and mois_concerne = '2026-01'$sql$, public.__id('cours1')),
    40000::bigint, 'un montant de l''historique a été réécrit');
end;
$$;

-- =============================================================================
-- 8. L'ENSEIGNANT ne voit NI règlement, NI tarif
--
-- La lecture se ferme, pas seulement l'écriture — c'est ce qui distingue ces
-- tables des tables pédagogiques. E1 enseigne pourtant « Groupe C1 ».
-- =============================================================================
do $$
begin
  perform public.__devenir(public.__id('u_e1'));

  perform public.__attendre(
    'select count(*) from public.reglement', 0::bigint,
    'un ENSEIGNANT lit les règlements');

  perform public.__attendre(
    'select count(*) from public.tarif', 0::bigint,
    'un ENSEIGNANT lit les tarifs — le forfait comme le mensuel');

  /*
   * ⚠️ La FORME doit être valide pour que ce soit bien la RLS qu'on éprouve.
   * Un trigger BEFORE s'exécute AVANT le `with check` de la policy : une ligne
   * mal formée serait refusée par P0081, et le test passerait au vert sans
   * jamais avoir touché à la sécurité. Al-Fourqane facture au forfait depuis la
   * section 6, on présente donc un forfait sur une session bornée.
   *
   * (Aucun oracle au passage : l'enseignant lit déjà `parametres`, donc le
   * message P0081 ne lui apprend rien qu'il ne puisse consulter.)
   */
  perform public.__refus(
    format($sql$insert into public.reglement (inscription_id, session_id, montant_du)
                values (%L, %L, 15000)$sql$, public.__id('i_aicha'), public.__id('s1')),
    '42501', 'un ENSEIGNANT enregistre un règlement');

  -- Il lit les réglages du centre (le rapport en dépend) mais n'en écrit aucun.
  perform public.__refus_update(
    format($sql$update public.parametres set mode_facturation = 'mensuel'
                where centre_id = %L$sql$, public.__id('c1')),
    'un ENSEIGNANT change le mode de facturation du centre');
end;
$$;

-- =============================================================================
-- 9. ÉTANCHÉITÉ INTER-CENTRE — règlements et tarifs
-- =============================================================================
do $$
begin
  perform public.__devenir(public.__id('u_r1'));

  -- R1 ne voit que SES règlements : les deux d'Al-Fourqane, pas le forfait
  -- d'An-Nour.
  perform public.__attendre(
    'select count(*) from public.reglement', 2::bigint,
    'un responsable voit les règlements d''un AUTRE centre');

  perform public.__attendre(
    'select count(*) from public.tarif', 1::bigint,
    'un responsable voit les tarifs d''un AUTRE centre');

  perform public.__attendre(
    format($sql$select count(*) from public.reglement where inscription_id = %L$sql$,
           public.__id('i_fatou')),
    0::bigint, 'le règlement d''un apprenant d''un autre centre est lisible');

  perform public.__attendre(
    'select count(*) from public.parametres', 1::bigint,
    'le mode de facturation d''un AUTRE centre est lisible');

  /*
   * ⚠️ L'étanchéité STRUCTURELLE, et pas seulement déclarative : la clé étrangère
   * composite interdit de rattacher un règlement à l'inscription d'un autre
   * centre. Sans elle, la ligne serait invisible pour l'autre centre — mais
   * l'unicité étant globale, elle lui interdirait d'enregistrer cette période.
   */
  perform public.__refus(
    format($sql$insert into public.reglement (centre_id, inscription_id, session_id, montant_du)
                values (%L, %L, %L, 1)$sql$,
           public.__id('c1'), public.__id('i_fatou'), public.__id('s1')),
    '23503', 'un règlement se rattache à l''inscription d''un AUTRE centre');

  -- Ni à la session d'un autre centre.
  perform public.__refus(
    format($sql$insert into public.reglement (centre_id, inscription_id, session_id, montant_du)
                values (%L, %L, %L, 1)$sql$,
           public.__id('c1'), public.__id('i_aicha'), public.__id('s2_bornee')),
    '23503', 'un règlement se rattache à la session d''un AUTRE centre');
end;
$$;

-- =============================================================================
-- 10. La FORME de la période — une, et une seule
--
-- ⚠️ Le trigger de mode est SUSPENDU le temps de cette section, et c'est
-- délibéré. Un trigger BEFORE s'exécute avant les contraintes CHECK : P0081
-- répondrait le premier à « aucune période » comme à « mois inexistant », et ces
-- contraintes de STRUCTURE ne seraient jamais éprouvées — un test vert
-- au-dessus de rien. Elles doivent tenir seules, car elles sont la dernière
-- barrière si la garde applicative venait à changer.
-- =============================================================================
reset role;

alter table public.reglement disable trigger reglement_coherent;

do $$
begin
  perform public.__refus(
    format($sql$insert into public.reglement (centre_id, inscription_id, mois, session_id, montant_du)
                values (%L, %L, '2026-05', %L, 1)$sql$,
           public.__id('c1'), public.__id('i_aicha'), public.__id('s1')),
    '23514', 'un règlement porte À LA FOIS un mois et une session');

  perform public.__refus(
    format($sql$insert into public.reglement (centre_id, inscription_id, montant_du)
                values (%L, %L, 1)$sql$, public.__id('c1'), public.__id('i_aicha')),
    '23514', 'un règlement sans aucune période est accepté');

  perform public.__refus(
    format($sql$insert into public.reglement (centre_id, inscription_id, mois, montant_du)
                values (%L, %L, '2026-13', 1)$sql$,
           public.__id('c1'), public.__id('i_aicha')),
    '23514', 'un mois inexistant est accepté');

  perform public.__refus(
    format($sql$insert into public.reglement (centre_id, inscription_id, mois, montant_du)
                values (%L, %L, '2026-05', -1)$sql$,
           public.__id('c1'), public.__id('i_aicha')),
    '23514', 'un montant dû négatif est accepté');
end;
$$;

alter table public.reglement enable trigger reglement_coherent;

-- =============================================================================
-- 11. Désinscrire emporte les règlements — l'interface DOIT le dire
--
-- `on delete cascade`, comme la note d'examen. Ce test ne l'approuve pas : il
-- FIGE le comportement, pour que l'écran qui l'annonce ne mente jamais.
-- =============================================================================
do $$
declare v_avant bigint;
begin
  select count(*) into v_avant from public.reglement
  where inscription_id = public.__id('i_omar');

  if v_avant = 0 then
    raise exception 'Le décor ne permet pas d''éprouver la cascade.';
  end if;

  delete from public.inscription where id = public.__id('i_omar');

  perform public.__attendre(
    format($sql$select count(*) from public.reglement where inscription_id = %L$sql$,
           public.__id('i_omar')),
    0::bigint, 'la cascade ne suit pas la désinscription');
end;
$$;

-- =============================================================================
-- 12. Les PRIVILÈGES de table, et rien de plus
--
-- ⚠️ `TRUNCATE` n'est PAS soumis à la RLS : accordé, il viderait la table
-- entière sans qu'aucune policy ne s'y oppose. Supabase l'accorde par défaut, et
-- il faut donc révoquer AVANT d'accorder — ce que `tarif` fait depuis 0017, et
-- ce que `paiement` a oublié depuis 0004. Sur la table qui porte l'argent
-- nominatif, on n'accorde pas un droit dont on n'a aucun usage.
-- =============================================================================
reset role;

do $$
declare v_trop text;
begin
  /*
   * ⚠️ `has_table_privilege`, jamais un `like` sur `relacl` : le motif
   * « authenticated=%t% » matche `authenticated=arwd/postgres` — le `t` venant
   * de « postgres ». Une assertion qui se trompe de cible échoue sur du juste et
   * passe sur du faux.
   */
  select string_agg(droit, ', ') into v_trop
  from (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as g(droit)
  where has_table_privilege('authenticated', 'public.reglement', droit);

  if v_trop is not null then
    raise exception
      'FAILLE — `authenticated` détient sur `reglement` des droits inutiles : %', v_trop;
  end if;

  -- Et il détient bien les quatre dont l'application a besoin.
  select string_agg(droit, ', ') into v_trop
  from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as g(droit)
  where not has_table_privilege('authenticated', 'public.reglement', droit);

  if v_trop is not null then
    raise exception 'La révocation a emporté un droit nécessaire : %', v_trop;
  end if;
end;
$$;

reset role;
select '✅ TOUTES LES ASSERTIONS PASSENT — modes de facturation, grain et étanchéité' as resultat;

rollback;
