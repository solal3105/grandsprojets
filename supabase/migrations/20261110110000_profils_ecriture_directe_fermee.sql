-- Plus aucune écriture directe dans profiles depuis le navigateur.
--
-- Suite de 20261110100000 (garde et journal). À appliquer une fois la console
-- en ligne avec set_profile_role() : une console restée en cache qui écrit
-- encore directement reçoit alors « permission denied for table profiles »,
-- et un rechargement de la page suffit.
--
-- La garde fermait déjà le défaut. Ici, c'est la porte elle-même qui est
-- murée : sans le droit d'écrire sur la table, aucune règle d'accès ajoutée
-- plus tard, même trop large, ne peut la rouvrir. Les droits d'un compte ne
-- changent plus que par set_profile_role() (console), par les fonctions
-- serveur qui tiennent la clé de service (invite-user, SSO) ou en SQL.
--
-- La lecture ne change pas (son propre profil, ou tous pour un administrateur).

drop policy if exists "Admins can update profiles" on public.profiles;

revoke insert, update, delete, truncate on public.profiles from anon, authenticated;

-- Marche arrière :
--   grant insert, update, delete, truncate on public.profiles to authenticated;
--   grant truncate on public.profiles to anon;
--   create policy "Admins can update profiles" on public.profiles
--     for update to authenticated using (public.is_admin()) with check (public.is_admin());
