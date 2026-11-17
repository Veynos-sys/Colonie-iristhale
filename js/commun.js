import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_CLE } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_CLE);

// Échappe le texte avant insertion dans le HTML
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Texte multi-lignes
export function para(v) {
  return esc(v).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

// 1 po = 10 pa = 100 pc
export function po(n) {
  const neg = Number(n) < 0;
  let pc = Math.round(Math.abs(Number(n || 0)) * 100);
  const or = Math.floor(pc / 100); pc -= or * 100;
  const pa = Math.floor(pc / 10); pc -= pa * 10;
  const parts = [];
  if (or) parts.push(`${or.toLocaleString('fr-FR')} po`);
  if (pa) parts.push(`${pa} pa`);
  if (pc) parts.push(`${pc} pc`);
  return (neg ? '−' : '') + (parts.join(' ') || '0 po');
}

export function dateCourte(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function toast(msg, type = 'ok') {
  let zone = document.getElementById('toasts');
  if (!zone) { zone = document.createElement('div'); zone.id = 'toasts'; document.body.append(zone); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  zone.append(t);
  setTimeout(() => t.classList.add('sortie'), 3800);
  setTimeout(() => t.remove(), 4300);
}

// Message d'erreur lisible depuis une erreur Supabase
export function msgErreur(e) {
  return e?.message || e?.error_description || String(e);
}

export const ETATS_BESOIN = {
  non_couvert: { label: 'Non couvert', niveau: 0 },
  precaire: { label: 'Précaire', niveau: 1 },
  assure: { label: 'Assuré', niveau: 2 },
};
export const STATUTS_PROJET = {
  verrouille: 'Verrouillé', disponible: 'Disponible', en_vote: 'Soumis au vote',
  en_cours: 'En chantier', termine: 'Construit', abandonne: 'Abandonné',
};
export const STATUTS_MISSION = {
  ouverte: 'Ouverte', en_cours: 'En cours', terminee: 'Accomplie', echouee: 'Échouée', annulee: 'Annulée',
};
export const STATUTS_NAVIRE = {
  attendu: 'Attendu', a_quai: 'À quai', reparti: 'Reparti', perdu: 'Perdu en mer',
};
export const STATUTS_COMMANDE = {
  demandee: 'En attente', acceptee: 'Acceptée', livree: 'Livrée', refusee: 'Refusée',
};
export const TYPES_JOURNAL = { rapport: 'Rapport', evenement: 'Événement', annonce: 'Annonce' };
export const RAYONS = { fonds: 'Fonds de l\'échoppe', arrivage: 'Arrivage', rare: 'Pièce rare' };
