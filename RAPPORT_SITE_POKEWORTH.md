# Rapport — site Pokéworth (aperçu non publié)

Base : `pokeworth-site-complet-v14.8.zip` (dossier Documents/Claude outputs, la plus récente). Cette version est **plus récente que pokeworth.fr** : le site en ligne affiche encore d'anciens textes (« Fonction », « produits scellés »). Rien n'a été déployé.

## Ce que j'ai fait
- **Typographie française** (94 passages dans 5 pages) : espaces insécables avant « : », « ; », « ? », « ! » et dans les guillemets « », pour qu'un signe de ponctuation ne se retrouve jamais seul en début de ligne. Pages : CGU, confidentialité, mentions légales, méthode des prix, sources des données. **Pages juridiques : texte strictement identique** (contrôlé par comparaison automatique, seuls les espaces changent).
- **Accueil, 2 retouches de texte** (le même changement dans les données structurées FAQ, pour qu'elles restent identiques au texte visible) :
  - « L'écran d'accueil de l'application te permet de retrouver les informations essentielles et de suivre ta collection en un coup d'œil. » devient « L'écran d'accueil rassemble les informations essentielles de ta collection. » (le titre de la carte dit déjà « en un coup d'œil »).
  - « Pokéworth ne calcule pas de prix secret. » devient « Pokéworth n'applique aucune formule secrète. » (même formulation que la page Méthode des prix).

## Ce que je n'ai pas modifié, volontairement
- Design, CSS, images, logo, composition, URL, sitemap, prix, conditions : intacts. Le CSS gère déjà `prefers-reduced-motion`, les états de focus, les survols et les apparitions ; ajouter des effets n'aurait apporté aucune valeur.
- Aucune faute d'orthographe ni de grammaire repérée dans les 20 pages. La casse « Pokéworth » est correcte partout (129 occurrences ; les 15 « pokeworth » sont des URL).

## Tests réalisés (navigateur local, copie servie en local)
- Débordement horizontal : aucune des 20 pages à 375 px ; les 6 pages modifiées à 320, 375, 768 et 1 280 px (24 mesures) : aucun.
- Erreurs JavaScript sur l'accueil : aucune. Données structurées JSON-LD : valides. Liens et ressources internes : 0 cassé.
- Rendu visuel : accueil contrôlé sur mobile (capture). Les autres pages ne l'ont pas été visuellement.
- **Non fait** : audit d'accessibilité complet, mesures de performance (Lighthouse), comparaison visuelle avant/après page par page, test des formulaires et du menu mobile, test sur iPhone réel. Pas de « build de production » : c'est un site statique sans étape de compilation.

## Points à décider (non modifiés)
- Apostrophes droites (') dans tout le site : l'apostrophe typographique (’) serait plus soignée, mais le changement touche aussi les données structurées et l'ensemble des fichiers.
- Les paragraphes de la FAQ restent longs ; les raccourcir risquerait de perdre des informations de conditions.

## Retour arrière
La version d'origine est intacte : `~/Documents/Claude outputs/pokeworth-site-complet-v14.8.zip`. Pour revenir en arrière, redéployer ce ZIP.

## Prévisualiser
Dans ce dossier : `python3 -m http.server 8000`, puis http://localhost:8000

## Correction FAQ des langues (validée par toi le 4 novembre 2026)
- Langues de l'app iOS confirmées dans le code (`AppInterfaceLanguage`, noms exacts) : Français, English, Italiano, Deutsch, Español, 日本語. Les 1 428 textes de l'app ont une entrée dans chacune des cinq autres langues ; je n'ai pas relu la qualité de ces traductions.
- Ancienne réponse : « Le site, l'app et la Web App sont en français. Dans la Web App, tu pourras choisir la langue des cartes (français ou japonais) sans changer celle de l'interface. Il n'existe pas d'autre traduction pour le moment. »
- Nouvelle réponse : « L'app iPhone est disponible en six langues : français, anglais, italien, allemand, espagnol et japonais. Le site et la Web App sont en français. Dans la Web App, tu pourras choisir la langue des cartes (français ou japonais) sans changer celle de l'interface. »
- Fichier modifié : `index.html` seul (réponse visible de la FAQ et la même réponse dans les données structurées). Aucune autre page ne dit que l'app est uniquement en français ; les autres mentions de « français » portent sur le marché, le catalogue ou les sources.
- Vérifié : FAQ qui s'ouvre et se ferme, texte affiché, aucun débordement à 375 et 1 280 px, aucune erreur JavaScript, JSON-LD valide. Pas de build de production : site statique.
