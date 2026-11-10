-- Affiche le tableau des essais et arrête le script en erreur si l'un échoue.
-- Inclus en fin de chaque fichier d'essais (\ir).

\set QUIET off
\pset footer off
select n, case when ok then 'OK' else 'ÉCHEC' end as resultat, cas,
       case when ok then '' else 'attendu : ' || attendu || ' | obtenu : ' || coalesce(obtenu, '(rien)') end as detail
  from public.zz_essais order by n;
select count(*) as essais, count(*) filter (where ok) as reussis from public.zz_essais;

do $$
begin
  if exists (select 1 from public.zz_essais where not ok) then
    raise exception 'Des essais échouent : voir les lignes ÉCHEC ci-dessus.';
  end if;
end $$;
