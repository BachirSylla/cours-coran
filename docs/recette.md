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
