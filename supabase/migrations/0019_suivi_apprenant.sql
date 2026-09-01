-- =============================================================================
-- 0019_suivi_apprenant.sql — un lien privé par inscription, sans compte
--
-- Les familles ne voyaient rien entre deux rapports de fin de session. Cette
-- migration leur ouvre une page privée où elles suivent EN DIRECT les notes de
-- récitation de leur enfant, pour un cours donné.
--
-- ⚠️ C'est la DEUXIÈME porte ouverte à `anon` après `cours_public` (0007), et la
-- première à exposer des notes individuelles — donc des données de mineurs. La
-- doctrine de 0007 s'applique mot pour mot :
--
--   * `anon` n'a AUCUN droit sur AUCUNE table. Sa seule porte est une fonction
--     `security definer` dont la LISTE DE COLONNES EST LA LISTE BLANCHE ;
--   * surtout PAS de vue : une vue s'exécute avec les droits de son
--     propriétaire et n'oblige pas le client à filtrer. `anon` ferait
--     `GET /rest/v1/la_vue?select=*` et sortirait les notes de tous les enfants
--     du centre. Seule une fonction impose le prédicat côté serveur ;
--   * la fonction lit les tables parce que son propriétaire `postgres` les
--     possède, et que la RLS ne s'applique pas au propriétaire. Poser un
--     `force row level security` sur ces tables ferait renvoyer zéro ligne SANS
--     ERREUR — d'où le `owner to postgres` explicite plus bas.
--
-- Le partage est opt-in : `inscription.jeton` naît `null` (colonne posée en
-- 0012, avec son index unique partiel, et qu'aucun client ne peut écrire).
--
-- Migration idempotente.
-- =============================================================================

-- =============================================================================
-- 1. Un coût borné pour un point d'entrée non authentifié
--
-- Même exigence qu'en 0007 : ce que `anon` peut appeler doit avoir un coût
-- prévisible, quelle que soit la taille du centre.
-- =============================================================================
create index if not exists presence_apprenant_cours_idx
  on public.presence (apprenant_id, cours_id);

comment on column public.seance.exercices_a_faire is
  'ATTENTION : renvoyé PUBLIQUEMENT par cours_public() et par suivi_apprenant(). N''y écrire aucune information personnelle.';

comment on column public.presence.commentaire is
  'ATTENTION : renvoyé PUBLIQUEMENT par suivi_apprenant() à la famille de l''apprenant concerné. C''est un mot à l''élève, pas une note de service.';

-- =============================================================================
-- 2. La lecture publique — la liste de colonnes EST la liste blanche
--
-- Onze colonnes, et pas une de plus. N'y rien ajouter sans se demander ce que
-- cela publie à un visiteur qui n'a qu'une URL.
--
-- Ce qui n'y est PAS, et ne doit jamais y entrer : aucun identifiant interne
-- (ni `id`, ni `cours_id`, ni `centre_id`, ni le jeton), aucun prix, aucun autre
-- apprenant, aucun autre cours, aucun lien de visioconférence, aucune moyenne ni
-- note finale calculée.
--
-- Pas de moyenne provisoire, délibérément : une moyenne à mi-parcours se lit
-- comme un verdict.
-- =============================================================================
do $$
declare v_fonction record;
begin
  for v_fonction in
    select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
    from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'suivi_apprenant'
  loop
    execute format('drop function public.%I(%s)', v_fonction.proname, v_fonction.arguments);
  end loop;
end
$$;

create function public.suivi_apprenant(p_jeton uuid)
returns table (
  apprenant     text,
  cours_libelle text,
  type_libelle  text,
  enseignant    text,
  centre_nom    text,
  logo          text,
  statut        text,
  evaluations   jsonb,
  assiduite     jsonb,
  examen        jsonb,
  exercices     text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    trim(a.prenom || ' ' || a.nom),
    c.libelle,
    t.libelle,
    m.nom_affiche,
    ce.nom,
    -- Le logo du cours l'emporte sur celui du centre : même règle que
    -- `parametresEffectifs` côté client (migration 0011).
    coalesce(c.logo, p.logo),
    c.statut,

    /*
     * Les ÉVALUATIONS — uniquement les séances réellement notées.
     *
     * `note is not null` : aucune ligne vide, aucun espace réservé. Une séance
     * sans note n'existe pas pour la famille, et une grille trouée se lirait
     * comme un reproche.
     *
     * ⚠️ `statut = 'faite'` ET `date <= current_date`, comme 0007. Les deux, et
     * pas l'un des deux : `seance.statut` vaut `'faite'` PAR DÉFAUT (0003), et le
     * formulaire le pose aussi en dur — une séance générée pour la semaine
     * prochaine est donc « faite » sans que personne l'ait décidé. Sans la
     * garde de date, une note pré-remplie sortirait avant que la séance ait eu
     * lieu. Sans la garde de statut, une note resterait publiée sur une séance
     * annulée après coup, alors que le rapport de session, lui, l'écarte
     * (`rapportSession.ts`) — la famille verrait une note s'évaporer.
     *
     * `contenu` suit la même règle que `libelleContenuSeance`
     * (`shared/lib/rapport.ts`) : sourate + versets s'ils sont renseignés,
     * sinon le contenu libre. `null` si ni l'un ni l'autre — le client affiche
     * alors la date seule.
     */
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'date', s.date,
                   'contenu', case
                     when nullif(btrim(coalesce(s.sourate, '')), '') is not null then
                       case
                         when s.versets_de is not null and s.versets_a is not null
                           then btrim(s.sourate) || ' v' || s.versets_de || '–' || s.versets_a
                         when s.versets_de is not null
                           then btrim(s.sourate) || ' v' || s.versets_de
                         else btrim(s.sourate)
                       end
                     else nullif(btrim(coalesce(s.contenu_aborde, '')), '')
                   end,
                   'note', pr.note,
                   'bareme', pr.note_bareme,
                   'commentaire', nullif(btrim(coalesce(pr.commentaire, '')), ''),
                   'etat', coalesce(pr.etat, case when pr.present then 'present' else 'absent' end)
                 )
                 order by s.date, s.heure_debut
               )
        from public.presence as pr
        join public.seance as s on s.id = pr.seance_id
        where pr.apprenant_id = i.apprenant_id
          and pr.cours_id = i.cours_id
          and pr.note is not null
          and s.statut = 'faite'
          and s.date <= current_date
      ),
      '[]'::jsonb
    ),

    /*
     * L'ASSIDUITÉ, sur les seules séances RÉELLEMENT TENUES — `statut = 'faite'`
     * ET `date <= current_date`. Compter une séance annulée comme une absence
     * serait un reproche injuste ; compter une séance à venir, dont la présence
     * a pu être pré-remplie, annoncerait le passé de la semaine prochaine.
     *
     * Le `coalesce` reproduit `etatEffectif` (`shared/lib/rapport.ts`) : un état
     * non renseigné retombe sur le booléen `present`, ce qui garde correctes les
     * séances d'avant la migration 0008.
     */
    (
      select jsonb_build_object(
               'present', count(*) filter (where etat_reel = 'present'),
               'retard',  count(*) filter (where etat_reel = 'retard'),
               'absent',  count(*) filter (where etat_reel = 'absent'),
               'excuse',  count(*) filter (where etat_reel = 'excuse'),
               'partiel', count(*) filter (where etat_reel = 'partiel'),
               'seances', count(*)
             )
      from (
        select coalesce(pr.etat, case when pr.present then 'present' else 'absent' end) as etat_reel
        from public.presence as pr
        join public.seance as s on s.id = pr.seance_id
        where pr.apprenant_id = i.apprenant_id
          and pr.cours_id = i.cours_id
          and s.statut = 'faite'
          and s.date <= current_date
      ) as etats
    ),

    -- L'examen n'apparaît que s'il existe. La note ne va jamais sans son barème.
    case
      when i.note_examen is not null and i.examen_bareme is not null
        then jsonb_build_object('note', i.note_examen, 'bareme', i.examen_bareme)
      else null
    end,

    -- Les exercices de la dernière séance tenue. `date <= current_date` reprend
    -- mot pour mot 0007 : une séance pré-remplie dans le futur ne doit pas
    -- publier son contenu par avance — sinon la famille lit aujourd'hui le
    -- travail préparé pour dans deux semaines.
    (
      select s.exercices_a_faire
      from public.seance as s
      where s.cours_id = i.cours_id
        and s.statut = 'faite'
        and s.date <= current_date
        and nullif(btrim(coalesce(s.exercices_a_faire, '')), '') is not null
      order by s.date desc, s.heure_debut desc
      limit 1
    )

  from public.inscription as i
  join public.apprenant as a on a.id = i.apprenant_id
  join public.cours as c on c.id = i.cours_id
  join public.type_cours as t on t.id = c.type_cours_id
  left join public.membre as m
    on m.user_id = c.enseignant_id and m.centre_id = c.centre_id
  join public.centre as ce on ce.id = c.centre_id
  left join public.parametres as p on p.centre_id = c.centre_id
  /*
   * Le prédicat, et le seul : un jeton, une inscription. Un jeton révoqué vaut
   * `null` et ne matche rien — zéro ligne, comme un jeton inconnu. Pas d'oracle.
   *
   * ⚠️ Le paramètre s'appelle `p_jeton`, PAS `jeton`. Dans une fonction
   * `language sql`, un nom de paramètre identique à un nom de colonne se
   * résout sur la COLONNE : `where i.jeton = jeton` devient `i.jeton = i.jeton`,
   * vrai pour toute ligne dont le jeton est non nul — et n'importe quelle URL
   * inventée sortirait alors les notes d'un enfant. Le préfixe n'est pas une
   * convention, c'est la garde.
   */
  where i.jeton = p_jeton;
$$;

comment on function public.suivi_apprenant(uuid) is
  'Suivi privé d''un apprenant pour UN cours, lisible sans compte via son jeton. La liste de colonnes est la liste blanche : n''y rien ajouter sans se demander ce que cela publie.';

-- =============================================================================
-- 3. L'activation — l'enseignant du cours, et lui seul
--
-- Même forme que les RPC de partage réécrites en 0017 : `security definer`,
-- gardées `cours_enseignes()`. Chacune remonte de l'inscription à son cours,
-- donc le client ne nomme jamais le cours et ne peut pas le forcer.
--
-- Le jeton est tiré par le CSPRNG du serveur : le navigateur ne choisit jamais
-- le secret. `inscription.jeton` n'est de toute façon accordée à personne en
-- écriture (0012).
-- =============================================================================
create or replace function public.activer_suivi(p_inscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_jeton uuid;
begin
  -- Idempotent : un lien déjà actif n'est pas remplacé.
  update public.inscription
  set jeton = coalesce(jeton, gen_random_uuid())
  where id = p_inscription_id
    and cours_id = any ((select public.cours_animables())::uuid[])
  returning jeton into v_jeton;

  if v_jeton is null then
    raise exception 'Seul l''enseignant de ce cours peut ouvrir un suivi.'
      using errcode = 'P0040';
  end if;

  return v_jeton;
end;
$$;

create or replace function public.regenerer_suivi(p_inscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_jeton uuid;
begin
  update public.inscription
  set jeton = gen_random_uuid()
  where id = p_inscription_id
    and cours_id = any ((select public.cours_animables())::uuid[])
  returning jeton into v_jeton;

  if v_jeton is null then
    raise exception 'Seul l''enseignant de ce cours peut régénérer ce lien.'
      using errcode = 'P0040';
  end if;

  return v_jeton;
end;
$$;

create or replace function public.revoquer_suivi(p_inscription_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_touchees integer;
begin
  update public.inscription
  set jeton = null
  where id = p_inscription_id
    and cours_id = any ((select public.cours_animables())::uuid[]);

  get diagnostics v_touchees = row_count;

  if v_touchees = 0 then
    raise exception 'Seul l''enseignant de ce cours peut révoquer ce lien.'
      using errcode = 'P0040';
  end if;
end;
$$;

alter function public.suivi_apprenant(uuid)   owner to postgres;
alter function public.activer_suivi(uuid)     owner to postgres;
alter function public.regenerer_suivi(uuid)   owner to postgres;
alter function public.revoquer_suivi(uuid)    owner to postgres;

-- =============================================================================
-- 4. Droits
--
-- ⚠️ `revoke from public` ne suffit pas : Supabase pose un
-- `alter default privileges ... grant execute on functions to authenticated`,
-- privilège NOMMÉ qui survit. On révoque explicitement, puis on rouvre.
--
-- `suivi_apprenant` est la seule que `anon` gagne — la deuxième de toute
-- l'application après `cours_public`. Les trois RPC d'activation lui restent
-- fermées : elles écrivent.
-- =============================================================================
revoke all on function public.suivi_apprenant(uuid) from public, anon, authenticated;
revoke all on function public.activer_suivi(uuid) from public, anon, authenticated;
revoke all on function public.regenerer_suivi(uuid) from public, anon, authenticated;
revoke all on function public.revoquer_suivi(uuid) from public, anon, authenticated;

grant execute on function public.suivi_apprenant(uuid) to anon, authenticated;
grant execute on function public.activer_suivi(uuid) to authenticated;
grant execute on function public.regenerer_suivi(uuid) to authenticated;
grant execute on function public.revoquer_suivi(uuid) to authenticated;

notify pgrst, 'reload schema';

-- =============================================================================
-- 5. Refermer la même faute là où elle dormait — `cours_public` (0007)
--
-- La collision paramètre/colonne rattrapée plus haut n'était pas une étourderie
-- isolée : `cours_public` porte exactement la même forme depuis 0007. Elle est
-- inoffensive tant que `public.cours` n'a pas de colonne nommée `jeton` — donc
-- tant que personne ne renomme `jeton_partage`. Écrire huit lignes
-- d'avertissement sur ce piège en laissant l'instance existante ouverte serait
-- incohérent.
--
-- Le corps est celui de 0007, à l'identique. Seul le prédicat change.
-- =============================================================================
create or replace function public.cours_public(jeton uuid)
returns table (
  libelle          text,
  type_libelle     text,
  lien_meet        text,
  date_debut       date,
  date_fin         date,
  statut           text,
  creneaux         jsonb,
  dernier_exercice text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.libelle,
    t.libelle,
    -- Un cours terminé ou en pause ne donne plus accès à la visioconférence :
    -- sans cela, un lien de visio resterait joignable indéfiniment par qui a
    -- gardé l'URL. C'est la seule protection contre l'oubli de révocation.
    case
      when c.statut in ('pause', 'termine') then null
      when c.date_fin is not null and c.date_fin < current_date then null
      else c.lien_meet
    end,
    c.date_debut,
    c.date_fin,
    c.statut,
    -- jsonb_agg renvoie NULL sur zéro ligne, jamais '[]'.
    -- Les `time` sortent bruts (« 09:00:00 ») : format que le front tronque
    -- déjà partout via .slice(0, 5).
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'jour_semaine', cr.jour_semaine,
                   'heure_debut', cr.heure_debut,
                   'heure_fin', cr.heure_fin
                 )
                 order by cr.jour_semaine, cr.heure_debut
               )
        from public.creneau as cr
        where cr.cours_id = c.id
      ),
      '[]'::jsonb
    ),
    -- Le dernier exercice RÉELLEMENT donné : une séance saisie sans exercice ne
    -- doit pas effacer celui de la séance précédente. Et une séance pré-remplie
    -- dans le futur ne doit pas publier son contenu par avance.
    (
      select s.exercices_a_faire
      from public.seance as s
      where s.cours_id = c.id
        and s.statut = 'faite'
        and s.date <= current_date
        and btrim(coalesce(s.exercices_a_faire, '')) <> ''
      order by s.date desc, s.heure_debut desc
      limit 1
    )
  -- Jointure interne sûre : type_cours_id est `not null` / `on delete restrict`.
  from public.cours as c
  join public.type_cours as t on t.id = c.type_cours_id
  /*
   * ⚠️ `$1`, et surtout PAS `jeton`.
   *
   * Dans une fonction `language sql`, un nom de paramètre identique à un nom de
   * colonne de la requête se résout sur la COLONNE, en silence. `public.cours`
   * n'a pas de colonne `jeton` aujourd'hui — la fonction est donc correcte, mais
   * par accident de nommage, pas par construction. Le jour où quelqu'un
   * renommerait `jeton_partage` en `jeton`, le prédicat deviendrait
   * `c.jeton = c.jeton` : vrai pour toute ligne partagée, et `anon` sortirait
   * TOUS les cours du monde, `lien_meet` compris, avec n'importe quelle URL.
   *
   * La référence positionnelle ne peut être masquée par aucune colonne. On la
   * préfère ici au renommage en `p_jeton`, qui aurait cassé la page publique
   * entre le déploiement de la base et celui du front.
   *
   * `= null` vaut NULL et jamais TRUE : la garde est redondante, mais explicite.
   */
  where $1 is not null
    and c.jeton_partage = $1;
$$;

-- `create or replace` conserve les droits déjà posés ; on les réaffirme quand
-- même, pour que rejouer cette migration seule laisse un état complet.
alter function public.cours_public(uuid) owner to postgres;
revoke all on function public.cours_public(uuid) from public, anon, authenticated;
grant execute on function public.cours_public(uuid) to anon, authenticated;
