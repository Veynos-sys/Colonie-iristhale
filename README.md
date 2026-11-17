# Registre de la colonie · Iristhale

Portail des colons de la campagne D&D sur l'archipel d'Iristhale (Compagnie du Levant).

- `index.html` : le portail des joueurs (connexion par mot de passe de colon).
- `admin.html` : le cabinet du MJ (connexion par e-mail, réservée aux adresses listées dans *Paramètres*).
- `js/config.js` : adresse de la base Supabase et clé publique (publique par conception).
- `supabase/migrations/` : structure de la base, règles de sécurité et fonctions du portail.
- `supabase/seed/` : données de départ (état du camp à l'arrivée de la Persévérante).

## Fonctionnement

Les joueurs ne lisent jamais les tables directement : toutes leurs actions passent par les fonctions
`portail_*` de la base, qui vérifient le mot de passe à chaque appel. Les notes MJ, les créatures non
découvertes, les votes en brouillon et les savoirs réservés ne quittent jamais la base.

Le site est statique (HTML, CSS, JavaScript sans compilation) et publié par GitHub Pages.
