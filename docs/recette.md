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
