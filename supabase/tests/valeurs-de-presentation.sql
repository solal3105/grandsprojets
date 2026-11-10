-- Essais des valeurs de présentation (migration 20261110180000).
--
-- À rejouer après toute modification de is_icon_class, de is_css_color ou des
-- contraintes *_presentation. Base locale jetable, jamais le projet Supabase.
--
--   createdb essai_presentation
--   psql -v ON_ERROR_STOP=1 -d essai_presentation \
--     -f supabase/tests/socle-local.sql \
--     -f supabase/tests/socle-stockage-local.sql \
--     -f supabase/tests/socle-ecritures-local.sql \
--     -f supabase/tests/socle-presentation-local.sql \
--     -f supabase/tests/valeurs-de-presentation.sql
--   dropdb essai_presentation
--
-- Toutes les lignes doivent afficher OK ; le script s'arrête en erreur sinon.
-- Il applique lui-même la migration entre ses deux temps.

\ir outils-essais.sql
\ir jeu-profils.sql

insert into public.city_branding (ville, brand_name) values ('a', 'Ville A');
insert into public.city_modules (ville, module_key, label, config) values ('a', 'travaux', 'Travaux', '{"color":"#FF6B35"}');
insert into public.category_icons (ville, category, icon_class, category_styles) values
  ('a', 'urbanisme', 'fa-solid fa-city', '{"color":"#6366F1","weight":3,"opacity":0.8}'),
  ('a', 'sans-style', 'fa-bus', null);
insert into public.ui_toggles (key, icon, label) values ('filters', 'fa-filter', 'Filtres');
insert into public.participer_categories (ville, category_key, icon_class, color) values ('a', 'voirie', 'fa-solid fa-road', '#EF4444');
insert into public.participer_statuts (ville, statut_key, color) values ('a', 'recu', '#2563EB');
insert into public.layers (name, ville, icon, icon_color) values ('velo', 'a', null, null);
insert into public.city_travaux (ville, name, icon) values ('a', 'Rue de la Paix', 'fa-solid fa-helmet-safety');
insert into public.filter_items (id, icon) values ('velo', 'fa-bicycle');
insert into public.basemaps_v2 (name, icon) values ('plan', 'fa-map');

\set piege_icone   '''fa-bus"><img src=x onerror=alert(1)>'''
\set piege_couleur '''red" onmouseover="alert(1)'''
\set refus '''new row for relation "%" violates check constraint "%_presentation"'''

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 1 : avant la migration, la base garde n'importe quel texte
-- ═════════════════════════════════════════════════════════════════════════════

select zz_check('Avant : une icône de catégorie qui porte une balise s''enregistre',
  zz_as('authenticated', :adm_a, format($$update public.category_icons set icon_class = %L where category = 'sans-style'$$, :piege_icone)), 'ok 1');
select zz_check('Avant : une couleur de module qui ferme l''attribut s''enregistre',
  zz_as('postgres', null, format($$update public.city_modules set config = jsonb_build_object('color', %L)$$, :piege_couleur)), 'ok 1');
update public.category_icons set icon_class = 'fa-bus' where category = 'sans-style';
update public.city_modules set config = '{"color":"#FF6B35"}';

-- ═════════════════════════════════════════════════════════════════════════════
-- La migration, jouée deux fois : elle se rejoue sans erreur
-- ═════════════════════════════════════════════════════════════════════════════

\ir ../migrations/20261110180000_valeurs_de_presentation.sql
\ir ../migrations/20261110180000_valeurs_de_presentation.sql

select zz_check('Dix contraintes posées, une par table, une seule fois',
  (select count(*)::text from pg_constraint where conname like '%\_presentation' and contype = 'c'), '10');

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 2 : la forme d'une icône, la forme d'une couleur
-- ═════════════════════════════════════════════════════════════════════════════

select zz_check('Icône admise : ' || coalesce(quote_literal(v), 'null'), public.is_icon_class(v)::text, 'true')
  from unnest(array['fa-solid fa-bus', 'fa-bus', 'fas fa-layer-group', 'fa-solid  fa-person-walking', 'fa_custom-1', '', null]) v;
select zz_check('Icône refusée : ' || v, public.is_icon_class(v)::text, 'false')
  from unnest(array[:piege_icone, 'fa-bus"', 'fa-bus''', 'fa-bus>', 'fa-bus<i', 'fa-bus=x', 'fa-bus;', E'fa-bus\nfa-x', 'fa-bus&quot;', 'fa-bus(1)']) v;

select zz_check('Couleur admise : ' || coalesce(quote_literal(v), 'null'), public.is_css_color(v)::text, 'true')
  from unnest(array['#14AE5C', '#fff', '#14AE5C80', '#FFFFFFFF', 'var(--color-warning)', 'rgb(20, 174, 92)', 'rgba(20,174,92,0.5)', 'hsl(145 79% 38% / 0.5)', 'orange', 'RED', '', null]) v;
select zz_check('Couleur refusée : ' || v, public.is_css_color(v)::text, 'false')
  from unnest(array[:piege_couleur, 'url(https://x.example/b)', '#14', '#14AE5C;', '#14AE5C"', 'red;background:url(x)', 'var(--x);', 'var(x)', 'expression(alert(1))', 'rgb(1,2,3);x', ' #14AE5C', '#GGGGGG', 'ab', 'javascript:alert(1)', E'red\nblue']) v;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEMPS 3 : chaque colonne refuse le piège, quel que soit le compte
-- ═════════════════════════════════════════════════════════════════════════════

-- Par l'API, au nom de l'administrateur de la ville : la règle s'évalue avec ses droits.
select zz_check('L''administrateur de la ville : icône de catégorie piégée refusée',
  zz_as('authenticated', :adm_a, format($$update public.category_icons set icon_class = %L where ville = 'a'$$, :piege_icone)), :refus);
select zz_check('Il enregistre toujours une icône et un style ordinaires',
  zz_as('authenticated', :adm_a, $$update public.category_icons set icon_class = 'fa-solid fa-tree', category_styles = '{"color":"#22C55E","fill":true,"fillColor":"#22C55E","fillOpacity":0.3,"dashArray":"4 4"}' where category = 'urbanisme'$$), 'ok 1');

-- Avec les droits du propriétaire, comme une fonction serveur : la règle tient aussi.
select zz_check('Colonne ' || cas, zz_as('postgres', null, requete), :refus)
  from (values
    ('category_icons.icon_class',            format($$update public.category_icons set icon_class = %L$$, :piege_icone)),
    ('category_icons.category_styles.color', format($$update public.category_icons set category_styles = jsonb_build_object('color', %L)$$, :piege_couleur)),
    ('category_icons.category_styles.fillColor', format($$update public.category_icons set category_styles = jsonb_build_object('color', '#fff', 'fillColor', %L)$$, :piege_couleur)),
    ('category_icons.category_styles en texte', $$update public.category_icons set category_styles = to_jsonb('{"color":"x\" onmouseover=\"y"}'::text)$$),
    ('category_icons.category_styles.color en objet', $$update public.category_icons set category_styles = '{"color":{"a":1}}'$$),
    ('city_modules.icon_class',              format($$update public.city_modules set icon_class = %L$$, :piege_icone)),
    ('city_modules.config.color',            format($$update public.city_modules set config = jsonb_build_object('color', %L)$$, :piege_couleur)),
    ('city_modules.config en texte',         $$update public.city_modules set config = to_jsonb('x'::text)$$),
    ('city_branding.primary_color',          format($$update public.city_branding set primary_color = %L$$, :piege_couleur)),
    ('participer_categories.icon_class',     format($$update public.participer_categories set icon_class = %L$$, :piege_icone)),
    ('participer_categories.color',          format($$update public.participer_categories set color = %L$$, :piege_couleur)),
    ('participer_statuts.color',             format($$update public.participer_statuts set color = %L$$, :piege_couleur)),
    ('layers.icon',                          format($$update public.layers set icon = %L$$, :piege_icone)),
    ('layers.icon_color',                    format($$update public.layers set icon_color = %L$$, :piege_couleur)),
    ('city_travaux.icon',                    format($$update public.city_travaux set icon = %L$$, :piege_icone)),
    ('filter_items.icon',                    format($$update public.filter_items set icon = %L$$, :piege_icone)),
    ('basemaps_v2.icon',                     format($$update public.basemaps_v2 set icon = %L$$, :piege_icone)),
    ('ui_toggles.icon',                      format($$update public.ui_toggles set icon = %L$$, :piege_icone)),
    ('category_icons à la création',         format($$insert into public.category_icons (ville, category, icon_class) values ('a', 'piege', %L)$$, :piege_icone))
  ) as c(cas, requete);

-- Ce qui s'enregistrait s'enregistre toujours.
select zz_check('Toujours admis : ' || cas, zz_as('postgres', null, requete), 'ok 1')
  from (values
    ('un module sans couleur',               $$update public.city_modules set config = '{"source_type":"city_travaux","url":null}'$$),
    ('un module avec sa couleur',            $$update public.city_modules set config = '{"color":"#0EA5E9","source_type":"url","url":"https://exemple.invalid/t.geojson"}', icon_class = 'fa-solid fa-helmet-safety'$$),
    ('une catégorie sans style',             $$update public.category_icons set category_styles = null where category = 'sans-style'$$),
    ('une catégorie au style vide',          $$update public.category_icons set category_styles = '{}' where category = 'sans-style'$$),
    ('une identité en hexadécimal court',    $$update public.city_branding set primary_color = '#fff'$$),
    ('une couche sans icône',                $$update public.layers set icon = null, icon_color = null, style = '{"color":"orange","weight":2}'$$),
    ('une couche avec icône et couleur',     $$update public.layers set icon = 'fa-bicycle', icon_color = '#14AE5C'$$),
    ('un chantier sans icône',               $$update public.city_travaux set icon = null$$),
    ('un statut de signalement',             $$update public.participer_statuts set color = '#10B981'$$),
    ('une catégorie de signalement',         $$update public.participer_categories set icon_class = 'fa-solid fa-lightbulb', color = '#F59E0B'$$)
  ) as c(cas, requete);

\ir resultat-essais.sql
