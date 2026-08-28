# Recette

Scénarios à dérouler à l'écran avant de pousser. Chacun se veut court et
vérifiable : une action, un résultat observable.

Prérequis : être connecté, avoir au moins un cours avec des séances saisies,
des apprenants inscrits et au moins une note d'examen.

---

## Notation par cours

Les réglages de notation vivent dans **Paramètres** (le centre) et peuvent être
**surchargés cours par cours**. Un champ laissé vide côté cours signifie
« hériter du centre » — c'est ce que dit son texte grisé.

### 1. Non-régression : un cours sans surcharge

1. Ouvrir un cours qui n'a jamais été réglé, déplier **Réglages spécifiques**.
2. Vérifier que **tous les champs sont vides** et que chacun annonce sa valeur
   héritée (« Hérité : 3 », « Hérité : 0,5 »…).
3. Exporter le rapport.

**Attendu** : le rapport est identique à celui d'avant l'ajout des surcharges —
mêmes notes, mêmes colonnes. C'est le point le plus important de cette recette.

### 2. Surcharger la part d'assiduité

1. Dans un cours, mettre **Part de l'assiduité** à `5`, enregistrer.
2. Exporter le rapport.

**Attendu** : la colonne d'assiduité est titrée « Assiduité /5 », et la colonne
de note académique « Note /15 ». La somme fait toujours 20 — la part académique
n'est jamais saisie, elle est ce qui reste.

### 3. Désactiver l'assiduité sur un cours

1. Mettre **Appliquer l'assiduité** à « Non », enregistrer.
2. Exporter le rapport.

**Attendu** :

- la colonne **Assiduité** disparaît de la grille de présence ;
- la colonne **Note** disparaît de la grille de notes — elle répéterait la note
  finale à l'identique ;
- la **note finale reste sur 20**, et vaut exactement la note académique. Un
  apprenant très absent n'est plus pénalisé.

Les comptages de présence (Prés. / Abs. / Ret. / %) restent affichés : ils
informent, ils ne notent plus.

### 4. Revenir à l'héritage

1. Vider les champs surchargés, remettre l'assiduité sur « Hérité », enregistrer.

**Attendu** : le rapport redevient celui du scénario 1.

---

## Logo par cours

Le logo du centre se règle dans **Paramètres → Logo du centre**. Chaque cours
peut lui substituer le sien.

### 5. Logo du centre

1. Dans Paramètres, charger une image **large** (par exemple 800 × 200).
2. Vérifier l'aperçu, puis exporter le rapport d'un cours.

**Attendu** : le logo apparaît à gauche du titre, à hauteur fixe, **sans
déformation** et sans chevaucher le titre. Recommencer avec une image **carrée**
et vérifier qu'elle ne se déforme pas non plus.

### 6. Logo propre à un cours

1. Dans un cours, déplier **Réglages spécifiques** et charger un autre logo.
2. Exporter le rapport de ce cours, puis celui d'un autre cours.

**Attendu** : le premier rapport porte le logo du cours, le second celui du
centre.

### 7. Revenir au logo du centre

1. Cliquer **Revenir au logo du centre**.

**Attendu** : l'aperçu disparaît, le texte « Hérité : le logo du centre »
réapparaît, et le rapport reprend le logo du centre.

### 8. Fichier refusé

1. Tenter de charger un fichier de plus de 8 Mo.

**Attendu** : un message explique le refus, et **rien n'est enregistré**. Les
formats autres que PNG, JPEG et WebP ne sont même pas proposés par la boîte de
dialogue du système.

---

## Impression

### 9. Sortie papier

1. Depuis le rapport, cliquer **Imprimer / Enregistrer en PDF**.

**Attendu** : une A4 **paysage**, les aplats de couleur présents (états de
présence, note finale), le logo visible, aucune colonne coupée. Refaire l'essai
en **thème sombre** : la feuille doit rester blanche.

---

## Rôles et centre (migration 0012)

Les données appartiennent désormais au **centre**, et un **rôle** décide de ce
que chacun voit. Un enseignant seul est responsable **et** enseignant de son
propre centre : rien ne doit changer pour lui.

Les scénarios 10 à 12 se déroulent avec un compte responsable — c'est le cas
d'aujourd'hui. Les scénarios 13 et 14 demandent un second compte, créé à la main
(voir plus bas).

### 10. Non-régression : le compte actuel

1. Se connecter normalement et parcourir Planning, Cours, Séances, Apprenants,
   Paiements, Paramètres.
2. Créer un cours, le modifier, saisir une séance et une présence, exporter un
   rapport.

**Attendu** : rigoureusement le comportement d'avant. C'est le point le plus
important de cette recette — le passage au modèle centre/rôles ne doit se voir
nulle part pour un enseignant seul.

### 11. Le garde-fou de chevauchement tient toujours

1. Créer un cours dont un créneau chevauche celui d'un cours existant.

**Attendu** : le refus nomme le cours en conflit (« Ce créneau chevauche le
cours « … » »), et **rien n'est enregistré**. Le périmètre du conflit est
désormais le centre — identique tant qu'il n'y a qu'un enseignant.

### 12. Le barème de récitation est personnel

1. Dans **Paramètres**, passer le barème de notation sur 10, puis saisir une
   note de récitation.

**Attendu** : le barème suit. C'est **votre** choix : il ne s'impose pas aux
autres enseignants du centre, et les notes déjà données gardent le leur.

### 13. Un compte enseignant ne gère pas

Créer le second compte dans le dashboard Supabase (Authentication → Add user),
puis l'inscrire au centre en SQL :

```sql
insert into public.membre (centre_id, user_id, role, nom_affiche)
values ((select id from public.centre limit 1), '<uuid du compte>', 'enseignant', 'Prénom Nom');

update public.cours set enseignant_id = '<uuid du compte>' where libelle = '<un cours>';
```

Se connecter avec ce compte.

**Attendu** :

- **Cours** ne liste que les cours qui lui sont affectés, sans « Nouveau cours »,
  ni « Modifier », ni « Supprimer » ;
- dans le détail d'un cours : ni prix, ni partage, ni note d'examen, ni réglages,
  ni règlements ; la liste des apprenants est visible mais **non modifiable** ;
- **Paiements** a disparu de la navigation, et l'URL `/paiements` répond
  « Réservé au responsable » ;
- **Paramètres** annonce « Consultation seule » — mais le **barème de
  récitation reste modifiable** ;
- séances, présences et notes de récitation se saisissent normalement.

### 14. Étanchéité entre enseignants

Avec un second enseignant affecté à un autre cours, et un apprenant inscrit aux
deux cours :

**Attendu** : chaque enseignant voit **l'identité** de l'apprenant partagé, mais
aucune note ni présence prise par l'autre. Le responsable, lui, voit les deux.

La preuve automatisée de tout cela vit dans `supabase/tests/rls_etancheite.sql` :

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_etancheite.sql
```

Il monte son propre décor, l'éprouve identité par identité, et **annule tout** à
la fin. Succès = « TOUTES LES ASSERTIONS PASSENT ».

---

## Conflit d'horaire par enseignant (migration 0013)

La ressource rare est **l'enseignant**, pas le centre : nul ne peut être à deux
endroits à la fois, mais deux enseignants tiennent très bien cours à la même
heure. Le scénario 15 se déroule avec le compte actuel ; les scénarios 16 et 17
demandent le second compte du scénario 13.

### 15. Non-régression : un seul enseignant

1. Créer un cours dont un créneau chevauche celui d'un cours existant.
2. Créer un cours dont le créneau **commence exactement à l'heure où** un autre
   se termine (11:00–12:00 après 10:00–11:00).

**Attendu** : le premier est refusé et nomme le cours en travers (« Ce créneau
chevauche le cours « … » »), le second passe. Le refus apparaît **avant même de
soumettre**, en rouge sous la ligne du formulaire — et le serveur le refuse
aussi si l'on force. Rien ne doit avoir changé par rapport à hier.

### 16. Deux enseignants au même horaire

Prérequis : un cours affecté à l'enseignant du scénario 13.

```sql
update public.cours set enseignant_id = '<uuid du second compte>' where libelle = '<un cours>';
```

1. En responsable, créer un nouveau cours au **même jour et à la même heure** que
   ce cours-là.

**Attendu** : **aucun conflit**, ni dans l'aperçu du formulaire, ni au moment
d'enregistrer. Dans le planning, les deux blocs se placent côte à côte **sans
bordure rouge** et sans bandeau d'alerte.

### 17. Le contrôle vise l'enseignant affecté, pas soi-même

1. Toujours en responsable, **modifier** le cours affecté à l'autre enseignant
   et lui donner un créneau qui chevauche un **autre** cours de cette même
   personne.

**Attendu** : refus, et le message **nomme l'enseignant** (« Amina est déjà pris
sur ce créneau : il chevauche le cours « … » »). C'est bien son agenda qui
décide, alors que c'est vous qui agissez. Sur vos propres cours, le message
reste celui du scénario 15, sans nom.

La preuve automatisée vit dans `supabase/tests/conflit_enseignant.sql` :

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/conflit_enseignant.sql
```

---

## Affectation d'un cours à un enseignant (migration 0014)

Le sélecteur **Enseignant** n'apparaît dans le formulaire de cours que si le
centre compte **plus d'un membre** : l'enseignant seul n'a pas à choisir entre
lui-même et lui-même.

### 18. Non-régression : centre à une personne

1. Ouvrir **Nouveau cours**.

**Attendu** : aucun sélecteur « Enseignant ». Le cours créé vous est affecté,
comme avant.

### 19. Affecter, et voir l'agenda changer

Prérequis : le second compte du scénario 13.

1. Ouvrir **Nouveau cours** : le sélecteur **Enseignant** apparaît, positionné
   sur vous.
2. Poser un créneau **déjà occupé par l'un de vos cours** → l'alerte de conflit
   s'affiche sous la ligne, et le bouton d'enregistrement se désactive.
3. Sans rien toucher d'autre, basculer le sélecteur sur l'autre enseignant.

**Attendu** : l'alerte **disparaît immédiatement**. C'est bien l'agenda de la
personne visée qui est contrôlé, pas le vôtre. Enregistrer fonctionne.

### 20. Réaffecter un cours existant

1. Modifier un cours et changer son enseignant, puis enregistrer.
2. Rouvrir le cours : le sélecteur montre le nouvel enseignant.
3. Se connecter avec ce compte : le cours apparaît dans **sa** liste, et
   disparaît de celle de l'ancien enseignant.

**Attendu** : ⚠️ réaffecter **ne revalide pas rétroactivement** le reste du
planning. Le contrôle porte sur les créneaux du cours qu'on enregistre, à cet
instant : si le nouvel enseignant avait déjà un cours sur ce créneau, le refus
tombe tout de suite ; en revanche, les autres cours déjà posés ne sont pas
réexaminés. Le prochain enregistrement de chacun d'eux le fera.

### 21. On n'affecte pas hors du centre

Le sélecteur ne liste que les membres du centre, et la base refuserait de toute
façon : la clé étrangère composite `(enseignant_id, centre_id)` l'interdit
structurellement. Éprouvé par `supabase/tests/rls_etancheite.sql`.

---

## Cohérence de l'interface par rôle

### 22. Ce que voit un enseignant

Avec le compte du scénario 13 :

**Attendu**, écran par écran :

| Écran             | Ce qu'il voit                                    | Ce qu'il ne voit pas                                  |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------- |
| Navigation        | Planning, Cours, Séances, Apprenants, Paramètres | **Paiements**                                         |
| Cours             | ses seuls cours affectés                         | Nouveau cours, Modifier, Supprimer                    |
| Détail d'un cours | apprenants, séances, rapport                     | prix, partage, examen, réglages, règlements, Modifier |
| Apprenants        | l'identité de ceux inscrits à ses cours          | Nouvel apprenant, Modifier, Supprimer                 |
| Séances           | saisie complète : présence, notes, contenu       | —                                                     |
| Paramètres        | **son** barème de récitation, modifiable         | notation du centre, logo du centre                    |

**Aucun lien mort** : `/paiements` tapé à la main répond « Réservé au
responsable » plutôt qu'un tableau vide.

### 23. Le barème est personnel

1. En enseignant, passer le barème sur 10 dans **Paramètres**, puis saisir une
   note de récitation.
2. Se reconnecter en responsable et ouvrir **Paramètres**.

**Attendu** : le responsable garde **son** barème — celui de l'enseignant ne
s'est imposé à personne. Et l'enseignant ne peut modifier ni son rôle, ni son
centre, ni le barème d'un collègue : la base le refuse, pas seulement l'écran.

---

## Suppression de `owner_id` (migration 0015)

L'ancien porteur du tenant, conservé en filet depuis la migration 0012, a été
supprimé. C'est le seul acte irréversible de la série.

### 24. Non-régression après suppression

1. Reprendre le scénario 10 de bout en bout avec le compte responsable.
2. Créer un cours, un apprenant, une inscription, une séance, une présence, un
   règlement, puis exporter un rapport.

**Attendu** : rien ne change. `owner_id` n'était plus lu par personne depuis
0012 — ni policy, ni code client, ni index actif.

### 25. Un compte supprimé n'emporte plus les données

Ce point n'est **pas** à tester en production. Il est mentionné parce que c'est
le gain de la migration : `owner_id` référençait `auth.users` en
`on delete cascade`, si bien que supprimer le compte effaçait cours, apprenants
et séances. Les données appartiennent maintenant au centre, qui survit à ses
membres.

À rejouer après la migration :

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_etancheite.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/conflit_enseignant.sql
```
