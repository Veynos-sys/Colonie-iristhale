-- =========================================================
-- Notes des joueurs (personnelles ou partagées), carnet, ajouts de PNJ et de créatures,
-- classes des personnages retirées du portail.
-- =========================================================

alter table public.pnj add column if not exists cree_par uuid references public.colons(id) on delete set null;
alter table public.bestiaire add column if not exists cree_par uuid references public.colons(id) on delete set null;
create index if not exists pnj_cree_par_idx on public.pnj (cree_par);
create index if not exists bestiaire_cree_par_idx on public.bestiaire (cree_par);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  auteur_id uuid not null references public.colons(id) on delete cascade,
  cible_type text not null check (cible_type in ('pnj','creature','colon','carnet')),
  cible_id uuid,
  titre text,
  texte text not null,
  prive boolean not null default true,       -- true : visible de l'auteur seul ; false : tout le village
  modifie_par uuid references public.colons(id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (cible_type = 'carnet' or cible_id is not null),
  check (cible_type <> 'carnet' or prive)
);
create index on public.notes (auteur_id);
create index on public.notes (modifie_par);
create index on public.notes (cible_type, cible_id);
alter table public.notes enable row level security;
revoke all on public.notes from anon;
create policy "mj_tout" on public.notes for all to authenticated
  using ((select public.est_mj())) with check ((select public.est_mj()));

-- Nettoyage des notes quand leur sujet disparaît
create or replace function public._trg_nettoyer_notes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.notes where cible_id = old.id and cible_type = tg_argv[0];
  return old;
end $$;
create trigger nettoyer_notes after delete on public.pnj for each row execute function public._trg_nettoyer_notes('pnj');
create trigger nettoyer_notes after delete on public.bestiaire for each row execute function public._trg_nettoyer_notes('creature');
create trigger nettoyer_notes after delete on public.colons for each row execute function public._trg_nettoyer_notes('colon');

-- ---------- Outils ----------
create or replace function public._nom_cible(p_type text, p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case p_type
    when 'pnj' then (select nom from public.pnj where id = p_id and visible)
    when 'creature' then (select nom from public.bestiaire where id = p_id and visible)
    when 'colon' then (select personnage from public.colons where id = p_id and actif)
  end;
$$;

create or replace function public._notes_json(p_moi uuid, p_type text, p_cible uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'partagees', coalesce((select jsonb_agg(jsonb_build_object(
        'id', n.id, 'texte', n.texte, 'auteur', a.personnage, 'mienne', n.auteur_id = p_moi,
        'modifie_par', case when n.modifie_par is distinct from n.auteur_id then m.personnage end,
        'modifie_le', n.modifie_le) order by n.cree_le)
      from public.notes n join public.colons a on a.id = n.auteur_id left join public.colons m on m.id = n.modifie_par
      where n.cible_type = p_type and n.cible_id = p_cible and not n.prive), '[]'::jsonb),
    'perso', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'texte', n.texte, 'modifie_le', n.modifie_le) order by n.cree_le)
      from public.notes n where n.cible_type = p_type and n.cible_id = p_cible and n.prive and n.auteur_id = p_moi), '[]'::jsonb)
  );
$$;

-- ---------- Écrire ou modifier une note ----------
create or replace function public.portail_note_enregistrer(
  p_mdp text, p_id uuid, p_cible_type text, p_cible_id uuid, p_texte text, p_prive boolean default true, p_titre text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.colons;
  n public.notes;
  v_texte text := trim(coalesce(p_texte, ''));
  v_nom text;
begin
  c := public._colon(p_mdp);
  if length(v_texte) < 2 then raise exception 'La note est vide.' using errcode = 'P0001'; end if;
  if length(v_texte) > 4000 then raise exception 'La note est trop longue (4 000 caractères au plus).' using errcode = 'P0001'; end if;

  if p_id is null then
    if p_cible_type = 'carnet' then
      insert into public.notes (auteur_id, cible_type, titre, texte, prive)
        values (c.id, 'carnet', nullif(left(trim(coalesce(p_titre, '')), 120), ''), v_texte, true);
      return jsonb_build_object('ok', true, 'message', 'Note ajoutée au carnet.');
    end if;
    if p_cible_type not in ('pnj','creature','colon') then raise exception 'Sujet inconnu.' using errcode = 'P0001'; end if;
    v_nom := public._nom_cible(p_cible_type, p_cible_id);
    if v_nom is null then raise exception 'Sujet introuvable.' using errcode = 'P0001'; end if;
    insert into public.notes (auteur_id, cible_type, cible_id, texte, prive, modifie_par)
      values (c.id, p_cible_type, p_cible_id, v_texte, coalesce(p_prive, true), c.id);
    if not coalesce(p_prive, true) then
      perform public._journaliser(c.id, 'note', c.personnage || ' a ajouté une information sur ' || v_nom || '.');
      return jsonb_build_object('ok', true, 'message', 'Information partagée avec tout le village.');
    end if;
    return jsonb_build_object('ok', true, 'message', 'Note personnelle enregistrée.');
  end if;

  select * into n from public.notes where id = p_id for update;
  if not found then raise exception 'Note introuvable.' using errcode = 'P0001'; end if;
  if n.prive and n.auteur_id <> c.id then raise exception 'Cette note ne vous appartient pas.' using errcode = 'P0001'; end if;
  update public.notes
     set texte = v_texte, modifie_par = c.id, modifie_le = now(),
         titre = case when n.cible_type = 'carnet' then nullif(left(trim(coalesce(p_titre, '')), 120), '') else titre end
   where id = n.id;
  if not n.prive then
    perform public._journaliser(c.id, 'note', c.personnage || ' a modifié une information sur ' || coalesce(public._nom_cible(n.cible_type, n.cible_id), '?') || '.');
  end if;
  return jsonb_build_object('ok', true, 'message', 'Note mise à jour.');
end $$;

create or replace function public.portail_note_supprimer(p_mdp text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.colons; n public.notes;
begin
  c := public._colon(p_mdp);
  select * into n from public.notes where id = p_id;
  if not found then raise exception 'Note introuvable.' using errcode = 'P0001'; end if;
  if n.auteur_id <> c.id then raise exception 'Seul l''auteur peut supprimer cette note.' using errcode = 'P0001'; end if;
  delete from public.notes where id = n.id;
  return jsonb_build_object('ok', true, 'message', 'Note supprimée.');
end $$;

-- ---------- Ajouter un personnage rencontré ----------
create or replace function public.portail_ajouter_pnj(p_mdp text, p_nom text, p_role text, p_description text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.colons; v_nom text := left(trim(coalesce(p_nom, '')), 80);
begin
  c := public._colon(p_mdp);
  if length(v_nom) < 2 then raise exception 'Donnez un nom à ce personnage.' using errcode = 'P0001'; end if;
  insert into public.pnj (nom, role, description, visible, ordre, cree_par)
    values (v_nom, nullif(left(trim(coalesce(p_role, '')), 120), ''), nullif(left(trim(coalesce(p_description, '')), 4000), ''), true, 100, c.id);
  perform public._journaliser(c.id, 'pnj', c.personnage || ' a inscrit un nouveau personnage au registre : ' || v_nom || '.');
  return jsonb_build_object('ok', true, 'message', v_nom || ' est inscrit au registre.');
end $$;

-- ---------- Documenter une créature ----------
create or replace function public.portail_ajouter_creature(
  p_mdp text, p_nom text, p_categorie text, p_habitat text, p_danger text, p_description text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.colons; v_nom text := left(trim(coalesce(p_nom, '')), 80);
begin
  c := public._colon(p_mdp);
  if length(v_nom) < 2 then raise exception 'Donnez un nom à cette créature.' using errcode = 'P0001'; end if;
  insert into public.bestiaire (nom, categorie, habitat, danger, description, decouvert_par, cree_par, jour, visible)
    values (v_nom, nullif(left(trim(coalesce(p_categorie, '')), 80), ''), nullif(left(trim(coalesce(p_habitat, '')), 160), ''),
            nullif(left(trim(coalesce(p_danger, '')), 60), ''), nullif(left(trim(coalesce(p_description, '')), 4000), ''),
            c.id, c.id, (select jour_actuel from public.village where id = 1), true);
  perform public._journaliser(c.id, 'bestiaire', c.personnage || ' a documenté une nouvelle créature : ' || v_nom || '.');
  return jsonb_build_object('ok', true, 'message', v_nom || ' entre au bestiaire.');
end $$;

-- ---------- Droits ----------
revoke execute on function public._trg_nettoyer_notes() from public, anon, authenticated;
revoke execute on function public._nom_cible(text, uuid) from public, anon, authenticated;
revoke execute on function public._notes_json(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.portail_note_enregistrer(text, uuid, text, uuid, text, boolean, text) to anon, authenticated;
grant execute on function public.portail_note_supprimer(text, uuid) to anon, authenticated;
grant execute on function public.portail_ajouter_pnj(text, text, text, text) to anon, authenticated;
grant execute on function public.portail_ajouter_creature(text, text, text, text, text, text) to anon, authenticated;
