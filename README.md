# ⚽ eFootball Striker

Un jeu de football d’arcade dynamique et addictif, jouable directement dans le navigateur sur desktop et mobile.

Développé avec **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4** et un moteur de rendu haute performance en **HTML5 Canvas**.

---

## 🎮 Fonctionnalités

- **Match arcade 5v5 sur terrain complet**, avec ligne médiane, deux surfaces de réparation, deux buts et caméra à défilement fluide.
- **Équipe du joueur** : quatre joueurs de champ, sélection automatique du joueur le plus proche du ballon et soutien des coéquipiers.
- **Passes et frappes** :
  - Appui bref sur le bouton d’action pour passer vers un coéquipier dans la direction visée.
  - Maintien puis relâchement pour charger et tirer ; jauge de puissance et *Perfect Shot*.
  - Le receveur d’une passe est sélectionné automatiquement et se place sur sa trajectoire.
- **IA adverse** : pressing et repli défensif, courses avec le ballon, recherche de passes libres et tirs vers le but du joueur.
- **Deux gardiens** : fermeture d’angle, plongeons vers l’intersection prévue, parades et prises de balle suivies d’une relance.
- **Gameplay d’arcade** :
  - Dribbles réactifs et esquives (Dash) avec jauge d'endurance
  - Système de combo et multiplicateurs de score en chaîne
  - Buts qui modifient le chronomètre et la difficulté qui progresse
- **Bonus & Objets à ramasser** :
  - ⏱️ **+Temps** : secondes bonus ajoutées au chrono
  - ⚡ **Vitesse** : boost d'accélération
  - ⭐ **Score x2** : double tous les points marqués
  - 🧲 **Aimant** : attire automatiquement le ballon à vos pieds
- **3 Niveaux de difficulté** :
  - **Amateur** : Défense plus lente, gardien généreux, temps accru.
  - **Pro** : Le défi d’arcade standard équilibré.
  - **Légende** : Pressing intensif, gardien d'élite et angles très fermés.
- **Effets sonores (SFX synthétisés avec Web Audio API)** : Tirs, poteaux, sifflet d'arbitre, clameur du public et célébrations sans dépendance à des fichiers audio externes.
- **Tableau des meilleurs scores (Highscores)** sauvegardé localement en `localStorage`.
- **Contrôles polyvalents** : Clavier complet ou tactile avec joystick virtuel et bouton de frappe sur mobile/tablette.

---

## 🕹️ Commandes de jeu

### Sur Clavier / PC

| Action | Touches |
|---|---|
| **Déplacement** | Touches directionnelles / `Z, Q, S, D` ou `W, A, S, D` |
| **Passe / Tir** | Appui bref (`< 250 ms`) / maintenir `Espace`, `J`, `X` ou `Entrée` |
| **Dash (Accélération / Esquive)** | `Shift` (Maj), `K` ou `L` |
| **Pause** | `Échap` ou `P` |
| **Recommencer** | `R` |

### Sur Écran Tactile / Mobile

- **Joystick virtuel** : Touchez et glissez sur le côté gauche de l'écran.
- **Bouton d’action** : Appui bref pour passer dans la direction du joystick ; maintenez puis relâchez pour tirer.
- **Bouton Dash** : Appuyez pour une accélération fulgurante.

---

## 🚀 Installation et Lancement

### Prérequis

- [Node.js](https://nodejs.org/) (version 18 ou supérieure recommandée)
- npm

### 1. Cloner le dépôt

```bash
git clone https://github.com/NiceMank/football-game.git
cd football-game
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Lancer le serveur de développement

```bash
npm run dev
```

Ouvrez l'URL affichée (habituellement `http://localhost:5173`) dans votre navigateur.

### 4. Compiler pour la production

```bash
npm run build
```

Les fichiers générés se trouveront dans le dossier `dist/`.

---

## 🛠️ Stack Technique

- **Framework UI** : [React 19](https://react.dev/)
- **Langage** : [TypeScript](https://www.typescriptlang.org/)
- **Bundler** : [Vite](https://vitejs.dev/)
- **Styles** : [Tailwind CSS v4](https://tailwindcss.com/)
- **Rendu graphique** : HTML5 2D Canvas API
- **Audio** : Web Audio API (synthèse sonore procédurale)
- **Déploiement single-file** : `vite-plugin-singlefile`

---

## 📄 Licence

Ce projet est sous licence MIT.
