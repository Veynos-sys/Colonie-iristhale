-- =========================================================
-- Annonces Discord détaillées : missions complètes, entrées du journal,
-- texte composé au moment de la publication (reflète les dernières modifications)
-- =========================================================

alter table public.nouveautes drop constraint if exists nouveautes_section_check;
alter table public.nouveautes add constraint nouveautes_section_check
  check (section in ('chantiers','missions','votes','journal','echoppe'));
alter table public.nouveautes
  add column if not exists mission_id uuid references public.missions(id) on delete cascade,
  add column if not exists journal_id uuid references public.journal(id) on delete cascade;
create index if not exists nouveautes_mission_id_idx on public.nouveautes (mission_id);
create index if not exists nouveautes_journal_id_idx on public.nouveautes (journal_id);

-- Missions : la nouvelle mission est composée à l'envoi, avec tout son contenu
create or replace function public._trg_missions() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_apparait boolean;
begin
  if not new.visible then return new; end if;
  v_apparait := tg_op = 'INSERT' or not old.visible;
  if v_apparait and new.statut in ('ouverte', 'en_cours') then
    insert into public.nouveautes (section, cle, mission_id) values ('missions', 'mission:' || new.id || ':nouvelle', new.id)
    on conflict (cle) do update set cree_le = now();
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

-- Journal : chaque entrée publiée (rapport, événement, annonce) devient une nouveauté
create or replace function public._trg_journal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.visible and (tg_op = 'INSERT' or not old.visible) then
    insert into public.nouveautes (section, cle, journal_id) values ('journal', 'journal:' || new.id, new.id)
    on conflict (cle) do update set cree_le = now();
  end if;
  return new;
end $$;
drop trigger if exists nouveaute_journal on public.journal;
create trigger nouveaute_journal after insert or update of visible on public.journal
  for each row execute function public._trg_journal();

-- Coupe un texte proprement à la fin d'un mot
create or replace function public._extrait(p_texte text, p_max int) returns text
language sql immutable as $$
  select case when p_texte is null then null
              when length(p_texte) <= p_max then p_texte
              else regexp_replace(left(p_texte, p_max), '\s+\S*$', '') || '…' end;
$$;

-- Texte Discord d'une nouveauté, composé avec les données actuelles
create or replace function public._texte_nouveaute(p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  n public.nouveautes; o public.objets; m public.missions; j public.journal;
  v_portail text; v_lien text;
begin
  select * into n from public.nouveautes where id = p_id;
  select valeur into v_portail from public.parametres where cle = 'url_portail';

  if n.objet_id is not null then
    select * into o from public.objets where id = n.objet_id;
    if not found or not o.visible then return null; end if;
    return '📦 ' || o.nom || ' : ' || trim_scale(o.prix) || ' po'
      || case when o.stock is not null then ' (' || o.stock || ' en stock)' else '' end;
  end if;

  if n.mission_id is not null then
    select * into m from public.missions where id = n.mission_id;
    if not found or not m.visible then return null; end if;
    return '📜 **Nouvel ordre de mission : ' || m.titre || '**'
      || coalesce(E'\n*' || m.resume || '*', '')
      || coalesce(E'\n' || public._extrait(m.description, 900), '')
      || coalesce(E'\n🪙 **Récompense :** ' || m.recompense, '')
      || coalesce(E'\n✍️ Ordre de ' || m.donneur, '')
      || E'\n🖊️ Pour vous porter volontaire : onglet Missions du registre'
      || coalesce(E'\n💬 Discussion : <' || m.lien_discord || '>', '');
  end if;

  if n.journal_id is not null then
    select * into j from public.journal where id = n.journal_id;
    if not found or not j.visible then return null; end if;
    v_lien := coalesce(j.lien_discord, v_portail || '#journal');
    return case j.type when 'rapport' then '📖 **Rapport' when 'evenement' then '⚡ **Événement' else '📣 **Annonce' end
      || coalesce(' · jour ' || j.jour, '') || ' : ' || j.titre || '**'
      || coalesce(' (' || j.auteur || ')', '')
      || coalesce(E'\n' || public._extrait(j.contenu, case when j.type = 'rapport' then 450 else 900 end), '')
      || case when j.type = 'rapport' or length(coalesce(j.contenu, '')) > 900
              then coalesce(E'\nLire la suite : <' || v_lien || '>', '') else '' end;
  end if;

  return n.texte;
end $$;

-- Aperçu pour l'admin (même texte que celui qui sera publié)
create or replace function public.mj_apercu_nouveautes() returns table (id uuid, section text, texte text, cree_le timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_mj() then raise exception 'Réservé aux MJ.'; end if;
  return query
    select n.id, n.section, public._texte_nouveaute(n.id), n.cree_le from public.nouveautes n order by n.cree_le;
end $$;

-- Publication : un bloc par nouveauté, regroupés par rubrique, découpés en messages de 1 900 caractères au plus
create or replace function public.mj_publier_nouveautes(p_ids uuid[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_url text; v_portail text;
  v_blocs text[] := array[]::text[];
  v_section text; v_titre text; v_bloc text; v_n int;
  v_msg text := '📣 **Nouvelles du camp**';
  r record;
begin
  if not public.est_mj() then raise exception 'Réservé aux MJ.'; end if;
  select valeur into v_url from public.parametres where cle = 'discord_webhook_annonces';
  if v_url is null then raise exception 'Le webhook du salon des annonces n''est pas réglé (Paramètres).'; end if;
  select valeur into v_portail from public.parametres where cle = 'url_portail';

  select count(*) into v_n from public.nouveautes where p_ids is null or id = any(p_ids);
  if v_n = 0 then return 0; end if;

  foreach v_section in array array['missions','journal','chantiers','votes','echoppe'] loop
    v_titre := case v_section when 'missions' then '__Ordres de mission__' when 'journal' then '__Journal du camp__'
                 when 'chantiers' then '__Chantiers__' when 'votes' then '__Conseil__' else '__Échoppe de Jasmine__' end;
    v_bloc := null;
    for r in select public._texte_nouveaute(n.id) as t from public.nouveautes n
             where n.section = v_section and (p_ids is null or n.id = any(p_ids)) order by n.cree_le loop
      continue when r.t is null;
      if v_bloc is null then
        v_blocs := v_blocs || (E'\n' || v_titre);
      end if;
      v_bloc := r.t;
      -- les blocs de plusieurs lignes sont séparés par une ligne vide
      v_blocs := v_blocs || (case when position(E'\n' in r.t) > 0 then E'\n' else '' end || left(r.t, 1850));
    end loop;
  end loop;
  if v_portail is not null then v_blocs := v_blocs || (E'\n🔗 Registre de la colonie : <' || v_portail || '>'); end if;

  foreach v_bloc in array v_blocs loop
    if length(v_msg) + length(v_bloc) + 1 > 1900 then
      perform public._discord_salon('discord_webhook_annonces', v_msg);
      v_msg := ltrim(v_bloc, E'\n');
    else
      v_msg := v_msg || E'\n' || v_bloc;
    end if;
  end loop;
  perform public._discord_salon('discord_webhook_annonces', v_msg);

  delete from public.nouveautes where p_ids is null or id = any(p_ids);
  return v_n;
end $$;

revoke execute on function public._trg_journal() from public, anon, authenticated;
revoke execute on function public._texte_nouveaute(uuid) from public, anon, authenticated;
revoke execute on function public._extrait(text, int) from public, anon;
revoke execute on function public.mj_apercu_nouveautes() from public, anon;
grant execute on function public.mj_apercu_nouveautes() to authenticated;
