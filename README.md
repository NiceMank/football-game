# ⚽ eFootball Striker

Prototype de football arcade construit avec **React**, **TypeScript**, **Vite** et **Canvas 2D**.

## Gameplay actuellement opérationnel

Le moteur conserve la base Phase 0 (terrain monde **800 × 1200**, viewport **480 × 720**, équipes de quatre joueurs de champ et un gardien, caméra clampée et contrôles clavier/tactiles) et ajoute le cœur jouable du match :

- déplacement du joueur actif et dribble avec ballon légèrement devant/sur le côté, qui s’étire à la course puis revient sous contrôle ;
- possession attribuée à un joueur, récupération conditionnelle et courte protection anti-bascule lors d’un nouveau contrôle ;
- passe courte sur pression brève : le moteur choisit un coéquipier selon l’orientation visée, la distance, la progression, l’espace libre et les adversaires dans la ligne ; la trajectoire est légèrement assistée ;
- réception assistée : le destinataire devient le joueur actif, anticipe le ballon et le contrôle si la trajectoire passe à proximité ;
- tir chargé sur pression maintenue, avec puissance influencée par la charge, la visée/l’orientation et la distance du but ; la zone verte de charge permet de déclencher un tir parfait ;
- buts détectés uniquement lorsque le ballon franchit l’ouverture, score mis à jour, pulsation de but en coordonnées monde puis coup d’envoi à l’autre équipe ;
- adversaires capables de se déplacer, défendre, tacler et récupérer le ballon. Ils n’ont pas encore d’IA offensive complète.

La simulation utilise un pas fixe de `1/120 s` et toutes les vitesses/frictions sont intégrées avec `dt`. La friction du ballon reste `Math.pow(0.5, dt)`.

## Commandes

- **Déplacement clavier** : flèches, `WASD` ou `ZQSD`.
- **Action clavier** : pression courte sur `Espace`, `Entrée`, `J` ou `X` = passe ; maintenir puis relâcher = tir chargé. Relâcher dans la zone verte pour un tir parfait.
- **Mobile** : glisser sur le côté gauche pour déplacer le joueur ; appuyer brièvement sur le bouton **PASSE / TIR** pour passer ou le maintenir pour charger un tir.
- **Pause / reprise** : `P`, `Échap` ou le bouton pause.
- **Recommencer** : `R`.

## Organisation du moteur

`src/game/engine.ts` contient les structures joueurs/ballon ainsi que la simulation, la sélection du joueur actif, les passes/tirs, les réceptions, les collisions, le score, la caméra et le rendu Canvas. `src/App.tsx` conserve la couche React : entrées, boucle fixe, HUD et interface tactile. `src/game/sfx.ts` fournit des sons Web Audio facultatifs.

La passe ne choisit pas simplement le coéquipier le plus proche : elle évalue le produit scalaire avec la direction visée, la progression vers le but, l’espace autour du receveur et la proximité des adversaires dans le couloir de passe.

## Limites actuelles

Les joueurs adverses reviennent à leurs formations et défendent par proximité/tacle ; ils n’organisent pas de construction offensive. Les gardiens sont dessinés mais n’ont pas encore de comportement de parade/détente. Pas de chronomètre de match ni de règles de touche/corner.

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
