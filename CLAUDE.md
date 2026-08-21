# CLAUDE.md — Application de gestion des cours (Coran)

> Fichier de référence pour Claude Code. Il décrit le projet, les règles métier, la
> stack, l'architecture et les conventions. **À lire avant toute tâche.**

## 1. Vue d'ensemble

Application **PWA** permettant à un enseignant **unique** de gérer ses cours en ligne
(initiation à la lecture du Coran, lecture, mémorisation), donnés en **individuel** ou en
**groupe**. Objectifs de qualité : **évolutive, modulaire, bien structurée, et soignée
visuellement**. Accès **multi-appareils** (téléphone, tablette, PC) synchronisé.

Problème n°1 à résoudre : **ne jamais placer deux cours sur le même créneau** (l'enseignant
est la ressource unique).

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

Toutes les tables : **RLS activé**, isolant les données au propriétaire (auth Supabase).
Les tables possédées portent `owner_id uuid not null default auth.uid()` référençant
`auth.users(id)`, plus `created_at` / `updated_at` (trigger automatique). `type_cours` est une
référence **globale** : pas de `owner_id`, lecture seule pour les utilisateurs authentifiés.

## 5. Règles métier (critiques)

1. **Détection de conflit** (enseignant unique) : deux **créneaux** entrent en conflit si
   `même jour_semaine ET heure_debut_A < heure_fin_B ET heure_debut_B < heure_fin_A`,
   tous cours confondus. **Pas de marge** entre les cours (début/fin fixes ; le débordement
   est hors système). Cette règle doit être **couverte par des tests Vitest**.
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
   séance. Elle additionne une part **académique** (l'examen de fin de session, `inscription`)
   et une part **assiduité**, dont les poids sont réglables et dont la **somme vaut toujours 20**
   (contrainte en base). L'assiduité part du maximum et retire une pénalité par absence et par
   retard, sans jamais descendre sous 0. Une **absence excusée ne pénalise pas** par défaut
   (`penaliser_absences_excusees`) — sinon la marquer n'aurait aucun sens ; une présence partielle
   n'est jamais pénalisée. Un apprenant sans note d'examen n'a pas 0 : la note finale vaut `null`.
   Ne compter que les présences de séances **réellement tenues** — `seance.statut` vaut aussi
   `annulee` et `reportee`.

## 6. Fonctionnalités

- Vue principale : **grille hebdomadaire** (jours × heures), blocs colorés, **conflit visible
  immédiatement** à la création/déplacement d'un cours.
- Fiches apprenants et cours (individuel/groupe via `inscription`).
- Saisie par séance : contenu abordé, exercices, présence, observations.
- Suivi pédagogique cumulé par apprenant (dernière leçon/page pour l'initiation ; dernière
  sourate+verset pour lecture/mémorisation) ; distinction nouveau vs révision (murâja'a) ;
  chaînage des exercices donnés → vérifiés.
- Paiements mensuels + tableau de bord (consultation seule).
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
- Ne pas stocker les types de cours en dur (table `type_cours`).
- Ne pas parler à Supabase hors de la couche repository.
