-- =========================================================
-- Besoins : quatre paliers (insuffisant, précaire, suffisant, abondant) avec libellés personnalisables
-- Journal : ordre des entrées d'un même jour
-- Achats : retirés du fil d'activité public
-- =========================================================

alter table public.besoins drop constraint if exists besoins_etat_check;
update public.besoins set etat = case etat when 'non_couvert' then 'insuffisant' when 'assure' then 'suffisant' else etat end;
alter table public.besoins alter column etat set default 'insuffisant';
alter table public.besoins add constraint besoins_etat_check check (etat in ('insuffisant','precaire','suffisant','abondant'));
alter table public.besoins
  add column if not exists libelle_insuffisant text,
  add column if not exists libelle_precaire text,
  add column if not exists libelle_suffisant text,
  add column if not exists libelle_abondant text;

alter table public.journal add column if not exists ordre int not null default 0;

update public.activite set public = false where type = 'achat';

do $$
declare d text;
begin
  -- portail_etat : libellés des besoins, ordre du journal
  select pg_get_functiondef('public.portail_etat(text)'::regprocedure) into d;
  d := replace(d, '''note'', b.note, ''icone'', b.icone)',
    '''note'', b.note, ''icone'', b.icone, ''libelles'', jsonb_build_object(''insuffisant'', b.libelle_insuffisant, ''precaire'', b.libelle_precaire, ''suffisant'', b.libelle_suffisant, ''abondant'', b.libelle_abondant))');
  d := replace(d, 'jsonb_agg(j order by j.jour desc nulls last, j.cree_le desc)', 'jsonb_agg(j order by j.jour desc nulls last, j.ordre, j.cree_le desc)');
  d := replace(d, 'select id, type, jour, titre, contenu, auteur, lien_discord, cree_le', 'select id, type, jour, titre, contenu, auteur, lien_discord, cree_le, ordre');
  d := replace(d, 'from public.journal where visible order by jour desc nulls last, cree_le desc', 'from public.journal where visible order by jour desc nulls last, ordre, cree_le desc');
  if position('libelle_abondant' in d) = 0 or position('j.ordre' in d) = 0 then raise exception 'portail_etat inattendue'; end if;
  execute d;

  -- portail_acheter : l'achat n'apparaît plus dans le fil public
  select pg_get_functiondef('public.portail_acheter(text, uuid, integer)'::regprocedure) into d;
  d := replace(d, ' à l''''échoppe.'');', ' à l''''échoppe.'', false);');
  if position('échoppe.'', false)' in d) = 0 then raise exception 'portail_acheter inattendue'; end if;
  execute d;
end $$;
