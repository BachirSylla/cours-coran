# Cours Coran

Application PWA de gestion des cours de Coran (planning hebdomadaire, apprenants, séances,
paiements). Les règles métier, le modèle de données et les conventions sont décrits dans
[CLAUDE.md](./CLAUDE.md) — à lire avant toute contribution.

## Stack

Vite · React · TypeScript strict · Tailwind CSS v4 · shadcn/ui · TanStack Query · Zustand ·
React Hook Form + Zod · React Router · date-fns · Supabase · vite-plugin-pwa · Vitest.

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs Supabase
npm run dev                  # http://localhost:5173
```

Le fichier `.env.local` est facultatif tant qu'aucun écran ne lit de données : le client
Supabase n'est instancié qu'au premier appel.

## Commandes

| Commande             | Rôle                                            |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Serveur de développement Vite                   |
| `npm run build`      | Vérification des types puis build de prod       |
| `npm run preview`    | Prévisualisation du build (PWA installable)     |
| `npm run lint`       | ESLint                                          |
| `npm run lint:fix`   | ESLint avec correction automatique              |
| `npm run format`     | Prettier (écriture)                             |
| `npm run typecheck`  | TypeScript seul                                 |
| `npm run test`       | Vitest (une passe)                              |
| `npm run test:watch` | Vitest en mode watch                            |
| `npm run gen:types`  | Types Supabase → `src/shared/supabase/types.ts` |

## Déploiement (Vercel)

### Variables d'environnement

**Deux variables suffisent**, et elles seules sont lues par le code client :

| Variable                 | Où la trouver                                    |
| ------------------------ | ------------------------------------------------ |
| `VITE_SUPABASE_URL`      | Dashboard Supabase → Project Settings → Data API |
| `VITE_SUPABASE_ANON_KEY` | Idem (clé `anon` / `publishable`)                |

Elles sont **publiques par conception** : la clé anon est destinée au navigateur, ce sont les
policies RLS qui protègent les données. Les déclarer sur les trois environnements Vercel
(Production, Preview, Development).

`SUPABASE_DB_URL`, `E2E_EMAIL` et `E2E_PASSWORD` sont des variables **locales uniquement**
(migrations `psql`, génération de types, scripts de vérification). Elles ne sont référencées nulle
part dans `src/` et ne doivent **jamais** être ajoutées sur l'hébergeur — leur préfixe absent de
`VITE_` garantit de toute façon que Vite ne les injecterait pas dans le bundle.

### Build

```bash
npm run build      # tsc -b && vite build → dist/
```

Une erreur de type fait échouer le déploiement, ce qui est voulu.

### Fallback SPA

[vercel.json](./vercel.json) réécrit toutes les URL vers `/index.html` : sans cela, recharger
directement `/paiements` renverrait un 404, puisque seule cette page existe côté serveur. Vercel
consulte le **système de fichiers avant** d'appliquer les rewrites, donc `assets/`, `sw.js`,
`registerSW.js` et `manifest.webmanifest` sont servis tels quels et jamais interceptés.

Les en-têtes du même fichier interdisent la mise en cache du service worker (sans quoi une
nouvelle version de l'application ne serait jamais détectée) et autorisent au contraire un cache
long sur les assets, qui portent un hash dans leur nom.

Deux en-têtes supplémentaires visent `/c/*`, la page de cours partagée. Son URL **contient le
jeton de partage**, donc :

- `X-Robots-Tag: noindex, nofollow` — un lien envoyé sur WhatsApp ne doit pas finir dans un index
  de moteur de recherche ;
- `Referrer-Policy: no-referrer` — le jeton ne doit pas partir dans l'en-tête `Referer` vers un
  site tiers. Les liens sortants de la page portent aussi `rel="noreferrer"`.

Le format de `vercel.json` n'admet pas de commentaires : c'est pourquoi ils sont ici.

### Supabase — à faire une fois

1. **Migrations** : appliquer `supabase/migrations/*.sql` dans l'ordre sur le projet de production
   (voir la section « Base de données » ci-dessous).
2. **Compte enseignant** : le créer via le dashboard (voir « Compte enseignant »).
3. **Redirect URLs** : Authentication → URL Configuration → ajouter l'URL Vercel dans
   _Site URL_ et _Redirect URLs_.
4. **Inscriptions publiques** : les laisser désactivées (l'app est mono-utilisateur).

## Base de données

Le schéma vit dans [supabase/migrations/](./supabase/migrations/) — migrations idempotentes,
rejouables. Appliquer `0001_init.sql` de l'une de ces façons :

```bash
# A — connexion directe (chaîne Session pooler dans .env.local)
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql

# B — CLI Supabase
npx supabase login                                       # une seule fois
npx supabase link --project-ref aiqdbgbbvledpahigyjr
npx supabase db push
```

Option C : coller le contenu du fichier dans le **SQL Editor** du dashboard.

Régénérer les types après toute modification du schéma :

```bash
npm run gen:types                                        # nécessite supabase login
# ou, sans login :
npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/shared/supabase/types.ts
```

`src/shared/supabase/types.ts` est **généré** — ne pas l'éditer à la main.

### Ce que le rôle `anon` peut faire

Rien, ou presque, et c'est vérifiable. La migration `0007_partage.sql` retire à `anon` les droits
que Supabase accorde par défaut sur toutes les tables du schéma `public` : la RLS n'est donc plus
la seule couche de protection, les privilèges le sont aussi. Sa seule porte est
`public.cours_public(uuid)`, qui sert la page de cours partagée.

Pour le vérifier à tout moment :

```sql
-- Attendu : tout à false.
select c.relname, has_table_privilege('anon', c.oid, 'select') as anon_select
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 1;

-- Attendu : true uniquement sur cours_public(uuid).
select p.oid::regprocedure, has_function_privilege('anon', p.oid, 'execute')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 1;
```

## Compte enseignant

L'application est **mono-utilisateur** : un seul compte, créé à la main. Il n'existe
volontairement **aucune page d'inscription** et aucune fonction `signUp` dans le code.

1. Dashboard Supabase → **Authentication → Users → Add user → Create new user**.
2. Saisir l'e-mail et le mot de passe, et **cocher « Auto Confirm User »**. Sans cette case, la
   connexion échoue tant que l'adresse n'est pas confirmée par e-mail.
3. Recommandé — fermer la porte aux inscriptions publiques : **Authentication → Sign In /
   Providers → Email → « Allow new users to sign up » = off**. Les policies RLS isolent déjà les
   données par `owner_id`, mais autant qu'aucun compte parasite ne puisse être créé.

Aucun mot de passe n'est stocké dans le dépôt. La session est conservée par Supabase dans le
`localStorage` du navigateur et rafraîchie automatiquement.

Toutes les routes sauf `/login` sont protégées par la garde
[`RequireAuth`](./src/features/auth/RequireAuth.tsx) : sans session, l'application redirige vers
l'écran de connexion en mémorisant la page demandée.

## Structure

```
src/
  app/        bootstrap, providers, routes, layout
  features/   une fonctionnalité = un dossier (apprenants, cours, séances, paiements, planning)
  shared/
    ui/       composants shadcn/ui partagés
    lib/      helpers (dates, formatage, conflits)
    supabase/ client + types générés + repositories par entité
  styles/     feuille Tailwind + thème
```

Ajouter un composant shadcn/ui : `npx shadcn@latest add <composant>` (atterrit dans
`src/shared/ui/` grâce aux alias de `components.json`).

## État d'avancement

Par rapport à la roadmap du [CLAUDE.md](./CLAUDE.md) §7 :

- **MVP** — cours, créneaux, apprenants, détection de conflit, grille hebdomadaire, lien Meet.
- **V1** — inscriptions, génération des séances au fil de l'eau, saisie contenu / exercices /
  présence, progression cumulée par apprenant.
- **V2** — paiements mensuels et tableau de bord (consultation seule, sans relance).
- **V3** — à faire : rappels de cours, séances reportées et rattrapages, cache offline.

L'i18n prévue au §3 n'est pas en place : les textes sont en français dans les composants.
