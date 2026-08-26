# Valdoream

Site vitrine du serveur Minecraft et du studio Valdoream : présentation, actualités, statut du serveur, boutique et panel d'administration.

## Structure du projet

| Fichier | Rôle |
| --- | --- |
| `index.html` | Le site public (accueil, serveur, studio, statut, boutique) |
| `admin/index.html` | Le panel d'administration, à protéger par Cloudflare Access |
| `assets/style.css` | Les styles partagés par les deux pages |
| `assets/data.js` | Le contenu du site (actualités, boutique, joueurs) et sa sauvegarde |

## Tester en local

Ouvrir `index.html` directement dans le navigateur fonctionne, mais il vaut mieux passer par un petit serveur local pour que les chemins se comportent comme en production :

```bash
python -m http.server 8000
```

Le site est alors sur http://localhost:8000/ et le panel sur http://localhost:8000/admin/.

## Protection du panel admin

Le panel n'a **pas** de formulaire de connexion, et c'est volontaire. Sur un hébergement de fichiers statiques, un mot de passe écrit dans le JavaScript est lisible par n'importe quel visiteur et ne protège rien.

La protection est assurée en amont par **Cloudflare Access**, qui vérifie l'identité du visiteur sur les serveurs de Cloudflare avant d'envoyer le moindre fichier. Marche à suivre :

1. Créer un compte sur [Cloudflare](https://dash.cloudflare.com) (gratuit).
2. Dans **Workers & Pages → Create → Pages**, connecter ce dépôt GitHub. Laisser la commande de build vide et la racine sur `/`.
3. Une fois le site déployé, aller dans **Zero Trust → Access → Applications → Add an application → Self-hosted**.
4. Renseigner le domaine du projet Pages et le chemin `admin` (puis répéter l'opération avec le chemin `admin/*`).
5. Créer une règle **Allow** limitée à son adresse e-mail, avec la méthode de connexion « One-time PIN » ou Google.
6. **Désactiver GitHub Pages** dans les réglages du dépôt. Tant que GitHub Pages reste actif, le panel reste accessible publiquement via l'adresse `github.io` et la protection ne sert à rien.

L'offre gratuite de Cloudflare Zero Trust couvre jusqu'à 50 utilisateurs.

## Limite actuelle des données

Les modifications faites dans le panel sont enregistrées dans le `localStorage` du navigateur. Elles survivent à un rafraîchissement, mais restent **locales à l'ordinateur qui les a faites** : les visiteurs du site ne les voient pas.

Pour que le panel pilote réellement le contenu public, il faut une base de données. Une offre gratuite comme [Supabase](https://supabase.com) permettrait de remplacer `assets/data.js` par de vrais appels réseau, sans changer le reste du code.
