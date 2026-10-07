# ⚽ eFootball Striker

Un jeu de football d’arcade dynamique et addictif, jouable directement dans le navigateur sur desktop et mobile.

Développé avec **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4** et un moteur de rendu haute performance en **HTML5 Canvas**.

---

## 🎮 Fonctionnalités

- **Moteur de jeu sur Canvas 2D fluide (60 FPS)** avec physique de balle réaliste, effets de rotation (spin) et rebonds.
- **Système de tir avancé** :
  - Barre de jauge de puissance dynamique
  - *Perfect Shot* (tir parfait dans la zone dorée) pour des frappes foudroyantes et imparables
  - Tirs lobés et tirs brossés
- **Gameplay d’arcade complet** :
  - Dribbles réactifs et esquives (Dash) avec jauge d'endurance
  - Gardien de but intelligent avec plongeons et arrêts réflexes
  - Défenseurs adverses qui pressent et tentent de vous subtiliser le ballon
  - Système de combo et multiplicateurs de score en chaîne
  - Vagues d'attaque successives avec montée progressive de la difficulté
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
| **Charger / Tirer** | `Espace`, `J`, `X` ou `Entrée` |
| **Dash (Accélération / Esquive)** | `Shift` (Maj), `K` ou `L` |
| **Pause** | `Échap` ou `P` |
| **Recommencer** | `R` |

### Sur Écran Tactile / Mobile

- **Joystick virtuel** : Touchez et glissez sur le côté gauche de l'écran.
- **Bouton Tir** : Maintenez pour charger la puissance, relâchez pour déclencher la frappe.
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
