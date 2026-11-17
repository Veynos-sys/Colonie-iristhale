-- =========================================================
-- Colonie d'Iristhale : schéma de base
-- Toutes les tables sont fermées aux visiteurs anonymes (RLS).
-- Les joueurs passent uniquement par les fonctions de 002_fonctions_joueurs.sql.
-- Les MJ (e-mails listés dans mj_emails) ont tous les droits.
-- =========================================================

create extension if not exists pg_net with schema extensions;

-- ---------- Administration ----------
create table public.mj_emails (
  email text primary key
);

create or replace function public.est_mj() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.mj_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create table public.parametres (
  cle text primary key,
  valeur text,
  description text
);

-- ---------- Le village ----------
create table public.village (
  id int primary key default 1 check (id = 1),
  nom text not null default 'Le camp des colons',
  palier text not null default 'Campement',
  jour_actuel int not null default 1,
  description text
);

create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique,
  titre text,
  jour_debut int,
  jour_fin int,
  en_cours boolean not null default false,
  resume text,
  cree_le timestamptz not null default now()
);

create table public.besoins (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  etat text not null default 'non_couvert' check (etat in ('non_couvert','precaire','assure')),
  provisoire boolean not null default false,   -- couvert seulement grâce au navire
  note text,                                    -- explication visible par les joueurs
  icone text,
  ordre int not null default 0,
  visible boolean not null default true
);

create table public.cartes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  image_url text,
  active boolean not null default false,
  cree_le timestamptz not null default now()
);

create table public.emplacements (
  id uuid primary key default gen_random_uuid(),
  carte_id uuid not null references public.cartes(id) on delete cascade,
  nom text not null,
  x numeric not null check (x between 0 and 100),   -- position en % de la largeur
  y numeric not null check (y between 0 and 100),   -- position en % de la hauteur
  description text
);

create table public.projets (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  besoin_id uuid references public.besoins(id) on delete set null,
  conditions text,          -- ce qu'il faut en plus du besoin (artisan, matériau, quête)
  effet text,               -- effet concret en jeu une fois construit
  statut text not null default 'verrouille'
    check (statut in ('verrouille','disponible','en_vote','en_cours','termine','abandonne')),
  commande_compagnie boolean not null default false,
  cycle_id uuid references public.cycles(id) on delete set null,
  emplacement_id uuid references public.emplacements(id) on delete set null,
  icone text,
  ordre int not null default 0,
  visible boolean not null default true,
  notes_mj text
);

create table public.navires (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  capitaine text,
  statut text not null default 'attendu' check (statut in ('attendu','a_quai','reparti','perdu')),
  jour_prevu int,
  annonce text,       -- ce que les joueurs savent de son arrivée
  cargaison text,     -- ce qu'il apporte (visible)
  visible boolean not null default true,
  notes_mj text,
  ordre int not null default 0
);

-- ---------- Les personnes ----------
create table public.colons (
  id uuid primary key default gen_random_uuid(),
  joueur text not null,
  personnage text not null,
  mot_de_passe text not null unique,
  espece text,
  classe text,
  niveau int,
  portrait_url text,
  description text,           -- écrite par le joueur
  responsabilite text,        -- rôle au village (ex. responsable de la forge)
  actif boolean not null default true,
  notes_mj text,
  cree_le timestamptz not null default now()
);

create table public.pnj (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  role text,
  description text,           -- ce que tout le monde voit en premier
  portrait_url text,
  statut text default 'vivant',
  visible boolean not null default true,
  ordre int not null default 0,
  notes_mj text
);

-- Ce que l'on sait d'un PNJ ou d'un colon.
-- portee 'village' : connu de tous ; 'restreint' : seulement des colons listés dans savoirs_colons.
create table public.savoirs (
  id uuid primary key default gen_random_uuid(),
  pnj_id uuid references public.pnj(id) on delete cascade,
  colon_id uuid references public.colons(id) on delete cascade,
  texte text not null,
  portee text not null default 'village' check (portee in ('village','restreint')),
  jour int,
  cree_le timestamptz not null default now(),
  check ((pnj_id is null) <> (colon_id is null))
);

create table public.savoirs_colons (
  savoir_id uuid not null references public.savoirs(id) on delete cascade,
  colon_id uuid not null references public.colons(id) on delete cascade,
  primary key (savoir_id, colon_id)
);

-- ---------- L'or ----------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  colon_id uuid not null references public.colons(id) on delete cascade,
  montant numeric(12,2) not null,   -- en pièces d'or, négatif = dépense
  motif text not null,
  origine text not null default 'mj' check (origine in ('mj','achat','systeme')),
  cree_le timestamptz not null default now()
);

-- ---------- L'échoppe ----------
create table public.objets (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  categorie text,
  description text,
  prix numeric(12,2) not null check (prix >= 0),
  stock int check (stock is null or stock >= 0),   -- null = illimité
  rayon text not null default 'fonds' check (rayon in ('fonds','arrivage','rare')),
  cycle_id uuid references public.cycles(id) on delete set null,
  visible boolean not null default true,
  ordre int not null default 0
);

create table public.achats (
  id uuid primary key default gen_random_uuid(),
  colon_id uuid not null references public.colons(id) on delete cascade,
  objet_id uuid references public.objets(id) on delete set null,
  nom_objet text not null,
  quantite int not null check (quantite > 0),
  prix_total numeric(12,2) not null,
  cree_le timestamptz not null default now()
);

create table public.commandes (
  id uuid primary key default gen_random_uuid(),
  colon_id uuid not null references public.colons(id) on delete cascade,
  demande text not null,
  statut text not null default 'demandee' check (statut in ('demandee','acceptee','livree','refusee')),
  prix numeric(12,2),
  reponse text,
  navire_id uuid references public.navires(id) on delete set null,
  cree_le timestamptz not null default now()
);

-- ---------- Les ordres de mission ----------
create table public.missions (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  resume text,
  description text,
  recompense text,
  donneur text,
  statut text not null default 'ouverte' check (statut in ('ouverte','en_cours','terminee','echouee','annulee')),
  lien_discord text,
  visible boolean not null default true,
  ordre int not null default 0,
  cree_le timestamptz not null default now()
);

create table public.inscriptions (
  mission_id uuid not null references public.missions(id) on delete cascade,
  colon_id uuid not null references public.colons(id) on delete cascade,
  message text,
  cree_le timestamptz not null default now(),
  primary key (mission_id, colon_id)
);

-- ---------- Le bestiaire ----------
create table public.bestiaire (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  categorie text,
  description text,
  habitat text,
  danger text,
  decouvert_par uuid references public.colons(id) on delete set null,
  jour int,
  image_url text,
  visible boolean not null default false,
  notes_mj text,
  cree_le timestamptz not null default now()
);

-- ---------- Le journal ----------
create table public.journal (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'evenement' check (type in ('rapport','evenement','annonce')),
  jour int,
  titre text not null,
  contenu text,
  auteur text,
  lien_discord text,
  visible boolean not null default true,
  cree_le timestamptz not null default now()
);

-- ---------- Les votes ----------
create table public.scrutins (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  description text,
  statut text not null default 'ouvert' check (statut in ('brouillon','ouvert','clos')),
  cycle_id uuid references public.cycles(id) on delete set null,
  resultat text,
  cree_le timestamptz not null default now()
);

create table public.choix (
  id uuid primary key default gen_random_uuid(),
  scrutin_id uuid not null references public.scrutins(id) on delete cascade,
  libelle text not null,
  description text,
  projet_id uuid references public.projets(id) on delete set null,
  emplacement_id uuid references public.emplacements(id) on delete set null,
  ordre int not null default 0
);

create table public.bulletins (
  scrutin_id uuid not null references public.scrutins(id) on delete cascade,
  colon_id uuid not null references public.colons(id) on delete cascade,
  choix_id uuid not null references public.choix(id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (scrutin_id, colon_id)
);

-- ---------- Le fil d'activité ----------
create table public.activite (
  id bigint generated always as identity primary key,
  colon_id uuid references public.colons(id) on delete set null,
  type text not null,
  message text not null,
  public boolean not null default true,
  cree_le timestamptz not null default now()
);

-- ---------- Index utiles ----------
create index on public.transactions (colon_id);
create index on public.achats (colon_id);
create index on public.savoirs (pnj_id);
create index on public.savoirs (colon_id);
create index on public.savoirs_colons (colon_id);
create index on public.emplacements (carte_id);
create index on public.projets (besoin_id);
create index on public.projets (cycle_id);
create index on public.projets (emplacement_id);
create index on public.choix (scrutin_id);
create index on public.choix (projet_id);
create index on public.choix (emplacement_id);
create index on public.bulletins (colon_id);
create index on public.bulletins (choix_id);
create index on public.inscriptions (colon_id);
create index on public.commandes (colon_id);
create index on public.commandes (navire_id);
create index on public.objets (cycle_id);
create index on public.achats (objet_id);
create index on public.bestiaire (decouvert_par);
create index on public.scrutins (cycle_id);
create index on public.activite (cree_le desc);
create index on public.activite (colon_id);

-- ---------- Sécurité : RLS partout, accès total pour les MJ ----------
do $$
declare t text;
begin
  foreach t in array array[
    'mj_emails','parametres','village','cycles','besoins','cartes','emplacements','projets',
    'navires','colons','pnj','savoirs','savoirs_colons','transactions','objets','achats',
    'commandes','missions','inscriptions','bestiaire','journal','scrutins','choix','bulletins','activite'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy "mj_tout" on public.%I for all to authenticated using ((select public.est_mj())) with check ((select public.est_mj()))', t);
  end loop;
end $$;

revoke execute on function public.est_mj() from public, anon;
grant execute on function public.est_mj() to authenticated;

-- ---------- Images (cartes Inkarnate, portraits, bestiaire) ----------
insert into storage.buckets (id, name, public) values ('images', 'images', true)
on conflict (id) do nothing;

create policy "mj_ecrit_images" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (select public.est_mj()));
create policy "mj_modifie_images" on storage.objects for update to authenticated
  using (bucket_id = 'images' and (select public.est_mj()));
create policy "mj_supprime_images" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (select public.est_mj()));
create policy "mj_lit_images" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (select public.est_mj()));
