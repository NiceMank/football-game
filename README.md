# ⚽ eFootball Striker

Prototype de football arcade construit avec **React**, **TypeScript**, **Vite** et **Canvas 2D**.

## État actuel — Phase 0

Cette étape fournit une base stable pour le futur match 5v5 :

- terrain monde de **800 × 1200** pixels dans un viewport **480 × 720** ;
- caméra fluide, clampée au terrain ;
- deux équipes de **quatre joueurs de champ et un gardien** ;
- déplacement clavier et joystick tactile ;
- joueur actif auto-sélectionné : porteur home, sinon joueur home le plus proche du ballon ;
- formations statiques pour les coéquipiers et l’équipe adverse ;
- physique élémentaire du ballon, limites, collisions et récupération de possession ;
- engagement au centre et remise en jeu après un but.

Les **passes, tirs, tactiques IA, plongeons de gardien, chronomètre, pickups et effets d’arcade** ne font volontairement pas partie de cette phase.

## Commandes

- **Déplacement clavier** : flèches, `WASD` ou `ZQSD`.
- **Déplacement tactile** : glisser sur la moitié gauche de l’écran.
- **Pause / reprise** : `P`, `Échap` ou le bouton pause.
- **Recommencer** : `R`.

## Organisation du moteur

`src/game/engine.ts` définit les structures `FootballPlayer`, `Goalkeeper` et `FootballBall`. `Game` orchestre les responsabilités de phase 0 dans des méthodes séparées : contrôle, formations, collisions, physique, possession, kickoff, caméra et rendu du monde. Les coordonnées du Canvas restent distinctes des coordonnées monde ; `App.tsx` se limite à l’interface, aux entrées et à la boucle fixe.

Un audit des fichiers et des décisions d’architecture est disponible dans [`PHASE_0_ARCHITECTURE.md`](./PHASE_0_ARCHITECTURE.md).

## Lancer le projet

```bash
npm install
npm run dev
```

Build de production :

```bash
npm run build
```

## Étapes suivantes

1. contrôle du ballon et passes ;
2. tirs et détection de buts plus complète ;
3. IA offensive/défensive ;
4. comportement des gardiens ;
5. match, HUD et réglages d’arcade.
