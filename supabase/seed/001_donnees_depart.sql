-- Données de départ : état du camp à l'arrivée de la Persévérante.
-- Tout est modifiable depuis l'admin. Aucun secret de MJ ici.

insert into public.cycles (numero, titre, en_cours, resume) values
 (1, 'L''arrivée de la Persévérante', true,
  'Le bûcher a brûlé au bon moment : la Persévérante a accosté avec ses cales pleines et de nouveaux colons.');

insert into public.besoins (nom, icone, etat, provisoire, ordre, description, note) values
 ('Se nourrir', '🍖', 'precaire', true, 1, 'Des vivres pour tout le camp, sans dépendre des navires.',
  'Les cales de la Persévérante ont rempli les réserves, mais seulement jusqu''au prochain navire.'),
 ('S''abriter', '🏕️', 'precaire', false, 2, 'Des abris solides contre la pluie, le froid et la saison qui vient.',
  'Tentes et abris de fortune sur la plage.'),
 ('Se défendre', '🛡️', 'non_couvert', false, 3, 'Protéger le camp des bêtes d''Iristhale et des pillards.', null),
 ('Se soigner', '⚕️', 'non_couvert', false, 4, 'Soigner les blessés et les malades sans compter sur la chance.', null),
 ('Fabriquer', '🔨', 'non_couvert', false, 5, 'Façonner outils, armes et matériaux sur place.', null),
 ('Commercer', '⚖️', 'precaire', true, 6, 'Échanger, acheter et vendre, avec Estoria comme sur place.',
  'L''échoppe de Jasmine vit au rythme des arrivages de la Compagnie.');

insert into public.projets (nom, icone, besoin_id, statut, commande_compagnie, ordre, description, conditions, effet)
select v.nom, v.icone, b.id, v.statut, v.cmd, v.ordre, v.description, v.conditions, v.effet
from (values
 ('Maison commune', '🏠', 'S''abriter', 'disponible', false, 1,
  'Une grande bâtisse de bois où tenir conseil, manger ensemble et abriter les nouveaux arrivants.',
  null, 'Le conseil du village peut se réunir à l''abri ; « S''abriter » progresse.'),
 ('Tour de guet', '🗼', 'Se défendre', 'disponible', false, 2,
  'Une tour sur le point le plus haut du camp, pour voir venir le danger de la forêt comme de la mer.',
  null, 'Le camp n''est plus pris par surprise ; « Se défendre » progresse.'),
 ('Entrepôt portuaire', '📦', 'Commercer', 'disponible', true, 3,
  'Demandé par la Compagnie du Levant : un entrepôt sur la plage pour stocker les marchandises à expédier vers Estoria.',
  'Commande de la Compagnie', 'La Compagnie est satisfaite ; les navires restent plus longtemps à quai.'),
 ('Fumoir', '🔥', 'Se nourrir', 'verrouille', false, 4,
  'Fumer viande et poisson pour les conserver des semaines.',
  'Une source de gibier ou de poisson régulière', 'Les vivres se conservent ; « Se nourrir » progresse durablement.'),
 ('Potager des colons', '🥕', 'Se nourrir', 'verrouille', false, 5,
  'Des parcelles cultivées près de la rivière.',
  'Des semences qui poussent dans le sol d''Iristhale', '« Se nourrir » ne dépend plus des navires.'),
 ('Palissade', '🪵', 'Se défendre', 'verrouille', false, 6,
  'Une enceinte de pieux autour du camp.',
  'Un bois assez solide pour construire', 'Les raids et les bêtes ont plus de mal à entrer.'),
 ('Infirmerie', '⚕️', 'Se soigner', 'verrouille', false, 7,
  'Un abri propre, des lits et des simples pour soigner.',
  'Un soigneur ou un herboriste installé au village', 'Les soins coûtent moins cher ; « Se soigner » progresse.'),
 ('Atelier du charpentier', '🪚', 'Fabriquer', 'verrouille', false, 8,
  'Un atelier couvert pour tailler et assembler le bois.',
  'Un bois de qualité trouvé dans la région', 'Le charpentier peut fabriquer et réparer des objets en bois.'),
 ('Forge', '⚒️', 'Fabriquer', 'verrouille', false, 9,
  'Une forge pour réparer et améliorer armes et outils.',
  'Un gisement de minerai et un forgeron', 'Réparation et amélioration d''armes et d''armures.')
) as v(nom, icone, besoin, statut, cmd, ordre, description, conditions, effet)
join public.besoins b on b.nom = v.besoin;

insert into public.navires (nom, capitaine, statut, ordre, annonce, cargaison) values
 ('La Persévérante', 'Ilda Marrec', 'a_quai', 1,
  'A accosté sans encombre, guidée par le bûcher allumé au promontoire du sud.',
  'Vivres, outils, marchandises pour l''échoppe et de nouveaux colons.'),
 ('Prochain navire de la Compagnie', null, 'attendu', 2,
  'Date encore inconnue. La Compagnie attend des nouvelles du camp avant d''affréter le suivant.', null);

insert into public.pnj (nom, role, ordre, description) values
 ('Halvar Ordan', 'Intendant de la Compagnie du Levant, chef du camp', 1,
  'Descendant d''Ysmer, il a rallié les colons sous le symbole du Couchant. C''est lui qui rédige les ordres de mission.'),
 ('Jasmine', 'Représentante de la guilde des commerçants', 2,
  'Extravagante, intarissable, passionnée par tout ce qui touche à la culture ysmérienne. Elle tient l''échoppe du camp.'),
 ('Nils Pétrel', 'Éclaireur', 3,
  'Éclaireur du camp, facilement distrait, toujours accompagné de Bidule.'),
 ('Ilda Marrec', 'Capitaine de la Persévérante', 4,
  'Capitaine du navire qui a ravitaillé le camp.'),
 ('Ysaline', 'Colon', 5, null),
 ('Maëva', 'Colon', 6, null),
 ('Bertrand', 'Colon', 7, null);

insert into public.savoirs (pnj_id, texte, portee)
select p.id, v.texte, 'village' from (values
 ('Halvar Ordan', 'Il porte une blessure récente et quitte rarement le camp.'),
 ('Jasmine', 'Elle accepte de rendre service, à condition qu''on lui rende la pareille un jour.'),
 ('Ysaline', 'Son frère Corentin a été capturé par des esclavagistes.')
) as v(nom, texte) join public.pnj p on p.nom = v.nom;

insert into public.missions (titre, ordre, statut, donneur, resume, recompense) values
 ('🍖 Les Marmites vides', 1, 'ouverte', 'Halvar Ordan',
  'Trouver une autre source de nourriture : gibier, plantes.',
  '20 po par espèce ou plante comestible documentée. L''espèce porte le nom de celui qui l''a identifiée.'),
 ('🪵 Le Bois de cœur', 2, 'ouverte', 'Halvar Ordan',
  'Trouver un bois plus solide que celui de la forêt voisine, assez bon pour construire.',
  '25 po chacun, et un objet taillé dans ce bois par le charpentier.'),
 ('🌊 Ce que la mer rapporte', 3, 'en_cours', 'Halvar Ordan',
  'Fouiller le bois échoué et les débris sur la bande de sable, au sud du village.',
  'Droit d''épave : chaque membre garde un objet trouvé, le reste revient au camp.'),
 ('🔥 Un feu pour le prochain navire', 4, 'terminee', 'Halvar Ordan',
  'Bâtir un bûcher au point le plus au sud et l''allumer le jour dit pour guider la Persévérante.',
  '30 po chacun et le droit de nommer le promontoire.'),
 ('🗺️ Terres inconnues', 5, 'ouverte', 'Halvar Ordan',
  'Exploration libre.',
  '10 po par découverte vérifiée (lieu notable, ressource, route praticable), et le droit de la nommer.');

insert into public.journal (type, titre, contenu, auteur) values
 ('evenement', 'La Persévérante a accosté',
  'Guidée par le bûcher allumé au promontoire du sud, la Persévérante a jeté l''ancre devant le camp. Ses cales apportent des vivres, des outils et de nouveaux visages.',
  'Halvar Ordan');

-- Échoppe : fonds permanent (prix du manuel majorés d'environ 50 %, « prix de la frontière »)
insert into public.objets (nom, categorie, rayon, prix, stock, ordre) values
 ('Rations (1 jour)', 'Vivres', 'fonds', 0.75, null, 1),
 ('Outre', 'Vivres', 'fonds', 0.3, null, 2),
 ('Torche', 'Équipement', 'fonds', 0.02, null, 3),
 ('Flasque d''huile', 'Équipement', 'fonds', 0.15, null, 4),
 ('Corde de chanvre (15 m)', 'Équipement', 'fonds', 1.5, null, 5),
 ('Sac de couchage', 'Équipement', 'fonds', 1.5, null, 6),
 ('Pied-de-biche', 'Équipement', 'fonds', 3, null, 7),
 ('Lanterne à capote', 'Équipement', 'fonds', 7.5, null, 8),
 ('Piège à mâchoires', 'Équipement', 'fonds', 7.5, null, 9),
 ('Trousse de soins', 'Soins', 'fonds', 7.5, null, 10),
 ('Flèches (20)', 'Munitions', 'fonds', 1.5, null, 11),
 ('Dague', 'Armes', 'fonds', 3, null, 12),
 ('Lance', 'Armes', 'fonds', 1.5, null, 13),
 ('Arc court', 'Armes', 'fonds', 37.5, null, 14),
 ('Bouclier', 'Armures', 'fonds', 15, null, 15),
 ('Armure de cuir', 'Armures', 'fonds', 15, null, 16);

-- Arrivage du cycle 1 (quantités limitées)
insert into public.objets (nom, categorie, rayon, prix, stock, ordre, description, cycle_id)
select v.nom, v.cat, 'arrivage', v.prix, v.stock, v.ordre, v.descr, c.id
from (values
 ('Potion de soins', 'Soins', 75, 3, 1, 'Rapportée d''Alderan dans une caisse de paille.'),
 ('Antitoxine', 'Soins', 75, 2, 2, null),
 ('Feu grégeois', 'Alchimie', 75, 2, 3, null),
 ('Matériel de pêche', 'Équipement', 1.5, 4, 4, 'Lignes, hameçons et flotteurs.'),
 ('Sachet de semences d''Estoria', 'Vivres', 2, 5, 5, 'Rien ne dit qu''elles pousseront ici.')
) as v(nom, cat, prix, stock, ordre, descr)
cross join (select id from public.cycles where numero = 1) c;

-- Un vote prêt à ouvrir (en brouillon, invisible des joueurs tant qu'il n'est pas ouvert)
with s as (
  insert into public.scrutins (titre, description, statut, cycle_id)
  select 'Premier chantier du cycle 1',
         'Un seul chantier pourra être mené d''ici la prochaine séance principale. Lequel ?',
         'brouillon', id from public.cycles where numero = 1
  returning id
)
insert into public.choix (scrutin_id, libelle, projet_id, ordre)
select s.id, p.nom, p.id, p.ordre from s
join public.projets p on p.statut = 'disponible';

-- Colon d'essai pour le MJ (à désactiver une fois les vrais colons créés)
with c as (
  insert into public.colons (joueur, personnage, mot_de_passe, espece, classe, niveau, description)
  values ('MJ', 'Colon d''essai', 'essai-mj', 'Humain', 'Guerrier', 1,
          'Personnage de test pour vérifier le portail. À désactiver dans l''admin.')
  returning id
)
insert into public.transactions (colon_id, montant, motif) select id, 100, 'Bourse de départ (test)' from c;
