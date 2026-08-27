# Valdoream

Site vitrine du serveur Minecraft et du studio Valdoream : présentation, actualités, statut du serveur, boutique et panel d'administration.

## Structure du projet

| Fichier | Rôle |
| --- | --- |
| `index.html` | Le site public (accueil, serveur, studio, statut, boutique) |
| `admin/index.html` | Le panel d'administration |
| `assets/style.css` | Les styles partagés par les deux pages |
| `assets/data.js` | Le contenu du site (actualités, boutique, joueurs) et sa sauvegarde |
| `functions/admin/_middleware.js` | La vérification du mot de passe qui protège `/admin/` |
| `functions/api/content.js` | La lecture publique du contenu, pour tous les visiteurs |
| `functions/admin/api/content.js` | L'écriture du contenu, réservée au panel |
| `tools/fix-encoding.py` | Un dépannage d'encodage, utile seulement en développement |

## Tester en local

Ouvrir `index.html` directement dans le navigateur fonctionne, mais il vaut mieux passer par un petit serveur local pour que les chemins se comportent comme en production :

```bash
python -m http.server 8000
```

Le site est alors sur http://localhost:8000/ et le panel sur http://localhost:8000/admin/.

## Protection du panel admin

Le panel n'a **pas** de formulaire de connexion écrit en JavaScript, et c'est volontaire : sur un hébergement de fichiers statiques, un mot de passe présent dans le code est lisible par n'importe quel visiteur et ne protège rien.

La vérification est faite par `functions/admin/_middleware.js`, une Pages Function qui tourne sur les serveurs Cloudflare et exige une authentification HTTP Basic avant de servir quoi que ce soit sous `/admin/`. Le fichier du panel n'est jamais envoyé à un visiteur non authentifié.

### Configurer les identifiants

Les identifiants viennent de deux variables d'environnement du projet Cloudflare Pages, jamais du dépôt Git. Dans le tableau de bord Cloudflare, aller dans le projet puis **Settings &#8594; Environment variables**, et ajouter pour l'environnement **Production** :

| Variable | Contenu |
| --- | --- |
| `ADMIN_USER` | l'identifiant de connexion |
| `ADMIN_PASSWORD` | le mot de passe (à créer en type **Secret**) |

Sans ces deux variables, le panel renvoie une erreur 503 : le comportement par défaut est de tout refuser, jamais de tout ouvrir.

Pour **changer le mot de passe**, il suffit de modifier `ADMIN_PASSWORD` puis de relancer un déploiement (**Deployments &#8594; Retry deployment**). Le changement ne peut pas se faire depuis le panel lui-même : ça demanderait une base de données pour stocker le nouveau mot de passe.

### Deux réglages à ne pas oublier

1. Dans **Settings &#8594; Functions**, mettre **Request limit failure mode** sur **Fail closed (block)**. Par défaut, si le quota gratuit de requêtes est dépassé, Cloudflare laisse passer les requêtes sans exécuter la Function — donc sans vérifier le mot de passe.
2. **Désactiver GitHub Pages** dans les réglages du dépôt. Tant qu'il reste actif, le site est aussi servi sur `minsto.github.io`, où aucune Function ne tourne et où `/admin/` est donc accessible à tous.

### Choisir un bon mot de passe

Cette protection résiste à la lecture du code source, mais pas à quelqu'un qui essaierait des milliers de mots de passe courants. Un mot du dictionnaire tombe en quelques minutes. Une phrase de passe longue, du type `bananes-donjon-valdoream-2026`, est facile à retenir et hors de portée d'une attaque par dictionnaire.

## Où sont enregistrées les données

Le contenu modifié dans le panel part dans **Workers KV**, la base de données de Cloudflare, et devient visible par tous les visiteurs du site. Le `localStorage` du navigateur ne sert plus que de cache : il permet d'afficher la page sans attendre le réseau, et de continuer à travailler si le serveur est injoignable.

| Adresse | Méthode | Qui peut l'utiliser |
| --- | --- | --- |
| `/api/content` | `GET` | tout le monde, en lecture seule |
| `/admin/api/content` | `GET`, `PUT`, `DELETE` | seulement avec le mot de passe du panel |
| `/api/shop/checkout` | `POST` | achat boutique (pseudo + panier) |
| `/api/minecraft/queue` | `GET`, `POST` | le serveur Minecraft (cle `SERVER_API_KEY`) |
| `/admin/api/minecraft/command` | `POST` | console admin (mot de passe panel) |

## Livraison en jeu (NeoForge / Minecraft)

La boutique et la console ne parlent pas directement au serveur Minecraft : elles ajoutent des commandes dans une **file d'attente** (`queue` dans la base KV). Un petit script sur la machine du serveur les execute via **RCON**.

### 1. Variable Cloudflare

Dans le projet Pages, **Settings &#8594; Environment variables**, ajouter :

| Variable | Type | Exemple |
| --- | --- | --- |
| `SERVER_API_KEY` | Secret | une longue phrase aleatoire |

### 2. RCON sur le serveur NeoForge

Dans `server.properties` :

```properties
enable-rcon=true
rcon.port=25575
rcon.password=votre-mot-de-passe-rcon
```

Redemarrer le serveur Minecraft.

### 3. Commandes sur chaque article

Dans le panel admin, chaque produit a un champ **Commande Minecraft** avec `{player}` :

| Type | Exemple |
| --- | --- |
| Grade (LuckPerms) | `lp user {player} parent set vip` |
| Objet vanilla | `give {player} minecraft:diamond 64` |
| Objet mod NeoForge | `give {player} modid:item_name 1` |

Adaptez les noms de grades LuckPerms et les IDs d'objets a votre serveur.

### 4. Lancer le bridge

Sur la machine qui peut joindre le RCON du serveur :

```powershell
$env:SERVER_API_KEY = "la-meme-cle-que-cloudflare"
$env:VALDOREAM_SITE = "https://valdoream.pages.dev"
$env:RCON_HOST = "127.0.0.1"
$env:RCON_PORT = "25575"
$env:RCON_PASSWORD = "votre-mot-de-passe-rcon"
python tools/minecraft-bridge.py
```

Le script interroge le site toutes les 5 secondes, execute les commandes en attente, et confirme le resultat.

## Mod NeoForge (recommande — console complete)

Le dossier **`minecraft-mod/`** contient un mod pret a copier dans **Valdoream Engine** :

- Logs console **en direct** dans le panel admin
- Joueurs en ligne, TPS, statut serveur
- File de livraisons boutique visible
- Commandes admin executees sur le vrai serveur (sans RCON)

Voir **`minecraft-mod/README.md`** pour l'installation et la config `config/valdoream_webbridge.properties`.

### 5. Cote joueur

1. Le joueur clique **Joueur** et entre son pseudo Minecraft exact.
2. Il achete dans la boutique.
3. Sous quelques secondes (si le bridge tourne), l'objet ou le grade arrive en jeu.

**Paiement reel :** le checkout actuel livre en jeu sans encaisser l'argent. Brancher **Stripe** avant d'ouvrir la boutique au public.


### Brancher la base de données

Sans cette étape, le site fonctionne quand même, mais en mode dégradé : les modifications ne sont gardées que dans le navigateur qui les a faites, et l'étiquette en haut du panel passe au rouge pour le signaler.

**1. Créer la base.** Dans le tableau de bord Cloudflare, aller dans **Storage & Databases &#8594; KV**, cliquer **Create a namespace**, la nommer `valdoream-content` puis valider.

**2. La brancher au site.** Ouvrir le projet Pages `valdoream`, puis **Settings &#8594; Bindings &#8594; Add &#8594; KV namespace**, et renseigner :

| Champ | Valeur |
| --- | --- |
| Variable name | `CONTENT` |
| KV namespace | `valdoream-content` |

Le nom de variable doit être exactement `CONTENT` : c'est sous ce nom que le code lit la base.

**3. Redéployer.** Un binding ajouté n'est pris en compte qu'au déploiement suivant : **Deployments &#8594; Retry deployment**, ou n'importe quel nouveau commit.

Le quota gratuit de Workers KV (100 000 lectures et 1 000 écritures par jour) est très large pour un site de cette taille.

### Vérifier que ça marche

Ouvrir le panel : l'étiquette en haut à droite doit afficher **Contenu en ligne chargé** en vert. Ajouter un article, puis vérifier que l'étiquette passe à **Enregistré en ligne**. Le test décisif consiste à ouvrir la boutique depuis un autre appareil ou une fenêtre de navigation privée : l'article doit y apparaître.

## Tester les Functions en local

Le serveur Python ci-dessus ne sert que les fichiers : il n'exécute ni le mot de passe ni la base de données. Pour tester l'ensemble, il faut l'outil de Cloudflare :

```bash
npx wrangler pages dev . --kv CONTENT --binding ADMIN_USER=admin --binding ADMIN_PASSWORD=un-mot-de-passe
```

Le site est alors sur http://127.0.0.1:8788/ avec une base KV locale, stockée dans `.wrangler/` et ignorée par Git.

## Encodage des fichiers

Certains éditeurs sous Windows réenregistrent les fichiers dans l'encodage local (cp1252) au lieu d'UTF-8, ce qui abîme les accents et remplace les emojis par des `?`. Deux protections sont en place :

- les fichiers HTML, CSS et JavaScript commencent par une signature UTF-8 (BOM), que les éditeurs détectent pour conserver le bon encodage ;
- les emojis sont écrits en entités HTML (`&#128081;` pour la couronne), une forme purement ASCII qu'aucun réenregistrement ne peut abîmer.

En cas de doute après une modification, `python tools/fix-encoding.py` vérifie les fichiers et répare ce qui peut l'être.
