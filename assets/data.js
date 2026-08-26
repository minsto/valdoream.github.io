/*
 * Données du site Valdoream.
 *
 * Le contenu est enregistré dans le localStorage du navigateur : les
 * modifications faites dans le panel admin restent visibles après un
 * rafraîchissement, mais uniquement sur l'ordinateur qui les a faites.
 * Pour que les visiteurs voient les changements, il faudra brancher une
 * vraie base de données (voir le README).
 */

const STORAGE_KEY = 'valdoream-content-v1';

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

function loadStore() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return structuredClone(DEFAULT_DATA);
        return Object.assign(structuredClone(DEFAULT_DATA), JSON.parse(raw));
    } catch (err) {
        console.warn('Contenu enregistré illisible, retour aux valeurs par défaut.', err);
        return structuredClone(DEFAULT_DATA);
    }
}

function saveStore(store) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (err) {
        console.warn("Impossible d'enregistrer le contenu.", err);
    }
}

function resetStore() {
    localStorage.removeItem(STORAGE_KEY);
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
