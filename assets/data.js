/*
 * Données du site Valdoream.
 *
 * Le contenu vit à deux endroits :
 *   1. la base de données Cloudflare KV, partagée par tous les visiteurs, lue
 *      via /api/content et écrite via /admin/api/content (protégé par mot de
 *      passe) ;
 *   2. le localStorage du navigateur, qui sert de cache pour afficher la page
 *      instantanément et de filet de sécurité si le serveur est injoignable.
 *
 * Si la base n'est pas encore branchée sur le projet Cloudflare Pages, tout
 * continue de fonctionner en mode local seul (voir le README).
 */

const STORAGE_KEY = 'valdoream-content-v1';

const PUBLIC_API = '/api/content';
const ADMIN_API = '/admin/api/content';

// État de la dernière synchronisation, affiché par le panel admin.
const storeStatus = { source: 'local', configured: false, message: '', savedAt: null };

const DEFAULT_DATA = {
    news: [
        { id: 1, title: 'Mise à Jour 2.0 : Les Catacombes', date: '24 AOÛT 2026', img: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=800&auto=format&fit=crop', desc: "Découvrez 5 nouveaux étages de donjons procéduraux et combattez le Titan d'Ombre." },
        { id: 2, title: 'Événement PvP : Tournoi des Guildes', date: '18 AOÛT 2026', img: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop', desc: 'Affrontez les meilleures équipes du serveur pour remporter des récompenses exclusives.' },
        { id: 3, title: "Nouveau système d'Artisanat", date: '10 AOÛT 2026', img: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?q=80&w=800&auto=format&fit=crop', desc: 'Forgez des artefacts rares grâce aux nouveaux minerais mystiques dispersés sur la carte.' }
    ],
    posts: [
        { id: 1, author: 'Alexandre', role: 'Lead Dev', time: 'Il y a 2h', content: 'Le correctif sur le calcul des coups critiques des Voleurs est désormais en ligne ! Bon jeu à tous.', tag: 'Patch Note' },
        { id: 2, author: 'Elena', role: 'Lead Artist', time: 'Hier', content: 'Nous préparons les textures des armures de la Saison 2. Rendez-vous très bientôt pour les premiers aperçus !', tag: 'Studio' }
    ],
    shop: [
        { id: 1, category: 'grades', name: 'Grade VIP', price: 5.00, desc: 'Connexion prioritaire, 2 Homes, Kit VIP 24h et préfixe jaune.' },
        { id: 2, category: 'grades', name: 'Grade Épique', price: 10.00, desc: 'Avantages VIP + 5 Homes, Kit Épique 48h et cosmétiques.' },
        { id: 3, category: 'grades', name: 'Grade Légende', price: 20.00, desc: 'Tous les avantages, préfixe animé, monture au spawn et 10 Homes.' },
        { id: 4, category: 'items', name: 'Pack x5 Clés Donjon', price: 4.50, desc: 'Ouvre 5 coffres mythiques à la fin des donjons.' },
        { id: 5, category: 'items', name: 'Pass Aventurier Saison 1', price: 8.00, desc: '50 paliers de récompenses cosmétiques et ressources.' }
    ],
    players: [
        { id: 1, pseudo: 'DarkSlayer99', grade: 'Épique', status: 'En ligne' },
        { id: 2, pseudo: 'MineCrafterPro', grade: 'Légende', status: 'En ligne' },
        { id: 3, pseudo: 'TrollBoy', grade: 'Joueur', status: 'Banni' },
        { id: 4, pseudo: 'AlexDev', grade: 'Admin', status: 'En ligne' }
    ],
    sales: [
        { player: 'DarkSlayer99', item: 'Grade Épique', price: 10.00, date: '14:32' },
        { player: 'MineCrafterPro', item: 'Grade Légende', price: 20.00, date: '12:15' }
    ],
    logs: [
        '[SYSTEM]: Serveur démarré sur le port 25565.',
        '[INFO]: Chargement du monde Survie RPG effectué.',
        '[Boutique]: Transaction #1042 enregistrée avec succès.'
    ]
};

// Complète un contenu partiel avec les valeurs par défaut, pour qu'une clé
// absente n'empêche pas l'affichage.
function withDefaults(content) {
    return Object.assign(structuredClone(DEFAULT_DATA), content || {});
}

// Contenu disponible immédiatement, sans attendre le réseau.
function loadStore() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return structuredClone(DEFAULT_DATA);
        return withDefaults(JSON.parse(raw));
    } catch (err) {
        console.warn('Contenu enregistré illisible, retour aux valeurs par défaut.', err);
        return structuredClone(DEFAULT_DATA);
    }
}

function saveStore(store) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (err) {
        console.warn("Impossible d'enregistrer le contenu dans ce navigateur.", err);
    }
}

function resetStore() {
    localStorage.removeItem(STORAGE_KEY);
}

/*
 * Récupère le contenu partagé et remplace le contenu local par celui-ci.
 * `store` est modifié sur place : les pages gardent la même référence, il leur
 * suffit de rappeler leurs fonctions de rendu ensuite.
 */
async function syncStoreFromServer(store) {
    try {
        const res = await fetch(PUBLIC_API, { cache: 'no-store' });
        if (!res.ok) throw new Error('réponse HTTP ' + res.status);

        const payload = await res.json();
        storeStatus.configured = Boolean(payload.configured);

        if (!payload.configured) {
            storeStatus.source = 'local';
            storeStatus.message = 'Base de données non branchée : contenu enregistré dans ce navigateur uniquement.';
            return storeStatus;
        }

        if (payload.content) {
            Object.assign(store, withDefaults(payload.content));
            saveStore(store);
            storeStatus.source = 'server';
            storeStatus.message = 'Contenu chargé depuis la base de données.';
        } else {
            storeStatus.source = 'server-empty';
            storeStatus.message = 'Base de données vide : contenu par défaut affiché.';
        }

        return storeStatus;
    } catch (err) {
        storeStatus.source = 'local';
        storeStatus.message = 'Serveur injoignable, contenu local affiché (' + err.message + ').';
        return storeStatus;
    }
}

// Envoie tout le contenu au serveur. Réservé au panel admin : l'adresse est
// derrière le mot de passe.
async function saveStoreToServer(store) {
    const res = await fetch(ADMIN_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(store),
        cache: 'no-store'
    });

    if (res.status === 401) {
        throw new Error('session expirée, recharge la page pour retaper le mot de passe');
    }

    let payload = null;
    try {
        payload = await res.json();
    } catch {
        /* réponse non JSON : on retombe sur le code HTTP ci-dessous */
    }

    if (!res.ok || !payload || payload.ok !== true) {
        throw new Error((payload && payload.error) || 'réponse HTTP ' + res.status);
    }

    storeStatus.source = 'server';
    storeStatus.savedAt = payload.savedAt || null;
    return payload;
}

async function resetStoreOnServer() {
    const res = await fetch(ADMIN_API, { method: 'DELETE', cache: 'no-store' });
    if (!res.ok) throw new Error('réponse HTTP ' + res.status);
    return true;
}

// Neutralise le HTML saisi dans les formulaires avant de l'injecter dans la page.
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

function formatPrice(value) {
    return Number(value).toFixed(2).replace('.', ',') + ' €';
}
