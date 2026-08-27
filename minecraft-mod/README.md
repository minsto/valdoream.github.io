# Valdoream Web Bridge — Mod NeoForge

Connecte votre serveur **NeoForge 1.21.1** au panel admin **valdoream.pages.dev** :

- Execute les commandes boutique (give, LuckPerms, etc.)
- Affiche les **logs console en direct** dans le panel
- Affiche les **joueurs en ligne**
- Affiche les **livraisons en attente** et les dernieres livraisons
- Permet d'envoyer **n'importe quelle commande serveur** depuis le panel

## Installation dans Valdoream Engine (ou autre mod NeoForge)

### 1. Copier les sources

Copiez le dossier `src/main/java/com/valdoream/webbridge/` dans **votre** projet mod NeoForge, ou ajoutez ce dossier `minecraft-mod` comme sous-projet Gradle.

Fichiers Java :

- `ValdoreamWebBridgeMod.java`
- `WebBridgeEvents.java`
- `WebBridgeConfig.java`
- `WebApiClient.java`
- `WebBridgeService.java`
- `LogCapture.java`

Copiez aussi `META-INF/neoforge.mods.toml` (ou fusionnez le modId dans votre mods.toml existant).

**Gson** est deja inclus dans Minecraft/NeoForge — rien a ajouter.

### 2. Configurer le mod

Au premier demarrage du serveur, le fichier est cree :

```
config/valdoream_webbridge.properties
```

Contenu :

```properties
siteUrl=https://valdoream.pages.dev
apiKey=VOTRE_SERVER_API_KEY_CLOUDFLARE
pollIntervalSeconds=2
```

`apiKey` = la variable **SERVER_API_KEY** dans Cloudflare Pages (Settings > Environment variables).

### 3. Cloudflare

Variables requises sur le projet **valdoream** :

| Variable | Type |
| --- | --- |
| `SERVER_API_KEY` | Secret |
| `CONTENT` | Binding KV |
| `ADMIN_USER` / `ADMIN_PASSWORD` | pour le panel |

Redeployez apres chaque changement de variable.

### 4. Demarrer

```bash
gradlew runServer
```

Dans le panel admin ? **Console Serveur** :

- Badge **Serveur en ligne** (vert) = le mod est connecte
- Logs en direct a gauche
- Joueurs en ligne + livraisons a droite

### 5. Tester une pomme

Panel admin ? Console ? tapez :

```
give Dev minecraft:apple
```

Ou achetez depuis la boutique avec le pseudo **Dev** exact.

## Commandes boutique

Chaque article a un champ **Commande Minecraft** avec `{player}` :

| Type | Exemple |
| --- | --- |
| Grade LuckPerms | `lp user {player} parent set vip` |
| Objet vanilla | `give {player} minecraft:apple 1` |
| Objet mod NeoForge | `give {player} modid:item 1` |

## Alternative sans mod (RCON)

Si vous ne voulez pas installer le mod tout de suite, utilisez `tools/minecraft-bridge.py` avec RCON active dans `server.properties`.

Le mod est recommande : pas besoin de RCON, logs complets, joueurs en ligne.

## Depannage

| Probleme | Solution |
| --- | --- |
| Serveur hors ligne dans le panel | Verifiez `apiKey` dans le config + SERVER_API_KEY Cloudflare |
| Commande en attente mais rien en jeu | Le mod doit tourner sur le serveur dedie |
| give echoue | Utilisez le pseudo exact (ex. `Dev` pas `dev`) |
| Pas de logs | Normal au demarrage ; attendez quelques secondes |
