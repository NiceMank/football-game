# Audit et architecture du moteur

## Base Phase 0 — audit historique

La Phase 0 avait isolé le terrain, les entités, le déplacement, le ballon, la possession, la caméra et le rendu Canvas dans `src/game/engine.ts`. `src/App.tsx` gardait l’interface, les entrées et la boucle fixe de `1/120 s`. Cette base est conservée : le gameplay humain n’a pas été réécrit pour ajouter l’IA adverse.

Le premier audit avait relevé que l’ancien prototype historique mélangeait gameplay et systèmes d’arcade (chrono, stamina, combos, bonus, effets et nombreuses mécaniques d’IA). Ces systèmes ne font pas partie du moteur actuel.

## Architecture conservée

- **Interface et entrées** : React, clavier, joystick tactile, bouton d’action, pause/reprise et HUD dans `src/App.tsx`.
- **Simulation** : `Game.update(dt, input)` orchestre les systèmes à pas fixe ; les déplacements, timers et frictions utilisent `dt`, sans dépendance au nombre d’images par seconde.
- **Coordonnées et rendu** : monde `800 × 1200`, viewport `480 × 720`, Canvas 2D et caméra lissée/clampée. Les effets de but sont dessinés dans le monde après la transformation caméra.
- **Entités** : structures séparées `FootballPlayer`, `Goalkeeper` et `FootballBall`; quatre joueurs de champ et un gardien visuel par équipe.
- **Audio** : sons Web Audio optionnels dans `src/game/sfx.ts`; l’absence d’audio ne bloque pas la simulation.

## Systèmes de gameplay

- **Contrôle humain et possession** : le porteur home est contrôlé par le joueur ; en passe home, le destinataire devient le joueur actif et anticipe la trajectoire. Le dribble maintient le ballon dans une zone devant/sur le côté. Les récupérations appliquent un verrou court.
- **Équipe adverse en défense** : un seul joueur est désigné presser (ou attaquer une balle neutre) ; il approche selon la portée de pressing et tente le tacle après un temps de réaction, avec distance minimale/maximale, cooldown et probabilité. Les autres joueurs restent dans un bloc compact, protègent l’axe et se décalent pour surveiller les joueurs home.
- **Équipe adverse en attaque** : après récupération, le porteur choisit une zone de progression libre. Il évalue pression, options de passe, espaces, angles et couloirs occupés ; il passe sous pression à un partenaire mieux placé, anticipe les passes reçues et tire à portée de la surface si l’angle et la pression sont favorables. Les tirs varient de puissance, de zone visée et d’imprécision.
- **Transitions** : la possession `home` / `away` / `neutral` commande l’état adverse ; une perte fait revenir away en défense, une récupération lance l’attaque, et les home non contrôlés reprennent leurs formations.
- **Difficulté** : Amateur, Pro et Légende modifient réaction, cadence de décision, portée/agressivité du pressing, qualité de sélection et précision des passes/tirs, et probabilité de tacle. Les vitesses des joueurs ne changent pas avec le niveau.
- **Buts et relance** : le score augmente seulement lorsque le ballon franchit l’ouverture ; un tir à côté rebondit sur la ligne de fond. Après un but, un pulse Canvas en coordonnées monde accompagne la remise en jeu par l’équipe adverse.

## Responsabilités dans `Game`

`Game.update()` coordonne le mouvement humain, les décisions et déplacements tactiques away, le retour des joueurs home non contrôlés à leur formation, les collisions, la physique du ballon, les récupérations, les buts, la caméra et le rendu. Les méthodes de l’IA sont isolées de l’entrée humaine. Le joueur actif home est le porteur home, le destinataire d’une passe home en vol, ou sinon le joueur home le plus proche du ballon.

Le ballon libre conserve la friction `Math.pow(0.5, dt)`. Les mouvements, timers et interpolations sont basés sur `dt`. Les boucles de collision et de sélection parcourent les tableaux existants sans construire de listes temporaires par frame ; les options de passe sont évaluées au rythme des décisions tactiques, pas à chaque image.

## Limites volontaires

Le gardien est présent au rendu mais n’intercepte pas encore les tirs. Il n’y a pas de chrono, de touches/corners, ni de règles complètes de match. Les comportements tactiques actuels concernent les joueurs de champ.
