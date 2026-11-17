import {
  sb, esc, po, poHTML, champMonnaie, lireMonnaie, pieces, dateCourte, toast, msgErreur,
  ETATS_BESOIN, STATUTS_PROJET, STATUTS_MISSION, STATUTS_NAVIRE, STATUTS_COMMANDE, TYPES_JOURNAL, RAYONS,
} from './commun.js';

const $ = s => document.querySelector(s);
const vue = $('#vue');
const modale = $('#modale');
let minuterie = null;

// =============================================================== Définition des tables
// Types de champ : texte, long, nombre, bool, choix (options), lien (vers une autre table), image, url
const PORTEE = { village: 'Tout le village', restreint: 'Certains colons seulement' };
const ETAT_B = Object.fromEntries(Object.entries(ETATS_BESOIN).map(([k, v]) => [k, v.label]));
const STATUT_SCRUTIN = { brouillon: 'Brouillon (invisible)', ouvert: 'Ouvert', clos: 'Clos' };

const ENTITES = {
  cycles: {
    titre: 'Cycles', table: 'cycles', tri: ['numero', false],
    aide: 'Un cycle va d\'une séance principale à la suivante. Un seul cycle « en cours » à la fois.',
    colonnes: ['numero', 'titre', 'en_cours', 'jour_debut', 'jour_fin'],
    champs: [
      { n: 'numero', l: 'Numéro', t: 'nombre', req: true }, { n: 'titre', l: 'Titre' },
      { n: 'jour_debut', l: 'Jour de début', t: 'nombre' }, { n: 'jour_fin', l: 'Jour de fin', t: 'nombre' },
      { n: 'en_cours', l: 'Cycle en cours', t: 'bool' }, { n: 'resume', l: 'Résumé visible des joueurs', t: 'long' },
    ],
  },
  besoins: {
    titre: 'Besoins', table: 'besoins', tri: ['ordre', true],
    colonnes: ['icone', 'nom', 'etat', 'provisoire', 'visible'],
    champs: [
      { n: 'nom', l: 'Nom', req: true }, { n: 'icone', l: 'Icône (émoji)' },
      { n: 'etat', l: 'Palier', t: 'choix', o: ETAT_B, d: 'insuffisant' },
      { n: 'provisoire', l: 'Couvert seulement grâce aux navires', t: 'bool' },
      { n: 'note', l: 'Note visible (pourquoi cet état)', t: 'long' },
      { n: 'description', l: 'Description', t: 'long' },
      { n: 'libelle_insuffisant', l: 'Mot pour « Insuffisant » (facultatif)', indice: 'Laissez vide pour garder le mot par défaut. Utile pour un besoin d\'un autre genre (ex. « Personne » pour un herboriste).' },
      { n: 'libelle_precaire', l: 'Mot pour « Précaire » (facultatif)' },
      { n: 'libelle_suffisant', l: 'Mot pour « Suffisant » (facultatif)' },
      { n: 'libelle_abondant', l: 'Mot pour « Abondant » (facultatif)' },
      { n: 'ordre', l: 'Ordre d\'affichage', t: 'nombre', d: 0 }, { n: 'visible', l: 'Visible des joueurs', t: 'bool', d: true },
    ],
  },
  projets: {
    titre: 'Projets', table: 'projets', tri: ['ordre', true],
    aide: 'Statut « Verrouillé » : visible en grisé avec ses conditions. Placez un projet construit sur la carte via « Emplacement ».',
    colonnes: ['icone', 'nom', 'besoin_id', 'statut', 'commande_compagnie', 'emplacement_id', 'visible'],
    champs: [
      { n: 'nom', l: 'Nom', req: true }, { n: 'icone', l: 'Icône (émoji)' },
      { n: 'besoin_id', l: 'Besoin lié', t: 'lien', vers: 'besoins' },
      { n: 'statut', l: 'Statut', t: 'choix', o: STATUTS_PROJET, d: 'verrouille' },
      { n: 'commande_compagnie', l: 'Commande de la Compagnie', t: 'bool' },
      { n: 'description', l: 'Description', t: 'long' },
      { n: 'conditions', l: 'Conditions (ce qu\'il faudra)', t: 'long' },
      { n: 'effet', l: 'Effet une fois construit', t: 'long' },
      { n: 'cycle_id', l: 'Cycle', t: 'lien', vers: 'cycles' },
      { n: 'emplacement_id', l: 'Emplacement sur la carte', t: 'lien', vers: 'emplacements' },
      { n: 'ordre', l: 'Ordre', t: 'nombre', d: 0 }, { n: 'visible', l: 'Visible des joueurs', t: 'bool', d: true },
      { n: 'notes_mj', l: 'Notes MJ (secrètes)', t: 'long' },
    ],
  },
  navires: {
    titre: 'Navires', table: 'navires', tri: ['ordre', true],
    colonnes: ['nom', 'capitaine', 'statut', 'jour_prevu', 'visible'],
    champs: [
      { n: 'nom', l: 'Nom', req: true }, { n: 'capitaine', l: 'Capitaine' },
      { n: 'statut', l: 'Statut', t: 'choix', o: STATUTS_NAVIRE, d: 'attendu' },
      { n: 'jour_prevu', l: 'Jour prévu', t: 'nombre' },
      { n: 'annonce', l: 'Ce que savent les colons', t: 'long' }, { n: 'cargaison', l: 'Cargaison annoncée', t: 'long' },
      { n: 'ordre', l: 'Ordre', t: 'nombre', d: 0 }, { n: 'visible', l: 'Visible des joueurs', t: 'bool', d: true },
      { n: 'notes_mj', l: 'Notes MJ (secrètes)', t: 'long' },
    ],
  },
  colons: {
    titre: 'Colons', table: 'colons', tri: ['personnage', true],
    aide: 'Le mot de passe sert de connexion au portail : il doit être unique. La description est aussi modifiable par le joueur.',
    colonnes: ['portrait_url', 'personnage', 'joueur', 'mot_de_passe', 'classe', 'niveau', 'actif'],
    champs: [
      { n: 'personnage', l: 'Personnage', req: true }, { n: 'joueur', l: 'Joueur', req: true },
      { n: 'mot_de_passe', l: 'Mot de passe du portail', req: true },
      { n: 'espece', l: 'Espèce' }, { n: 'classe', l: 'Classe' }, { n: 'niveau', l: 'Niveau', t: 'nombre' },
      { n: 'responsabilite', l: 'Responsabilité au village' },
      { n: 'portrait_url', l: 'Portrait', t: 'image' },
      { n: 'description', l: 'Description (écrite par le joueur)', t: 'long' },
      { n: 'actif', l: 'Actif (peut se connecter)', t: 'bool', d: true },
      { n: 'notes_mj', l: 'Notes MJ (secrètes)', t: 'long' },
    ],
  },
  pnj: {
    titre: 'PNJ', table: 'pnj', tri: ['ordre', true],
    aide: 'Ce que les colons savent d\'un PNJ se gère dans « Savoirs ».',
    colonnes: ['portrait_url', 'nom', 'role', 'statut', 'cree_par', 'visible'],
    champs: [
      { n: 'nom', l: 'Nom', req: true }, { n: 'role', l: 'Rôle' }, { n: 'statut', l: 'Statut (vivant, disparu…)', d: 'vivant' },
      { n: 'cree_par', l: 'Inscrit par (joueur)', t: 'lien', vers: 'colons', indice: 'Vide si c\'est vous qui l\'avez créé.' },
      { n: 'portrait_url', l: 'Portrait', t: 'image' },
      { n: 'description', l: 'Description visible de tous', t: 'long' },
      { n: 'ordre', l: 'Ordre', t: 'nombre', d: 0 }, { n: 'visible', l: 'Visible des joueurs', t: 'bool', d: true },
      { n: 'notes_mj', l: 'Notes MJ (secrètes)', t: 'long' },
    ],
  },
  savoirs: {
    titre: 'Savoirs', table: 'savoirs', tri: ['cree_le', false],
    aide: 'Une information sur un PNJ ou un colon. « Certains colons seulement » : cochez ceux qui la connaissent.',
    colonnes: ['pnj_id', 'colon_id', 'texte', 'portee', 'jour'],
    champs: [
      { n: 'pnj_id', l: 'Sur le PNJ', t: 'lien', vers: 'pnj', indice: 'Remplir le PNJ OU le colon, pas les deux.' },
      { n: 'colon_id', l: 'Sur le colon', t: 'lien', vers: 'colons' },
      { n: 'texte', l: 'Ce que l\'on sait', t: 'long', req: true },
      { n: 'portee', l: 'Qui le sait', t: 'choix', o: PORTEE, d: 'village' },
      { n: 'connaisseurs', l: 'Colons qui le savent', t: 'connaisseurs' },
      { n: 'jour', l: 'Appris le jour', t: 'nombre' },
    ],
  },
  objets: {
    titre: 'Échoppe', table: 'objets', tri: ['rayon', true],
    aide: 'Liez chaque objet au catalogue D&D pour afficher sa description officielle. Stock vide = illimité. Rayon « Arrivage » : quantités limitées, à renouveler à chaque cycle. Décochez « Visible » pour retirer un objet sans le supprimer.',
    colonnes: ['nom', 'categorie', 'rayon', 'prix', 'stock', 'cycle_id', 'catalogue_id', 'visible'],
    champs: [
      { n: 'nom', l: 'Nom', req: true }, { n: 'categorie', l: 'Catégorie' },
      { n: 'rayon', l: 'Rayon', t: 'choix', o: RAYONS, d: 'fonds' },
      { n: 'prix', l: 'Prix', t: 'monnaie', req: true },
      { n: 'stock', l: 'Stock (vide = illimité)', t: 'nombre' },
      { n: 'cycle_id', l: 'Cycle d\'arrivage', t: 'lien', vers: 'cycles' },
      { n: 'catalogue_id', l: 'Objet du catalogue D&D', t: 'lien', vers: 'catalogue', indice: 'Affiche sous l\'objet la description et les caractéristiques officielles.' },
      { n: 'description', l: 'Petit mot de l\'échoppe (facultatif, en italique)', t: 'long' },
      { n: 'ordre', l: 'Ordre', t: 'nombre', d: 0 }, { n: 'visible', l: 'En vente', t: 'bool', d: true },
    ],
  },
  achats: {
    titre: 'Achats', table: 'achats', tri: ['cree_le', false], lectureSeule: true,
    aide: 'Historique des achats à l\'échoppe. Pour rembourser, ajoutez un crédit dans « Or des colons ».',
    colonnes: ['cree_le', 'colon_id', 'nom_objet', 'quantite', 'prix_total'],
    champs: [],
  },
  commandes: {
    titre: 'Commandes', table: 'commandes', tri: ['cree_le', false],
    aide: 'Commandes spéciales passées par les colons. Le bouton « Débiter » retire le prix de la bourse du colon.',
    colonnes: ['cree_le', 'colon_id', 'demande', 'statut', 'prix', 'navire_id'],
    champs: [
      { n: 'colon_id', l: 'Colon', t: 'lien', vers: 'colons', req: true },
      { n: 'demande', l: 'Demande', t: 'long', req: true },
      { n: 'statut', l: 'Statut', t: 'choix', o: STATUTS_COMMANDE, d: 'demandee' },
      { n: 'prix', l: 'Prix', t: 'monnaie' },
      { n: 'navire_id', l: 'Livrée par', t: 'lien', vers: 'navires' },
      { n: 'reponse', l: 'Réponse visible du colon', t: 'long' },
    ],
    actions: [{ l: 'Débiter le prix', f: debiterCommande }],
  },
  missions: {
    titre: 'Ordres de mission', table: 'missions', tri: ['ordre', true], select: '*, inscriptions(colon_id, message)',
    colonnes: ['titre', 'statut', 'donneur', 'inscriptions', 'visible'],
    champs: [
      { n: 'titre', l: 'Titre', req: true }, { n: 'donneur', l: 'Donné par', d: 'Halvar Ordan' },
      { n: 'statut', l: 'Statut', t: 'choix', o: STATUTS_MISSION, d: 'ouverte' },
      { n: 'resume', l: 'Résumé (une phrase)', t: 'long' }, { n: 'description', l: 'Description complète', t: 'long' },
      { n: 'recompense', l: 'Récompense', t: 'long' }, { n: 'lien_discord', l: 'Discussion sur le Discord (lien)', t: 'url' },
      { n: 'rapport_id', l: 'Rapport au journal', t: 'lien', vers: 'journal', indice: 'Créez d\'abord l\'entrée dans « Journal », puis reliez-la ici.' },
      { n: 'ordre', l: 'Ordre', t: 'nombre', d: 0 }, { n: 'visible', l: 'Visible des joueurs', t: 'bool', d: true },
    ],
  },
  bestiaire: {
    titre: 'Bestiaire', table: 'bestiaire', tri: ['nom', true],
    aide: 'Une créature n\'apparaît aux joueurs qu\'une fois « Visible » cochée. Vous pouvez préparer des fiches à l\'avance.',
    colonnes: ['image_url', 'nom', 'categorie', 'danger', 'decouvert_par', 'cree_par', 'visible'],
    champs: [
      { n: 'nom', l: 'Nom', req: true }, { n: 'categorie', l: 'Catégorie' }, { n: 'danger', l: 'Danger (ex. Mortel)' },
      { n: 'habitat', l: 'Habitat' }, { n: 'image_url', l: 'Illustration', t: 'image' },
      { n: 'description', l: 'Description', t: 'long' },
      { n: 'decouvert_par', l: 'Documenté par', t: 'lien', vers: 'colons' }, { n: 'jour', l: 'Jour de la rencontre', t: 'nombre' },
      { n: 'cree_par', l: 'Ajouté par (joueur)', t: 'lien', vers: 'colons' },
      { n: 'visible', l: 'Visible des joueurs', t: 'bool', d: false },
      { n: 'notes_mj', l: 'Notes MJ (statistiques, secrets)', t: 'long' },
    ],
  },
  notes: {
    titre: 'Notes des joueurs', table: 'notes', tri: ['modifie_le', false],
    aide: 'Toutes les notes des joueurs : personnelles (que leur auteur est seul à voir sur le portail), partagées avec le village, et pages de carnet. Vous pouvez corriger ou supprimer.',
    colonnes: ['modifie_le', 'auteur_id', 'cible_type', 'cible', 'prive', 'texte'],
    champs: [
      { n: 'auteur_id', l: 'Auteur', t: 'lien', vers: 'colons', req: true },
      { n: 'cible_type', l: 'Sujet', t: 'choix', o: { pnj: 'PNJ', creature: 'Créature', colon: 'Colon', carnet: 'Carnet' } },
      { n: 'titre', l: 'Titre (carnet)' },
      { n: 'texte', l: 'Texte', t: 'long', req: true },
      { n: 'prive', l: 'Personnelle (visible de l\'auteur seul)', t: 'bool', d: true },
    ],
  },
  journal: {
    titre: 'Journal', table: 'journal', tri: ['cree_le', false], fleches: true,
    aide: 'Les entrées sont classées du jour le plus récent au plus ancien. Pour un même jour, utilisez les flèches ↑ ↓ pour choisir laquelle apparaît en premier chez les joueurs.',
    colonnes: ['ordre_jour', 'jour', 'type', 'titre', 'auteur', 'visible'],
    champs: [
      { n: 'titre', l: 'Titre', req: true }, { n: 'type', l: 'Type', t: 'choix', o: TYPES_JOURNAL, d: 'evenement' },
      { n: 'jour', l: 'Jour', t: 'nombre' }, { n: 'auteur', l: 'Auteur' },
      { n: 'contenu', l: 'Contenu', t: 'long', grand: true }, { n: 'lien_discord', l: 'Lien vers le Discord', t: 'url' },
      { n: 'visible', l: 'Visible des joueurs', t: 'bool', d: true },
    ],
  },
};

// Comment afficher une ligne d'une table quand on y fait référence
const LIBELLES = {
  besoins: r => `${r.icone || ''} ${r.nom}`, cycles: r => `Cycle ${r.numero}${r.titre ? ' · ' + r.titre : ''}`,
  emplacements: r => r.nom, colons: r => r.personnage, pnj: r => r.nom, navires: r => r.nom,
  projets: r => r.nom, scrutins: r => r.titre, cartes: r => r.nom, objets: r => r.nom,
  journal: r => `${r.jour ? `Jour ${r.jour} · ` : ''}${r.titre}`,
  bestiaire: r => r.nom,
  catalogue: r => `${r.nom} · ${r.categorie}`,
};
const cache = {};
async function lookup(table, forcer = false) {
  if (cache[table] && !forcer) return cache[table];
  const { data, error } = await sb.from(table).select('*');
  if (error) throw error;
  cache[table] = Object.fromEntries(data.map(r => [r.id, r]));
  return cache[table];
}
const viderCache = (...t) => (t.length ? t : Object.keys(cache)).forEach(k => delete cache[k]);
const libelle = (table, id) => id && cache[table]?.[id] ? LIBELLES[table](cache[table][id]) : '';

// =============================================================== Navigation
const MENU = [
  ['Suivi', [['tableau', 'Tableau de bord', 'nouveautes'], ['or', 'Or des colons'], ['commandes', 'Commandes', 'commandes']]],
  ['Le village', [['village', 'Village & jour'], ['cycles', 'Cycles'], ['besoins', 'Besoins'], ['projets', 'Projets'], ['carte', 'Carte du village'], ['scrutins', 'Votes', 'scrutins'], ['navires', 'Navires']]],
  ['Les gens', [['colons', 'Colons'], ['pnj', 'PNJ'], ['savoirs', 'Savoirs'], ['notes', 'Notes des joueurs']]],
  ['Le monde', [['missions', 'Ordres de mission'], ['journal', 'Journal'], ['bestiaire', 'Bestiaire']]],
  ['Commerce', [['objets', 'Échoppe'], ['catalogue', 'Catalogue D&D 2024'], ['achats', 'Achats']]],
  ['Réglages', [['parametres', 'Paramètres']]],
];
const VUES_SPECIALES = { catalogue: vueCatalogue, tableau: vueTableau, or: vueOr, village: vueVillage, carte: vueCarte, scrutins: vueScrutins, parametres: vueParametres };

async function compteurs() {
  const [k, s, n] = await Promise.all([
    sb.from('commandes').select('id', { count: 'exact', head: true }).eq('statut', 'demandee'),
    sb.from('scrutins').select('id', { count: 'exact', head: true }).eq('statut', 'ouvert'),
    sb.from('nouveautes').select('id', { count: 'exact', head: true }),
  ]);
  return { commandes: k.count || 0, scrutins: s.count || 0, nouveautes: n.count || 0 };
}

async function dessinerMenu() {
  const c = await compteurs().catch(() => ({}));
  const page = location.hash.slice(1) || 'tableau';
  $('#menu').innerHTML = MENU.map(([g, items]) => `<div class="groupe">${g}</div>` +
    items.map(([id, l, cpt]) => `<a href="#${id}" class="${id === page ? 'actif' : ''}">${l}${cpt && c[cpt] ? `<span class="compte">${c[cpt]}</span>` : ''}</a>`).join('')).join('');
}

async function router() {
  clearInterval(minuterie);
  const page = location.hash.slice(1) || 'tableau';
  dessinerMenu();
  vue.innerHTML = '<p class="chargement">Chargement…</p>';
  try {
    if (VUES_SPECIALES[page]) await VUES_SPECIALES[page]();
    else if (ENTITES[page]) await vueListe(page);
    else await vueTableau();
  } catch (e) {
    vue.innerHTML = `<h1>Oups</h1><p>${esc(msgErreur(e))}</p>`;
  }
}
window.addEventListener('hashchange', router);

// =============================================================== Liste générique
async function chargerLiens(ent) {
  const tables = new Set(ent.champs.filter(c => c.t === 'lien').map(c => c.vers));
  ent.colonnes.forEach(c => { const ch = ent.champs.find(x => x.n === c); if (ch?.t === 'lien') tables.add(ch.vers); });
  if (ent.table === 'achats' || ent.table === 'missions') tables.add('colons');
  if (ent.table === 'notes') ['pnj', 'bestiaire', 'colons'].forEach(t => tables.add(t));
  await Promise.all([...tables].map(t => lookup(t, true)));
}

function cellule(ent, ligne, col) {
  const v = ligne[col];
  const ch = ent.champs.find(c => c.n === col) || {};
  if (col === 'ordre_jour') return `<span style="white-space:nowrap"><button class="bouton discret petit" data-deplacer="-1" data-id="${ligne.id}" title="Monter">↑</button> <button class="bouton discret petit" data-deplacer="1" data-id="${ligne.id}" title="Descendre">↓</button></span>`;
  if (col === 'inscriptions') return v?.length ? v.map(i => esc(libelle('colons', i.colon_id))).join(', ') : '<span class="cache">aucun</span>';
  if (col === 'colon_id' && ent.table === 'achats') return esc(libelle('colons', v));
  if (col === 'cree_le' || col === 'modifie_le') return `<span style="white-space:nowrap">${dateCourte(v)}</span>`;
  if (col === 'cible') return ligne.cible_type === 'carnet' ? esc(ligne.titre || 'Carnet') : esc(libelle({ pnj: 'pnj', creature: 'bestiaire', colon: 'colons' }[ligne.cible_type], ligne.cible_id));
  if (['prix', 'prix_total', 'montant'].includes(col)) return v === null ? '' : `<span class="num">${poHTML(v)}</span>`;
  if (v === null || v === undefined || v === '') return '';
  if (ch.t === 'bool' || typeof v === 'boolean') return v ? '✓' : '<span class="cache">non</span>';
  if (ch.t === 'choix') return esc(ch.o[v] || v);
  if (ch.t === 'lien') return esc(libelle(ch.vers, v));
  if (ch.t === 'image') return `<img class="mini" src="${esc(v)}" alt="">`;
  return `<span class="court">${esc(v)}</span>`;
}

async function vueListe(cle) {
  const ent = ENTITES[cle];
  await chargerLiens(ent);
  let q = sb.from(ent.table).select(ent.select || '*');
  if (ent.tri) q = q.order(ent.tri[0], { ascending: ent.tri[1], nullsFirst: false });
  const { data, error } = await q;
  if (error) throw error;
  if (ent.fleches) data.sort((a, b) => ((b.jour ?? -1e9) - (a.jour ?? -1e9)) || (a.ordre - b.ordre) || (new Date(b.cree_le) - new Date(a.cree_le)));

  const enTete = c => (ent.champs.find(x => x.n === c)?.l) || { ordre_jour: 'Ordre', cree_le: 'Date', modifie_le: 'Date', cible: 'Sur', inscriptions: 'Volontaires', colon_id: 'Colon', nom_objet: 'Objet', quantite: 'Qté', prix_total: 'Total' }[c] || c;
  const dessiner = filtre => {
    const lignes = data.filter(r => !filtre || JSON.stringify(r).toLowerCase().includes(filtre) ||
      ent.colonnes.some(c => cellule(ent, r, c).toLowerCase().includes(filtre)));
    $('#tbody').innerHTML = lignes.map(r => `<tr class="${ent.lectureSeule ? '' : 'cliquable'} ${r.visible === false || r.actif === false ? 'cache' : ''}" data-id="${r.id}">
      ${ent.colonnes.map(c => `<td>${cellule(ent, r, c)}</td>`).join('')}</tr>`).join('')
      || `<tr><td colspan="${ent.colonnes.length}" class="cache">Rien pour l'instant.</td></tr>`;
    if (!ent.lectureSeule) $('#tbody').querySelectorAll('tr[data-id]').forEach(tr =>
      tr.addEventListener('click', ev => { if (!ev.target.closest('[data-deplacer]')) editer(cle, data.find(r => r.id === tr.dataset.id)); }));
    $('#tbody').querySelectorAll('[data-deplacer]').forEach(b => b.addEventListener('click', async ev => {
      ev.stopPropagation();
      const ligne = data.find(r => r.id === b.dataset.id);
      const memeJour = data.filter(r => (r.jour ?? null) === (ligne.jour ?? null));
      const i = memeJour.indexOf(ligne), j = i + Number(b.dataset.deplacer);
      if (j < 0 || j >= memeJour.length) return;
      [memeJour[i], memeJour[j]] = [memeJour[j], memeJour[i]];
      const res = await Promise.all(memeJour.map((r, k) => sb.from(ent.table).update({ ordre: k }).eq('id', r.id)));
      const err = res.find(r => r.error);
      if (err) return toast(msgErreur(err.error), 'erreur');
      router();
    }));
  };

  vue.innerHTML = `<h1>${ent.titre}</h1>${ent.aide ? `<p class="aide">${esc(ent.aide)}</p>` : ''}
    <div class="barre-outils">${ent.lectureSeule ? '' : '<button class="bouton" id="nouveau">+ Ajouter</button>'}
      <input type="search" id="filtre" placeholder="Filtrer…"><span class="cache">${data.length} ligne${data.length > 1 ? 's' : ''}</span></div>
    <div class="table-cadre"><table class="donnees"><thead><tr>${ent.colonnes.map(c => `<th>${esc(enTete(c))}</th>`).join('')}</tr></thead><tbody id="tbody"></tbody></table></div>`;
  dessiner('');
  $('#filtre').addEventListener('input', e => dessiner(e.target.value.trim().toLowerCase()));
  $('#nouveau')?.addEventListener('click', () => editer(cle, null));
}

// =============================================================== Formulaire générique
function champHTML(c, val) {
  const v = val ?? (c.d ?? '');
  const id = `f-${c.n}`;
  const indice = c.indice ? `<span class="indice">${esc(c.indice)}</span>` : '';
  const req = c.req ? 'required' : '';
  switch (c.t) {
    case 'long':
      return `<label class="champ"><span>${esc(c.l)}</span><textarea id="${id}" name="${c.n}" ${req} style="${c.grand ? 'min-height:16em' : ''}">${esc(v)}</textarea>${indice}</label>`;
    case 'nombre':
      return `<label class="champ"><span>${esc(c.l)}</span><input id="${id}" name="${c.n}" type="number" step="${c.pas || 1}" value="${esc(v)}" ${req}>${indice}</label>`;
    case 'bool':
      return `<label class="champ case"><input id="${id}" name="${c.n}" type="checkbox" ${v === true || v === 'true' ? 'checked' : ''}><span>${esc(c.l)}</span></label>`;
    case 'choix':
      return `<label class="champ"><span>${esc(c.l)}</span><select id="${id}" name="${c.n}">${Object.entries(c.o).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${indice}</label>`;
    case 'lien': {
      const lignes = Object.values(cache[c.vers] || {}).sort((a, b) => LIBELLES[c.vers](a).localeCompare(LIBELLES[c.vers](b), 'fr', { numeric: true }));
      return `<label class="champ"><span>${esc(c.l)}</span><select id="${id}" name="${c.n}" ${req}><option value="">(aucun)</option>${lignes.map(r => `<option value="${r.id}" ${r.id === v ? 'selected' : ''}>${esc(LIBELLES[c.vers](r))}</option>`).join('')}</select>${indice}</label>`;
    }
    case 'image':
      return `<div class="champ"><span>${esc(c.l)}</span>${v ? `<img class="apercu-image" src="${esc(v)}" alt="">` : ''}
        <input name="${c.n}" type="url" value="${esc(v)}" placeholder="Lien https://… ou fichier ci-dessous">
        <input name="${c.n}__fichier" type="file" accept="image/*" style="margin-top:6px"></div>`;
    case 'monnaie':
      return champMonnaie(c.n, val ?? c.d, { label: c.l });
    case 'url':
      return `<label class="champ"><span>${esc(c.l)}</span><input id="${id}" name="${c.n}" type="url" value="${esc(v)}">${indice}</label>`;
    case 'connaisseurs': {
      const colons = Object.values(cache.colons || {}).sort((a, b) => a.personnage.localeCompare(b.personnage, 'fr'));
      return `<div class="champ" id="bloc-connaisseurs"><span>${esc(c.l)}</span><div class="cases">${colons.map(k =>
        `<label><input type="checkbox" name="connaisseurs" value="${k.id}" ${(val || []).includes(k.id) ? 'checked' : ''}> ${esc(k.personnage)}</label>`).join('') || '<em>Aucun colon.</em>'}</div></div>`;
    }
    default:
      return `<label class="champ"><span>${esc(c.l)}</span><input id="${id}" name="${c.n}" value="${esc(v)}" ${req}>${indice}</label>`;
  }
}

async function televerser(fichier, dossier) {
  const nomPropre = fichier.name.toLowerCase().normalize('NFD').replace(/[^\w.]+/g, '-');
  const chemin = `${dossier}/${Date.now()}-${nomPropre}`;
  const { error } = await sb.storage.from('images').upload(chemin, fichier, { upsert: false, contentType: fichier.type });
  if (error) throw error;
  return sb.storage.from('images').getPublicUrl(chemin).data.publicUrl;
}

async function lireFormulaire(form, champs, dossier) {
  const fd = new FormData(form);
  const ligne = {};
  for (const c of champs) {
    if (c.t === 'connaisseurs') continue;
    if (c.t === 'bool') { ligne[c.n] = form.elements[c.n].checked; continue; }
    if (c.t === 'monnaie') { ligne[c.n] = lireMonnaie(form, c.n); continue; }
    let v = fd.get(c.n);
    if (c.t === 'image') {
      const f = fd.get(c.n + '__fichier');
      if (f && f.size) v = await televerser(f, dossier);
    }
    v = typeof v === 'string' ? v.trim() : v;
    if (v === '' || v === null) v = null;
    else if (c.t === 'nombre') v = Number(v);
    ligne[c.n] = v;
  }
  return ligne;
}

async function editer(cle, ligne, apres) {
  const ent = ENTITES[cle];
  await chargerLiens(ent);
  if (cle === 'savoirs') await lookup('colons', true);
  let connus = [];
  if (cle === 'savoirs' && ligne) {
    const { data } = await sb.from('savoirs_colons').select('colon_id').eq('savoir_id', ligne.id);
    connus = (data || []).map(r => r.colon_id);
  }
  const champs = ent.champs.map(c => c.t === 'connaisseurs' ? champHTML(c, connus) : champHTML(c, ligne?.[c.n])).join('');
  $('#modale-corps').innerHTML = `<form id="form-edit" novalidate>
    <h2>${ligne ? 'Modifier' : 'Ajouter'} · ${esc(ent.titre)}</h2>${champs}
    <div class="pied">
      <div>${ligne ? '<button type="button" class="bouton danger petit" id="supprimer">Supprimer</button>' : ''}
        ${ligne && ent.actions ? ent.actions.map((a, i) => `<button type="button" class="bouton discret petit" data-action="${i}">${esc(a.l)}</button>`).join('') : ''}</div>
      <div class="droite"><button type="button" class="bouton discret" id="annuler">Annuler</button><button class="bouton" type="submit">Enregistrer</button></div>
    </div></form>`;
  modale.showModal();
  const form = $('#form-edit');
  const majPortee = () => { const b = $('#bloc-connaisseurs'); if (b) b.hidden = form.elements.portee?.value !== 'restreint'; };
  form.elements.portee?.addEventListener('change', majPortee); majPortee();
  $('#annuler').onclick = () => modale.close();
  form.querySelectorAll('[data-action]').forEach(b => b.onclick = async () => {
    try { await ent.actions[b.dataset.action].f(ligne); modale.close(); router(); } catch (e) { toast(msgErreur(e), 'erreur'); }
  });
  $('#supprimer')?.addEventListener('click', async () => {
    if (!confirm('Supprimer définitivement cette ligne ?')) return;
    const { error } = await sb.from(ent.table).delete().eq('id', ligne.id);
    if (error) return toast(msgErreur(error), 'erreur');
    toast('Supprimé.'); modale.close(); viderCache(ent.table); apres ? apres() : router();
  });
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const manque = ent.champs.filter(c => c.req && (c.t === 'monnaie' ? lireMonnaie(form, c.n) === null : !String(form.elements[c.n]?.value ?? '').trim()));
    if (manque.length) return toast(`À remplir : ${manque.map(c => c.l).join(', ')}`, 'erreur');
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const donnees = await lireFormulaire(form, ent.champs, ent.table);
      const req = ligne ? sb.from(ent.table).update(donnees).eq('id', ligne.id).select().single()
        : sb.from(ent.table).insert(donnees).select().single();
      const { data, error } = await req;
      if (error) throw error;
      if (cle === 'savoirs') {
        const choisis = [...form.querySelectorAll('input[name=connaisseurs]:checked')].map(i => i.value);
        await sb.from('savoirs_colons').delete().eq('savoir_id', data.id);
        if (donnees.portee === 'restreint' && choisis.length) {
          const { error: e2 } = await sb.from('savoirs_colons').insert(choisis.map(colon_id => ({ savoir_id: data.id, colon_id })));
          if (e2) throw e2;
        }
      }
      if (cle === 'cycles' && donnees.en_cours) await sb.from('cycles').update({ en_cours: false }).neq('id', data.id);
      toast('Enregistré.'); modale.close(); viderCache(ent.table); apres ? apres() : router();
    } catch (e) { toast(msgErreur(e), 'erreur'); btn.disabled = false; }
  });
}

async function debiterCommande(c) {
  if (!c.prix) throw new Error('Indiquez d\'abord un prix.');
  if (!confirm(`Retirer ${po(c.prix)} à ${libelle('colons', c.colon_id)} ?`)) return;
  const { error } = await sb.from('transactions').insert({ colon_id: c.colon_id, montant: -c.prix, motif: `Commande : ${c.demande.slice(0, 80)}`, origine: 'mj' });
  if (error) throw error;
  toast('Bourse débitée.');
}

// =============================================================== Tableau de bord
async function vueTableau() {
  const [{ data: v }, { data: soldes }, { count: nbCmd }, { count: nbVotes }, { data: cy }] = await Promise.all([
    sb.from('village').select('*').eq('id', 1).single(),
    sb.from('soldes').select('*'),
    sb.from('commandes').select('id', { count: 'exact', head: true }).eq('statut', 'demandee'),
    sb.from('scrutins').select('id', { count: 'exact', head: true }).eq('statut', 'ouvert'),
    sb.from('cycles').select('*').eq('en_cours', true).maybeSingle(),
  ]);
  await lookup('colons', true);
  vue.innerHTML = `<h1>Tableau de bord</h1>
    <p class="aide">${esc(v?.nom || '')} · Jour ${v?.jour_actuel ?? '?'}${cy ? ` · Cycle ${cy.numero}` : ''}</p>
    <div class="tuiles">
      <a class="tuile" href="#village"><strong>Jour ${v?.jour_actuel ?? '?'}</strong><span>Avancer le temps</span></a>
      <a class="tuile" href="#colons"><strong>${Object.values(cache.colons).filter(c => c.actif).length}</strong><span>colons actifs</span></a>
      <a class="tuile" href="#scrutins"><strong>${nbVotes || 0}</strong><span>vote(s) ouvert(s)</span></a>
      <a class="tuile" href="#commandes"><strong>${nbCmd || 0}</strong><span>commande(s) en attente</span></a>
      <a class="tuile" href="#or"><strong style="font-size:1.3rem">${poHTML((soldes || []).reduce((s, r) => s + Number(r.solde), 0))}</strong><span>d'or dans les bourses</span></a>
    </div>
    <h2>Nouveautés à annoncer sur Discord</h2>
    <p class="aide">Ce qui a changé depuis la dernière annonce : projets, missions, votes, objets de l'échoppe. Rien ne part tant que vous ne cliquez pas sur « Publier ».</p>
    <div class="bloc" id="nouveautes"></div>
    <h2>Ce qui se passe au village</h2>
    <p class="aide">Toutes les actions des joueurs, y compris celles qu'ils ne voient pas (commandes, fiches). Mise à jour automatique toutes les 30 secondes.</p>
    <ul class="fil-admin" id="fil"></ul>`;
  const fil = async () => {
    const { data } = await sb.from('activite').select('*').order('cree_le', { ascending: false }).limit(150);
    const el = $('#fil'); if (!el) return;
    el.innerHTML = (data || []).map(a => `<li class="${a.public ? '' : 'prive'}"><time>${dateCourte(a.cree_le)}</time><span class="type">${esc(a.type)}${a.public ? '' : ' · privé'}</span><span>${esc(a.message)}</span></li>`).join('')
      || '<li><span></span><span></span><span class="cache">Aucune activité pour l\'instant.</span></li>';
  };
  await fil();
  await blocNouveautes();
  minuterie = setInterval(fil, 30000);
}

const SECTIONS = { chantiers: 'Chantiers', missions: 'Ordres de mission', votes: 'Conseil', echoppe: 'Échoppe' };
async function blocNouveautes() {
  const el = $('#nouveautes');
  const { data, error } = await sb.from('nouveautes').select('*, objets(nom, prix, stock, visible)').order('cree_le');
  if (error) { el.textContent = msgErreur(error); return; }
  const lignes = (data || []).filter(n => !n.objet_id || n.objets?.visible);
  if (!lignes.length) { el.innerHTML = '<p class="cache" style="margin:0">Rien de neuf à annoncer.</p>'; return; }
  const texte = n => n.texte ? n.texte.replace(/\*\*/g, '')
    : `📦 ${n.objets.nom} : ${po(n.objets.prix)}${n.objets.stock !== null ? ` (${n.objets.stock} en stock)` : ''}`;
  el.innerHTML = Object.entries(SECTIONS).map(([k, titre]) => {
    const ls = lignes.filter(n => n.section === k);
    return ls.length ? `<p style="margin:.6em 0 .2em;color:var(--or)">${titre}</p>` + ls.map(n =>
      `<label style="display:flex;gap:8px;padding:.2em 0"><input type="checkbox" name="nv" value="${n.id}" checked> <span>${esc(texte(n))}</span></label>`).join('') : '';
  }).join('') + `<div class="en-ligne" style="margin-top:12px">
      <button class="bouton" id="publier">Publier la sélection sur Discord</button>
      <button class="bouton danger petit" id="ecarter">Retirer de la liste sans publier</button></div>`;
  const choisis = () => [...el.querySelectorAll('input[name=nv]:checked')].map(i => i.value);
  $('#publier').onclick = async () => {
    const ids = choisis(); if (!ids.length) return toast('Rien de coché.', 'erreur');
    $('#publier').disabled = true;
    const { data: n, error: e } = await sb.rpc('mj_publier_nouveautes', { p_ids: ids });
    if (e) { toast(msgErreur(e), 'erreur'); $('#publier').disabled = false; return; }
    toast(`${n} nouveauté(s) publiée(s) sur Discord.`); dessinerMenu(); blocNouveautes();
  };
  $('#ecarter').onclick = async () => {
    const ids = choisis(); if (!ids.length) return toast('Rien de coché.', 'erreur');
    if (!confirm(`Retirer ${ids.length} ligne(s) sans les publier ?`)) return;
    const { error: e } = await sb.from('nouveautes').delete().in('id', ids);
    if (e) return toast(msgErreur(e), 'erreur');
    dessinerMenu(); blocNouveautes();
  };
}

// =============================================================== Village & jour
async function vueVillage() {
  const { data: v, error } = await sb.from('village').select('*').eq('id', 1).single();
  if (error) throw error;
  vue.innerHTML = `<h1>Village & jour</h1>
    <p class="aide">Le jour en jeu s'affiche en haut du portail. Avancez-le après chaque séance.</p>
    <div class="grille-2">
      <div class="bloc"><h2 style="margin-top:0">Le temps</h2>
        <p style="font-size:2.2rem;font-family:var(--ancien);color:var(--or-pale);margin:.1em 0">Jour <span id="jour">${v.jour_actuel}</span></p>
        <div class="en-ligne">
          <button class="bouton discret" data-j="-1">−1</button><button class="bouton" data-j="1">+1 jour</button>
          <label class="champ"><span>Avancer de</span><input type="number" id="saut" min="1" value="2"></label>
          <button class="bouton discret" id="sauter">Avancer</button>
        </div></div>
      <form class="bloc" id="form-village"><h2 style="margin-top:0">Le village</h2>
        <label class="champ"><span>Nom du village</span><input name="nom" value="${esc(v.nom)}" required></label>
        <label class="champ"><span>Palier</span><input name="palier" value="${esc(v.palier)}" list="paliers"></label>
        <datalist id="paliers"><option>Campement</option><option>Hameau</option><option>Village</option><option>Bourg</option><option>Ville</option></datalist>
        <label class="champ"><span>Présentation (sous le nom, sur le portail)</span><textarea name="description">${esc(v.description || '')}</textarea></label>
        <button class="bouton" type="submit">Enregistrer</button>
      </form>
    </div>`;
  const majJour = async j => {
    const { error } = await sb.from('village').update({ jour_actuel: Math.max(1, j) }).eq('id', 1);
    if (error) return toast(msgErreur(error), 'erreur');
    $('#jour').textContent = Math.max(1, j); v.jour_actuel = Math.max(1, j); toast(`Nous sommes au jour ${v.jour_actuel}.`);
  };
  vue.querySelectorAll('[data-j]').forEach(b => b.onclick = () => majJour(v.jour_actuel + Number(b.dataset.j)));
  $('#sauter').onclick = () => majJour(v.jour_actuel + Number($('#saut').value || 0));
  $('#form-village').onsubmit = async ev => {
    ev.preventDefault();
    const f = ev.target;
    const { error } = await sb.from('village').update({ nom: f.nom.value.trim(), palier: f.palier.value.trim() || 'Campement', description: f.description.value.trim() || null }).eq('id', 1);
    toast(error ? msgErreur(error) : 'Village enregistré.', error ? 'erreur' : 'ok');
  };
}

// =============================================================== Or
async function vueOr() {
  const [{ data: soldes }, { data: tx }] = await Promise.all([
    sb.from('soldes').select('*').order('personnage'),
    sb.from('transactions').select('*').order('cree_le', { ascending: false }).limit(200),
  ]);
  await lookup('colons', true);
  vue.innerHTML = `<h1>Or des colons</h1>
    <p class="aide">Les soldes se calculent à partir de chaque mouvement. Pour corriger une erreur, supprimez le mouvement ou ajoutez-en un inverse.</p>
    <div class="grille-2">
      <form class="bloc" id="form-or"><h2 style="margin-top:0">Verser ou retirer</h2>
        <div class="champ"><span>Colons concernés</span>
          <div class="cases"><label><input type="checkbox" id="tous"> <em>Tous les actifs</em></label>${(soldes || []).filter(s => cache.colons[s.colon_id]?.actif).map(s => `<label><input type="checkbox" name="c" value="${s.colon_id}"> ${esc(s.personnage)}</label>`).join('')}</div></div>
        ${champMonnaie('montant', null, { label: 'Montant par colon', signe: true })}
        <label class="champ"><span>Motif</span><input name="motif" required placeholder="Ex. : Mission du bûcher"></label>
        <button class="bouton" type="submit">Enregistrer</button>
      </form>
      <div class="bloc"><h2 style="margin-top:0">Soldes</h2>
        <table class="donnees">${(soldes || []).map(s => `<tr class="${cache.colons[s.colon_id]?.actif ? '' : 'cache'}"><td>${esc(s.personnage)}<br><span class="cache">${esc(s.joueur)}</span></td><td class="num">${poHTML(s.solde)}</td></tr>`).join('')}</table>
      </div>
    </div>
    <h2>Derniers mouvements</h2>
    <div class="table-cadre"><table class="donnees"><thead><tr><th>Date</th><th>Colon</th><th>Motif</th><th>Origine</th><th>Montant</th><th></th></tr></thead><tbody>
    ${(tx || []).map(t => `<tr><td>${dateCourte(t.cree_le)}</td><td>${esc(libelle('colons', t.colon_id))}</td><td>${esc(t.motif)}</td><td>${esc(t.origine)}</td>
      <td class="num" style="color:${Number(t.montant) < 0 ? '#E08A90' : '#9FC48B'}">${poHTML(t.montant)}</td>
      <td><button class="bouton danger petit" data-suppr="${t.id}">×</button></td></tr>`).join('')}
    </tbody></table></div>`;
  $('#tous').onchange = e => vue.querySelectorAll('input[name=c]').forEach(i => i.checked = e.target.checked);
  $('#form-or').onsubmit = async ev => {
    ev.preventDefault();
    const f = ev.target;
    const ids = [...f.querySelectorAll('input[name=c]:checked')].map(i => i.value);
    if (!ids.length) return toast('Cochez au moins un colon.', 'erreur');
    const montant = lireMonnaie(f, 'montant');
    if (!montant) return toast('Indiquez un montant.', 'erreur');
    const { error } = await sb.from('transactions').insert(ids.map(colon_id => ({ colon_id, montant, motif: f.motif.value.trim(), origine: 'mj' })));
    if (error) return toast(msgErreur(error), 'erreur');
    toast(`${ids.length} mouvement(s) enregistré(s).`); router();
  };
  vue.querySelectorAll('[data-suppr]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer ce mouvement ?')) return;
    const { error } = await sb.from('transactions').delete().eq('id', b.dataset.suppr);
    if (error) return toast(msgErreur(error), 'erreur');
    router();
  });
}

// =============================================================== Carte du village
let carteChoisie = null;
async function vueCarte() {
  const { data: cartes } = await sb.from('cartes').select('*').order('cree_le', { ascending: false });
  if (!carteChoisie || !cartes.find(c => c.id === carteChoisie)) carteChoisie = (cartes.find(c => c.active) || cartes[0])?.id || null;
  const carte = cartes.find(c => c.id === carteChoisie);
  const [{ data: emps }, { data: projets }] = await Promise.all([
    carte ? sb.from('emplacements').select('*').eq('carte_id', carte.id) : Promise.resolve({ data: [] }),
    sb.from('projets').select('id, nom, icone, statut, emplacement_id').order('ordre'),
  ]);
  const projetDe = id => projets.find(p => p.emplacement_id === id);

  vue.innerHTML = `<h1>Carte du village</h1>
    <p class="aide">Téléversez un fond Inkarnate, puis cliquez sur la carte pour créer un emplacement. Faites glisser un repère pour le déplacer. Quand le village change, ajoutez une nouvelle carte et activez-la : les emplacements de l'ancienne restent dans l'historique.</p>
    <div class="barre-outils">
      <select id="choix-carte" class="saisie" style="max-width:280px;background:var(--nuit);color:var(--clair)">${cartes.map(c => `<option value="${c.id}" ${c.id === carteChoisie ? 'selected' : ''}>${esc(c.nom)}${c.active ? ' (active)' : ''}</option>`).join('') || '<option>Aucune carte</option>'}</select>
      ${carte && !carte.active ? '<button class="bouton" id="activer">Montrer cette carte aux joueurs</button>' : ''}
      <button class="bouton discret" id="nouvelle-carte">+ Nouvelle carte</button>
      ${carte ? '<button class="bouton discret" id="changer-fond">Changer le fond</button><button class="bouton danger petit" id="suppr-carte">Supprimer la carte</button>' : ''}
    </div>
    ${carte ? `<div class="editeur">
      <div class="plan" id="plan">${carte.image_url ? `<img src="${esc(carte.image_url)}" alt="">` : '<p style="padding:3em;text-align:center">Pas encore d\'image : utilisez « Changer le fond ».</p>'}
        ${emps.map(e => { const p = projetDe(e.id); return `<div class="pt ${p ? '' : 'libre'}" data-id="${e.id}" style="left:${e.x}%;top:${e.y}%">${p ? esc(p.icone || '🏠') : ''}<span>${esc(p ? p.nom : e.nom)}</span></div>`; }).join('')}
      </div>
      <div class="bloc" id="panneau-emp"><p class="aide" style="margin:0">Cliquez sur un repère pour le modifier, ou sur un endroit vide pour créer un emplacement.</p></div>
    </div>` : '<div class="bloc"><p>Aucune carte. Créez-en une avec votre fond Inkarnate.</p></div>'}`;

  $('#choix-carte').onchange = e => { carteChoisie = e.target.value; router(); };
  $('#activer')?.addEventListener('click', async () => {
    await sb.from('cartes').update({ active: false }).neq('id', carte.id);
    const { error } = await sb.from('cartes').update({ active: true }).eq('id', carte.id);
    toast(error ? msgErreur(error) : 'Les joueurs voient maintenant cette carte.', error ? 'erreur' : 'ok'); router();
  });
  const formCarte = (titre, existante) => {
    $('#modale-corps').innerHTML = `<form id="f-carte"><h2>${titre}</h2>
      <label class="champ"><span>Nom</span><input name="nom" required value="${esc(existante?.nom || '')}" placeholder="Ex. : Le camp, cycle 2"></label>
      <div class="champ"><span>Image (export Inkarnate en JPG ou PNG)</span><input name="fichier" type="file" accept="image/*" ${existante ? '' : 'required'}></div>
      <div class="pied"><span></span><div class="droite"><button type="button" class="bouton discret" onclick="this.closest('dialog').close()">Annuler</button><button class="bouton">Enregistrer</button></div></div></form>`;
    modale.showModal();
    $('#f-carte').onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target; const b = f.querySelector('button:not([type=button])'); b.disabled = true; b.textContent = 'Envoi…';
      try {
        const fic = f.fichier.files[0];
        const url = fic ? await televerser(fic, 'cartes') : existante?.image_url;
        const ligne = { nom: f.nom.value.trim(), image_url: url };
        const r = existante ? await sb.from('cartes').update(ligne).eq('id', existante.id).select().single()
          : await sb.from('cartes').insert({ ...ligne, active: !cartes.length }).select().single();
        if (r.error) throw r.error;
        carteChoisie = r.data.id; modale.close(); router();
      } catch (e) { toast(msgErreur(e), 'erreur'); b.disabled = false; b.textContent = 'Enregistrer'; }
    };
  };
  $('#nouvelle-carte').onclick = () => formCarte('Nouvelle carte');
  $('#changer-fond')?.addEventListener('click', () => formCarte('Modifier la carte', carte));
  $('#suppr-carte')?.addEventListener('click', async () => {
    if (!confirm('Supprimer cette carte et tous ses emplacements ?')) return;
    const { error } = await sb.from('cartes').delete().eq('id', carte.id);
    if (error) return toast(msgErreur(error), 'erreur');
    carteChoisie = null; router();
  });
  if (!carte) return;

  const plan = $('#plan');
  const pos = ev => { const r = plan.getBoundingClientRect(); return { x: Math.min(100, Math.max(0, (ev.clientX - r.left) / r.width * 100)), y: Math.min(100, Math.max(0, (ev.clientY - r.top) / r.height * 100)) }; };

  const panneau = e => {
    plan.querySelectorAll('.pt').forEach(p => p.classList.toggle('choisi', p.dataset.id === e?.id));
    const p = e ? projetDe(e.id) : null;
    const libres = projets.filter(x => !x.emplacement_id || x.emplacement_id === e?.id);
    $('#panneau-emp').innerHTML = `<form id="f-emp"><h2 style="margin-top:0">${e ? 'Emplacement' : 'Nouvel emplacement'}</h2>
      <label class="champ"><span>Nom de l'emplacement</span><input name="nom" required value="${esc(e?.nom || '')}" placeholder="Ex. : Bord de la rivière"></label>
      <label class="champ"><span>Description</span><textarea name="description" style="min-height:4em">${esc(e?.description || '')}</textarea></label>
      <label class="champ"><span>Bâtiment placé ici</span><select name="projet"><option value="">(libre)</option>${libres.map(x => `<option value="${x.id}" ${p?.id === x.id ? 'selected' : ''}>${esc((x.icone || '') + ' ' + x.nom)} · ${STATUTS_PROJET[x.statut]}</option>`).join('')}</select>
        <span class="indice">Sur le portail, seuls les projets « En chantier » ou « Construit » apparaissent sur la carte.</span></label>
      <div class="en-ligne"><button class="bouton">Enregistrer</button>${e ? '<button type="button" class="bouton danger petit" id="suppr-emp">Supprimer</button>' : ''}</div></form>`;
    $('#f-emp').onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target;
      try {
        let id = e?.id;
        const ligne = { nom: f.nom.value.trim(), description: f.description.value.trim() || null };
        if (id) { const r = await sb.from('emplacements').update(ligne).eq('id', id); if (r.error) throw r.error; }
        else { const r = await sb.from('emplacements').insert({ ...ligne, carte_id: carte.id, x: panneau.nx, y: panneau.ny }).select().single(); if (r.error) throw r.error; id = r.data.id; }
        await sb.from('projets').update({ emplacement_id: null }).eq('emplacement_id', id);
        if (f.projet.value) { const r = await sb.from('projets').update({ emplacement_id: id }).eq('id', f.projet.value); if (r.error) throw r.error; }
        toast('Emplacement enregistré.'); router();
      } catch (err) { toast(msgErreur(err), 'erreur'); }
    };
    $('#suppr-emp')?.addEventListener('click', async () => {
      if (!confirm('Supprimer cet emplacement ?')) return;
      await sb.from('emplacements').delete().eq('id', e.id); router();
    });
  };

  // Clic sur le fond : nouvel emplacement
  plan.addEventListener('click', ev => {
    if (ev.target.closest('.pt') || !carte.image_url) return;
    const { x, y } = pos(ev);
    plan.querySelector('.pt.nouveau')?.remove();
    const pt = document.createElement('div'); pt.className = 'pt libre nouveau choisi'; pt.style.left = x + '%'; pt.style.top = y + '%';
    plan.append(pt);
    panneau.nx = Math.round(x * 100) / 100; panneau.ny = Math.round(y * 100) / 100;
    panneau(null);
  });

  // Repères : clic pour éditer, glisser pour déplacer
  plan.querySelectorAll('.pt[data-id]').forEach(pt => {
    let depart = null, bouge = false;
    pt.addEventListener('pointerdown', ev => { ev.stopPropagation(); depart = { x: ev.clientX, y: ev.clientY }; bouge = false; pt.setPointerCapture(ev.pointerId); });
    pt.addEventListener('pointermove', ev => {
      if (!depart) return;
      if (Math.hypot(ev.clientX - depart.x, ev.clientY - depart.y) > 4) bouge = true;
      if (bouge) { const { x, y } = pos(ev); pt.style.left = x + '%'; pt.style.top = y + '%'; }
    });
    pt.addEventListener('pointerup', async ev => {
      if (!depart) return; depart = null;
      const e = emps.find(x => x.id === pt.dataset.id);
      if (bouge) {
        const { x, y } = pos(ev);
        const { error } = await sb.from('emplacements').update({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }).eq('id', e.id);
        if (error) toast(msgErreur(error), 'erreur'); else { e.x = x; e.y = y; }
      } else panneau(e);
    });
    pt.addEventListener('click', ev => ev.stopPropagation());
  });
}

// =============================================================== Votes
async function vueScrutins() {
  const [{ data: scrutins }, { data: bulletins }] = await Promise.all([
    sb.from('scrutins').select('*, choix(*)').order('cree_le', { ascending: false }),
    sb.from('bulletins').select('*'),
  ]);
  await Promise.all([lookup('colons', true), lookup('projets', true), lookup('emplacements', true), lookup('cycles', true)]);
  const { data: hook } = await sb.from('parametres').select('valeur').eq('cle', 'discord_webhook').maybeSingle();

  vue.innerHTML = `<h1>Votes du conseil</h1>
    <p class="aide">Un vote en brouillon est invisible des joueurs. Ouvrez-le quand il est prêt : chaque voix est annoncée sur le Discord${hook?.valeur ? '' : ' (webhook pas encore réglé dans Paramètres)'}. Les joueurs peuvent changer d'avis tant que le vote est ouvert.</p>
    <div class="barre-outils"><button class="bouton" id="nouveau-scrutin">+ Nouveau vote</button>
      <button class="bouton discret" id="scrutin-projets">+ Vote sur les projets disponibles</button></div>
    ${scrutins.map(s => {
      const bs = bulletins.filter(b => b.scrutin_id === s.id);
      const choix = [...s.choix].sort((a, b) => a.ordre - b.ordre);
      return `<div class="bloc scrutin-admin" data-s="${s.id}">
        <div class="barre-outils" style="justify-content:space-between;margin:0">
          <h2 style="margin:0">${esc(s.titre)} <span class="badge ${s.statut === 'ouvert' ? 'vert' : s.statut === 'clos' ? 'gris' : 'or'}">${STATUT_SCRUTIN[s.statut]}</span></h2>
          <div class="en-ligne">
            ${s.statut !== 'ouvert' ? `<button class="bouton petit" data-statut="ouvert">${s.statut === 'clos' ? 'Rouvrir' : 'Ouvrir le vote'}</button>` : '<button class="bouton petit" data-statut="clos">Clore le vote</button>'}
            ${s.statut === 'ouvert' ? '<button class="bouton discret petit" data-statut="brouillon">Repasser en brouillon</button>' : ''}
            <button class="bouton discret petit" data-modifier>Modifier</button>
          </div>
        </div>
        ${s.description ? `<p class="aide" style="margin:.5em 0">${esc(s.description)}</p>` : ''}
        ${choix.map(c => { const v = bs.filter(b => b.choix_id === c.id); return `<div class="choix-ligne">
          <div><strong>${esc(c.libelle)}</strong>${c.projet_id ? ` <span class="cache">· projet ${esc(libelle('projets', c.projet_id))}</span>` : ''}${c.emplacement_id ? ` <span class="cache">· ${esc(libelle('emplacements', c.emplacement_id))}</span>` : ''}
            <span class="qui">${v.map(b => esc(libelle('colons', b.colon_id))).join(', ')}</span></div>
          <div class="en-ligne"><span class="voix">${v.length} voix</span><button class="bouton danger petit" data-suppr-choix="${c.id}" title="Retirer ce choix">×</button></div></div>`; }).join('') || '<p class="cache">Aucun choix.</p>'}
        <form class="en-ligne form-choix" style="margin-top:10px">
          <label class="champ"><span>Nouveau choix</span><input name="libelle" required placeholder="Libellé"></label>
          <label class="champ"><span>Projet lié (facultatif)</span><select name="projet"><option value="">(aucun)</option>${Object.values(cache.projets).map(p => `<option value="${p.id}">${esc(p.nom)}</option>`).join('')}</select></label>
          <button class="bouton petit">Ajouter</button>
        </form>
        ${s.statut === 'clos' ? `<form class="en-ligne form-resultat" style="margin-top:10px"><label class="champ"><span>Décision annoncée aux joueurs</span><input name="resultat" value="${esc(s.resultat || '')}" placeholder="Ex. : La tour de guet sera bâtie ce cycle."></label><button class="bouton petit">Enregistrer</button></form>` : ''}
      </div>`;
    }).join('') || '<div class="bloc">Aucun vote.</div>'}`;

  const formScrutin = s => {
    $('#modale-corps').innerHTML = `<form id="f-s"><h2>${s ? 'Modifier le vote' : 'Nouveau vote'}</h2>
      <label class="champ"><span>Question</span><input name="titre" required value="${esc(s?.titre || '')}"></label>
      <label class="champ"><span>Explication</span><textarea name="description">${esc(s?.description || '')}</textarea></label>
      <label class="champ"><span>Cycle</span><select name="cycle"><option value="">(aucun)</option>${Object.values(cache.cycles).sort((a, b) => b.numero - a.numero).map(c => `<option value="${c.id}" ${(s ? s.cycle_id : c.en_cours ? c.id : '') === c.id ? 'selected' : ''}>${esc(LIBELLES.cycles(c))}</option>`).join('')}</select></label>
      <div class="pied"><div>${s ? '<button type="button" class="bouton danger petit" id="suppr-s">Supprimer le vote</button>' : ''}</div><div class="droite"><button type="button" class="bouton discret" onclick="this.closest('dialog').close()">Annuler</button><button class="bouton">Enregistrer</button></div></div></form>`;
    modale.showModal();
    $('#f-s').onsubmit = async ev => {
      ev.preventDefault(); const f = ev.target;
      const ligne = { titre: f.titre.value.trim(), description: f.description.value.trim() || null, cycle_id: f.cycle.value || null };
      const { error } = s ? await sb.from('scrutins').update(ligne).eq('id', s.id) : await sb.from('scrutins').insert({ ...ligne, statut: 'brouillon' });
      if (error) return toast(msgErreur(error), 'erreur');
      modale.close(); router();
    };
    $('#suppr-s')?.addEventListener('click', async () => {
      if (!confirm('Supprimer ce vote et toutes ses voix ?')) return;
      await sb.from('scrutins').delete().eq('id', s.id); modale.close(); router();
    });
  };
  $('#nouveau-scrutin').onclick = () => formScrutin(null);
  $('#scrutin-projets').onclick = async () => {
    const dispo = Object.values(cache.projets).filter(p => p.statut === 'disponible').sort((a, b) => a.ordre - b.ordre);
    if (!dispo.length) return toast('Aucun projet « Disponible ».', 'erreur');
    const cy = Object.values(cache.cycles).find(c => c.en_cours);
    const { data, error } = await sb.from('scrutins').insert({ titre: `Chantier du cycle ${cy?.numero ?? ''}`.trim(), description: 'Un seul chantier pourra être mené d\'ici la prochaine séance principale.', statut: 'brouillon', cycle_id: cy?.id || null }).select().single();
    if (error) return toast(msgErreur(error), 'erreur');
    await sb.from('choix').insert(dispo.map((p, i) => ({ scrutin_id: data.id, libelle: p.nom, projet_id: p.id, ordre: i })));
    toast('Vote créé en brouillon.'); router();
  };
  vue.querySelectorAll('[data-s]').forEach(bloc => {
    const s = scrutins.find(x => x.id === bloc.dataset.s);
    bloc.querySelectorAll('[data-statut]').forEach(b => b.onclick = async () => {
      if (b.dataset.statut === 'ouvert' && !s.choix.length) return toast('Ajoutez au moins un choix.', 'erreur');
      const { error } = await sb.from('scrutins').update({ statut: b.dataset.statut }).eq('id', s.id);
      if (error) return toast(msgErreur(error), 'erreur');
      toast(b.dataset.statut === 'ouvert' ? 'Le vote est ouvert aux colons.' : 'Statut mis à jour.'); router();
    });
    bloc.querySelector('[data-modifier]').onclick = () => formScrutin(s);
    bloc.querySelectorAll('[data-suppr-choix]').forEach(b => b.onclick = async () => {
      if (!confirm('Retirer ce choix (et les voix qui s\'y portaient) ?')) return;
      await sb.from('choix').delete().eq('id', b.dataset.supprChoix); router();
    });
    bloc.querySelector('.form-choix').onsubmit = async ev => {
      ev.preventDefault(); const f = ev.target;
      const { error } = await sb.from('choix').insert({ scrutin_id: s.id, libelle: f.libelle.value.trim(), projet_id: f.projet.value || null, ordre: s.choix.length });
      if (error) return toast(msgErreur(error), 'erreur');
      router();
    };
    const fr = bloc.querySelector('.form-resultat');
    if (fr) fr.onsubmit = async ev => {
      ev.preventDefault();
      const { error } = await sb.from('scrutins').update({ resultat: fr.resultat.value.trim() || null }).eq('id', s.id);
      toast(error ? msgErreur(error) : 'Décision enregistrée.', error ? 'erreur' : 'ok');
    };
  });
}

// =============================================================== Catalogue D&D 2024
let catalogueCache = null;
async function vueCatalogue() {
  if (!catalogueCache) {
    const { data, error } = await sb.from('catalogue').select('*').order('ordre');
    if (error) throw error;
    catalogueCache = data;
  }
  await lookup('cycles', true);
  const cats = [...new Set(catalogueCache.map(c => c.categorie))];
  vue.innerHTML = `<h1>Catalogue D&D 2024</h1>
    <p class="aide">Équipement et objets magiques du SRD 5.2.1 (version libre des règles 2024), avec les prix du manuel. Les objets magiques ont la valeur indicative de leur rareté. Cochez des lignes puis « Mettre en vente » pour les ajouter à l'échoppe avec la majoration de frontière. Réservé au MJ.</p>
    <div class="barre-outils">
      <select id="cat" class="saisie" style="max-width:240px;background:var(--nuit);color:var(--clair)"><option value="">Toutes les catégories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select>
      <input type="search" id="q" placeholder="Rechercher (nom, rareté, propriété…)">
      <button class="bouton" id="vendre" disabled>Mettre en vente</button><span class="cache" id="nb"></span>
    </div>
    <div class="table-cadre"><table class="donnees"><thead><tr><th></th><th>Nom</th><th>Catégorie</th><th>Prix</th><th>Poids</th><th>Détails</th></tr></thead><tbody id="tbody"></tbody></table></div>
    <p class="aide" style="margin-top:1em">Source : Document de Référence du Système 5.2.1, Wizards of the Coast LLC, licence CC-BY-4.0.</p>`;
  const choisis = new Set();
  const majBouton = () => { $('#vendre').disabled = !choisis.size; $('#vendre').textContent = choisis.size ? `Mettre en vente (${choisis.size})` : 'Mettre en vente'; };
  const dessiner = () => {
    const cat = $('#cat').value, q = $('#q').value.trim().toLowerCase();
    const lignes = catalogueCache.filter(c => (!cat || c.categorie === cat) &&
      (!q || [c.nom, c.sous_categorie, c.details, c.rarete].join(' ').toLowerCase().includes(q)));
    $('#nb').textContent = `${lignes.length} objet${lignes.length > 1 ? 's' : ''}`;
    $('#tbody').innerHTML = lignes.map(c => `<tr>
      <td><input type="checkbox" data-c="${c.id}" ${choisis.has(c.id) ? 'checked' : ''}></td>
      <td><strong>${esc(c.nom)}</strong>${c.rarete ? `<br><span class="cache">${esc(c.rarete)}</span>` : ''}</td>
      <td>${esc(c.categorie)}${c.sous_categorie ? `<br><span class="cache">${esc(c.sous_categorie)}</span>` : ''}</td>
      <td class="num">${c.prix === null ? '<span class="cache">variable</span>' : poHTML(c.prix)}</td>
      <td style="white-space:nowrap">${esc(c.poids || '')}</td>
      <td><span class="court">${esc(c.details || '')}</span></td></tr>`).join('');
    $('#tbody').querySelectorAll('[data-c]').forEach(i => i.onchange = () => { i.checked ? choisis.add(i.dataset.c) : choisis.delete(i.dataset.c); majBouton(); });
  };
  $('#cat').onchange = dessiner; $('#q').oninput = dessiner; dessiner();
  $('#vendre').onclick = () => mettreEnVente(catalogueCache.filter(c => choisis.has(c.id)));
}

function mettreEnVente(liste) {
  const cycleEnCours = Object.values(cache.cycles || {}).find(c => c.en_cours);
  const majo = 1.5;
  const prixDe = (c, m) => c.prix === null ? '' : Math.round(c.prix * m * 100) / 100;
  $('#modale-corps').innerHTML = `<form id="f-vente"><h2>Mettre en vente</h2>
    <div class="deux">
      <label class="champ"><span>Rayon</span><select name="rayon">${Object.entries(RAYONS).map(([k, l]) => `<option value="${k}" ${k === 'arrivage' ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="champ"><span>Majoration de frontière</span><input name="majo" type="number" step="0.05" min="0" value="${majo}"><span class="indice">1.5 = +50 % sur le prix du manuel</span></label>
      <label class="champ"><span>Stock par objet (vide = illimité)</span><input name="stock" type="number" min="0" value="${liste.length === 1 ? 1 : 2}"></label>
      <label class="champ"><span>Cycle d'arrivage</span><select name="cycle"><option value="">(aucun)</option>${Object.values(cache.cycles || {}).sort((a, b) => b.numero - a.numero).map(c => `<option value="${c.id}" ${cycleEnCours?.id === c.id ? 'selected' : ''}>${esc(LIBELLES.cycles(c))}</option>`).join('')}</select></label>
    </div>
    <div class="table-cadre"><table class="donnees"><thead><tr><th>Objet</th><th>Catégorie à l'échoppe</th><th>Prix de vente (po)</th></tr></thead><tbody>
    ${liste.map((c, i) => `<tr><td>${esc(c.nom)}<br><span class="cache">manuel : ${c.prix === null ? 'variable' : poHTML(c.prix)}</span></td>
      <td><input class="saisie" name="cat-${i}" value="${esc(c.categorie === 'Objets magiques' ? 'Objets magiques' : (c.sous_categorie && c.categorie === 'Outils' ? c.sous_categorie : c.categorie))}" style="background:var(--mer);color:var(--clair)"></td>
      <td data-base="${c.prix ?? ''}" data-i="${i}">${champMonnaie(`prix-${i}`, c.prix === null ? null : prixDe(c, majo))}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="pied"><span class="aide" style="margin:0">Chaque nouvel objet apparaîtra dans les nouveautés à annoncer.</span><div class="droite"><button type="button" class="bouton discret" onclick="this.closest('dialog').close()">Annuler</button><button class="bouton">Ajouter à l'échoppe</button></div></div></form>`;
  modale.showModal();
  const f = $('#f-vente');
  f.majo.oninput = () => f.querySelectorAll('td[data-base]').forEach(td => {
    if (td.dataset.base === '') return;
    const p = pieces(Math.round(Number(td.dataset.base) * Number(f.majo.value || 1) * 100) / 100);
    ['po', 'pa', 'pc'].forEach(k => { f.elements[`prix-${td.dataset.i}__${k}`].value = p[k]; });
  });
  f.onsubmit = async ev => {
    ev.preventDefault();
    const lignes = liste.map((c, i) => ({
      nom: c.nom, categorie: f[`cat-${i}`].value.trim() || c.categorie, rayon: f.rayon.value,
      prix: lireMonnaie(f, `prix-${i}`), stock: f.stock.value === '' ? null : Number(f.stock.value),
      cycle_id: f.cycle.value || null, catalogue_id: c.id, description: null, visible: true,
    }));
    if (lignes.some(l => l.prix === null || l.prix < 0)) return toast('Indiquez un prix pour chaque objet.', 'erreur');
    const { error } = await sb.from('objets').insert(lignes);
    if (error) return toast(msgErreur(error), 'erreur');
    toast(`${lignes.length} objet(s) ajouté(s) à l'échoppe.`); modale.close(); dessinerMenu();
  };
}

// =============================================================== Paramètres
async function vueParametres() {
  const [{ data: params }, { data: mjs }] = await Promise.all([
    sb.from('parametres').select('*'),
    sb.from('mj_emails').select('*'),
  ]);
  const P = Object.fromEntries((params || []).map(p => [p.cle, p.valeur || '']));
  vue.innerHTML = `<h1>Paramètres</h1>
    <div class="grille-2">
      <form class="bloc" id="f-hook"><h2 style="margin-top:0">Discord</h2>
        <p class="aide">Pour chaque salon : Paramètres du salon › Intégrations › Webhooks › Nouveau webhook › Copier l'URL du webhook.</p>
        <label class="champ"><span>Salon des annonces (nouveautés publiées depuis le tableau de bord)</span><input name="annonces" type="url" value="${esc(P.discord_webhook_annonces)}" placeholder="https://discord.com/api/webhooks/…"></label>
        <label class="champ"><span>Salon des votes (chaque voix y est annoncée automatiquement)</span><input name="votes" type="url" value="${esc(P.discord_webhook)}" placeholder="https://discord.com/api/webhooks/…"></label>
        <label class="champ"><span>Adresse du portail (ajoutée en bas des annonces)</span><input name="portail" type="url" value="${esc(P.url_portail)}"></label>
        <div class="en-ligne"><button class="bouton">Enregistrer</button>
          <button type="button" class="bouton discret" data-test="annonces">Tester les annonces</button>
          <button type="button" class="bouton discret" data-test="votes">Tester les votes</button></div>
      </form>
      <div class="bloc"><h2 style="margin-top:0">Maîtres du jeu</h2>
        <p class="aide">Ces adresses ont accès à l'admin, après avoir créé leur compte depuis la page de connexion.</p>
        ${mjs.map(m => `<p class="en-ligne" style="justify-content:space-between">${esc(m.email)} <button class="bouton danger petit" data-mj="${esc(m.email)}">Retirer</button></p>`).join('')}
        <form class="en-ligne" id="f-mj"><label class="champ"><span>Ajouter un MJ</span><input name="email" type="email" required></label><button class="bouton petit">Ajouter</button></form>
      </div>
    </div>`;
  $('#f-hook').onsubmit = async ev => {
    ev.preventDefault();
    const f = ev.target;
    const hooks = { discord_webhook_annonces: f.annonces.value.trim() || null, discord_webhook: f.votes.value.trim() || null };
    if (Object.values(hooks).some(u => u && !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(u))) return toast('Un des liens ne ressemble pas à un webhook Discord.', 'erreur');
    const { error } = await sb.from('parametres').upsert([
      ...Object.entries(hooks).map(([cle, valeur]) => ({ cle, valeur })),
      { cle: 'url_portail', valeur: f.portail.value.trim() || null },
    ]);
    toast(error ? msgErreur(error) : 'Paramètres enregistrés.', error ? 'erreur' : 'ok');
  };
  vue.querySelectorAll('[data-test]').forEach(b => b.onclick = async () => {
    const { error } = await sb.rpc('mj_tester_webhook', { p_salon: b.dataset.test });
    toast(error ? msgErreur(error) : 'Message envoyé : vérifiez le salon Discord.', error ? 'erreur' : 'ok');
  });
  $('#f-mj').onsubmit = async ev => {
    ev.preventDefault();
    const { error } = await sb.from('mj_emails').insert({ email: ev.target.email.value.trim().toLowerCase() });
    if (error) return toast(msgErreur(error), 'erreur');
    router();
  };
  vue.querySelectorAll('[data-mj]').forEach(b => b.onclick = async () => {
    if (mjs.length === 1) return toast('Il faut garder au moins un MJ.', 'erreur');
    if (!confirm(`Retirer l'accès de ${b.dataset.mj} ?`)) return;
    await sb.from('mj_emails').delete().eq('email', b.dataset.mj); router();
  });
}

// =============================================================== Connexion
async function demarrer() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { $('#connexion').hidden = false; $('#admin').hidden = true; return; }
  const { data: estMj, error } = await sb.rpc('est_mj');
  if (error || !estMj) {
    $('#connexion').hidden = false; $('#admin').hidden = true;
    $('#connexion-msg').textContent = `Le compte ${session.user.email} n'est pas inscrit comme MJ.`;
    await sb.auth.signOut();
    return;
  }
  $('#qui').textContent = session.user.email;
  $('#connexion').hidden = true; $('#admin').hidden = false;
  router();
}

let modeConnexion = 'entrer';
document.querySelectorAll('#form-connexion [data-mode]').forEach(b => b.addEventListener('click', () => { modeConnexion = b.dataset.mode; }));
$('#form-connexion').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target; const msg = $('#connexion-msg'); msg.textContent = '';
  const email = f.email.value.trim(), password = f.mdp.value;
  if (modeConnexion === 'creer') {
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } });
    if (error) { msg.textContent = msgErreur(error); return; }
    if (!data.session) { msg.textContent = 'Compte créé. Confirmez votre adresse via l\'e-mail reçu, puis revenez vous connecter.'; return; }
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { msg.textContent = /confirm/i.test(error.message) ? 'Adresse pas encore confirmée : vérifiez vos e-mails.' : 'E-mail ou mot de passe incorrect.'; return; }
  }
  demarrer();
});
$('#oubli').addEventListener('click', async () => {
  const email = $('#form-connexion').email.value.trim();
  if (!email) { $('#connexion-msg').textContent = 'Saisissez d\'abord votre e-mail.'; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
  $('#connexion-msg').textContent = error ? msgErreur(error) : 'Un lien de réinitialisation vous a été envoyé.';
});
$('#deconnexion').addEventListener('click', async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); });

sb.auth.onAuthStateChange(async (evt) => {
  if (evt === 'PASSWORD_RECOVERY') {
    const nouveau = prompt('Choisissez un nouveau mot de passe (8 caractères minimum) :');
    if (nouveau) {
      const { error } = await sb.auth.updateUser({ password: nouveau });
      toast(error ? msgErreur(error) : 'Mot de passe modifié.', error ? 'erreur' : 'ok');
    }
  }
});

demarrer();
