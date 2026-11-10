-- Un administrateur ne lit que les comptes de ses espaces.
--
-- Le défaut (audit de sécurité du 9 novembre 2026) : trois lectures se
-- contentaient du rôle admin, sans regarder l'espace. L'administrateur d'une
-- seule ville recevait donc tous les profils de la suite, leurs adresses
-- e-mail (get_profiles_with_email) et leurs dates de connexion
-- (profils_etat_acces), comptes des autres collectivités et des entreprises
-- de Chantiers compris. Seule la console triait ensuite, dans le navigateur.
--
-- La règle, écrite une seule fois (can_read_profile) et appliquée aux trois
-- lectures :
--   - chacun lit son propre compte ;
--   - un super administrateur lit tous les comptes ;
--   - un administrateur de ville lit les comptes qui ont au moins un espace
--     en commun avec lui. Un compte sans espace n'est donc lu que par
--     lui-même et par les super administrateurs.
--
-- C'est exactement le tri que la console faisait déjà : sa liste des
-- utilisateurs ne change pour personne. Les fonctions de base qui lisent un
-- profil pour décider d'un droit (is_admin, is_admin_for_ville,
-- op_chantier_est_admin...) ne passent pas par cette règle : elles tournent
-- avec les droits de leur propriétaire.
--
-- Essais : supabase/tests/profils-lecture.sql (base locale).

-- 1. La règle ------------------------------------------------------------------

create or replace function public.can_read_profile(p_profile uuid, p_ville text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_profile = auth.uid(), false)
      or exists (
           select 1
             from public.profiles me
            where me.id = auth.uid()
              and me.role = 'admin'
              and ('global' = any(me.ville) or me.ville && p_ville)
         );
$$;

comment on function public.can_read_profile(uuid, text[]) is
  'Qui lit quel compte : le sien, tous pour un super administrateur, ceux qui partagent un espace pour un administrateur de ville. Règle commune à la lecture de profiles, à get_profiles_with_email() et à profils_etat_acces().';

-- Les fonctions du schéma public reçoivent d'office le droit d'exécution pour
-- anon : il se retire nommément.
revoke all on function public.can_read_profile(uuid, text[]) from public, anon;
grant execute on function public.can_read_profile(uuid, text[]) to authenticated, service_role;

-- 2. La table --------------------------------------------------------------------

alter policy "Enable read access for users" on public.profiles
  using (public.can_read_profile(id, ville));

-- 3. Les adresses e-mail -----------------------------------------------------------

create or replace function public.get_profiles_with_email()
returns table (id uuid, role text, ville text, created_at timestamptz, email varchar)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.role, p.ville::text, p.created_at, u.email::varchar
    from public.profiles p
    left join auth.users u on u.id = p.id
   where public.can_read_profile(p.id, p.ville);
$$;

comment on function public.get_profiles_with_email() is
  'Les comptes que l''appelant a le droit de lire (can_read_profile), avec leur adresse e-mail. Sert la liste des utilisateurs de la console.';

revoke all on function public.get_profiles_with_email() from public, anon;
grant execute on function public.get_profiles_with_email() to authenticated, service_role;

-- 4. Les dates de connexion --------------------------------------------------------

create or replace function public.profils_etat_acces()
returns table (id uuid, email_confirmed_at timestamptz, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email_confirmed_at, u.last_sign_in_at
    from auth.users u
    left join public.profiles p on p.id = u.id
   where public.can_read_profile(u.id, p.ville);
$$;

-- Marche arrière (les définitions d'avant) :
--   alter policy "Enable read access for users" on public.profiles
--     using ((auth.uid() = id) or public.is_admin());
--   puis, dans get_profiles_with_email() et profils_etat_acces(), remplacer
--   l'appel à can_read_profile par : <id du compte> = auth.uid() or public.is_admin()
--   drop function if exists public.can_read_profile(uuid, text[]);
