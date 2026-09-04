-- Le fond de carte par défaut de tous les espaces devient « Couleur »
-- (style OpenFreeMap bright) à la place de « Claire » (positron).
--
-- La carte choisit le fond ainsi : préférence de la ville (city_branding.default_basemap)
-- si elle existe, sinon le fond marqué is_default parmi ceux du thème courant,
-- sinon le premier du thème dans l'ordre de tri. Un seul fond clair porte is_default.
-- « Couleur » passe aussi en tête du panneau, « Claire » reste disponible en troisième.

update public.basemaps_v2 set is_default = false, sort_order = 3 where name = 'ofm-positron';
update public.basemaps_v2 set is_default = true,  sort_order = 1 where name = 'ofm-bright';
