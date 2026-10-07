# Audit et architecture — Phase 0

## Audit du dépôt avant cette phase

### `src/game/engine.ts`

Le moteur précédent concentrait dans une seule classe les coordonnées du terrain, l’état des joueurs et du ballon, la boucle de match, la gestion des entrées, les tactiques IA, les tirs, les deux gardiens, les buts, les pickups, les combos, les particules et tout le dessin Canvas. Les responsabilités s’étaient accumulées au fil des fonctionnalités et le HUD dépendait de cet état d’arcade (chrono, jauge de tir, stamina, effets). C’était une mauvaise base pour ajouter progressivement les systèmes d’un match.

### `src/App.tsx`

Le composant gérait correctement l’interface React, les touches, le joystick tactile et une simulation à pas fixe de `1/120 s`. En revanche, il connaissait les anciens concepts de gameplay (tir, dash, difficulté, records, combos et bonus), ce qui le liait fortement au moteur et rendait un changement de modèle coûteux. Le Canvas conservait déjà un viewport fixe avec gestion du DPR.

### Audio et présentation

- `src/game/sfx.ts` synthétisait plusieurs sons d’arcade par Web Audio, notamment du bruit et des temporisations. Il utilisait aussi un cast `any` pour la compatibilité audio ancienne.
- `src/index.css` est volontairement minimal et Tailwind est chargé par Vite.
- `src/main.tsx` ne fait que monter React en `StrictMode` : aucune logique de jeu n’y est mélangée.
- `src/utils/cn.ts` est un utilitaire de classes générique et n’est pas utilisé par l’écran de jeu actuel.
- `vite.config.ts` configure React, Tailwind, le build single-file et l’hôte de l’aperçu ; ces éléments ne sont pas spécifiques au gameplay.

## Décisions de conservation / refactorisation

### Conservé

- React comme couche d’interface, séparée de la simulation.
- Canvas 2D, viewport `480 × 720` et rendu haute densité.
- Boucle fixe avec accumulateur et `dt` en secondes.
- Clavier, joystick tactile, pause/reprise et feedback audio facultatif.
- Vite, Tailwind, `main.tsx`, utilitaire `cn.ts` et réglage d’hôte de l’aperçu.

### Réécrit ou retiré de la base jouable

- Le moteur monolithique a été réduit à des responsabilités explicites : contrôle du joueur, maintien des formations, limites, collisions, physique du ballon, possession, kickoff, caméra et dessin du monde.
- Le HUD et les entrées React ne référencent plus le système de tir/charge, le dash, le chrono d’arcade, les vagues, les records, les combos ou les pickups.
- Les comportements de pressing/dribble/passe de l’IA et le plongeon/parade/capture des gardiens ont été retirés pour cette phase ; les joueurs adverses restent en formation et les gardiens dans leur zone.
- Les effets particules, textes flottants et animations de célébration ne sont pas utilisés dans la base minimale.
- L’audio a été réduit à quelques tonalités optionnelles et ne bloque jamais la simulation.

## Architecture maintenant en place

- **État du match** : phase, score, possession et équipe qui reprend après un but dans `Game`.
- **Coordonnées** : `W`/`H` pour le viewport ; `PITCH_W`/`PITCH_H` pour le monde.
- **Entités** : `FootballPlayer`, `Goalkeeper` et `FootballBall` sont des structures distinctes ; chaque équipe de champ compte quatre joueurs et possède son gardien séparé.
- **Contrôle** : le porteur home est sélectionné ; sinon `updateActivePlayer()` choisit le home le plus proche du ballon. La sélection est isolée pour pouvoir ajouter un changement manuel ultérieurement.
- **Simulation** : `update()` orchestre les systèmes ; chaque déplacement et ralentissement dépend de `dt`. Les collisions de joueurs sont résolues sans créer de listes temporaires par frame.
- **Caméra et rendu** : la caméra suit l’action avec interpolation et clamp. Le rendu applique la translation monde, dessine le terrain et les entités, puis restaure le contexte ; le HUD React reste attaché au viewport.
- **Interface** : `App.tsx` gère uniquement les contrôles, le cycle React, le HUD de base et l’appel du moteur.

## Limites volontaires de la Phase 0

Il n’y a pas encore de passe, de tir, de commandes d’action, de tactique IA, de gardien réactif ni de durée de match. Le ballon peut être porté, se libérer sur un contact adverse, rouler et être récupéré ; une entrée dans un but met à jour le score et lance le kickoff de l’équipe adverse. Ces systèmes seront ajoutés séparément, une fois la base validée.
