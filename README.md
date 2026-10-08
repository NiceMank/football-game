# ⚽ eFootball Striker

Football arcade **5 contre 5** en vue de dessus légèrement oblique, construit avec **React 19**, **TypeScript**, **Vite** et **Canvas 2D** (aucun asset externe : terrain, joueurs, ballon, sons et foule sont générés en code).

## Lancer le projet

```bash
npm install
npm run dev      # serveur de développement
npm run build    # build de production (un seul fichier dist/index.html)
npm test         # tests du moteur (Node + esbuild)
```

## Commandes

### Clavier

| Touche | Action |
| --- | --- |
| `WASD` / flèches (`ZQSD` sur AZERTY) | déplacement |
| `X` | passe (tap = passe intelligente, maintenir = passe lobée) · en défense : maintenir = presser le porteur (le stick choisit le côté), tacle si le ballon est tout près, intervention courte un peu plus loin |
| `T` | passe en profondeur dans la course d'un coéquipier : le ballon passe devant lui et il sprinte dessus ; la direction choisit le côté ; personne devant = ballon dans l'espace devant soi |
| `C` | tir (tap = tir placé, maintenir = tir chargé, haut/bas = viser un poteau) · en défense : maintenir = un coéquipier presse avec toi (X + C = pressing à deux) ; tout près = tacle glissé · sur corner : centre |
| `R` | sprint (maintenir), plus franc qu'une course, avec ou sans ballon ; l'endurance baisse puis remonte progressivement |
| `Alt` | crochet (pousse le ballon devant) · sprint aussi |
| `Shift droit` | changer de joueur (appuis répétés = joueur suivant) |
| `Échap` | pause |
| `Entrée` | recommencer (en pause ou à la fin du match uniquement) |

### Mobile (paysage obligatoire)

- **Joystick analogique** flottant à gauche (zone morte, retour visuel).
- **PASSE** : tap = passe auto intelligente ; glisser = passe orientée, la longueur du glissé règle la puissance.
- **TIR** : tap = tir contrôlé ; maintenir = charge ; glisser = visée (premier poteau, centre, second poteau) et puissance. En défense, maintenir appelle un deuxième presseur (avec PASSE = pressing à deux) ; tout près du ballon, c'est un tacle glissé.
- **PASSE** en défense : maintenir = presser le porteur.
- **PROF.** : passe en profondeur (le joystick choisit le côté).
- **SPRINT** : maintenir pour accélérer (consomme l'endurance).
- **SWITCH** : joueur le mieux placé.
- En portrait, un écran « TOURNEZ VOTRE TÉLÉPHONE » bloque et met le match en pause ; au lancement, le jeu tente le plein écran et `screen.orientation.lock('landscape')`.

## Règles gérées

Coup d'envoi, but (ballon entièrement au-delà de la ligne, entre les poteaux, sous la barre), poteaux et barre, touche, corner, sortie de but, fautes (tacles ratés, tacles glissés sur l'homme), coup franc avec mur et distance, penalty, mi-temps avec changement de côté, fin de match. Règle IFAB 2026/27 : un gardien qui garde le ballon en main plus de **8 secondes** concède un **corner**. Le gardien de l'équipe humaine est relancé par le joueur (`X` main, `C` dégagement) avec un compte à rebours à l'écran. Le hors-jeu n'est pas simulé.

## Architecture (`src/game`)

| Module | Rôle |
| --- | --- |
| `match.ts` | machine d'états du match (setup → taking → live → goal / halftime / fulltime), possession, contacts ballon, chrono, HUD |
| `ball.ts` | physique du ballon : gravité, rebonds, frictions sol/air, effet, prédiction, traînée |
| `player.ts` | joueur : stats, accélération limitée, endurance, orientation, glissade |
| `team.ts` | équipe : losange 1-2-1, maillots, rôles tactiques (presseur, couverture…), plan d'attaque |
| `goalkeeper.ts` | gardien : perception retardée, temps de réaction, lecture bruitée, plongeon à vitesse et allonge finies, captation / parade / erreur |
| `ai.ts` | IA d'équipe : pressing + couverture + marquage, soutien et appels, plans (construction, direct, côtés, contre), décisions du porteur |
| `human.ts` | traduction des entrées (clavier / tactile) en actions, tirs et passes en une touche, changement de joueur |
| `actions.ts` | passes, lobs, centres, tirs, dégagements, touches, tacles |
| `rules.ts` | sorties de balle, buts, cadre, fautes, placement sur coups de pied arrêtés |
| `camera.ts` | caméra anticipative qui garde le but visible près de la surface |
| `renderer.ts` | rendu Canvas pseudo-3D (terrain, tribunes, buts et filets, joueurs, ballon, marqueurs, mini-carte) |
| `effects.ts` | particules (pool), secousses, flash, bandeaux |
| `input.ts` / `sfx.ts` | clavier (codes physiques) et sons Web Audio procéduraux |
| `profiles.ts` | profils de difficulté |

La simulation tourne à pas fixe (`1/120 s`), les décisions IA sont cadencées par minuteurs, et la boucle de rendu ne fait pas d'allocation par image.

### Assistance

`src/game/assist.ts` regroupe l'assistance du joueur humain (niveaux `low` / `medium` / `high`, `medium` par défaut : passe 0,55, tir 0,35, défense 0,45). Elle élargit la recherche du coéquipier dans la direction visée et retrouve un coéquipier proche juste à côté de la visée, met le tir sur le cadre quand la direction est proche du but (une direction nettement à côté reste à côté), et règle la portée du tacle sur `X` et une légère correction de la course vers le porteur. Elle ne rend ni les passes, ni les tirs, ni les tacles parfaits : l'erreur et les interceptions restent.

### Défense IA

Le presseur lit le porteur avec un temps de réaction (lecture rafraîchie toutes les 0,1 à 0,25 s puis extrapolée) : un changement de direction est vu en retard. Il choisit entre **contenir** (distance qui grandit avec la vitesse du porteur, pas chassés plus lents qu'une course), **presser** (porteur lent, dos au but, ballon juste perdu, près de la surface) et **revenir côté but** s'il est dépassé ; le tacle se tente au bon moment, et un tacle sur une lecture périmée est raté plus souvent. Les autres défenseurs couvrent et marquent au lieu de venir sur le ballon.

### Difficulté

**Amateur / Pro / Légende** modifie la qualité des décisions (réaction, vision, anticipation, pressing, précision des passes et tirs), pas la vitesse des joueurs. Pro laisse des espaces et presse moins haut qu'avant ; Légende reste plus agressive. Les gardiens restent faillibles à tous les niveaux. Les coéquipiers de l'humain jouent à un niveau fixe, quel que soit le choix.

### Appels et passe en profondeur

Un seul coéquipier (l'attaquant, ou un milieu si l'attaquant a le ballon) part en sprint dans un couloir derrière la ligne, puis se repose brièvement avant de repartir. Les autres proposent une solution courte. `T` vise d'abord ce coureur : le ballon est dosé pour arriver un peu moins vite que sa course, et il s'arrête avant un défenseur placé dans le couloir. Sans appel devant, le ballon part dans l'espace, à une vitesse qui ne le fait pas sortir.

## Tests

`npm test` exécute :

- `tests/controls.mjs` : mapping clavier (Shift droit, Alt, X, T, C, R = sprint, Entrée, Échap, J/K/L inactifs), passe orientée, passe lobée, passe et tir au glissé, tir chargé, visée des poteaux, crochet, changement de joueur ;
- `tests/feel.mjs` : défense sans effet « aimant » (distance de marquage, séparation sur un crochet, pas d'essaim), passe assistée (direction, coéquipier proche, ballon qui arrive, interceptions possibles), tir assisté (poteaux, visée partielle, tirs non tous cadrés), assistance défensive (pas de téléportation, tacles non automatiques), niveaux d'assistance, T et R, appels en profondeur, dosage de la passe en profondeur ;
- `tests/rules.mjs` : but / pas but, barre, sortie de but vs corner, touche, coup franc, penalty, cycle de chaque coup de pied arrêté, règle des 8 secondes ;
- `tests/goalkeepers.mjs` : statistiques d'arrêts par difficulté (tirs puissants placés, tirs faibles centraux, tirs enroulés) ;
- `tests/full-match.mjs` : matchs complets IA contre IA et humain contre IA, rythme, variété des plans et des arrêts de jeu, performance.
