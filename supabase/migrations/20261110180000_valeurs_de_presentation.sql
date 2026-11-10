-- UNE CLASSE D'ICÔNE ET UNE COULEUR ONT UNE FORME : LA BASE LA TIENT.
--
-- Les icônes et les couleurs qu'une collectivité règle (catégories, modules,
-- identité, signalements, couches, chantiers) sont écrites par les pages dans
-- des attributs class et style. Chaque page les valide avant de les écrire
-- (normalizeIconClass et SecurityUtils.safeColor, modules/security-utils.js).
-- La base tient maintenant la même règle à la source : une valeur qui n'a pas
-- la forme d'une classe d'icône ou d'une couleur ne s'enregistre pas, quel que
-- soit l'écran, le compte ou la fonction serveur qui l'envoie.
--
-- Relevé du 10/11/2026 : toutes les valeurs en base ont déjà cette forme
-- (989 catégories, 223 modules, 199 identités, 51 catégories et 56 statuts de
-- signalement, 62 couches, 36 chantiers, 10 filtres, 8 fonds de carte, 9 boutons).

-- Les caractères d'un nom de classe, et l'espace qui sépare deux classes.
create or replace function public.is_icon_class(v text)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select v is null or v ~ '^[A-Za-z0-9_ -]*$'
$$;
comment on function public.is_icon_class(text) is
  'Vrai pour une liste de classes d''icône (lettres, chiffres, tiret, tiret bas, espaces). Miroir de normalizeIconClass (modules/security-utils.js).';

-- Les quatre écritures d'une couleur que les pages acceptent.
create or replace function public.is_css_color(v text)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select v is null
      or v = ''
      or v ~* '^#[0-9a-f]{3,8}$'
      or v ~* '^var\(--[a-z0-9-]+\)$'
      or v ~* '^(rgb|hsl)a?\([0-9 .,%/]+\)$'
      or v ~* '^[a-z]{3,20}$'
$$;
comment on function public.is_css_color(text) is
  'Vrai pour une couleur écrite en hexadécimal, en variable CSS, en rgb() ou hsl(), ou par son nom. Miroir de SecurityUtils.safeColor (modules/security-utils.js).';

-- Une contrainte par table, posée une seule fois (la migration se rejoue).
do $$
declare
  regle record;
begin
  for regle in
    select * from (values
      ('category_icons', 'category_icons_presentation',
        $c$public.is_icon_class(icon_class)
           and (category_styles is null or (
                 jsonb_typeof(category_styles) = 'object'
                 and public.is_css_color(category_styles ->> 'color')
                 and public.is_css_color(category_styles ->> 'fillColor')))$c$),
      ('city_modules', 'city_modules_presentation',
        $c$public.is_icon_class(icon_class)
           and jsonb_typeof(config) = 'object'
           and public.is_css_color(config ->> 'color')$c$),
      ('city_branding', 'city_branding_presentation',
        $c$public.is_css_color(primary_color)$c$),
      ('participer_categories', 'participer_categories_presentation',
        $c$public.is_icon_class(icon_class) and public.is_css_color(color)$c$),
      ('participer_statuts', 'participer_statuts_presentation',
        $c$public.is_css_color(color)$c$),
      ('layers', 'layers_presentation',
        $c$public.is_icon_class(icon) and public.is_css_color(icon_color)$c$),
      ('city_travaux', 'city_travaux_presentation', $c$public.is_icon_class(icon)$c$),
      ('filter_items', 'filter_items_presentation', $c$public.is_icon_class(icon)$c$),
      ('basemaps_v2', 'basemaps_v2_presentation', $c$public.is_icon_class(icon)$c$),
      ('ui_toggles', 'ui_toggles_presentation', $c$public.is_icon_class(icon)$c$)
    ) as r(tbl, nom, condition)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = regle.nom and conrelid = format('public.%I', regle.tbl)::regclass
    ) then
      execute format('alter table public.%I add constraint %I check (%s)', regle.tbl, regle.nom, regle.condition);
    end if;
  end loop;
end $$;
