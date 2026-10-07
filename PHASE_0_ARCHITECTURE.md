# Audit et architecture du moteur

## Base Phase 0 — audit historique

La Phase 0 avait isolé le terrain, les entités, le déplacement, le ballon, la possession, la caméra et le rendu Canvas dans `src/game/engine.ts`. `src/App.tsx` gardait l’interface, les entrées et la boucle fixe de `1/120 s`. Cette base a été conservée pour le gameplay : l’architecture n’a pas été remplacée.

Le premier audit avait également relevé que l’ancien prototype historique mélangeait gameplay et systèmes d’arcade (chrono, stamina, combos, bonus, effets et nombreuses mécaniques d’IA). Ces systèmes ne font pas partie du moteur actuel.

## Architecture conservée

- **Interface et entrées** : React, clavier, joystick tactile, pause/reprise et HUD dans `src/App.tsx`.
- **Simulation** : `Game.update(dt, input)` orchestre les systèmes à pas fixe ; les déplacements, timers et frictions utilisent `dt`, sans dépendance au nombre d’images par seconde.
- **Coordonnées et rendu** : monde `800 × 1200`, viewport `480 × 720`, Canvas 2D et caméra lissée/clampée. Les effets de but sont dessinés dans le monde après la transformation caméra.
- **Entités** : structures séparées `FootballPlayer`, `Goalkeeper` et `FootballBall`; quatre joueurs de champ et un gardien visuel par équipe.
- **Audio** : sons Web Audio optionnels dans `src/game/sfx.ts`; l’absence d’audio ne bloque pas la simulation.

## Systèmes de gameplay ajoutés

- **Contrôle du ballon** : le joueur propriétaire est le joueur actif. Le dribble maintient le ballon dans une zone devant/sur le côté, avec un léger retard contrôlé à la course. Les récupérations appliquent un verrou court contre les changements de propriétaire répétés.
- **Passe** : une pression courte sélectionne un partenaire par direction visée, angle, distance, progression, espace libre et couloir d’adversaires. Le ballon est légèrement dirigé vers la trajectoire anticipée du destinataire.
- **Réception** : la cible de passe devient le joueur actif, se déplace vers une interception prédite et récupère le ballon lorsque celui-ci entre dans sa zone de contrôle. La possession est alors attribuée à son identifiant.
- **Tir** : une pression maintenue charge la puissance; le joueur relâche pour tirer. La vitesse dépend de la charge, la visée est influencée par l’orientation et bénéficie d’une assistance proportionnée à la distance du but. Une plage de charge dédiée déclenche un tir parfait.
- **Buts et relance** : le score augmente seulement lorsque le ballon franchit l’ouverture entre les poteaux. Un tir à côté rebondit sur la ligne de fond. Après un but, un pulse Canvas en coordonnées monde accompagne la remise en jeu par l’équipe adverse.
- **Défense** : les adversaires se déplacent vers leurs formations, peuvent tacler et récupérer un ballon libre. Ils n’ont pas d’IA offensive complète.

## Responsabilités dans `Game`

`Game.update()` coordonne le déplacement du joueur actif, l’action passe/tir, le retour des autres joueurs à leur formation, les collisions, la physique du ballon, les récupérations, les buts, la caméra et le rendu. La sélection du joueur actif privilégie successivement le porteur home, le receveur d’une passe home en vol, puis le joueur home le plus proche du ballon.

Le ballon libre conserve la friction `Math.pow(0.5, dt)`. Les mouvements, timers et interpolations sont basés sur `dt`. Les boucles de collision et de sélection parcourent les tableaux existants sans construire de listes temporaires par frame.

## Limites volontaires

Les formations restent simplifiées; il n’y a pas de stratégie offensive adverse, de gardien réactif, de chrono, de touches/corners, ni de règles complètes de match. Le gardien est présent au rendu mais n’intercepte pas encore les tirs. Ces limites ne changent pas les systèmes de déplacement, possession, passe, réception, tir, but et remise en jeu décrits ci-dessus.
