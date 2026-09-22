-- Plafond d'arrêt d'une génération de dossier : 1 $ (le budget prévu, annoncé
-- à la sélection de la zone, reste 0,24 $). Les générations déjà ouvertes au
-- plafond initial en profitent aussi : elles peuvent reprendre au lieu de
-- rester bloquées aux trois quarts.
alter table public.diagnostic_ai_runs drop constraint diagnostic_ai_runs_limit_micro_check;
alter table public.diagnostic_ai_runs add constraint diagnostic_ai_runs_limit_micro_check check (limit_micro >= 1 and limit_micro <= 1000000);
alter table public.diagnostic_ai_runs alter column limit_micro set default 1000000;
update public.diagnostic_ai_runs set limit_micro = 1000000 where limit_micro = 240000;
