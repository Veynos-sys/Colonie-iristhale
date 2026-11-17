-- =========================================================
-- Fonctions du portail des colons.
-- Seule porte d'entrée pour les joueurs : chaque appel vérifie le mot de passe.
-- =========================================================

-- ---------- Outils internes (non exposés) ----------
create or replace function public._colon(p_mdp text) returns public.colons
language plpgsql stable security definer set search_path = public as $$
declare c public.colons;
begin
  select * into c from public.colons
  where mot_de_passe = trim(coalesce(p_mdp, '')) and actif;
  if not found then
    raise exception 'Mot de passe inconnu.' using errcode = 'P0001';
  end if;
  return c;
end $$;

create or replace function public._solde(p_colon uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(montant), 0) from public.transactions where colon_id = p_colon;
$$;

create or replace function public._journaliser(p_colon uuid, p_type text, p_message text, p_public boolean default true)
returns void language sql security definer set search_path = public as $$
  insert into public.activite (colon_id, type, message, public) values (p_colon, p_type, p_message, p_public);
$$;

create or replace function public._discord(p_message text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_url text;
begin
  select valeur into v_url from public.parametres where cle = 'discord_webhook';
  if v_url is null or v_url !~ '^https://(discord\.com|discordapp\.com)/api/webhooks/' then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('content', p_message, 'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end $$;

-- Ce qu'un colon sait d'un PNJ ou d'un autre colon
create or replace function public._savoirs_visibles(p_moi uuid, p_pnj uuid, p_colon uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'texte', s.texte, 'jour', s.jour,
           'restreint', s.portee = 'restreint'
         ) order by s.jour nulls first, s.cree_le), '[]'::jsonb)
  from public.savoirs s
  where (s.pnj_id = p_pnj or s.colon_id = p_colon)
    and (s.portee = 'village'
         or exists (select 1 from public.savoirs_colons sc where sc.savoir_id = s.id and sc.colon_id = p_moi));
$$;

-- ---------- Connexion ----------
create or replace function public.portail_connexion(p_mdp text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.colons;
begin
  c := public._colon(p_mdp);
  return jsonb_build_object('id', c.id, 'personnage', c.personnage, 'joueur', c.joueur);
end $$;

-- ---------- Tout ce que voit un colon ----------
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
      'classe', c.classe, 'niveau', c.niveau, 'portrait_url', c.portrait_url,
      'description', c.description, 'responsabilite', c.responsabilite,
      'solde', public._solde(c.id),
      'transactions', (select coalesce(jsonb_agg(t order by t.cree_le desc), '[]'::jsonb) from (
          select montant, motif, origine, cree_le from public.transactions
          where colon_id = c.id order by cree_le desc limit 60) t),
      'commandes', (select coalesce(jsonb_agg(k order by k.cree_le desc), '[]'::jsonb) from (
          select id, demande, statut, prix, reponse, cree_le from public.commandes where colon_id = c.id) k)
    ),

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
        'inscrits', (select coalesce(jsonb_agg(jsonb_build_object('personnage', cc.personnage, 'message', i.message) order by i.cree_le), '[]'::jsonb)
                     from public.inscriptions i join public.colons cc on cc.id = i.colon_id where i.mission_id = m.id),
        'inscrit', exists (select 1 from public.inscriptions i where i.mission_id = m.id and i.colon_id = c.id)
      ) order by m.ordre, m.cree_le), '[]'::jsonb)
      from public.missions m where m.visible),

    'bestiaire', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', be.id, 'nom', be.nom, 'categorie', be.categorie, 'description', be.description,
        'habitat', be.habitat, 'danger', be.danger, 'jour', be.jour, 'image_url', be.image_url,
        'decouvert_par', cc.personnage) order by be.nom), '[]'::jsonb)
      from public.bestiaire be left join public.colons cc on cc.id = be.decouvert_par
      where be.visible),

    'journal', (select coalesce(jsonb_agg(j order by j.jour desc nulls last, j.cree_le desc), '[]'::jsonb) from (
        select id, type, jour, titre, contenu, auteur, lien_discord, cree_le
        from public.journal where visible order by jour desc nulls last, cree_le desc limit 150) j),

    'pnj', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'nom', p.nom, 'role', p.role, 'description', p.description,
        'portrait_url', p.portrait_url, 'statut', p.statut,
        'savoirs', public._savoirs_visibles(c.id, p.id, null)) order by p.ordre, p.nom), '[]'::jsonb)
      from public.pnj p where p.visible),

    'colons', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', cc.id, 'joueur', cc.joueur, 'personnage', cc.personnage, 'espece', cc.espece,
        'classe', cc.classe, 'niveau', cc.niveau, 'portrait_url', cc.portrait_url,
        'description', cc.description, 'responsabilite', cc.responsabilite,
        'savoirs', public._savoirs_visibles(c.id, null, cc.id)) order by cc.personnage), '[]'::jsonb)
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

-- ---------- Acheter à l'échoppe ----------
create or replace function public.portail_acheter(p_mdp text, p_objet uuid, p_quantite int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.colons;
  o public.objets;
  v_total numeric;
  v_solde numeric;
begin
  c := public._colon(p_mdp);
  if p_quantite is null or p_quantite < 1 or p_quantite > 50 then
    raise exception 'Quantité invalide.' using errcode = 'P0001';
  end if;

  -- verrou : un seul achat à la fois sur cet objet
  select * into o from public.objets where id = p_objet and visible for update;
  if not found then raise exception 'Cet objet n''est plus en vente.' using errcode = 'P0001'; end if;
  if o.stock is not null and o.stock < p_quantite then
    raise exception 'Stock insuffisant : il en reste %.', o.stock using errcode = 'P0001';
  end if;

  -- verrou : un seul achat à la fois pour ce colon
  perform 1 from public.colons where id = c.id for update;
  v_total := o.prix * p_quantite;
  v_solde := public._solde(c.id);
  if v_solde < v_total then
    raise exception 'Pas assez d''or : il vous faut % po, vous en avez %.', trim_scale(v_total), trim_scale(v_solde) using errcode = 'P0001';
  end if;

  if o.stock is not null then
    update public.objets set stock = stock - p_quantite where id = o.id;
  end if;
  insert into public.achats (colon_id, objet_id, nom_objet, quantite, prix_total)
    values (c.id, o.id, o.nom, p_quantite, v_total);
  insert into public.transactions (colon_id, montant, motif, origine)
    values (c.id, -v_total, 'Échoppe : ' || p_quantite || ' × ' || o.nom, 'achat');
  perform public._journaliser(c.id, 'achat',
    c.personnage || ' a acheté ' || p_quantite || ' × ' || o.nom || ' à l''échoppe.');

  return jsonb_build_object('ok', true, 'message',
    p_quantite || ' × ' || o.nom || ' pour ' || trim_scale(v_total) || ' po.', 'solde', v_solde - v_total);
end $$;

-- ---------- Voter ----------
create or replace function public.portail_voter(p_mdp text, p_choix uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.colons;
  ch public.choix;
  s public.scrutins;
  v_ancien uuid;
begin
  c := public._colon(p_mdp);
  select * into ch from public.choix where id = p_choix;
  if not found then raise exception 'Choix inconnu.' using errcode = 'P0001'; end if;
  select * into s from public.scrutins where id = ch.scrutin_id;
  if s.statut <> 'ouvert' then raise exception 'Ce vote est clos.' using errcode = 'P0001'; end if;

  select choix_id into v_ancien from public.bulletins where scrutin_id = s.id and colon_id = c.id;
  if v_ancien = ch.id then
    return jsonb_build_object('ok', true, 'message', 'Votre voix était déjà sur ce choix.');
  end if;

  insert into public.bulletins (scrutin_id, colon_id, choix_id) values (s.id, c.id, ch.id)
  on conflict (scrutin_id, colon_id) do update set choix_id = excluded.choix_id, cree_le = now();

  if v_ancien is null then
    perform public._journaliser(c.id, 'vote', c.personnage || ' a voté : « ' || s.titre || ' ».');
    perform public._discord('🗳️ **' || c.personnage || '** a voté : « ' || s.titre || ' »');
  else
    perform public._journaliser(c.id, 'vote', c.personnage || ' a changé son vote : « ' || s.titre || ' ».');
    perform public._discord('🗳️ **' || c.personnage || '** a changé son vote : « ' || s.titre || ' »');
  end if;

  return jsonb_build_object('ok', true, 'message', 'Votre voix est enregistrée.');
end $$;

-- ---------- Ordres de mission ----------
create or replace function public.portail_inscrire(p_mdp text, p_mission uuid, p_message text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.colons; m public.missions;
begin
  c := public._colon(p_mdp);
  select * into m from public.missions where id = p_mission and visible;
  if not found or m.statut not in ('ouverte','en_cours') then
    raise exception 'Cette mission n''accepte plus de volontaires.' using errcode = 'P0001';
  end if;
  insert into public.inscriptions (mission_id, colon_id, message)
    values (m.id, c.id, nullif(left(trim(coalesce(p_message, '')), 500), ''))
  on conflict (mission_id, colon_id) do update set message = excluded.message;
  perform public._journaliser(c.id, 'mission', c.personnage || ' se porte volontaire : « ' || m.titre || ' ».');
  return jsonb_build_object('ok', true, 'message', 'Vous êtes inscrit(e) sur l''ordre de mission.');
end $$;

create or replace function public.portail_desinscrire(p_mdp text, p_mission uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.colons; v_titre text;
begin
  c := public._colon(p_mdp);
  delete from public.inscriptions where mission_id = p_mission and colon_id = c.id;
  if found then
    select titre into v_titre from public.missions where id = p_mission;
    perform public._journaliser(c.id, 'mission', c.personnage || ' se retire de « ' || v_titre || ' ».');
  end if;
  return jsonb_build_object('ok', true, 'message', 'Vous n''êtes plus inscrit(e).');
end $$;

-- ---------- Commande spéciale à Estoria ----------
create or replace function public.portail_commander(p_mdp text, p_demande text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.colons; v text := left(trim(coalesce(p_demande, '')), 600);
begin
  c := public._colon(p_mdp);
  if length(v) < 3 then raise exception 'Décrivez ce que vous voulez commander.' using errcode = 'P0001'; end if;
  if (select count(*) from public.commandes where colon_id = c.id and statut = 'demandee') >= 5 then
    raise exception 'Vous avez déjà 5 commandes en attente.' using errcode = 'P0001';
  end if;
  insert into public.commandes (colon_id, demande) values (c.id, v);
  perform public._journaliser(c.id, 'commande', c.personnage || ' a passé une commande pour Estoria : ' || v, false);
  return jsonb_build_object('ok', true, 'message', 'Commande transmise à l''échoppe. Réponse au prochain passage du MJ.');
end $$;

-- ---------- Ma fiche ----------
create or replace function public.portail_maj_fiche(p_mdp text, p_description text, p_portrait_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.colons; v_url text := nullif(trim(coalesce(p_portrait_url, '')), '');
begin
  c := public._colon(p_mdp);
  if v_url is not null and v_url !~ '^https://' then
    raise exception 'Le portrait doit être un lien https://' using errcode = 'P0001';
  end if;
  update public.colons
     set description = left(coalesce(p_description, ''), 6000), portrait_url = v_url
   where id = c.id;
  perform public._journaliser(c.id, 'fiche', c.personnage || ' a mis à jour sa fiche.', false);
  return jsonb_build_object('ok', true, 'message', 'Fiche enregistrée.');
end $$;

-- ---------- Vue des soldes pour l'admin ----------
create or replace view public.soldes with (security_invoker = true) as
  select c.id as colon_id, c.personnage, c.joueur, coalesce(sum(t.montant), 0) as solde
  from public.colons c left join public.transactions t on t.colon_id = c.id
  group by c.id;
revoke all on public.soldes from anon;

-- ---------- Droits d'exécution ----------
revoke execute on function public._colon(text) from public, anon, authenticated;
revoke execute on function public._solde(uuid) from public, anon, authenticated;
revoke execute on function public._journaliser(uuid, text, text, boolean) from public, anon, authenticated;
revoke execute on function public._discord(text) from public, anon, authenticated;
revoke execute on function public._savoirs_visibles(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.portail_connexion(text) to anon, authenticated;
grant execute on function public.portail_etat(text) to anon, authenticated;
grant execute on function public.portail_acheter(text, uuid, int) to anon, authenticated;
grant execute on function public.portail_voter(text, uuid) to anon, authenticated;
grant execute on function public.portail_inscrire(text, uuid, text) to anon, authenticated;
grant execute on function public.portail_desinscrire(text, uuid) to anon, authenticated;
grant execute on function public.portail_commander(text, text) to anon, authenticated;
grant execute on function public.portail_maj_fiche(text, text, text) to anon, authenticated;

-- Message test Discord depuis l'admin
create or replace function public.mj_tester_discord() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_mj() then raise exception 'Réservé aux MJ.'; end if;
  perform public._discord('🔔 Test du portail de la colonie : le webhook fonctionne.');
end $$;
revoke execute on function public.mj_tester_discord() from public, anon;
grant execute on function public.mj_tester_discord() to authenticated;
