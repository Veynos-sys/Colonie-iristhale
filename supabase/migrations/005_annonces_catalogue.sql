-- =========================================================
-- Nouveautés à annoncer (publication manuelle par le MJ), rapport de mission, catalogue SRD 5.2.1
-- Les voix des votes restent annoncées automatiquement dans le salon des votes.
-- =========================================================

insert into public.parametres (cle, valeur, description) values
  ('discord_webhook_annonces', null, 'Webhook du salon des annonces (nouveautés publiées depuis l''admin)'),
  ('url_portail', 'https://veynos-sys.github.io/Colonie-iristhale/', 'Adresse du portail, ajoutée en bas des annonces')
on conflict (cle) do nothing;
update public.parametres set description = 'Webhook du salon des votes (chaque voix y est annoncée)' where cle = 'discord_webhook';

-- ---------- Envoi vers un salon ----------
create or replace function public._discord_salon(p_cle text, p_message text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_url text;
begin
  select valeur into v_url from public.parametres where cle = p_cle;
  if v_url is null or v_url !~ '^https://(discord\.com|discordapp\.com)/api/webhooks/' then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('content', left(p_message, 1990), 'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end $$;

create or replace function public._discord(p_message text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._discord_salon('discord_webhook', p_message);
end $$;

-- ---------- File des nouveautés ----------
create table public.nouveautes (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('chantiers','missions','votes','echoppe')),
  cle text not null unique,           -- évite les doublons (même objet, même événement)
  texte text,                          -- ligne prête à publier (null pour l'échoppe : calculée à l'envoi)
  objet_id uuid references public.objets(id) on delete cascade,
  cree_le timestamptz not null default now()
);
create index on public.nouveautes (objet_id);
alter table public.nouveautes enable row level security;
revoke all on public.nouveautes from anon;
create policy "mj_tout" on public.nouveautes for all to authenticated
  using ((select public.est_mj())) with check ((select public.est_mj()));

create or replace function public._noter(p_section text, p_cle text, p_texte text, p_objet uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into public.nouveautes (section, cle, texte, objet_id) values (p_section, p_cle, p_texte, p_objet)
  on conflict (cle) do update set texte = excluded.texte, cree_le = now();
$$;

-- Projets
create or replace function public._trg_projets() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_besoin text;
begin
  if not new.visible then return new; end if;
  if not (tg_op = 'INSERT' or not old.visible or old.statut is distinct from new.statut) then return new; end if;
  select nom into v_besoin from public.besoins where id = new.besoin_id;
  if new.statut = 'disponible' then
    perform public._noter('chantiers', 'projet:' || new.id || ':disponible',
      '🏗️ Nouveau projet possible : **' || coalesce(new.icone || ' ', '') || new.nom || '**'
      || case when new.commande_compagnie then ' (commande de la Compagnie)' else '' end
      || coalesce(' · besoin « ' || v_besoin || ' »', ''));
  elsif new.statut = 'en_cours' then
    perform public._noter('chantiers', 'projet:' || new.id || ':en_cours',
      '🔨 Chantier lancé : **' || coalesce(new.icone || ' ', '') || new.nom || '**');
  elsif new.statut = 'termine' then
    perform public._noter('chantiers', 'projet:' || new.id || ':termine',
      '🏠 **' || new.nom || '** est construit !' || coalesce(' ' || new.effet, ''));
  end if;
  return new;
end $$;
create trigger nouveaute_projets after insert or update of statut, visible on public.projets
  for each row execute function public._trg_projets();

-- Missions (+ lien vers le rapport au journal)
alter table public.missions add column if not exists rapport_id uuid references public.journal(id) on delete set null;
create index if not exists missions_rapport_id_idx on public.missions (rapport_id);

create or replace function public._trg_missions() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_apparait boolean;
begin
  if not new.visible then return new; end if;
  v_apparait := tg_op = 'INSERT' or not old.visible;
  if v_apparait and new.statut in ('ouverte', 'en_cours') then
    perform public._noter('missions', 'mission:' || new.id || ':nouvelle',
      '📜 Nouvel ordre de mission : **' || new.titre || '**'
      || coalesce(' · ' || new.resume, '') || coalesce(' · 🪙 ' || new.recompense, ''));
  elsif not v_apparait and old.statut is distinct from new.statut then
    if new.statut = 'terminee' then
      perform public._noter('missions', 'mission:' || new.id || ':fin',
        '✅ Mission accomplie : **' || new.titre || '**'
        || case when new.rapport_id is not null then ' (rapport au journal)' else '' end);
    elsif new.statut = 'echouee' then
      perform public._noter('missions', 'mission:' || new.id || ':fin', '❌ Mission échouée : **' || new.titre || '**');
    end if;
  end if;
  return new;
end $$;
create trigger nouveaute_missions after insert or update of statut, visible on public.missions
  for each row execute function public._trg_missions();

-- Votes
create or replace function public._trg_scrutins() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_choix text;
begin
  if new.statut = 'ouvert' and (tg_op = 'INSERT' or old.statut <> 'ouvert') then
    select string_agg(libelle, ' / ' order by ordre, libelle) into v_choix from public.choix where scrutin_id = new.id;
    perform public._noter('votes', 'scrutin:' || new.id || ':ouvert',
      '🗳️ Le conseil vote : **' || new.titre || '**' || coalesce(' · ' || v_choix, ''));
  elsif tg_op = 'UPDATE' and new.statut = 'clos' and old.statut = 'ouvert' then
    select string_agg(ch.libelle || ' ' || (select count(*) from public.bulletins b where b.choix_id = ch.id) || ' voix', ', '
                      order by (select count(*) from public.bulletins b where b.choix_id = ch.id) desc, ch.ordre)
      into v_choix from public.choix ch where ch.scrutin_id = new.id;
    perform public._noter('votes', 'scrutin:' || new.id || ':clos',
      '🔒 Vote clos : **' || new.titre || '**' || coalesce(' · ' || v_choix, ''));
  end if;
  if tg_op = 'UPDATE' and new.statut = 'clos' and new.resultat is not null and new.resultat is distinct from old.resultat then
    perform public._noter('votes', 'scrutin:' || new.id || ':decision',
      '📣 Décision du conseil (' || new.titre || ') : ' || new.resultat);
  end if;
  return new;
end $$;
create trigger nouveaute_scrutins after insert or update of statut, resultat on public.scrutins
  for each row execute function public._trg_scrutins();

-- Échoppe
create or replace function public._trg_objets() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.visible and (tg_op = 'INSERT' or not old.visible) then
    perform public._noter('echoppe', 'objet:' || new.id, null, new.id);
  end if;
  return new;
end $$;
create trigger nouveaute_objets after insert or update of visible on public.objets
  for each row execute function public._trg_objets();

-- ---------- Publication par le MJ ----------
create or replace function public.mj_publier_nouveautes(p_ids uuid[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_url text; v_portail text;
  v_lignes text[] := array[]::text[];
  v_section text; v_titre text; v_bloc text;
  v_msg text := '📣 **Nouvelles du camp**';
  v_ligne text; v_n int;
begin
  if not public.est_mj() then raise exception 'Réservé aux MJ.'; end if;
  select valeur into v_url from public.parametres where cle = 'discord_webhook_annonces';
  if v_url is null then raise exception 'Le webhook du salon des annonces n''est pas réglé (Paramètres).'; end if;
  select valeur into v_portail from public.parametres where cle = 'url_portail';

  select count(*) into v_n from public.nouveautes where p_ids is null or id = any(p_ids);
  if v_n = 0 then return 0; end if;

  foreach v_section in array array['chantiers','missions','votes','echoppe'] loop
    v_titre := case v_section when 'chantiers' then '__Chantiers__' when 'missions' then '__Ordres de mission__'
                               when 'votes' then '__Conseil__' else '__Échoppe de Jasmine__' end;
    select string_agg(coalesce(n.texte,
             '📦 ' || o.nom || ' : ' || trim_scale(o.prix) || ' po'
             || case when o.stock is not null then ' (' || o.stock || ' en stock)' else '' end), E'\n'
             order by n.cree_le)
      into v_bloc
      from public.nouveautes n left join public.objets o on o.id = n.objet_id
     where n.section = v_section and (p_ids is null or n.id = any(p_ids))
       and (n.objet_id is null or o.visible);
    if v_bloc is not null then
      v_lignes := v_lignes || ''::text || v_titre || string_to_array(v_bloc, E'\n');
    end if;
  end loop;
  if v_portail is not null then v_lignes := v_lignes || ''::text || ('<' || v_portail || '>'); end if;

  -- découpe en messages de moins de 1900 caractères
  foreach v_ligne in array v_lignes loop
    if length(v_msg) + length(v_ligne) + 1 > 1900 then
      perform public._discord_salon('discord_webhook_annonces', v_msg);
      v_msg := v_ligne;
    else
      v_msg := v_msg || E'\n' || v_ligne;
    end if;
  end loop;
  perform public._discord_salon('discord_webhook_annonces', v_msg);

  delete from public.nouveautes where p_ids is null or id = any(p_ids);
  return v_n;
end $$;

-- Test des deux salons depuis l'admin
create or replace function public.mj_tester_webhook(p_salon text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_mj() then raise exception 'Réservé aux MJ.'; end if;
  if p_salon = 'annonces' then
    perform public._discord_salon('discord_webhook_annonces', '🔔 Test du registre de la colonie : les annonces arriveront ici.');
  else
    perform public._discord_salon('discord_webhook', '🔔 Test du registre de la colonie : les votes seront annoncés ici.');
  end if;
end $$;

-- ---------- Catalogue (réservé au MJ) ----------
create table public.catalogue (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  categorie text not null,
  sous_categorie text,
  prix numeric(14,2),
  poids text,
  details text,
  rarete text,
  source text not null default 'SRD 5.2.1',
  ordre int not null default 0
);
create index on public.catalogue (categorie);
alter table public.catalogue enable row level security;
revoke all on public.catalogue from anon;
create policy "mj_tout" on public.catalogue for all to authenticated
  using ((select public.est_mj())) with check ((select public.est_mj()));

-- ---------- Droits ----------
revoke execute on function public._discord_salon(text, text) from public, anon, authenticated;
revoke execute on function public._discord(text) from public, anon, authenticated;
revoke execute on function public._noter(text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public._trg_projets() from public, anon, authenticated;
revoke execute on function public._trg_missions() from public, anon, authenticated;
revoke execute on function public._trg_scrutins() from public, anon, authenticated;
revoke execute on function public._trg_objets() from public, anon, authenticated;
revoke execute on function public.mj_publier_nouveautes(uuid[]) from public, anon;
revoke execute on function public.mj_tester_webhook(text) from public, anon;
grant execute on function public.mj_publier_nouveautes(uuid[]) to authenticated;
grant execute on function public.mj_tester_webhook(text) to authenticated;
