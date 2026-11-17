-- Objets de l'échoppe liés au catalogue SRD 5.2.1 (description et caractéristiques officielles)
alter table public.catalogue add column if not exists description text;
alter table public.objets add column if not exists catalogue_id uuid references public.catalogue(id) on delete set null;
create index if not exists objets_catalogue_id_idx on public.objets (catalogue_id);

-- portail_etat : chaque objet renvoie aussi details, texte (description), poids et rareté du catalogue
do $$
declare d text;
begin
  select pg_get_functiondef('public.portail_etat(text)'::regprocedure) into d;
  d := replace(d, '''rayon'', o.rayon)',
    '''rayon'', o.rayon, ''details'', ca.details, ''texte'', ca.description, ''poids'', ca.poids, ''rarete'', ca.rarete)');
  d := replace(d, 'from public.objets o where o.visible',
    'from public.objets o left join public.catalogue ca on ca.id = o.catalogue_id where o.visible');
  execute d;
end $$;
