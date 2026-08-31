# CLAUDE.md — Application de gestion des cours (Coran)

> Fichier de référence pour Claude Code. Il décrit le projet, les règles métier, la
> stack, l'architecture et les conventions. **À lire avant toute tâche.**

## 1. Vue d'ensemble

Application **PWA** de gestion de cours de Coran (initiation à la lecture, lecture,
mémorisation), donnés en **individuel** ou en **groupe**. Objectifs de qualité : **évolutive,
modulaire, bien structurée, et soignée visuellement**. Accès **multi-appareils** (téléphone,
tablette, PC) synchronisé.

Elle s'organise autour d'un **centre** (migration 0012) : un responsable qui gère, des
enseignants à qui des cours sont affectés. L'enseignant seul est simplement un centre à une
personne, responsable **et** enseignant — un seul modèle, pas de cas particulier.

Problème n°1 à résoudre : **ne jamais placer deux cours sur le même créneau**.

## 2. Stack technique

- **Base** : Vite + React + TypeScript (mode `strict`).
- **UI** : Tailwind CSS + **shadcn/ui** (composants Radix possédés dans le repo) + `lucide-react`.
- **Backend / DB** : **Supabase** (Postgres + Auth + Realtime + RLS), client `@supabase/supabase-js`.
  - Types TS générés depuis le schéma : `supabase gen types typescript`.
- **Couche données** : **TanStack Query** (cache/sync serveur) + **Zustand** (état local léger).
- **Formulaires / validation** : **React Hook Form + Zod** (schémas partagés).
- **Navigation** : React Router.
- **Dates** : `date-fns` (récurrence hebdo, calcul des chevauchements).
- **PWA** : `vite-plugin-pwa` (manifest, service worker, installation « écran d'accueil »).
- **Qualité** : ESLint + Prettier + TypeScript strict + **Vitest**.
- **Hébergement** : Vercel ou Netlify (front, gratuit) + Supabase (backend).

Utiliser les **versions stables les plus récentes** de chaque paquet. Ne pas introduire de
dépendance lourde de calendrier (ex. FullCalendar) : la grille est un composant sur mesure.

## 3. Architecture

Organisation **par fonctionnalité** (feature-based), jamais par type technique global.

```
src/
  app/                 # bootstrap, routes, providers (QueryClient, router, auth)
  features/
    apprenants/        # composants + hooks + repo de la feature
    cours/
    seances/
    paiements/
    planning/          # grille hebdomadaire + détection de conflits
  shared/
    ui/                # composants shadcn/ui partagés
    lib/               # helpers (dates, formatage, conflits)
    supabase/          # client + types générés + repositories par entité
  styles/
```

Règles d'architecture :

- **Couche d'accès Supabase par entité** (repository, ex. `coursRepo.ts`). Le reste de l'app
  ne parle **jamais** directement à Supabase — toujours via un repo + un hook TanStack Query.
- Les règles de validation vivent dans des **schémas Zod** réutilisés par les formulaires ET
  la logique.
- Composants présentational purs séparés des hooks de données.
- **i18n prévu dès le départ** (démarrage en français ; arabe/RTL possible plus tard —
  Tailwind gère le RTL nativement). Ne pas coder de textes en dur hors d'un système de
  traduction si l'effort reste raisonnable.

## 4. Modèle de données (Supabase / Postgres)

Les types de cours sont dans une **table de référence** (extensible), pas en dur.

### `type_cours`

- `id`, `libelle` (ex. Initiation à la lecture du Coran / Lecture du Coran / Mémorisation)

### `apprenant`

- `id`, `nom`, `prenom`, `contact` (WhatsApp/téléphone/email), `niveau`,
  `date_inscription`, `statut` (actif | pause | parti), `notes`

### `cours`

- `id`, `libelle`, `type_cours_id` (FK), `format` (individuel | groupe)
- `date_debut` **(obligatoire, souvent = date d'inscription)**
- `date_fin` **(nullable — renseignée seulement quand le cours se termine ; vide = en cours)**
- `lien_meet` **(un seul lien pour tout le cours, réutilisé par toutes les séances)**
- `prix_mensuel`, `devise`
- `statut` (actif | pause | termine)
- `jeton_partage` **(uuid nullable + index unique partiel — `null` = partage désactivé)** :
  secret de l'URL publique `/c/<jeton>`. Toujours tiré **côté serveur**
  (`activer_partage` / `regenerer_partage` / `revoquer_partage`), jamais par le navigateur,
  et exclu de `CoursInput` : il ne passe pas par le formulaire.
- **Ne porte aucun horaire** : les créneaux hebdomadaires vivent dans `creneau`.

### `creneau` (créneaux hebdomadaires récurrents d'un cours, 1..N)

- `id`, `cours_id` (FK, on delete cascade)
- `jour_semaine` **(ISO-8601 : 1 = lundi … 7 = dimanche — aligné sur `getISODay` de date-fns)**
- `heure_debut`, `heure_fin` (`time`, `heure_fin > heure_debut`)
- Unicité `(cours_id, jour_semaine, heure_debut)`
- Un cours donné 2×/semaine = **deux lignes** ici. Il n'y a **pas** de champ `frequence`.

### `inscription` (liaison apprenant ↔ cours, gère les groupes)

- `apprenant_id` (FK), `cours_id` (FK)
- `note_examen`, `examen_bareme` (nullables) : note d'examen de **fin de session** de cet
  apprenant **pour ce cours**. Comme partout, la note ne va jamais sans son barème — la base
  refuse l'une sans l'autre. Corollaire : désinscrire un apprenant **supprime sa note**.

### `seance` (occurrence réelle d'un cours)

- `id`, `cours_id` (FK), `date`, `statut` (faite | annulee | reportee | absence)
- `contenu_aborde` (texte libre — convient à l'initiation : leçon/page de méthode Nourania, Qaïda)
- `sourate`, `versets_de`, `versets_a` (optionnels — pour Lecture / Mémorisation)
- `type_travail` (nouvelle_memorisation | revision | lecture)
- `exercices_a_faire`, `observations`
- présence par apprenant (table `presence` : `seance_id`, `apprenant_id`, `present`, plus
  l'évaluation de récitation `note` / `note_bareme` / `commentaire` / `passage_evalue`)
- `presence.etat` (nullable) nuance le booléen : `present | retard | absent | excuse | partiel`.
  **`null` = non renseigné** → le calcul retombe sur `present`, ce qui garde toutes les séances
  d'avant la migration 0008 correctement comptées. Les deux colonnes s'écrivent **toujours
  ensemble** (`presenceRepo`), pour qu'elles ne puissent jamais se contredire.

### `paiement`

- `id`, `cours_id` (FK), `mois_concerne` (AAAA-MM), `montant_du`, `montant_recu`,
  `date_paiement`, `methode`
- Unicité `(cours_id, mois_concerne)` : un règlement par cours et par mois.
- **Le statut n'est PAS une colonne** : `paye | partiel | attente | retard` se déduit des
  montants et du mois comparé au mois courant (`shared/lib/paiements.ts`). Le stocker le
  figerait, et il deviendrait faux tout seul au passage d'un mois.
- Comme les séances, les mois dus sont **calculés au fil de l'eau** à partir de `prix_mensuel` et
  de la plage de vie du cours : une ligne n'existe qu'une fois un règlement enregistré, et son
  `montant_du` est alors figé.

### `tarif` (migration 0017)

- `cours_id` (PK), `centre_id`, `prix_mensuel`, `devise`. FK **composite** vers
  `cours (id, centre_id)`.
- **Gardée `est_responsable()` en LECTURE comme en écriture.** C'est la fermeture d'une fuite :
  un enseignant lisait `cours.prix_mensuel` sur ses propres cours — l'interface le masquait, la
  RLS non — et `inscriptionRepo.listByApprenant` embarquait `cours(*)` dans la fiche apprenant.
- L'embed PostgREST revient **vide** pour un enseignant, pas en erreur : ce n'est pas un cas
  d'exception à traiter. Passer par `tarifDuCours()` (`coursRepo.ts`), la relation n'étant pas
  reconnue comme un-à-un à cause de la FK composite.

### `centre` et `membre` (migration 0012)

- `centre` : `id`, `nom`. **C'est lui qui possède les données**, plus un compte.
- `membre` : `centre_id`, `user_id` (→ `auth.users`), `role` (responsable | enseignant),
  `nom_affiche` (dénormalisé — `auth.users` est illisible depuis le client), `note_bareme`.
  `unique (user_id)` : un utilisateur, un centre. C'est ce qui rend `centre_courant()` scalaire.
- `cours.enseignant_id` : à qui le cours est affecté. FK **composite** vers
  `membre (user_id, centre_id)` — on ne peut pas affecter un cours à quelqu'un d'un autre centre.
  Le responsable le choisit dans le formulaire de cours (migration 0014) ; `enregistrer_cours`
  traite `null` comme « inchangé », **jamais** comme « désaffecter », pour qu'un client qui
  ignore le champ n'efface pas les affectations des cours qu'il enregistre. Aucune policy ne
  garde cette colonne en propre : `est_responsable()` dit qui écrit dans `cours`, et la FK
  composite dit vers qui — un `with check` qui relirait `membre` n'ajouterait rien qu'une
  sous-requête par écriture.

Toutes les tables : **RLS activé**, isolant les données au **centre**. Les tables possédées
portent `centre_id uuid not null default centre_courant()`, plus `created_at` / `updated_at`
(trigger automatique). `type_cours` est une référence **globale** : pas de `centre_id`, lecture
seule pour les utilisateurs authentifiés. `owner_id`, l'ancien porteur du tenant, a été
**supprimé** (migration 0015) : le centre est désormais le seul propriétaire. Effet de bord
recherché — supprimer un compte ne détruit plus les données, ce que faisait l'ancien
`owner_id ... on delete cascade`.

### `invitation` (migration 0016)

- `centre_id`, `role`, `code_hash`, `cree_par`, `expire_le`, `utilise_le` / `utilise_par`,
  `revoquee_le`.
- **Le code n'est jamais stocké** — seulement son SHA-256. Le clair n'apparaît qu'une fois, dans
  le retour de `creer_invitation` ; `code_hash` n'est accordé à **personne** en lecture, pas même
  au responsable qui l'a créée. Perdu = révoquer et réémettre.
- **Pas de colonne `statut`** : comme pour `paiement`, « active / expirée / utilisée / révoquée »
  se déduit des horodatages et de `now()` (`etatInvitation` dans `invitationRepo.ts`).
- La table n'accorde **que le SELECT**, au seul responsable de son centre. Insert, update et
  delete ne sont accordés à personne : les trois RPC `security definer` sont les seules écritures.

**Les clés étrangères transportent le tenant** : `creneau`, `seance`, `paiement` et `inscription`
pointent `cours (id, centre_id)`, `inscription` et `presence` pointent `apprenant (id, centre_id)`,
`presence` pointe `seance (id, cours_id)`. Sans cela, un responsable pourrait planter chez lui une
ligne pointant un parent d'un autre centre : invisible pour l'autre, mais les contraintes
d'unicité étant globales, elle lui interdirait définitivement d'enregistrer ce créneau ou ce mois.
L'étanchéité est **structurelle**, pas seulement déclarative.

## 5. Règles métier (critiques)

1. **Détection de conflit** (périmètre : l'**enseignant**, migration 0013) : deux **créneaux**
   entrent en conflit s'ils relèvent du **même enseignant affecté** (`cours.enseignant_id`) ET
   que `même jour_semaine ET heure_debut_A < heure_fin_B ET heure_debut_B < heure_fin_A`.
   La ressource rare est la personne, pas le centre : deux enseignants tiennent très bien cours
   à la même heure. **Pas de marge** (début/fin fixes ; le débordement est hors système) :
   deux créneaux adjacents ne se chevauchent pas. Couverte par des tests Vitest.

   Le scope est l'enseignant **affecté au cours**, jamais `auth.uid()` : un responsable qui pose
   le planning de quelqu'un doit voir ses créneaux contrôlés contre l'agenda de cette
   personne-là. Un cours sans enseignant (`null`, possible après suppression d'un membre) forme
   un groupe qui se contrôle contre lui-même — d'où `is not distinct from` en SQL et `===` sur
   `null` côté TypeScript, jamais `=`, qui cesserait silencieusement de contrôler quoi que ce soit.

   Le **chevauchement temporel** (`creneauxSeChevauchent`) reste séparé de la **règle métier**
   (`creneauxEnConflit`) : le premier ne connaît que des heures. Le garde-fou de `enregistrer_cours`
   est la source de vérité, atomique ; la détection côté client n'est qu'un aperçu.

2. **Deux temporalités distinctes** à ne pas confondre :
   - le créneau hebdomadaire récurrent → table `creneau` (`jour_semaine` + `heure_debut`/`heure_fin`) ;
   - la plage de vie du cours → table `cours` (`date_debut` obligatoire, `date_fin` optionnelle).
3. **Génération des séances au fil de l'eau** : générer les occurrences à partir de
   `date_debut` (prochaines semaines), sans fin fixée à l'avance ; s'arrêter dès qu'une
   `date_fin` est renseignée.
4. **Un lien Meet par cours**, réutilisé pour toutes ses séances.
5. **Notifications** : uniquement **rappel de cours** (veille + juste avant, avec lien Meet).
   **Aucun rappel de paiement** (ne pas centrer l'app sur l'argent). La partie financière
   reste **consultable** sans relances.
6. **Fréquence** : un cours a **1..N créneaux hebdomadaires** (table `creneau`). Pas de champ
   `frequence` — « 2×/semaine » se modélise par deux créneaux.
7. **Capacité d'un cours** : un cours au format `individuel` accueille **exactement 1** apprenant
   inscrit ; au format `groupe`, **1..N**. Cette règle est **applicative**, pas contrainte en base
   (la table `inscription` ne garantit que l'unicité `(apprenant_id, cours_id)`) : elle vit dans
   `features/inscriptions/reglesInscription.ts` et doit y rester centralisée. Corollaire : passer
   un cours de `groupe` à `individuel` est refusé tant qu'il compte plus d'un inscrit.
8. **Page de cours partagée** (`/c/:jeton`, hors `RequireAuth`) : un apprenant n'a pas de compte et
   n'en aura pas. Le rôle `anon` n'a **aucun droit sur aucune table** — ni policy RLS, ni `grant`.
   Sa seule porte est `public.cours_public(jeton uuid)` (`security definer`, `search_path = ''`,
   migration 0007), dont la **liste des colonnes de sortie est la liste blanche** : libellé, type,
   lien Meet, période, statut, créneaux, dernier exercice. N'y rien ajouter sans se demander ce que
   cela publie. Ne **jamais** exposer ces données par une vue : une vue n'oblige pas le client à
   filtrer sur le jeton, et sortirait tous les cours. Le contrat est re-vérifié côté client par
   `shared/supabase/coursPublicSchema.ts` (Zod), qui supprime toute clé hors liste. Le lien Meet est
   masqué dès que le cours est en pause ou terminé — c'est la seule protection contre l'oubli de
   révocation.
9. **Note finale de session** (`shared/lib/rapport.ts`, module pur) : toujours **sur 20**,
   indépendamment de `parametres.note_bareme` — qui ne concerne que les notes de récitation par
   séance. Elle additionne une part **académique** et une part **assiduité**, dont les poids sont
   réglables et dont la **somme vaut toujours 20** (contrainte en base).
   La **base de la part académique** est elle aussi réglable (`parametres.base_academique`,
   migration 0009) : `examen_seul`, ou `moyenne_devoirs_examen` (défaut) qui moyenne à parts égales
   les notes de séance et l'examen. **Sans aucun devoir noté, la base retombe sur l'examen seul** —
   on ne moyenne pas avec du vide. L'assiduité part du maximum et retire une pénalité par absence et par
   retard, sans jamais descendre sous 0. Une **absence excusée ne pénalise pas** par défaut
   (`penaliser_absences_excusees`) — sinon la marquer n'aurait aucun sens ; une présence partielle
   n'est jamais pénalisée. Un apprenant sans note d'examen n'a pas 0 : la note finale vaut `null`.
   Ne compter que les présences de séances **réellement tenues** — `seance.statut` vaut aussi
   `annulee` et `reportee`.
10. **Rôles** (migration 0012). Deux familles de tables, et elles ne partagent **aucun prédicat
    d'écriture** :
    - **gestion** (`cours`, `creneau`, `apprenant`, `inscription`, `paiement`) : écriture gardée
      par `est_responsable()`, **et rien d'autre**. Y glisser `cours_lisibles()` rouvrirait
      l'écriture à l'enseignant — d'où le suffixe `_lisibles`, pour que la faute saute aux yeux ;
    - **pédagogie** (`seance`, `presence`) : écriture gardée par `cours_lisibles()`, le métier de
      l'enseignant.

    Un enseignant voit l'**identité** des apprenants inscrits à ses cours, jamais leur travail
    ailleurs. Il ne voit **aucun paiement**, pas même sur ses cours. Il lit les réglages du centre
    (le rapport en dépend) sans pouvoir les écrire — sauf **son** barème de récitation, qui vit sur
    sa ligne `membre` et non dans `parametres`.

    Le rôle vit **côté serveur**, dans `membre` : jamais dans le JWT (révocation différée jusqu'au
    rafraîchissement du jeton), jamais dans un réglage client. Le masquage d'interface
    (`useMembre()`) est de la lisibilité, pas de la sécurité : l'autorité reste les policies. Il
    évite le **lien mort** — un onglet qui mène à une page vide se lit comme une panne, pas comme
    une permission — et rien de plus.

    Un membre modifie **sa propre ligne** `membre` (policy `membre_update_soi`, `using` **et**
    `with check` sur `user_id = auth.uid()`), et **la seule colonne `note_bareme`** : `role` et
    `centre_id` ne sont accordés à personne en écriture. C'est le privilège de COLONNE, et non la
    policy, qui empêche l'escalade — la policy seule laisserait quiconque se poser responsable.

    Helpers de policy, tous `security definer`, `stable`, `search_path = ''`, `owner postgres`, et
    **aucun ne lève jamais** (une exception dans un `using` avorte toute la requête) :
    `centre_courant()`, `est_responsable()`, `cours_lisibles()`, `apprenants_lisibles()`. Les
    appeler **enveloppés** — `(select f())::uuid[]` — pour obtenir un InitPlan : un appel par
    requête, pas par ligne.

    ⚠️ **Une policy de SELECT ne doit jamais passer par un helper qui relit sa propre table.** Un
    helper `stable` ne voit pas la ligne que l'instruction est en train d'insérer, et le
    `returning` — que PostgREST ajoute dès qu'un repository chaîne `.select()` — échouerait sur
    toute création. `cours_select` et `apprenant_select` portent donc leur prédicat sur les
    colonnes de la ligne. Éprouvé par `supabase/tests/rls_etancheite.sql`, qui teste le refus
    **et** l'acceptation.

11. **Invitation d'enseignants** (migration 0016). Le responsable génère un code, le transmet hors
    bande, l'enseignant crée son compte puis l'échange. Trois fonctions, toutes `security definer`
    et possédées par `postgres` :
    - `creer_invitation(jours)` → le code en clair, **une seule fois**. Gardée par
      `est_responsable()`. **Aucun paramètre `centre_id` ni `role`** : le centre vient de
      `centre_courant()`, le rôle est `'enseignant'` en dur ;
    - `racheter_invitation(code, nom)` → **le seul chemin qui crée une ligne `membre`**. Ni le
      centre ni le rôle ne sont des arguments : ils viennent de la ligne `invitation`. C'est
      l'analogue exact du garde-fou anti-escalade du §5.10 — ce que le client ne peut pas nommer,
      il ne peut pas le forcer ;
    - `revoquer_invitation(id)` → responsable, même centre, invitation non utilisée.

    **Usage unique**, garanti par une **seule instruction** portant sa garde dans le `where` :
    `update … set utilise_le = now() where code_hash = … and utilise_le is null … returning`.
    L'UPDATE pose un verrou de ligne ; en READ COMMITTED une transaction concurrente attend puis
    réévalue son `where` sur la ligne modifiée, et ne touche rien. ⚠️ **Ne jamais réécrire cela en
    « select … puis update »** : ce serait rouvrir exactement la course que cette forme supprime.
    `supabase/tests/invitation.sql` vérifie la FORME de la fonction pour attraper cette régression.

    `invitation.role` n'accepte **qu'une seule valeur**, `'enseignant'` : le rachat recopie ce
    rôle dans `membre` sans le questionner — c'est ce qui garantit qu'il ne vient pas du client —
    donc la contrainte est la seconde ligne de défense derrière le littéral de `creer_invitation`.
    Inviter un co-responsable demandera une migration délibérée.

    **Ce que le hachage ne protège pas**, et qu'il vaut mieux savoir : le code transite en
    littéral de requête RPC (les journaux du dashboard peuvent en garder trace) ; `service_role`
    garde `all` par défaut et lit donc l'empreinte — « accordé à personne » vaut pour `anon` et
    `authenticated` ; et le SHA-256 est nu, toute la marge tenant aux 60 bits d'entropie et à
    l'expiration, pas au coût du calcul.

    **Impasse connue** : rien ne permet de quitter un centre ni d'en retirer un membre depuis
    l'application — pas de `delete` accordé sur `membre`, pas de fonction. Un rattachement erroné
    se défait en SQL. À traiter le jour où cela se posera.

    **Sécurité par inertie.** L'inscription Supabase est **ouverte** (`disable_signup = false`) et
    **sans confirmation d'e-mail** (`mailer_autoconfirm = true`). Ce n'est pas un relâchement :
    l'adresse n'est qu'un identifiant de connexion — on ne lui envoie jamais rien — et un compte
    sans ligne `membre` a `centre_courant() = null`, donc ne voit rien, n'écrit rien, et n'existe
    pour aucune policy. C'est ce que protège l'invariant, pas la confirmation. Garder celle-ci
    aurait été un faux gage : le SMTP partagé plafonne à deux envois par heure et le lien pointe
    vers `site_url`. `RequireMembre` accueille ces comptes inertes plutôt que de leur montrer une
    application vide, qui se lirait comme une panne.

12. **Structure contre pédagogie** (migration 0017) — le renversement de 0011 et de la place que
    0012 donnait à l'examen. La frontière ne passe plus entre « gestion » et « pédagogie » mais
    entre ce qu'on **structure** et ce qu'on **anime**, et l'autorité pédagogique tient à
    l'**affectation**, jamais au rôle :
    - **responsable**, sur tout cours de son centre : identité du cours, créneaux, affectation
      (`enseignant_id`), tarif et règlements, composition de la classe, réglages **par défaut** du
      centre (`parametres`) ;
    - **enseignant affecté** (`cours.enseignant_id = auth.uid()`), sur **son** cours : séances,
      présences, notes de récitation, note d'examen, surcharges de notation, logo du cours, lien
      de visioconférence, lien de partage, rapport.

    Un responsable qui enseigne le cours fait les deux ; un responsable qui ne l'enseigne pas ne
    peut **rien** y corriger côté pédagogique — il doit se l'affecter le temps de le faire.

    **La règle qui décide de chaque cas.** Les privilèges de colonne portent sur le rôle Postgres
    `authenticated`, que le responsable et l'enseignant partagent : ils ne peuvent **jamais**
    séparer les deux. D'où :

    > on **décompose** quand la LECTURE doit se fermer ; on **révoque la colonne** et on passe par
    > une RPC quand seule l'ÉCRITURE se ferme.

    Une seule décomposition en découle — `tarif`. Tout le reste garde ses colonnes sur `cours` et
    `inscription`, sorties des `grant`, écrites par six RPC `security definer` gardées
    `cours_enseignes()` : `definir_reglages_cours`, `definir_lien_meet`, `noter_examen`, et les
    trois de partage, passées d'`invoker` à `definer` pour cette raison même.

    Chaque RPC **résout elle-même sa cible jusqu'au cours** — `noter_examen` remonte de
    l'inscription — et vérifie que l'appelant l'enseigne. Le client ne nomme jamais le cours, donc
    ne peut pas le forcer ; c'est l'analogue du code d'invitation qui porte son rôle (§5.11).

    ⚠️ `definir_reglages_cours` **remplace** les sept réglages d'un bloc : une clé absente vaut
    `null`, c'est-à-dire « hériter du centre », et non « inchangé ».

    ⚠️ `enregistrer_cours` est `security invoker` : les privilèges de colonne de `cours`
    s'appliquent **à l'intérieur** d'elle. La liste re-grantée doit couvrir **exactement** ce
    qu'elle écrit — une colonne oubliée casse toute création et toute édition de cours, en
    silence côté client. Éprouvé par le chemin HTTP réel, pas seulement en test unitaire.

    **Un cours sans enseignant ne gèle pas.** `cours.enseignant_id` est
    `on delete set null` : supprimer un membre désaffecte ses cours. `cours_animables()` — le
    helper qu'emploient réellement les policies et les RPC — ajoute donc, pour un responsable, les
    cours que personne n'enseigne. Sans cela, plus personne ne pourrait y toucher une séance ni
    une note.

    **Cette frontière est à un `update` de distance**, et c'est voulu : `enseignant_id` est de la
    structure, donc un responsable peut s'affecter n'importe quel cours et récupérer alors toute
    l'autorité pédagogique. Ce n'est pas une barrière contre lui, c'est une séparation des flux de
    travail.

    Les **lectures ne se resserrent pas** : responsable et enseignant lisent les réglages
    effectifs, les séances, les présences et l'examen de tout ce que `cours_lisibles()` leur
    ouvre. Le rapport en dépend.

## 6. Fonctionnalités

- Vue principale : **grille hebdomadaire** (jours × heures), blocs colorés, **conflit visible
  immédiatement** à la création/déplacement d'un cours.
- Fiches apprenants et cours (individuel/groupe via `inscription`).
- Saisie par séance : contenu abordé, exercices, présence, observations.
- Suivi pédagogique cumulé par apprenant (dernière leçon/page pour l'initiation ; dernière
  sourate+verset pour lecture/mémorisation) ; distinction nouveau vs révision (murâja'a) ;
  chaînage des exercices donnés → vérifiés.
- Paiements mensuels + tableau de bord (consultation seule).
- **Rapport de fin de session** (`/cours/:coursId/rapport`, hors `AppLayout`) : feuille A4 paysage
  imprimable — présence par séance, notes de récitation, examen et note finale. Assemblé par
  `shared/lib/rapportSession.ts` (pur), imprimé via `window.print()` — aucune dépendance PDF. Son
  CSS vit dans un **fichier séparé** chargé par la seule route : `@page` n'a pas de sélecteur, et
  mettrait sinon toute l'application en paysage.
- **Lien de cours partageable** (`/c/:jeton`) : page publique sans connexion donnant l'horaire, la
  prochaine séance, le lien de visioconférence et le dernier exercice — activable, régénérable et
  révocable depuis la fiche du cours, avec partage WhatsApp (§5.8).
- Rappels de cours (plus tard).

## 7. Roadmap (construire par étapes, ne pas tout faire d'un coup)

- **MVP** : `cours` + `creneau` + `apprenant` + détection de conflit + grille hebdomadaire +
  lien Meet.
- **V1** : génération des séances au fil de l'eau, saisie contenu/exercices/présence,
  progression par apprenant.
- **V2** : paiements mensuels, statut payé/impayé, tableau de bord (sans rappels).
- **V3** : rappels de cours (WhatsApp/push via Supabase Edge Functions + pg_cron), séances
  reportées/rattrapages, cache offline (persistance TanStack Query).

## 8. Commandes

```bash
npm run dev          # serveur de dev Vite
npm run build        # build de production
npm run preview      # prévisualiser le build
npm run lint         # ESLint
npm run test         # Vitest
npm run gen:types    # types Supabase → src/shared/supabase/types.ts (nécessite supabase login)
```

Épreuves SQL — chacune monte son propre décor et **annule tout** à la fin. À rejouer après toute
migration touchant aux policies (la première) ou à `enregistrer_cours` (la seconde) :

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_etancheite.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/conflit_enseignant.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/invitation.sql
```

Les migrations qui verrouillent `cours` prennent un verrou exclusif : les lancer avec
`-c "set lock_timeout='15s'"`, pour qu'une contention échoue bruyamment plutôt que d'attendre en
silence derrière une connexion PostgREST restée ouverte.

⚠️ Les migrations qui remplacent `enregistrer_cours` se succèdent (0002, 0012, 0013, 0014) :
rejouer une ancienne après une plus récente **restaure son comportement**. L'idempotence se
vérifie en rejouant une migration juste après elle-même, jamais dans le désordre.

Variante sans `supabase login`, avec la chaîne de connexion de `.env.local` :

```bash
npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/shared/supabase/types.ts
```

## 9. Conventions

- **TypeScript strict**, pas de `any` implicite. Typer les retours de repositories via les
  types Supabase générés.
- Données serveur **toujours** via TanStack Query (jamais de `fetch`/appel Supabase dans un
  composant directement).
- Validation **toujours** via un schéma Zod ; réutiliser le schéma côté formulaire.
- Composants nommés en PascalCase, hooks en `useXxx`, repos en `xxxRepo.ts`.
- Style via classes Tailwind + composants shadcn ; éviter le CSS ad hoc.
- Commits clairs et atomiques ; une feature = un périmètre.
- Écrire un test Vitest pour toute logique métier sensible (conflits, génération de séances).

## 10. Pièges à éviter

- Ne pas confondre **cours** (modèle récurrent) et **séance** (occurrence). Garder les tables
  séparées.
- Les **créneaux** vivent dans la table `creneau`, **jamais** sur `cours`.
- Ne pas mettre le lien Meet sur la séance.
- Ne pas ajouter de rappels de paiement.
- Ne pas ajouter de marge horaire automatique entre les cours.
- Ne pas scoper le conflit sur `auth.uid()` : c'est l'enseignant **affecté** qui décide, sinon un
  responsable posant le planning d'autrui contrôlerait contre son propre agenda.
- Ne pas stocker les types de cours en dur (table `type_cours`).
- Ne pas parler à Supabase hors de la couche repository.
- Ne pas gater l'écriture d'une table de **gestion** sur `cours_lisibles()` : c'est un helper de
  **lecture**, et l'employer dans un `with check` rouvrirait l'écriture à l'enseignant.
- Ne pas faire relire à une policy de SELECT la table qu'elle protège (voir §5.10) : toute
  création avec `returning` cesserait de fonctionner.
- Ne pas se fier à `revoke <priv> (colonne)` : un privilège de colonne ne retire rien tant qu'un
  privilège de TABLE le couvre. Il faut retirer celui de la table, puis le réaccorder colonne par
  colonne — c'est ce qui protège `inscription.jeton`, `membre.role` et `invitation.code_hash`.
- Ne pas se fier non plus à `revoke … from public` sur une fonction : Supabase pose un
  `alter default privileges … grant execute on functions to authenticated`, qui est un privilège
  **nommé** et survit. Toujours révoquer explicitement `from public, anon, authenticated`, puis
  réaccorder ce qui doit l'être.
- Ne jamais donner à une fonction d'invitation un paramètre `centre_id` ou `role` : ce que le
  client peut nommer, il peut le forcer.
- Ne pas garder l'écriture pédagogique sur `cours_lisibles()` : pour un responsable, ce
  helper inclut les cours d'autrui. C'est `cours_enseignes()` — strictement
  `enseignant_id = auth.uid()`.
- Ne pas ajouter une colonne aux `grant` de `cours` sans se demander qui doit l'écrire :
  la liste est exactement ce que `enregistrer_cours` touche, et rien de plus.
- Ne pas réintroduire de propriétaire par compte : `owner_id` a disparu en 0015, et le tenant est
  le centre. Une isolation par `auth.uid()` rouvrirait tout ce que 0012 a refermé.
