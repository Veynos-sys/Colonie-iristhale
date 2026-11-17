-- Portail : notes, carnet, ajouts des joueurs ; classes retirées
create or replace function public.portail_etat(p_mdp text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c public.colons;
  v_carte public.cartes;
begin
  c := public._colon(p_mdp);
  select * into v_carte from public.cartes where active order by cree_le desc limit 1;

  return jsonb_build_object(
    'moi', jsonb_build_object(
      'id', c.id, 'joueur', c.joueur, 'personnage', c.personnage, 'espece', c.espece,
      'niveau', c.niveau, 'portrait_url', c.portrait_url,
      'description', c.description, 'responsabilite', c.responsabilite,
      'solde', public._solde(c.id),
      'transactions', (select coalesce(jsonb_agg(t order by t.cree_le desc), '[]'::jsonb) from (
          select montant, motif, origine, cree_le from public.transactions
          where colon_id = c.id order by cree_le desc limit 60) t),
      'commandes', (select coalesce(jsonb_agg(k order by k.cree_le desc), '[]'::jsonb) from (
          select id, demande, statut, prix, reponse, cree_le from public.commandes where colon_id = c.id) k)
    ),
    'carnet', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'titre', n.titre, 'texte', n.texte, 'modifie_le', n.modifie_le)
                 order by n.modifie_le desc), '[]'::jsonb)
               from public.notes n where n.auteur_id = c.id and n.cible_type = 'carnet'),

    'village', (select to_jsonb(v) from public.village v where id = 1),

    'cycle', (select to_jsonb(cy) - 'cree_le' from public.cycles cy
              order by en_cours desc, numero desc limit 1),

    'besoins', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'nom', b.nom, 'description', b.description, 'etat', b.etat,
        'provisoire', b.provisoire, 'note', b.note, 'icone', b.icone) order by b.ordre, b.nom), '[]'::jsonb)
      from public.besoins b where b.visible),

    'projets', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nom', p.nom, 'description', p.description, 'conditions', p.conditions,
        'effet', p.effet, 'statut', p.statut, 'commande_compagnie', p.commande_compagnie,
        'icone', p.icone, 'besoin', b.nom, 'besoin_id', p.besoin_id,
        'emplacement_id', p.emplacement_id, 'cycle', cy.numero) order by p.ordre, p.nom), '[]'::jsonb)
      from public.projets p
      left join public.besoins b on b.id = p.besoin_id
      left join public.cycles cy on cy.id = p.cycle_id
      where p.visible),

    'carte', case when v_carte.id is null then null else jsonb_build_object(
        'id', v_carte.id, 'nom', v_carte.nom, 'image_url', v_carte.image_url,
        'emplacements', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', e.id, 'nom', e.nom, 'x', e.x, 'y', e.y, 'description', e.description,
            'projet', (select jsonb_build_object('nom', p.nom, 'statut', p.statut, 'icone', p.icone, 'effet', p.effet)
                       from public.projets p where p.emplacement_id = e.id and p.visible
                         and p.statut in ('en_cours','termine') limit 1)
          )), '[]'::jsonb) from public.emplacements e where e.carte_id = v_carte.id)
      ) end,

    'navires', (select coalesce(jsonb_agg(jsonb_build_object(
        'nom', n.nom, 'capitaine', n.capitaine, 'statut', n.statut, 'jour_prevu', n.jour_prevu,
        'annonce', n.annonce, 'cargaison', n.cargaison) order by n.ordre, n.jour_prevu nulls last), '[]'::jsonb)
      from public.navires n where n.visible),

    'objets', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'nom', o.nom, 'categorie', o.categorie, 'description', o.description,
        'prix', o.prix, 'stock', o.stock, 'rayon', o.rayon) order by o.rayon, o.ordre, o.categorie, o.nom), '[]'::jsonb)
      from public.objets o where o.visible),

    'missions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'titre', m.titre, 'resume', m.resume, 'description', m.description,
        'recompense', m.recompense, 'donneur', m.donneur, 'statut', m.statut, 'lien_discord', m.lien_discord,
        'rapport_id', m.rapport_id,
        'inscrits', (select coalesce(jsonb_agg(jsonb_build_object('personnage', cc.personnage, 'message', i.message) order by i.cree_le), '[]'::jsonb)
                     from public.inscriptions i join public.colons cc on cc.id = i.colon_id where i.mission_id = m.id),
        'inscrit', exists (select 1 from public.inscriptions i where i.mission_id = m.id and i.colon_id = c.id)
      ) order by m.ordre, m.cree_le), '[]'::jsonb)
      from public.missions m where m.visible),

    'bestiaire', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', be.id, 'nom', be.nom, 'categorie', be.categorie, 'description', be.description,
        'habitat', be.habitat, 'danger', be.danger, 'jour', be.jour, 'image_url', be.image_url,
        'decouvert_par', cc.personnage, 'ajoute_par', aj.personnage,
        'notes', public._notes_json(c.id, 'creature', be.id)) order by be.nom), '[]'::jsonb)
      from public.bestiaire be left join public.colons cc on cc.id = be.decouvert_par
      left join public.colons aj on aj.id = be.cree_par
      where be.visible),

    'journal', (select coalesce(jsonb_agg(j order by j.jour desc nulls last, j.cree_le desc), '[]'::jsonb) from (
        select id, type, jour, titre, contenu, auteur, lien_discord, cree_le
        from public.journal where visible order by jour desc nulls last, cree_le desc limit 150) j),

    'pnj', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nom', p.nom, 'role', p.role, 'description', p.description,
        'portrait_url', p.portrait_url, 'statut', p.statut, 'ajoute_par', aj.personnage,
        'savoirs', public._savoirs_visibles(c.id, p.id, null),
        'notes', public._notes_json(c.id, 'pnj', p.id)) order by p.ordre, p.nom), '[]'::jsonb)
      from public.pnj p left join public.colons aj on aj.id = p.cree_par where p.visible),

    'colons', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', cc.id, 'joueur', cc.joueur, 'personnage', cc.personnage, 'espece', cc.espece,
        'niveau', cc.niveau, 'portrait_url', cc.portrait_url,
        'description', cc.description, 'responsabilite', cc.responsabilite,
        'savoirs', public._savoirs_visibles(c.id, null, cc.id),
        'notes', public._notes_json(c.id, 'colon', cc.id)) order by cc.personnage), '[]'::jsonb)
      from public.colons cc where cc.actif),

    'scrutins', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'titre', s.titre, 'description', s.description, 'statut', s.statut, 'resultat', s.resultat,
        'total', (select count(*) from public.bulletins bu where bu.scrutin_id = s.id),
        'mon_choix', (select bu.choix_id from public.bulletins bu where bu.scrutin_id = s.id and bu.colon_id = c.id),
        'votants', (select coalesce(jsonb_agg(cc.personnage order by bu.cree_le), '[]'::jsonb)
                    from public.bulletins bu join public.colons cc on cc.id = bu.colon_id where bu.scrutin_id = s.id),
        'choix', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', ch.id, 'libelle', ch.libelle, 'description', ch.description,
            'voix', (select count(*) from public.bulletins bu where bu.choix_id = ch.id)
          ) order by ch.ordre, ch.libelle), '[]'::jsonb) from public.choix ch where ch.scrutin_id = s.id)
      ) order by (s.statut = 'ouvert') desc, s.cree_le desc), '[]'::jsonb)
      from public.scrutins s where s.statut <> 'brouillon'),

    'activite', (select coalesce(jsonb_agg(a order by a.cree_le desc), '[]'::jsonb) from (
        select type, message, cree_le from public.activite where public order by cree_le desc limit 30) a)
  );
end $$;
