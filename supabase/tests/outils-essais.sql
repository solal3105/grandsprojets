-- Outils communs aux essais de base locale : le tableau des résultats et les
-- fonctions qui jouent une instruction au nom d'un compte puis comparent.
-- Inclus par chaque fichier d'essais (\ir), jamais joué seul.

\set QUIET on
set client_min_messages = warning;

create table public.zz_essais (n int generated always as identity, cas text, attendu text, obtenu text, ok boolean);

-- Joue une instruction au nom d'un compte, comme le fait l'API : rôle Postgres
-- et jeton. Rend le message de l'erreur s'il y en a une ; sinon 'ok <lignes
-- touchées>' pour une écriture, ou la valeur lue (une ligne, une colonne) pour
-- une lecture.
create function public.zz_jouer(p_role text, p_user uuid, p_sql text, p_lecture boolean) returns text
language plpgsql as $$
declare
  v text;
  n bigint;
begin
  begin
    if p_role in ('anon', 'authenticated', 'service_role') then
      perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
    end if;
    perform set_config('role', p_role, true);
    if p_lecture then
      execute p_sql into v;
      v := coalesce(v, '(rien)');
    else
      execute p_sql;
      get diagnostics n = row_count;
      v := 'ok ' || n;
    end if;
    perform set_config('role', 'none', true);
  exception when others then
    v := sqlerrm;
  end;
  perform set_config('request.jwt.claims', '', true);
  return v;
end;
$$;

create function public.zz_as(p_role text, p_user uuid, p_sql text) returns text
language sql as $$ select public.zz_jouer(p_role, p_user, p_sql, false); $$;

create function public.zz_lit(p_role text, p_user uuid, p_sql text) returns text
language sql as $$ select public.zz_jouer(p_role, p_user, p_sql, true); $$;

create function public.zz_check(p_cas text, p_obtenu text, p_attendu text) returns void
language sql as $$
  insert into public.zz_essais (cas, attendu, obtenu, ok)
  values (p_cas, p_attendu, p_obtenu, coalesce(p_obtenu like p_attendu, false));
$$;
