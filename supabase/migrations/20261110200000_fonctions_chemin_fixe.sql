-- LES FONCTIONS QUI LISENT LES DROITS NE CHERCHENT LEURS TABLES QUE LÀ OÙ ELLES SONT.
--
-- Quatre fonctions d'avant 2026 s'exécutent avec les droits de leur
-- propriétaire (elles lisent `profiles` pour dire si le compte est
-- administrateur, s'il fait partie de l'équipe d'une ville, s'il peut gérer ses
-- chantiers, et pour marquer l'auteur d'un chantier déposé). Elles reçoivent le
-- même réglage que toutes celles écrites depuis : un chemin de recherche fixe
-- et vide, chaque table étant nommée avec son schéma. Leur réponse ne dépend
-- plus que de `public.profiles` et du compte connecté, jamais de la session qui
-- les appelle.
--
-- Rien d'autre ne change : mêmes réponses, mêmes droits d'exécution, mêmes
-- règles d'accès et même déclencheur sur `city_travaux`.
-- Essais : supabase/tests/fonctions-chemin-fixe.sql.

-- La seule des quatre qui nommait sa table sans schéma.
create or replace function public.is_admin()
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return (select role from public.profiles where id = auth.uid()) = 'admin';
end;
$$;

-- Les trois autres nomment déjà `public.profiles` : seul le réglage s'ajoute.
alter function public.can_manage_city_travaux(text) set search_path = '';
alter function public.is_contributor_for_ville(text) set search_path = '';
alter function public.travaux_before_insert() set search_path = '';
