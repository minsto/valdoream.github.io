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

Les identifiants viennent de deux variables d'environnement du projet Cloudflare Pages, jamais du dépôt Git. Dans le tableau de bord Cloudflare, aller dans le projet puis **Settings → Environment variables**, et ajouter pour l'environnement **Production** :

| Variable | Contenu |
| --- | --- |
| `ADMIN_USER` | l'identifiant de connexion |
| `ADMIN_PASSWORD` | le mot de passe (à créer en type **Secret**) |

Sans ces deux variables, le panel renvoie une erreur 503 : le comportement par défaut est de tout refuser, jamais de tout ouvrir.

Pour **changer le mot de passe**, il suffit de modifier `ADMIN_PASSWORD` puis de relancer un déploiement (**Deployments → Retry deployment**). Le changement ne peut pas se faire depuis le panel lui-même : ça demanderait une base de données pour stocker le nouveau mot de passe.

### Deux réglages à ne pas oublier

1. Dans **Settings → Functions**, mettre **Request limit failure mode** sur **Fail closed (block)**. Par défaut, si le quota gratuit de requêtes est dépassé, Cloudflare laisse passer les requêtes sans exécuter la Function — donc sans vérifier le mot de passe.
2. **Désactiver GitHub Pages** dans les réglages du dépôt. Tant qu'il reste actif, le site est aussi servi sur `minsto.github.io`, où aucune Function ne tourne et où `/admin/` est donc accessible à tous.

### Choisir un bon mot de passe

Cette protection résiste à la lecture du code source, mais pas à quelqu'un qui essaierait des milliers de mots de passe courants. Un mot du dictionnaire tombe en quelques minutes. Une phrase de passe longue, du type `bananes-donjon-valdoream-2026`, est facile à retenir et hors de portée d'une attaque par dictionnaire.

## Limite actuelle des données

Les modifications faites dans le panel sont enregistrées dans le `localStorage` du navigateur. Elles survivent à un rafraîchissement, mais restent **locales à l'ordinateur qui les a faites** : les visiteurs du site ne les voient pas.

Pour que le panel pilote réellement le contenu public, il faut une base de données. Une offre gratuite comme [Supabase](https://supabase.com) permettrait de remplacer `assets/data.js` par de vrais appels réseau, sans changer le reste du code.
