-- Les lots de lecture comptent 12 textes : une zone que le panneau accepte
-- (jusqu'à environ 670 textes sous le plafond d'un dollar) demande environ deux
-- appels par lot, les rapprochements par couche et la synthèse. Le plafond de 60
-- appels arrêtait ces zones après avoir fait payer leur lecture. Le plafond en
-- dollars reste la vraie borne ; celui des appels ne sert plus qu'à couper une
-- boucle anormale.
create or replace function public.reserve_diagnostic_ai(
  p_run uuid, p_family uuid, p_user uuid, p_ville text, p_hash text,
  p_phase text, p_model text, p_reserve bigint, p_floor bigint
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare r diagnostic_ai_runs; c diagnostic_ai_calls;
begin
  if p_reserve <= 0 or p_floor < 0 then raise exception 'Invalid reservation'; end if;
  insert into diagnostic_ai_runs(id,family_id,user_id,ville) values(p_run,p_family,p_user,p_ville) on conflict do nothing;
  select * into r from diagnostic_ai_runs where id=p_run for update;
  if r.user_id <> p_user or r.ville <> p_ville or r.family_id <> p_family then
    return jsonb_build_object('status','forbidden');
  end if;
  select * into c from diagnostic_ai_calls where run_id=p_run and request_hash=p_hash order by created_at desc limit 1;
  if found and c.status='complete' then
    return jsonb_build_object('status','cached','result',c.result,'spent_micro',r.spent_micro,'reserved_micro',r.reserved_micro,'limit_micro',r.limit_micro);
  end if;
  if c.status='running' then
    -- Un serveur disparu ne libère jamais un appel possiblement facturé.
    if c.created_at > now()-interval '2 minutes' then return jsonb_build_object('status','busy'); end if;
    update diagnostic_ai_calls set status='uncertain',charged_micro=reserved_micro,finished_at=now() where id=c.id;
    update diagnostic_ai_runs set reserved_micro=reserved_micro-c.reserved_micro,spent_micro=spent_micro+c.reserved_micro where id=p_run returning * into r;
  end if;
  if r.spent_micro+r.reserved_micro+p_reserve+p_floor > r.limit_micro or r.calls >= 160 then
    return jsonb_build_object('status','budget','spent_micro',r.spent_micro,'reserved_micro',r.reserved_micro,'limit_micro',r.limit_micro);
  end if;
  insert into diagnostic_ai_calls(run_id,request_hash,phase,model,reserved_micro) values(p_run,p_hash,p_phase,p_model,p_reserve) returning * into c;
  update diagnostic_ai_runs set reserved_micro=reserved_micro+p_reserve,calls=calls+1 where id=p_run returning * into r;
  return jsonb_build_object('status','reserved','call_id',c.id,'spent_micro',r.spent_micro,'reserved_micro',r.reserved_micro,'limit_micro',r.limit_micro);
end $$;
