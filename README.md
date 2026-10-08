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
| `X` | passe (tap = passe intelligente, maintenir = passe lobée) · en défense : tacle si le ballon est tout près, intervention courte un peu plus loin, rien de trop loin ; maintenir sans direction = pressing |
| `T` | passe en profondeur dans la course d'un coéquipier placé devant (la direction choisit le côté) ; personne devant = ballon dans l'espace devant soi |
| `C` | tir (tap = tir placé, maintenir = tir chargé, haut/bas = viser un poteau) · en défense : tacle glissé · sur corner : centre |
| `R` | sprint (maintenir), avec ou sans ballon ; l'endurance baisse puis remonte progressivement |
| `Alt` | crochet (pousse le ballon devant) · sprint aussi |
| `Shift droit` | changer de joueur (appuis répétés = joueur suivant) |
| `Échap` | pause |
| `Entrée` | recommencer (en pause ou à la fin du match uniquement) |

### Mobile (paysage obligatoire)

- **Joystick analogique** flottant à gauche (zone morte, retour visuel).
- **PASSE** : tap = passe auto intelligente ; glisser = passe orientée, la longueur du glissé règle la puissance.
- **TIR** : tap = tir contrôlé ; maintenir = charge ; glisser = visée (premier poteau, centre, second poteau) et puissance.
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

### Difficulté

**Amateur / Pro / Légende** modifie surtout la qualité des décisions (réaction, vision, anticipation, pressing, précision des passes et tirs). La vitesse des joueurs ne change pas et les gardiens restent faillibles à tous les niveaux.

## Tests

`npm test` exécute :

- `tests/controls.mjs` : mapping clavier (Shift droit, Alt, X, T, C, R = sprint, Entrée, Échap, J/K/L inactifs), passe orientée, passe lobée, passe et tir au glissé, tir chargé, visée des poteaux, crochet, changement de joueur ;
- `tests/rules.mjs` : but / pas but, barre, sortie de but vs corner, touche, coup franc, penalty, cycle de chaque coup de pied arrêté, règle des 8 secondes ;
- `tests/goalkeepers.mjs` : statistiques d'arrêts par difficulté (tirs puissants placés, tirs faibles centraux, tirs enroulés) ;
- `tests/full-match.mjs` : matchs complets IA contre IA et humain contre IA, rythme, variété des plans et des arrêts de jeu, performance.
