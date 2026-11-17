import {
  sb, esc, para, po, dateCourte, toast, msgErreur,
  ETATS_BESOIN, STATUTS_PROJET, STATUTS_MISSION, STATUTS_NAVIRE, STATUTS_COMMANDE, TYPES_JOURNAL, RAYONS,
} from './commun.js';

const CLE_MDP = 'colonie_iristhale_mdp';
let mdp = localStorage.getItem(CLE_MDP) || '';
let E = null;                // état complet renvoyé par la base
let filtreJournal = 'tout';

const $ = s => document.querySelector(s);
const contenu = $('#contenu');

// ---------------------------------------------------------------- Accès
async function rpc(nom, args = {}) {
  const { data, error } = await sb.rpc(nom, { p_mdp: mdp, ...args });
  if (error) throw error;
  return data;
}

async function charger() {
  E = await rpc('portail_etat');
  rendreEntete();
  rendre();
}

async function entrer(motDePasse) {
  mdp = motDePasse.trim();
  try {
    await charger();
    localStorage.setItem(CLE_MDP, mdp);
    $('#entree').hidden = true;
    $('#portail').hidden = false;
  } catch (e) {
    localStorage.removeItem(CLE_MDP);
    $('#entree').hidden = false;
    $('#portail').hidden = true;
    $('#entree-erreur').textContent = /Mot de passe/.test(msgErreur(e))
      ? 'Ce mot de passe ne figure pas au registre.'
      : 'Le registre est inaccessible pour le moment. Réessayez dans un instant.';
  }
}

$('#form-entree').addEventListener('submit', ev => {
  ev.preventDefault();
  $('#entree-erreur').textContent = '';
  entrer($('#mdp').value);
});
$('#sortir').addEventListener('click', () => {
  localStorage.removeItem(CLE_MDP);
  location.hash = '';
  location.reload();
});

// Action joueur générique : appelle la base, affiche le message, recharge
async function agir(nom, args, bouton) {
  if (bouton) bouton.disabled = true;
  try {
    const r = await rpc(nom, args);
    toast(r?.message || 'C\'est fait.');
    await charger();
  } catch (e) {
    toast(msgErreur(e), 'erreur');
    if (bouton) bouton.disabled = false;
  }
}

// ---------------------------------------------------------------- En-tête
function rendreEntete() {
  const v = E.village || {};
  $('#nom-village').textContent = v.nom || 'Le camp';
  const cy = E.cycle;
  $('#horloge').textContent = [`Jour ${v.jour_actuel ?? '?'}`, cy ? `Cycle ${cy.numero}` : null, v.palier].filter(Boolean).join(' · ');
  $('#solde').textContent = po(E.moi.solde);
  $('#nom-moi').textContent = E.moi.personnage;
  const aVoter = E.scrutins.filter(s => s.statut === 'ouvert' && !s.mon_choix).length;
  $('#pastille-votes').hidden = !aVoter;
  $('#pastille-votes').textContent = aVoter;
}

// ---------------------------------------------------------------- Routage
const PAGES = { village, echoppe, missions, votes, journal, habitants, bestiaire, fiche };

function rendre() {
  const page = (location.hash.slice(1) || 'village');
  const f = PAGES[page] || village;
  document.querySelectorAll('.onglets a').forEach(a => a.classList.toggle('actif', a.getAttribute('href') === '#' + (PAGES[page] ? page : 'village')));
  contenu.innerHTML = f();
  brancher(page);
}
window.addEventListener('hashchange', () => { if (E) { rendre(); contenu.focus({ preventScroll: true }); window.scrollTo(0, 0); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && E) charger().catch(() => {}); });

// ---------------------------------------------------------------- Pages
function village() {
  const v = E.village || {};
  const cy = E.cycle;
  const enCours = E.projets.filter(p => p.statut === 'en_cours');
  const ouverts = E.scrutins.filter(s => s.statut === 'ouvert');
  return `
  <h1 class="titre-page">${esc(v.nom || 'Le camp')}</h1>
  <p class="chapeau">${v.description ? esc(v.description) : `${esc(v.palier || 'Campement')} de la Compagnie du Levant sur Iristhale.`}</p>

  <div class="deux-colonnes">
    <div>
      ${carteVillage()}

      <h2 class="titre-section">Les besoins du village <small>ce qui manque encore pour vivre ici</small></h2>
      <div class="besoins">${E.besoins.map(besoin).join('') || '<p class="vide">Aucun besoin recensé.</p>'}</div>

      <h2 class="titre-section">Les chantiers</h2>
      ${blocProjets()}
    </div>

    <aside>
      ${cy ? `<div class="panneau">
        <h3>Cycle ${esc(cy.numero)}${cy.titre ? ` · ${esc(cy.titre)}` : ''}</h3>
        ${cy.jour_debut ? `<p class="meta">Depuis le jour ${esc(cy.jour_debut)}${cy.jour_fin ? `, jusqu'au jour ${esc(cy.jour_fin)}` : ''}</p>` : ''}
        ${cy.resume ? `<p>${esc(cy.resume)}</p>` : ''}
        ${enCours.length ? `<p><strong>Chantier :</strong> ${enCours.map(p => esc(p.nom)).join(', ')}</p>` : ''}
        ${ouverts.length ? `<p><a href="#votes">🗳️ ${ouverts.length} vote${ouverts.length > 1 ? 's' : ''} en cours</a></p>` : ''}
      </div>` : ''}

      <div class="panneau">
        <h3>Navires</h3>
        ${E.navires.map(n => `
          <p><strong>${esc(n.nom)}</strong> <span class="badge ${n.statut === 'a_quai' ? 'vert' : n.statut === 'perdu' ? 'rouge' : 'or'}">${STATUTS_NAVIRE[n.statut]}</span></p>
          ${n.capitaine ? `<p class="meta">Capitaine ${esc(n.capitaine)}</p>` : ''}
          ${n.jour_prevu ? `<p class="meta">Attendu le jour ${esc(n.jour_prevu)}</p>` : ''}
          ${n.annonce ? `<p>${esc(n.annonce)}</p>` : ''}
          ${n.cargaison ? `<p class="meta">Cargaison : ${esc(n.cargaison)}</p>` : ''}
        `).join('<hr style="border:0;border-top:1px solid rgba(169,166,189,.15)">') || '<p class="vide">Aucun navire annoncé.</p>'}
      </div>

      <div class="panneau">
        <h3>Au camp, ces derniers temps</h3>
        <ul class="fil">${E.activite.slice(0, 12).map(a => `<li><time>${dateCourte(a.cree_le)}</time>${esc(a.message)}</li>`).join('') || '<li class="vide">Rien à signaler.</li>'}</ul>
      </div>

      ${E.journal.length ? `<div class="panneau">
        <h3>Dernières pages du journal</h3>
        <ul class="fil">${E.journal.slice(0, 4).map(j => `<li><time>${j.jour ? `Jour ${esc(j.jour)}` : dateCourte(j.cree_le)}</time><a href="#journal">${esc(j.titre)}</a></li>`).join('')}</ul>
      </div>` : ''}
    </aside>
  </div>`;
}

function carteVillage() {
  const c = E.carte;
  if (!c || !c.image_url) {
    return `<div class="carte-absente parchemin"><p>Le cartographe n'a pas encore achevé le plan du village.</p></div>`;
  }
  const reperes = c.emplacements.map((e, i) => {
    const p = e.projet;
    const cls = p ? (p.statut === 'en_cours' ? 'chantier' : 'bati') : 'libre';
    return `<button class="repere ${cls}" style="left:${Number(e.x)}%;top:${Number(e.y)}%" data-emp="${i}"
      aria-label="${esc(p ? p.nom : e.nom)}"><span class="icone">${p ? esc(p.icone || '🏠') : ''}</span><span class="nom">${esc(p ? p.nom : e.nom)}</span></button>`;
  }).join('');
  return `<div class="carte-village"><img src="${esc(c.image_url)}" alt="Plan du village : ${esc(c.nom)}">${reperes}</div>`;
}

function besoin(b) {
  const e = ETATS_BESOIN[b.etat] || ETATS_BESOIN.non_couvert;
  return `<div class="besoin parchemin" data-niveau="${e.niveau}">
    <div class="besoin-tete"><span class="ico" aria-hidden="true">${esc(b.icone || '•')}</span><h3>${esc(b.nom)}</h3></div>
    <div class="jauge" aria-hidden="true"><i></i><i></i></div>
    <span class="etat">${e.label}</span>${b.provisoire ? '<span class="ancre" title="Ne tient que grâce aux navires de la Compagnie">⚓ grâce aux navires</span>' : ''}
    ${b.note ? `<p class="note">${esc(b.note)}</p>` : b.description ? `<p class="note">${esc(b.description)}</p>` : ''}
  </div>`;
}

function blocProjets() {
  const groupes = [
    ['en_cours', 'En chantier'], ['en_vote', 'Soumis au vote'], ['disponible', 'Possibles dès maintenant'],
    ['verrouille', 'Pas encore à notre portée'], ['termine', 'Construits'],
  ];
  const html = groupes.map(([st, titre]) => {
    const ps = E.projets.filter(p => p.statut === st);
    if (!ps.length) return '';
    return `<h3 style="font-size:1.15rem;color:var(--doux);margin:1.2em 0 .6em">${titre}</h3>
      <div class="grille">${ps.map(projet).join('')}</div>`;
  }).join('');
  return html || '<p class="vide">Aucun chantier envisagé pour l\'instant.</p>';
}

function projet(p) {
  return `<div class="projet parchemin ${p.statut}">
    <span class="ico" aria-hidden="true">${esc(p.icone || '')}</span>
    <h3>${esc(p.nom)}</h3>
    <p class="meta">${p.besoin ? esc(p.besoin) : ''}${p.commande_compagnie ? ' · <span class="badge cire">Commande de la Compagnie</span>' : ''}</p>
    ${p.description ? `<p>${esc(p.description)}</p>` : ''}
    ${p.statut === 'verrouille' && p.conditions ? `<p class="il-faut"><strong>Il faudra :</strong> ${esc(p.conditions)}</p>` : ''}
    ${p.effet ? `<p class="effet">${p.statut === 'termine' ? '' : 'Une fois construit : '}${esc(p.effet)}</p>` : ''}
  </div>`;
}

function echoppe() {
  const peutPayer = prix => Number(E.moi.solde) >= Number(prix);
  const ligne = o => `<tr>
    <td>${esc(o.nom)}${o.description ? `<span class="desc">${esc(o.description)}</span>` : ''}</td>
    <td class="prix">${po(o.prix)}</td>
    <td class="stock">${o.stock === null ? '' : o.stock > 0 ? `Reste ${o.stock}` : '<span class="badge rouge">Épuisé</span>'}</td>
    <td class="col-achat"><div class="achat">
      ${o.stock === 0 ? '' : `<input type="number" min="1" max="${o.stock ?? 50}" value="1" aria-label="Quantité" data-qte="${o.id}">
      <button class="bouton petit" data-acheter="${o.id}" ${peutPayer(o.prix) ? '' : 'disabled title="Pas assez d\'or"'}>Acheter</button>`}
    </div></td></tr>`;

  const table = objets => {
    let cat = null;
    return `<table class="etal"><thead><tr><th>Article</th><th>Prix</th><th></th><th></th></tr></thead><tbody>${
      objets.map(o => {
        let h = '';
        if (o.categorie !== cat) { cat = o.categorie; h += `<tr class="categorie"><td colspan="4">${esc(cat || 'Divers')}</td></tr>`; }
        return h + ligne(o);
      }).join('')}</tbody></table>`;
  };
  const parCat = l => [...l].sort((a, b) => (a.categorie || '').localeCompare(b.categorie || '', 'fr'));
  const arrivage = E.objets.filter(o => o.rayon !== 'fonds');
  const fonds = parCat(E.objets.filter(o => o.rayon === 'fonds'));
  const jasmine = E.pnj.find(p => /jasmine/i.test(p.nom));

  return `
  <h1 class="titre-page">L'échoppe</h1>
  <p class="chapeau">Tenue par la guilde des commerçants. Tout ce qui est ici a traversé l'océan, et cela se ressent sur les prix.</p>
  <div class="jasmine parchemin">
    ${jasmine?.portrait_url ? `<img class="portrait" src="${esc(jasmine.portrait_url)}" alt="">` : '<div class="portrait" aria-hidden="true">J</div>'}
    <div><blockquote>« Approchez, approchez ! Le dernier navire m'a laissé quelques merveilles, et je ne les garderai pas longtemps. »</blockquote>
    <p class="meta" style="margin:.4em 0 0">Votre bourse : <strong>${po(E.moi.solde)}</strong></p></div>
  </div>

  <h2 class="titre-section">Arrivage${E.cycle ? ` du cycle ${esc(E.cycle.numero)}` : ''} <small>en quantité limitée, premier arrivé, premier servi</small></h2>
  <div class="parchemin carte-p">${arrivage.length ? table(arrivage) : '<p class="vide">Rien de neuf dans les caisses pour le moment.</p>'}</div>

  <h2 class="titre-section">Fonds de l'échoppe <small>toujours disponible</small></h2>
  <div class="parchemin carte-p">${fonds.length ? table(fonds) : '<p class="vide">Les étagères sont vides.</p>'}</div>

  <h2 class="titre-section">Commande pour Estoria <small>livrée par un prochain navire, si la Compagnie accepte</small></h2>
  <div class="deux-colonnes">
    <form id="form-commande" class="parchemin carte-p">
      <label class="champ"><span>Ce que vous voulez faire venir d'Estoria</span>
        <textarea name="demande" maxlength="600" required placeholder="Ex. : une longue-vue, un livre sur la flore des îles, des pointes de flèches en argent…"></textarea></label>
      <button class="bouton" type="submit">Passer commande</button>
    </form>
    <div class="parchemin carte-p">
      <h3>Mes commandes</h3>
      ${E.moi.commandes.length ? E.moi.commandes.map(k => `<p><span class="badge ${k.statut === 'refusee' ? 'rouge' : k.statut === 'livree' ? 'vert' : 'or'}">${STATUTS_COMMANDE[k.statut]}</span>
        ${esc(k.demande)}${k.prix ? ` · <strong>${po(k.prix)}</strong>` : ''}${k.reponse ? `<br><span class="meta">${esc(k.reponse)}</span>` : ''}</p>`).join('') : '<p class="vide">Aucune commande.</p>'}
    </div>
  </div>`;
}

function missions() {
  const actives = E.missions.filter(m => ['ouverte', 'en_cours'].includes(m.statut));
  const closes = E.missions.filter(m => !['ouverte', 'en_cours'].includes(m.statut));
  const carte = m => {
    const ouverte = ['ouverte', 'en_cours'].includes(m.statut);
    const couleur = { ouverte: 'vert', en_cours: 'ambre', terminee: 'or', echouee: 'rouge', annulee: 'gris' }[m.statut];
    return `<article class="mission parchemin carte-p ${m.statut}">
      <div class="ligne"><h3>${esc(m.titre)}</h3><span class="badge ${couleur}">${STATUTS_MISSION[m.statut]}</span></div>
      ${m.donneur ? `<p class="meta">Ordre de ${esc(m.donneur)}</p>` : ''}
      ${m.resume ? `<p><em>${esc(m.resume)}</em></p>` : ''}
      ${m.description ? para(m.description) : ''}
      ${m.recompense ? `<p class="recompense">🪙 ${esc(m.recompense)}</p>` : ''}
      ${m.inscrits.length ? `<p style="margin-bottom:0"><strong>Volontaires :</strong></p><ul class="inscrits">${m.inscrits.map(i => `<li>${esc(i.personnage)}${i.message ? ` <span class="meta">« ${esc(i.message)} »</span>` : ''}</li>`).join('')}</ul>` : ''}
      ${m.lien_discord || rapportDe(m) ? `<p class="liens-mission">${m.lien_discord ? `<a href="${esc(m.lien_discord)}" target="_blank" rel="noopener">💬 Discussion sur le Discord</a>` : ''}
        ${rapportDe(m) ? `<button class="bouton discret petit" data-rapport="${m.rapport_id}">📖 Lire le rapport</button>` : ''}</p>` : ''}
      ${ouverte ? (m.inscrit
        ? `<button class="bouton discret petit" data-desinscrire="${m.id}">Me retirer</button>`
        : `<details><summary class="bouton petit" style="list-style:none">Me porter volontaire</summary>
            <form class="form-inscription" data-mission="${m.id}" style="margin-top:.8em">
              <label class="champ"><span>Un mot pour le groupe (facultatif)</span><input name="message" maxlength="500" placeholder="Ex. : dispo samedi soir"></label>
              <button class="bouton petit" type="submit">Confirmer</button>
            </form></details>`) : ''}
    </article>`;
  };
  return `
  <h1 class="titre-page">Ordres de mission</h1>
  <p class="chapeau">Les tâches confiées par le chef du camp. Inscrivez-vous pour signaler aux autres que vous êtes partant.</p>
  <div class="grille">${actives.map(carte).join('') || '<p class="vide">Aucun ordre en cours.</p>'}</div>
  ${closes.length ? `<h2 class="titre-section">Missions passées</h2><div class="grille">${closes.map(carte).join('')}</div>` : ''}`;
}

function rapportDe(m) { return m.rapport_id ? E.journal.find(j => j.id === m.rapport_id) : null; }

function votes() {
  const s = E.scrutins;
  const bloc = sc => {
    const ouvert = sc.statut === 'ouvert';
    const total = Number(sc.total) || 0;
    return `<article class="scrutin parchemin">
      <div class="ligne"><h3>${esc(sc.titre)}</h3><span class="badge ${ouvert ? 'vert' : 'gris'}">${ouvert ? 'Vote ouvert' : 'Clos'}</span></div>
      ${sc.description ? para(sc.description) : ''}
      <div class="choix-liste">${sc.choix.map(ch => {
        const pct = total ? Math.round(100 * ch.voix / total) : 0;
        return `<button class="choix ${sc.mon_choix === ch.id ? 'mien' : ''}" data-voter="${ch.id}" ${ouvert ? '' : 'disabled'}>
          <span class="barre" style="width:${pct}%"></span>
          <span><strong>${esc(ch.libelle)}</strong><span>${ch.voix} voix${sc.mon_choix === ch.id ? ' · votre choix' : ''}</span></span>
          ${ch.description ? `<small>${esc(ch.description)}</small>` : ''}
        </button>`;
      }).join('')}</div>
      <p class="meta">${total} votant${total > 1 ? 's' : ''}${sc.votants.length ? ` : ${sc.votants.map(esc).join(', ')}` : ''}${ouvert ? '. Vous pouvez changer d\'avis tant que le vote est ouvert.' : ''}</p>
      ${sc.resultat ? `<p><strong>Décision :</strong> ${esc(sc.resultat)}</p>` : ''}
    </article>`;
  };
  return `
  <h1 class="titre-page">Le conseil vote</h1>
  <p class="chapeau">Un colon, une voix. Débattez sur le Discord, tranchez ici.</p>
  ${s.map(bloc).join('') || '<p class="vide">Aucun vote pour le moment.</p>'}`;
}

function journal() {
  const liste = E.journal.filter(j => filtreJournal === 'tout' || j.type === filtreJournal);
  return `
  <h1 class="titre-page">Le journal du village</h1>
  <p class="chapeau">Rapports d'expédition et événements du camp, du plus récent au plus ancien.</p>
  <div class="filtres">${[['tout', 'Tout'], ...Object.entries(TYPES_JOURNAL)].map(([k, l]) => `<button data-filtre="${k}" class="${filtreJournal === k ? 'actif' : ''}">${l}</button>`).join('')}</div>
  ${liste.map(j => `<article class="entree-journal parchemin">
    <p class="meta" style="margin:0">${j.jour ? `Jour ${esc(j.jour)} · ` : ''}${TYPES_JOURNAL[j.type]}${j.auteur ? ` · ${esc(j.auteur)}` : ''}</p>
    <h3>${esc(j.titre)}</h3>
    <div class="corps">${para(j.contenu)}</div>
    ${j.lien_discord ? `<p><a href="${esc(j.lien_discord)}" target="_blank" rel="noopener">Lire sur le Discord</a></p>` : ''}
  </article>`).join('') || '<p class="vide">Le journal est encore vierge.</p>'}`;
}

function initiale(nom) { return esc((nom || '?').trim()[0] || '?'); }
function portrait(url, nom, grand = false) {
  return url ? `<img class="portrait${grand ? ' grand' : ''}" src="${esc(url)}" alt="" loading="lazy">`
    : `<div class="portrait${grand ? ' grand' : ''}" aria-hidden="true">${initiale(nom)}</div>`;
}

function habitants() {
  const carte = (p, type) => `<button class="personne parchemin" data-${type}="${p.id}">
    ${portrait(p.portrait_url, type === 'pnj' ? p.nom : p.personnage)}
    <div><h3>${esc(type === 'pnj' ? p.nom : p.personnage)}</h3>
      <p class="role">${type === 'pnj' ? esc(p.role || '') : [p.espece, p.classe, p.niveau ? `niv. ${p.niveau}` : null].filter(Boolean).map(esc).join(' · ')}${p.statut && p.statut !== 'vivant' ? ` · <span class="badge rouge">${esc(p.statut)}</span>` : ''}</p>
      ${p.description ? `<p class="apercu">${esc(p.description)}</p>` : ''}
      ${p.savoirs.length ? `<p class="meta" style="margin:.3em 0 0">✦ ${p.savoirs.length} chose${p.savoirs.length > 1 ? 's' : ''} que vous savez</p>` : ''}
    </div></button>`;
  return `
  <h1 class="titre-page">Les habitants</h1>
  <p class="chapeau">Qui vit au camp, et ce que vous savez de chacun. Certaines choses ne sont connues que de quelques-uns 🔒.</p>
  <h2 class="titre-section">Figures du camp</h2>
  <div class="grille">${E.pnj.map(p => carte(p, 'pnj')).join('') || '<p class="vide">Personne pour l\'instant.</p>'}</div>
  <h2 class="titre-section">Les colons</h2>
  <div class="grille">${E.colons.map(c => carte(c, 'colon')).join('')}</div>`;
}

function fichePersonne(p, type) {
  const nom = type === 'pnj' ? p.nom : p.personnage;
  return `<div class="fenetre-tete">${portrait(p.portrait_url, nom, true)}
    <div><h2>${esc(nom)}</h2>
    <p class="meta" style="margin:.2em 0">${type === 'pnj' ? esc(p.role || '') : [p.espece, p.classe, p.niveau ? `niveau ${p.niveau}` : null].filter(Boolean).map(esc).join(' · ')}</p>
    ${type === 'colon' ? `<p class="meta" style="margin:0">Joué par ${esc(p.joueur)}${p.responsabilite ? ` · ${esc(p.responsabilite)}` : ''}</p>` : ''}</div></div>
    ${p.description ? para(p.description) : '<p class="vide">Pas encore de description.</p>'}
    <h3 style="font-size:1.3rem;margin-top:1em">Ce que vous savez</h3>
    ${p.savoirs.length ? `<ul class="savoirs">${p.savoirs.map(s => `<li class="${s.restreint ? 'restreint' : ''}">${esc(s.texte)}
      <span class="qui">${s.restreint ? 'Connu de vous et de quelques autres seulement' : 'Connu de tout le village'}${s.jour ? ` · jour ${esc(s.jour)}` : ''}</span></li>`).join('')}</ul>`
      : '<p class="vide">Rien de particulier.</p>'}`;
}

function bestiaire() {
  return `
  <h1 class="titre-page">Bestiaire d'Iristhale</h1>
  <p class="chapeau">Les créatures rencontrées et documentées par les colons. Ce qui n'a pas encore été vu n'y figure pas.</p>
  <div class="grille">${E.bestiaire.map(b => `<article class="creature parchemin">
    ${b.image_url ? `<img src="${esc(b.image_url)}" alt="" loading="lazy">` : ''}
    <div class="carte-p">
      <div class="ligne"><h3>${esc(b.nom)}</h3>${b.danger ? `<span class="badge cire">${esc(b.danger)}</span>` : ''}</div>
      ${b.categorie ? `<p class="meta">${esc(b.categorie)}</p>` : ''}
      ${b.description ? para(b.description) : ''}
      <dl>${b.habitat ? `<dt>Habitat</dt><dd>${esc(b.habitat)}</dd>` : ''}
      ${b.decouvert_par ? `<dt>Documenté par</dt><dd>${esc(b.decouvert_par)}${b.jour ? `, jour ${esc(b.jour)}` : ''}</dd>` : ''}</dl>
    </div></article>`).join('') || '<p class="vide">Aucune créature documentée pour l\'instant.</p>'}</div>`;
}

function fiche() {
  const m = E.moi;
  return `
  <div class="fiche-tete parchemin">${portrait(m.portrait_url, m.personnage, true)}
    <div><h2>${esc(m.personnage)}</h2>
    <p class="meta" style="margin:.2em 0">${[m.espece, m.classe, m.niveau ? `niveau ${m.niveau}` : null].filter(Boolean).map(esc).join(' · ')}</p>
    <p style="margin:.2em 0">Joué par ${esc(m.joueur)}${m.responsabilite ? ` · <strong>${esc(m.responsabilite)}</strong>` : ''}</p></div>
  </div>
  <div class="deux-colonnes">
    <form id="form-fiche" class="parchemin carte-p">
      <h3>Ma description</h3>
      <p class="meta">Ce que les autres colons voient de votre personnage : apparence, caractère, ce qu'il laisse paraître.</p>
      <label class="champ"><span>Description</span><textarea name="description" maxlength="6000" style="min-height:14em">${esc(m.description || '')}</textarea></label>
      <label class="champ"><span>Lien vers un portrait (https://…)</span><input name="portrait" type="url" value="${esc(m.portrait_url || '')}" placeholder="https://i.imgur.com/…"></label>
      <button class="bouton" type="submit">Enregistrer</button>
    </form>
    <div class="parchemin carte-p">
      <div class="ligne"><h3>Ma bourse</h3><strong style="font-size:1.3rem">🪙 ${po(m.solde)}</strong></div>
      <table class="registre">${m.transactions.map(t => `<tr>
        <td>${esc(t.motif)}<br><time>${dateCourte(t.cree_le)}</time></td>
        <td class="montant ${Number(t.montant) >= 0 ? 'credit' : 'debit'}">${Number(t.montant) >= 0 ? '+' : ''}${po(t.montant)}</td></tr>`).join('')
        || '<tr><td class="vide">Aucun mouvement.</td></tr>'}</table>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Interactions
function ouvrirFenetre(html) {
  $('#fenetre-corps').innerHTML = html;
  $('#fenetre').showModal();
}

function brancher(page) {
  if (page === 'village' || !PAGES[page]) {
    contenu.querySelectorAll('[data-emp]').forEach(b => b.addEventListener('click', () => {
      const e = E.carte.emplacements[b.dataset.emp];
      const p = e.projet;
      ouvrirFenetre(`<h2>${esc(p ? p.nom : e.nom)}</h2>
        ${p ? `<p class="meta">${esc(e.nom)} · ${STATUTS_PROJET[p.statut]}</p>${p.effet ? `<p>${esc(p.effet)}</p>` : ''}`
            : `<p class="meta">Emplacement libre</p>`}
        ${e.description ? para(e.description) : ''}`);
    }));
  }
  contenu.querySelectorAll('[data-acheter]').forEach(b => b.addEventListener('click', () => {
    const q = Number(contenu.querySelector(`[data-qte="${b.dataset.acheter}"]`)?.value || 1);
    agir('portail_acheter', { p_objet: b.dataset.acheter, p_quantite: q }, b);
  }));
  contenu.querySelectorAll('[data-voter]').forEach(b => b.addEventListener('click', () => agir('portail_voter', { p_choix: b.dataset.voter }, b)));
  contenu.querySelectorAll('[data-desinscrire]').forEach(b => b.addEventListener('click', () => agir('portail_desinscrire', { p_mission: b.dataset.desinscrire }, b)));
  contenu.querySelectorAll('.form-inscription').forEach(f => f.addEventListener('submit', ev => {
    ev.preventDefault();
    agir('portail_inscrire', { p_mission: f.dataset.mission, p_message: f.message.value }, f.querySelector('button'));
  }));
  contenu.querySelectorAll('[data-rapport]').forEach(b => b.addEventListener('click', () => {
    const j = E.journal.find(x => x.id === b.dataset.rapport);
    ouvrirFenetre(`<p class="meta" style="margin:0">${j.jour ? `Jour ${esc(j.jour)} · ` : ''}${TYPES_JOURNAL[j.type]}${j.auteur ? ` · ${esc(j.auteur)}` : ''}</p>
      <h2>${esc(j.titre)}</h2>${para(j.contenu)}
      ${j.lien_discord ? `<p><a href="${esc(j.lien_discord)}" target="_blank" rel="noopener">Lire sur le Discord</a></p>` : ''}`);
  }));
  contenu.querySelectorAll('[data-filtre]').forEach(b => b.addEventListener('click', () => { filtreJournal = b.dataset.filtre; rendre(); }));
  contenu.querySelectorAll('[data-pnj]').forEach(b => b.addEventListener('click', () => ouvrirFenetre(fichePersonne(E.pnj.find(p => p.id === b.dataset.pnj), 'pnj'))));
  contenu.querySelectorAll('[data-colon]').forEach(b => b.addEventListener('click', () => ouvrirFenetre(fichePersonne(E.colons.find(p => p.id === b.dataset.colon), 'colon'))));
  const fc = $('#form-commande');
  if (fc) fc.addEventListener('submit', ev => { ev.preventDefault(); agir('portail_commander', { p_demande: fc.demande.value }, fc.querySelector('button')); });
  const ff = $('#form-fiche');
  if (ff) ff.addEventListener('submit', ev => {
    ev.preventDefault();
    agir('portail_maj_fiche', { p_description: ff.description.value, p_portrait_url: ff.portrait.value }, ff.querySelector('button'));
  });
}

// ---------------------------------------------------------------- Démarrage
if (mdp) entrer(mdp); else $('#mdp').focus();
