-- =============================================================================
-- 0024_reconduire_session.sql — ouvrir la session suivante
--
-- À la fin d'une session, on rouvre les mêmes cours pour la période suivante :
-- mêmes libellés, mêmes niveaux, mêmes enseignants, mêmes horaires. Tout
-- ressaisir à la main est long, et se trompe.
--
-- ⚠️ CE QUI EST RECOPIÉ EST LA STRUCTURE, ET RIEN D'AUTRE.
--
--   recopié      libellé, type, niveau, format, enseignant affecté, créneaux,
--                réglages de notation, logo, tarif ;
--   PAS recopié  inscriptions, séances, présences, notes, examens — la
--                pédagogie repart à zéro, l'historique reste dans la session
--                source, et c'est ce qui fait de la progression d'un apprenant
--                une histoire sur plusieurs sessions plutôt qu'un éternel
--                recommencement ;
--   PAS recopié  `lien_meet` : un lien de visioconférence périmé est pire qu'un
--                champ vide, parce qu'on croit qu'il fonctionne ;
--   JAMAIS       `jeton_partage`. Recopier un secret donnerait à l'ancien public
--                l'accès au nouveau cours. Les jetons de suivi partent de toute
--                façon avec les inscriptions, qui ne sont pas recopiées.
--
-- Le résultat est un BROUILLON : tout y est modifiable. Rien n'est automatique
-- côté apprenants — promouvoir quelqu'un de Niveau 1 à Niveau 2 doit rester un
-- choix, donc les inscriptions se refont à la main (l'écran propose la liste de
-- la session précédente, il ne la recopie pas).
--
-- Migration idempotente et transactionnelle.
-- =============================================================================

begin;

-- =============================================================================
-- 1. D'où vient chaque copie
--
-- Sans ce lien, rien ne rattacherait un cours reconduit à son modèle : le
-- libellé ne suffit pas — il n'est pas unique, deux cours peuvent porter le même
-- nom dans une session. Il sert à deux choses :
--
--   * proposer, à l'inscription, les apprenants du cours de la session
--     précédente — une aide à la saisie, jamais une recopie (la promotion d'un
--     apprenant de Niveau 1 à Niveau 2 doit rester un choix) ;
--   * suivre la progression d'un apprenant d'une session à l'autre.
--
-- ⚠️ `on delete set null (reconduit_de)`, avec la COLONNE nommée. Sur une clé
-- composite, un `set null` sans liste annule TOUTES les colonnes de la clé,
-- `centre_id` compris — qui est `not null`. La suppression échouerait alors
-- purement et simplement (leçon de 0018).
-- =============================================================================
alter table public.cours add column if not exists reconduit_de uuid;

comment on column public.cours.reconduit_de is
  'Cours de la session précédente dont celui-ci est la copie (migration 0024). Sert à proposer les anciens inscrits et à suivre la progression d''une session à l''autre. `null` = cours créé directement.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cours'::regclass and conname = 'cours_reconduit_du_centre_fkey'
  ) then
    alter table public.cours add constraint cours_reconduit_du_centre_fkey
      foreign key (reconduit_de, centre_id)
      references public.cours (id, centre_id)
      on delete set null (reconduit_de);
  end if;
end
$$;

create index if not exists cours_reconduit_de_idx on public.cours (reconduit_de);

/*
 * ⚠️ Aucun `grant` n'est nécessaire ici, et il importe de savoir pourquoi.
 *
 * Sur `cours`, seuls INSERT et UPDATE sont accordés colonne par colonne (0017) ;
 * le SELECT, lui, reste au niveau TABLE (`authenticated=rdDxtm`). La nouvelle
 * colonne est donc lisible d'office — et croire l'inverse serait pire qu'inutile :
 * quelqu'un qui compterait sur la liste de colonnes pour CACHER un futur secret
 * se tromperait. Ce qui ferme la lecture de `cours`, c'est la RLS, et elle seule.
 *
 * Pas de `grant insert/update` non plus : seule `reconduire_session` écrit cette
 * colonne, et elle est `security definer` — les privilèges de colonne ne s'y
 * appliquent pas.
 */

-- =============================================================================
-- 2. La reconduction
-- =============================================================================
create or replace function public.reconduire_session(
  p_session_id uuid,
  p_nom        text,
  p_date_debut date,
  p_date_fin   date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_centre   uuid;
  v_nouvelle uuid;
  v_nom      text := btrim(coalesce(p_nom, ''));
  v_source   public.cours;
  v_copie    uuid;
  v_choc_a   text;
  v_choc_b   text;
begin
  /*
   * Garde de rôle. La reconduction est de la STRUCTURE : elle décide quels
   * cours existent et quand (CLAUDE.md §5.13).
   */
  if not (select public.est_responsable()) then
    raise exception 'Seul le responsable du centre peut ouvrir une session.'
      using errcode = 'P0070';
  end if;

  /*
   * La session source doit être du centre de l'appelant. Message IDENTIQUE à
   * celui du refus de rôle : distinguer « pas votre centre » de « n'existe
   * pas » dirait à un responsable curieux quels identifiants sont réels
   * ailleurs. Même prudence que `retirer_membre` (§5.15).
   */
  select s.centre_id into v_centre
  from public.session as s
  where s.id = p_session_id
    and s.centre_id = (select public.centre_courant());

  if v_centre is null then
    raise exception 'Seul le responsable du centre peut ouvrir une session.'
      using errcode = 'P0070';
  end if;

  if v_nom = '' or p_date_debut is null then
    raise exception 'La nouvelle session a besoin d''un nom et d''une date de début.'
      using errcode = 'P0071';
  end if;

  if p_date_fin is not null and p_date_fin < p_date_debut then
    raise exception 'La date de fin ne peut pas précéder la date de début.'
      using errcode = 'P0071';
  end if;

  /*
   * La date de début est CHOISIE, jamais déduite de la session source : entre
   * deux sessions il y a souvent des vacances, et imposer la continuité
   * obligerait à la corriger chaque fois. Aucune contrainte non plus entre les
   * deux périodes — une session de rattrapage n'attend pas la fin de la
   * précédente.
   *
   * La session source n'est PAS touchée : elle reste en cours ou se clôture
   * séparément, quand son responsable le décide.
   */
  begin
    insert into public.session (centre_id, nom, date_debut, date_fin, statut)
    values (v_centre, v_nom, p_date_debut, p_date_fin, 'en_cours')
    returning id into v_nouvelle;
  exception when unique_violation then
    raise exception 'Une session porte déjà le nom « % » dans ce centre.', v_nom
      using errcode = 'P0071';
  end;

  /*
   * Un tour de boucle par cours. Une insertion ensembliste serait plus courte,
   * mais il faudrait ensuite rattacher chaque créneau à la BONNE copie — et le
   * seul lien commun serait le libellé, qui n'est pas unique : deux cours
   * peuvent porter le même nom dans une session. `returning` donne l'identifiant
   * de la copie sans rien deviner. Les volumes sont de l'ordre de la dizaine.
   */
  for v_source in
    select * from public.cours where session_id = p_session_id order by libelle
  loop
    /*
     * `statut = 'actif'` quel que soit celui de la source : on ouvre une
     * période, on ne recopie pas un cours dans l'état « terminé ». `date_debut`
     * suit la nouvelle session et `date_fin` repart nulle — la plage de vie du
     * cours est celle de SA session, pas de la précédente.
     *
     * ⚠️ `enseignant_id` est recopié tel quel, `null` compris. Un membre retiré
     * entre-temps a laissé ses cours orphelins (`on delete set null`, 0018) : la
     * copie l'est aussi, et `cours_animables()` la rend au responsable. Il ne
     * peut pas pointer quelqu'un d'invalide — la clé étrangère composite vers
     * `membre (user_id, centre_id)` le refuserait.
     */
    insert into public.cours (
      centre_id, session_id, libelle, type_cours_id, niveau, format,
      enseignant_id, date_debut, date_fin, statut, logo, reconduit_de,
      assiduite_active, base_academique, bareme_assiduite,
      penalite_absence, penalite_retard, penaliser_absences_excusees
    )
    values (
      v_centre, v_nouvelle, v_source.libelle, v_source.type_cours_id, v_source.niveau,
      v_source.format, v_source.enseignant_id, p_date_debut, null, 'actif', v_source.logo,
      -- D'où vient cette copie. C'est ce lien qui permettra de proposer les
      -- anciens inscrits, et de suivre un apprenant d'une session à l'autre.
      v_source.id,
      v_source.assiduite_active, v_source.base_academique, v_source.bareme_assiduite,
      v_source.penalite_absence, v_source.penalite_retard, v_source.penaliser_absences_excusees
    )
    returning id into v_copie;

    -- Mêmes jours, mêmes heures. C'est le cœur de la reconduction, et c'est ce
    -- qui exige que le conflit soit scopé par session (0022).
    insert into public.creneau (centre_id, cours_id, jour_semaine, heure_debut, heure_fin)
    select v_centre, v_copie, cr.jour_semaine, cr.heure_debut, cr.heure_fin
    from public.creneau as cr
    where cr.cours_id = v_source.id;

    /*
     * Le tarif. Il n'était pas dans la liste demandée, et c'est un choix
     * assumé : sans lui, il faudrait ressaisir le prix de chaque cours à chaque
     * session. Un prix hérité se voit dans le formulaire et se corrige ; un prix
     * oublié facture zéro. `tarif` est gardée `est_responsable()` en lecture
     * comme en écriture (0017), et cette fonction l'est aussi.
     */
    insert into public.tarif (cours_id, centre_id, prix_mensuel, devise)
    select v_copie, v_centre, t.prix_mensuel, t.devise
    from public.tarif as t
    where t.cours_id = v_source.id;
  end loop;

  /*
   * ⚠️ Le garde-fou de chevauchement (§5.1) vit dans `enregistrer_cours`, et
   * ces insertions ne passent pas par elle. Une session source saine produit
   * une copie saine — mais « saine » n'est garanti que par cette même fonction,
   * et rien n'empêche une session d'avoir été bricolée en SQL. On vérifie donc
   * l'état FINAL de la session NEUVE, comme `retirer_membre` le fait après
   * réaffectation (§5.15).
   *
   * `is not distinct from` : les cours sans enseignant forment un agenda commun.
   */
  select a_cours.libelle, b_cours.libelle
  into v_choc_a, v_choc_b
  from public.creneau as a
  join public.creneau as b
    on b.cours_id     <> a.cours_id
   and b.jour_semaine  = a.jour_semaine
   and a.heure_debut   < b.heure_fin
   and b.heure_debut   < a.heure_fin
  join public.cours as a_cours on a_cours.id = a.cours_id
  join public.cours as b_cours on b_cours.id = b.cours_id
  where a_cours.session_id = v_nouvelle
    and b_cours.session_id = v_nouvelle
    and a_cours.enseignant_id is not distinct from b_cours.enseignant_id
  limit 1;

  if v_choc_a is not null then
    raise exception
      'La session source contient deux cours du même enseignant sur le même créneau (« % » et « % »). Corrigez-les avant de reconduire.',
      v_choc_a, v_choc_b using errcode = 'P0072';
  end if;

  /*
   * ⚠️ Un cours sans aucun créneau. `enregistrer_cours` l'interdit (P0001), mais
   * rien n'empêche un `delete` direct sur `creneau` — le même raisonnement qui a
   * justifié le contrôle ci-dessus, poussé jusqu'au bout.
   *
   * Il y a un second chemin, plus subtil : la boucle ouvre un curseur, dont
   * l'instantané est figé, tandis que chaque `insert … select from creneau`
   * prend le sien. En READ COMMITTED, des créneaux supprimés pendant la
   * reconduction donneraient une copie vide sans que rien ne le signale.
   *
   * On contrôle donc l'état FINAL de la session neuve, ce qui attrape les deux
   * cas d'un coup — plutôt que la source, qui n'en attraperait qu'un.
   */
  select copie.libelle into v_choc_a
  from public.cours as copie
  where copie.session_id = v_nouvelle
    and not exists (select 1 from public.creneau as cr where cr.cours_id = copie.id)
  limit 1;

  if v_choc_a is not null then
    raise exception
      'Le cours « % » de la session source n''a aucun créneau : sa copie serait inutilisable. Donnez-lui un horaire avant de reconduire.',
      v_choc_a using errcode = 'P0073';
  end if;

  return v_nouvelle;
end;
$function$;

alter function public.reconduire_session(uuid, text, date, date) owner to postgres;

-- Supabase pose un `alter default privileges … grant execute … to authenticated`
-- qui survit à `revoke … from public` : révoquer explicitement, puis réaccorder.
revoke all on function public.reconduire_session(uuid, text, date, date)
  from public, anon, authenticated;
grant execute on function public.reconduire_session(uuid, text, date, date) to authenticated;

comment on function public.reconduire_session(uuid, text, date, date) is
  'Ouvre la session suivante en recopiant la STRUCTURE des cours (libellé, type, niveau, enseignant, créneaux, réglages, tarif). Ne recopie NI inscriptions, NI séances, NI notes, NI lien de visio, NI jeton de partage. Atomique, gardée est_responsable().';

commit;
