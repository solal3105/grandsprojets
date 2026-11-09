-- Invitations de la console : savoir qui a vraiment ouvert son accès.
--
-- Le 3 novembre 2026, deux invitations envoyées depuis la console ne sont
-- jamais parties, et rien ne permettait de le voir : la liste des
-- utilisateurs ne montrait que le rôle et la date de création. Deux fonctions,
-- toutes deux en lecture seule :
--
-- 1. compte_par_email : la fonction invite-user cherche le compte qui porte
--    une adresse (aucun, jamais ouvert, déjà utilisé) avant de décider
--    d'inviter, de relancer ou d'ajouter l'espace. Réservée à la clé de
--    service : elle lit auth.users.
-- 2. profils_etat_acces : la console affiche « Jamais connecté » et le bouton
--    « Renvoyer l'invitation » pour les comptes qui n'ont jamais servi. Mêmes
--    droits que get_profiles_with_email (son propre profil, ou un admin).

create or replace function public.compte_par_email(p_email text)
returns table (id uuid, email_confirmed_at timestamptz, last_sign_in_at timestamptz, role text, ville text[])
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email_confirmed_at, u.last_sign_in_at, p.role, p.ville
    from auth.users u
    left join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(p_email))
   limit 1;
$$;

revoke all on function public.compte_par_email(text) from public, anon, authenticated;
grant execute on function public.compte_par_email(text) to service_role;

create or replace function public.profils_etat_acces()
returns table (id uuid, email_confirmed_at timestamptz, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email_confirmed_at, u.last_sign_in_at
    from auth.users u
   where u.id = auth.uid() or public.is_admin();
$$;

revoke all on function public.profils_etat_acces() from public, anon;
grant execute on function public.profils_etat_acces() to authenticated;
