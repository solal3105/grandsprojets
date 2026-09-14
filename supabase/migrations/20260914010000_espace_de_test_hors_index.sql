-- L'espace de test des essais automatiques sort des moteurs de recherche.
--
-- Il se comporte comme une ville ordinaire : ses projets approuvés
-- deviennent des pages publiques. Jusqu'ici ils n'étaient écartés du plan du
-- site et de la page des villes que par une règle sur leur nom (« test »,
-- « e2e »), ce qui tenait à une convention de nommage et non à une règle.
-- Le réglage par espace fait ce travail proprement, et cette règle sur les
-- noms est retirée du code dans le même commit.

update public.city_branding set indexable = false where ville = 'test-e2e';
