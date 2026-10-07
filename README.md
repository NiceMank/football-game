# ⚽ eFootball Striker

Prototype de football arcade construit avec **React**, **TypeScript**, **Vite** et **Canvas 2D**.

## Gameplay actuellement opérationnel

Le moteur conserve la base Phase 0 (terrain monde **800 × 1200**, viewport **480 × 720**, quatre joueurs de champ et un gardien visuel par équipe, caméra clampée et contrôles clavier/tactiles) et propose :

- déplacement humain, dribble avec ballon maintenu devant/sur le côté, possession par joueur, récupération conditionnelle et verrou anti-bascule ;
- passes humaines orientées avec choix du partenaire selon la visée, la distance, la progression, l’espace et le couloir d’adversaires ; réception anticipée et changement automatique de joueur actif ;
- tirs chargés avec puissance, visée assistée, zone de tir parfait et distinctions de puissance ;
- **équipe adverse tactique** : quand elle défend, un seul joueur presse tandis que les autres couvrent les espaces, l’axe et les joueurs home ; le presser tente des tacles avec distance, réaction, cooldown et réussite probabiliste ;
- quand away récupère le ballon, elle passe en mode attaque : le porteur avance dans un couloir libre, peut passer sous pression à un coéquipier mieux placé, ou tirer près de la surface si l’angle et la pression le permettent ; les passes ont une précision variable et les tirs visent plusieurs zones du but ;
- changement immédiat de phase après perte/récupération et retour des joueurs non contrôlés home à leur formation ;
- buts, tirs à côté, pulsation de célébration en coordonnées monde et coup d’envoi à l’autre équipe.

### Difficulté adverse

Choix avant le match : **Amateur**, **Pro** ou **Légende**. La difficulté influe sur les délais de réaction et de décision, l’agressivité/portée du pressing, la sélection et la précision des passes, la précision des tirs et la réussite des tacles. Elle **n’augmente pas la vitesse des joueurs**.

La simulation utilise un pas fixe de `1/120 s` et toutes les vitesses/frictions sont intégrées avec `dt`. La friction du ballon reste `Math.pow(0.5, dt)`.

## Commandes

- **Déplacement clavier** : flèches, `WASD` ou `ZQSD`.
- **Action clavier** : pression courte sur `Espace`, `Entrée`, `J` ou `X` = passe ; maintenir puis relâcher = tir chargé. Relâcher dans la zone verte pour un tir parfait.
- **Mobile** : glisser sur le côté gauche pour déplacer le joueur ; appuyer brièvement sur **PASSE / TIR** pour passer ou maintenir le bouton pour charger un tir.
- **Pause / reprise** : `P`, `Échap` ou le bouton pause.
- **Recommencer** : `R`.

## Organisation du moteur

`src/game/engine.ts` contient l’état du match et la simulation : contrôle humain, IA adverse défensive/offensive, passe/réception, tir, collisions, possession, score, caméra et rendu Canvas. `src/App.tsx` conserve la couche React : entrées, boucle fixe, HUD, difficulté et interface tactile. `src/game/sfx.ts` fournit des sons Web Audio facultatifs.

Les joueurs adverses gardent leur vitesse définie ; la difficulté améliore les décisions et la qualité d’exécution plutôt que les statistiques de déplacement.

## Limites actuelles

Les gardiens sont dessinés mais n’ont pas encore de comportement de déplacement/parade. Pas de chronomètre, touches/corners ou règles complètes de match. Le système tactique porte sur les joueurs de champ.

## Lancer le projet

```bash
npm install
npm run dev
```

Build de production :

```bash
npm run build
```

L’audit de la base et les décisions de conservation de l’architecture sont documentés dans [`PHASE_0_ARCHITECTURE.md`](./PHASE_0_ARCHITECTURE.md).
