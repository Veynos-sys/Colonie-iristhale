"""Construit le catalogue D&D 2024 (SRD 5.2.1 français, CC-BY-4.0) en SQL."""
import re, json, sys

L = open('/home/claude/srd/fr.txt', encoding='utf-8').read().split('\n')
SRC = 'SRD 5.2.1'

def prix_po(s):
    s = s.strip().replace(' ', ' ')
    m = re.fullmatch(r'([\d ]+?)\s*(po|pa|pc)', s)
    if not m:
        return None
    v = int(m.group(1).replace(' ', ''))
    return {'po': v, 'pa': v / 10, 'pc': v / 100}[m.group(2)]

items = []
def add(nom, cat, sous, prix, poids=None, details=None, rarete=None):
    items.append(dict(nom=nom.strip(), categorie=cat, sous_categorie=sous, prix=prix,
                      poids=(poids or None) if poids != '—' else None, details=details, rarete=rarete))

def bloc(debut, fin):
    i = next(k for k, l in enumerate(L) if debut in l)
    j = next(k for k in range(i + 1, len(L)) if fin in L[k])
    return i, j

# ---------- Armes
i, j = bloc('Armes courantes de corps à corps', 'Document de Référence du Système 5.2.1')
sous = None
rx = re.compile(r'^\s+(?P<nom>\S.*?)\s+(?P<deg>\d+d\d+ \w+|1 perforant)\s{2,}(?P<prop>.+?)\s{2,}(?P<botte>[A-ZÉ][\w’é]+(?: [a-zé]+)?)\s+(?P<poids>[\d,]+ k?g|—)\s+(?P<prix>[\d ]+ (?:po|pa|pc))\s*$')
for l in L[i:j]:
    s = l.strip()
    if s.startswith('Armes ') and 'Dégâts' not in s:
        sous = s.rstrip('s').replace('Armes', 'Arme', 1) if False else s
        continue
    m = rx.match(l)
    if m:
        add(m['nom'], 'Armes', sous, prix_po(m['prix']), m['poids'],
            f"{m['deg']} · {m['prop'].strip()} · Botte : {m['botte']}")
    elif items and items[-1]['categorie'] == 'Armes' and re.match(r'^\s{20,}\S', l) and s:
        items[-1]['details'] = items[-1]['details'].replace(' · Botte', ' ' + s + ' · Botte')

# ---------- Armures
i, j = bloc('Armures légères (s’enfile', 'Document de Référence du Système 5.2.1')
rx = re.compile(r'^\s+(?P<nom>\S.*?)\s{2,}(?P<ca>(?:\+2|\d+).*?)\s{2,}(?P<force>—|For \d+)\s{2,}(?P<disc>—|Désavantage)\s+(?P<poids>[\d,]+ kg)\s+(?P<prix>[\d ]+ po)\s*$')
sous = None
for l in L[i:j]:
    s = l.strip()
    if re.match(r'^(Armures (légères|intermédiaires|lourdes)|Bouclier \()', s):
        sous = s.split(' (')[0]
        continue
    m = rx.match(l)
    if m:
        d = f"CA {m['ca'].strip()}"
        if m['force'] != '—': d += f" · {m['force']}"
        if m['disc'] != '—': d += ' · Discrétion : Désavantage'
        add(m['nom'], 'Armures', sous, prix_po(m['prix']), m['poids'], d)

# ---------- Matériel d'aventurier (table à deux colonnes)
i = next(k for k, l in enumerate(L) if 'Acide' in l and '25 po' in l)
j = next(k for k in range(i, len(L)) if 'Trousse de soins' in L[k])
rx = re.compile(r'(?P<nom>[A-ZÉÈÀÂÎÔ][^\s].*?)\s{2,}(?P<poids>[\d,]+ (?:kg|g)|—|Variable)\s+(?P<prix>[\d ]*\d (?:po|pa|pc)|Variable)')
ignorer = {'Munitions', 'Focaliseur arcanique', 'Focaliseur druidique', 'Symbole sacré'}
corrections = {'Paquetage d’exploration': 'Paquetage d’exploration souterraine', 'Outre': 'Outre (pleine)'}
for l in L[i:j + 1]:
    for m in rx.finditer(l):
        nom = m['nom'].strip()
        if nom in ignorer or nom.startswith('Parchemin de sort'):
            continue
        add(corrections.get(nom, nom), 'Matériel d’aventurier', None, prix_po(m['prix']), m['poids'])
add('Parchemin de sort (sort mineur)', 'Matériel d’aventurier', 'Parchemins de sort', 30)
add('Parchemin de sort (1er niveau)', 'Matériel d’aventurier', 'Parchemins de sort', 50)

# ---------- Munitions
for nom, qte, poids, prix in [('Balles d’arme à feu', 10, '1 kg', 3), ('Billes de fronde', 20, '750 g', 0.04),
                              ('Carreaux d’arbalète', 20, '750 g', 1), ('Dards de sarbacane', 50, '0,5 kg', 1),
                              ('Flèches', 20, '0,5 kg', 1)]:
    add(f'{nom} ({qte})', 'Munitions', None, prix, poids)

# ---------- Focaliseurs et symboles
for nom, poids, prix in [('Baguette', '0,5 kg', 10), ('Bâton', '2 kg', 5), ('Cristal', '0,5 kg', 10),
                         ('Orbe', '1,5 kg', 20), ('Sceptre', '1 kg', 10)]:
    add(nom, 'Focaliseurs', 'Focaliseur arcanique', prix, poids)
for nom, poids, prix in [('Baguette d’if', '0,5 kg', 10), ('Bâton en bois', '2 kg', 5), ('Branche de houx', None, 1)]:
    add(nom, 'Focaliseurs', 'Focaliseur druidique', prix, poids)
for nom, poids, prix in [('Amulette (portée ou tenue)', '0,5 kg', 5), ('Emblème (cousu ou peint)', None, 5),
                         ('Reliquaire (tenu)', '1 kg', 5)]:
    add(nom, 'Focaliseurs', 'Symbole sacré', prix, poids)

# ---------- Outils
artisan = [('Matériel d’alchimiste', 50), ('Matériel de brasseur', 20), ('Matériel de calligraphe', 10),
           ('Matériel de peintre', 10), ('Outils de bricoleur', 50), ('Outils de cartographe', 15),
           ('Outils de charpentier', 8), ('Outils de cordonnier', 5), ('Outils de forgeron', 20),
           ('Outils de joaillier', 25), ('Outils de maçon', 10), ('Outils de menuisier', 1),
           ('Outils de potier', 10), ('Outils de souffleur de verre', 30), ('Outils de tanneur', 5),
           ('Outils de tisserand', 1), ('Ustensiles de cuisinier', 1)]
for nom, prix in artisan:
    add(nom, 'Outils', 'Outils d’artisan', prix)
for nom, prix in [('Accessoires de déguisement', 25), ('Instruments de navigateur', 25), ('Matériel de contrefaçon', 15),
                  ('Matériel d’empoisonneur', 50), ('Matériel d’herboriste', 5), ('Outils de voleur', 25)]:
    add(nom, 'Outils', 'Autres outils', prix)
for nom, prix in [('Cartes à jouer', 0.5), ('Dés', 0.1), ('Échecs draconiques', 1), ('Jeu des dragons', 1)]:
    add(nom, 'Outils', 'Boîtes de jeux', prix)
for nom, prix, poids in [('Chalemie', 2, '0,5 kg'), ('Cor', 3, '1 kg'), ('Cornemuse', 30, '3 kg'), ('Flûte', 2, '0,5 kg'),
                         ('Flûte de pan', 12, '1 kg'), ('Luth', 35, '1 kg'), ('Lyre', 30, '1 kg'), ('Tambour', 6, '1,5 kg'),
                         ('Tympanon', 25, '5 kg'), ('Viole', 30, '0,5 kg')]:
    add(nom, 'Outils', 'Instruments de musique', prix, poids)

# ---------- Montures, harnachement, véhicules
for nom, charge, prix in [('Chameau', '225 kg', 50), ('Cheval de selle', '240 kg', 75), ('Cheval de trait', '270 kg', 50),
                          ('Destrier', '270 kg', 400), ('Éléphant', '660 kg', 200), ('Molosse', '97,5 kg', 25),
                          ('Mule', '210 kg', 8), ('Poney', '112,5 kg', 30)]:
    add(nom, 'Montures et véhicules', 'Montures et autres animaux', prix, None, f'Capacité de charge : {charge}')
for nom, poids, prix in [('Calèche', '300 kg', 100), ('Char', '50 kg', 250), ('Chariot', '200 kg', 35),
                         ('Charrette', '100 kg', 15), ('Écuries (par jour)', None, 0.5), ('Fourrage (par jour)', '5 kg', 0.05),
                         ('Selle d’équitation', '12,5 kg', 10), ('Selle exotique', '20 kg', 60), ('Selle militaire', '15 kg', 20),
                         ('Traîneau', '150 kg', 20)]:
    add(nom, 'Montures et véhicules', 'Harnachement et véhicules tractés', prix, poids)
for nom, vit, prix in [('Barge', '1,5 km/h', 3000), ('Barque', '2,25 km/h', 50), ('Bateau à voiles', '3 km/h', 10000),
                       ('Dirigeable', '12 km/h', 40000), ('Drakkar', '4,5 km/h', 10000), ('Galère', '6 km/h', 30000),
                       ('Navire de guerre', '3,75 km/h', 25000)]:
    add(nom, 'Montures et véhicules', 'Véhicules aériens et bateaux', prix, None, f'Vitesse : {vit}')

# ---------- Nourriture, logement, services
for nom, prix in [('Bière (pichet)', 0.04), ('Fromage (tranche)', 0.1), ('Pain (miche)', 0.02),
                  ('Repas misérable', 0.01), ('Repas pauvre', 0.02), ('Repas modeste', 0.1), ('Repas confortable', 0.2),
                  ('Repas riche', 0.3), ('Repas aristocratique', 0.6), ('Vin ordinaire (bouteille)', 0.2), ('Vin fin (bouteille)', 10)]:
    add(nom, 'Nourriture et logement', 'Nourriture et boisson', prix)
for nom, prix in [('misérable', 0.07), ('pauvre', 0.1), ('modeste', 0.5), ('confortable', 0.8), ('riche', 2), ('aristocratique', 4)]:
    add(f'Séjour à l’auberge, {nom} (par jour)', 'Nourriture et logement', 'Auberge', prix)
for nom, prix in [('Mendiant', 0), ('Misérable', 0.1), ('Pauvre', 0.2), ('Modeste', 1), ('Confortable', 2), ('Riche', 4), ('Aristocratique', 10)]:
    add(f'Train de vie {nom.lower()} (par jour)', 'Nourriture et logement', 'Train de vie', prix)
for nom, prix, det in [('Employé qualifié', 2, 'par jour'), ('Employé sans formation', 0.2, 'par jour'), ('Messager', 0.02, 'par 1,5 km')]:
    add(nom, 'Services', 'Employés', prix, None, det)
for niv, dispo, prix in [('sort mineur', 'Village, bourgade ou ville', 30), ('niveau 1', 'Village, bourgade ou ville', 50),
                         ('niveau 2', 'Village, bourgade ou ville', 200), ('niveau 3', 'Bourgade ou ville uniquement', 300),
                         ('niveaux 4 et 5', 'Bourgade ou ville uniquement', 2000), ('niveaux 6 à 8', 'Ville uniquement', 20000),
                         ('niveau 9', 'Ville uniquement', 100000)]:
    add(f'Incantation d’un sort ({niv})', 'Services', 'Services d’incantation', prix, None, f'Disponibilité : {dispo}')

# ---------- Objets magiques
VAL = {'courant': 100, 'peu courant': 400, 'rare': 4000, 'très rare': 40000, 'légendaire': 200000, 'artefact': None}
mi = json.load(open('/home/claude/srd/mi.json', encoding='utf-8'))
prec = None
for r in mi:
    nom = r['nom']
    if nom[0].islower() and prec:
        nom = prec + ' ' + nom
    t = r['type']
    m = None if 'rareté variable' in t else re.search(r'(peu courante?|très rare|courante?|\brare\b|légendaire|artefact)', t.split(',', 1)[-1], re.I)
    rar = m.group(1).lower().rstrip('e') if m else None
    if rar == 'peu courant' or rar == 'courant':
        pass
    rar = {'peu courant': 'peu courant', 'courant': 'courant', 'rar': 'rare', 'très rar': 'très rare', 'légendair': 'légendaire', 'artefact': 'artefact'}.get(rar, rar)
    sous = t.split(',')[0].split(' (')[0]
    prix = VAL.get(rar)
    usage_unique = sous in ('Potion',) or 'Munition' in t
    if prix and usage_unique:
        prix = prix / 2
    add(nom, 'Objets magiques', sous, prix, None, t, rar)
    prec = r['nom'] if not r['nom'][0].islower() else prec

# ---------- Contrôles
noms = [x['nom'] for x in items]
dups = {n for n in noms if noms.count(n) > 1}
from collections import Counter
print(Counter(x['categorie'] for x in items), file=sys.stderr)
print('doublons', dups, file=sys.stderr)
print('sans prix', [x['nom'] for x in items if x['prix'] is None][:20], file=sys.stderr)

def q(v):
    if v is None: return 'null'
    if isinstance(v, (int, float)): return repr(round(v, 2))
    return "'" + str(v).replace("'", "''") + "'"

lignes = [f"({q(x['nom'])},{q(x['categorie'])},{q(x['sous_categorie'])},{q(x['prix'])},{q(x['poids'])},{q(x['details'])},{q(x['rarete'])},{k})"
          for k, x in enumerate(items)]
sql = ('insert into public.catalogue (nom, categorie, sous_categorie, prix, poids, details, rarete, ordre) values\n'
       + ',\n'.join(lignes) + ';\n')
open('/home/claude/colonie-iristhale/supabase/seed/002_catalogue_srd521.sql', 'w', encoding='utf-8').write(
    '-- Catalogue tiré du Document de Référence du Système 5.2.1 (SRD 5.2.1) par Wizards of the Coast LLC,\n'
    '-- version française, sous licence Creative Commons Attribution 4.0 International (CC-BY-4.0).\n'
    '-- Prix des objets magiques : valeur indicative selon la rareté (table « Rareté et valeur des objets magiques »),\n'
    '-- divisée par deux pour les potions.\n' + sql)
print(len(items), file=sys.stderr)

json.dump([dict(x, ordre=k) for k, x in enumerate(items)], open('/home/claude/srd/catalogue.json', 'w', encoding='utf-8'), ensure_ascii=False)
