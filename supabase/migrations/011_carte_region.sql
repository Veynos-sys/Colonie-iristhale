-- =========================================================
-- Carte de la région et repères posés par les joueurs (village ou personnels) et par le MJ (officiels)
-- L'activité d'un colon supprimé disparaît avec lui
-- =========================================================

alter table public.activite drop constraint if exists activite_colon_id_fkey;
alter table public.activite add constraint activite_colon_id_fkey
  foreign key (colon_id) references public.colons(id) on delete cascade;

alter table public.village add column if not exists carte_region_url text;

create table public.reperes (
  id uuid primary key default gen_random_uuid(),
  auteur_id uuid references public.colons(id) on delete cascade,   -- null : repère officiel du MJ
  type text not null default 'lieu' check (type in ('lieu','ressource','danger','rumeur','autre')),
  titre text not null,
  texte text,
  x numeric not null check (x between 0 and 100),
  y numeric not null check (y between 0 and 100),
  prive boolean not null default false,
  modifie_par uuid references public.colons(id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  check (not prive or auteur_id is not null)
);
create index on public.reperes (auteur_id);
create index on public.reperes (modifie_par);
alter table public.reperes enable row level security;
revoke all on public.reperes from anon;
create policy "mj_tout" on public.reperes for all to authenticated
  using ((select public.est_mj())) with check ((select public.est_mj()));

-- ---------- Poser ou modifier un repère ----------
create or replace function public.portail_repere_enregistrer(
  p_mdp text, p_id uuid, p_type text, p_titre text, p_texte text, p_x numeric default null, p_y numeric default null, p_prive boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.colons; r public.reperes;
  v_titre text := left(trim(coalesce(p_titre, '')), 80);
  v_texte text := nullif(left(trim(coalesce(p_texte, '')), 2000), '');
  v_type text := coalesce(nullif(p_type, ''), 'lieu');
begin
  c := public._colon(p_mdp);
  if length(v_titre) < 2 then raise exception 'Donnez un nom à ce repère.' using errcode = 'P0001'; end if;
  if v_type not in ('lieu','ressource','danger','rumeur','autre') then raise exception 'Type de repère inconnu.' using errcode = 'P0001'; end if;

  if p_id is null then
    if p_x is null or p_y is null or p_x < 0 or p_x > 100 or p_y < 0 or p_y > 100 then
      raise exception 'Position invalide.' using errcode = 'P0001';
    end if;
    insert into public.reperes (auteur_id, type, titre, texte, x, y, prive, modifie_par)
      values (c.id, v_type, v_titre, v_texte, round(p_x, 2), round(p_y, 2), coalesce(p_prive, false), c.id);
    if not coalesce(p_prive, false) then
      perform public._journaliser(c.id, 'carte', c.personnage || ' a marqué « ' || v_titre || ' » sur la carte.');
      return jsonb_build_object('ok', true, 'message', 'Repère ajouté pour tout le village.');
    end if;
    return jsonb_build_object('ok', true, 'message', 'Repère personnel ajouté.');
  end if;

  select * into r from public.reperes where id = p_id for update;
  if not found then raise exception 'Repère introuvable.' using errcode = 'P0001'; end if;
  if r.auteur_id is null then raise exception 'Les repères officiels ne peuvent être modifiés que par le MJ.' using errcode = 'P0001'; end if;
  if r.prive and r.auteur_id <> c.id then raise exception 'Ce repère ne vous appartient pas.' using errcode = 'P0001'; end if;
  update public.reperes set type = v_type, titre = v_titre, texte = v_texte,
         x = coalesce(round(p_x, 2), x), y = coalesce(round(p_y, 2), y),
         modifie_par = c.id, modifie_le = now()
   where id = r.id;
  if not r.prive then
    perform public._journaliser(c.id, 'carte', c.personnage || ' a mis à jour le repère « ' || v_titre || ' ».');
  end if;
  return jsonb_build_object('ok', true, 'message', 'Repère mis à jour.');
end $$;

create or replace function public.portail_repere_supprimer(p_mdp text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.colons; r public.reperes;
begin
  c := public._colon(p_mdp);
  select * into r from public.reperes where id = p_id;
  if not found then raise exception 'Repère introuvable.' using errcode = 'P0001'; end if;
  if r.auteur_id is distinct from c.id then raise exception 'Seul l''auteur peut retirer ce repère.' using errcode = 'P0001'; end if;
  delete from public.reperes where id = r.id;
  return jsonb_build_object('ok', true, 'message', 'Repère retiré.');
end $$;

grant execute on function public.portail_repere_enregistrer(text, uuid, text, text, text, numeric, numeric, boolean) to anon, authenticated;
grant execute on function public.portail_repere_supprimer(text, uuid) to anon, authenticated;

-- ---------- portail_etat : repères visibles ----------
do $$
declare d text;
begin
  select pg_get_functiondef('public.portail_etat(text)'::regprocedure) into d;
  d := replace(d, '''village'', (select to_jsonb(v) from public.village v where id = 1),',
    '''village'', (select to_jsonb(v) from public.village v where id = 1),
    ''reperes'', (select coalesce(jsonb_agg(jsonb_build_object(
        ''id'', r.id, ''type'', r.type, ''titre'', r.titre, ''texte'', r.texte, ''x'', r.x, ''y'', r.y,
        ''prive'', r.prive, ''officiel'', r.auteur_id is null, ''mien'', r.auteur_id = c.id,
        ''auteur'', a.personnage,
        ''modifie_par'', case when r.modifie_par is distinct from r.auteur_id then m.personnage end,
        ''modifie_le'', r.modifie_le) order by r.cree_le), ''[]''::jsonb)
      from public.reperes r left join public.colons a on a.id = r.auteur_id left join public.colons m on m.id = r.modifie_par
      where not r.prive or r.auteur_id = c.id),');
  if position('''reperes''' in d) = 0 then raise exception 'portail_etat inattendue'; end if;
  execute d;
end $$;
