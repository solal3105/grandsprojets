-- Suivi privé des générations IA. Seul le relais authentifié réserve et solde.
create table public.diagnostic_ai_runs (
  id uuid primary key,
  family_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  ville text not null check (ville ~ '^[a-zA-Z0-9-]+$'),
  spent_micro bigint not null default 0 check (spent_micro >= 0),
  reserved_micro bigint not null default 0 check (reserved_micro >= 0),
  limit_micro bigint not null default 240000 check (limit_micro between 1 and 240000),
  calls integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.diagnostic_ai_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.diagnostic_ai_runs(id) on delete cascade,
  request_hash text not null,
  phase text not null,
  model text not null,
  status text not null default 'running' check (status in ('running','complete','failed','uncertain')),
  reserved_micro bigint not null check (reserved_micro > 0),
  charged_micro bigint,
  usage jsonb,
  result jsonb,
  request_id text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index diagnostic_ai_calls_lookup on public.diagnostic_ai_calls(run_id,request_hash,created_at desc);
alter table public.diagnostic_ai_runs enable row level security;
alter table public.diagnostic_ai_calls enable row level security;
revoke all on public.diagnostic_ai_runs, public.diagnostic_ai_calls from anon, authenticated;
grant all on public.diagnostic_ai_runs, public.diagnostic_ai_calls to service_role;

create function public.reserve_diagnostic_ai(
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
  if r.spent_micro+r.reserved_micro+p_reserve+p_floor > r.limit_micro or r.calls >= 60 then
    return jsonb_build_object('status','budget','spent_micro',r.spent_micro,'reserved_micro',r.reserved_micro,'limit_micro',r.limit_micro);
  end if;
  insert into diagnostic_ai_calls(run_id,request_hash,phase,model,reserved_micro) values(p_run,p_hash,p_phase,p_model,p_reserve) returning * into c;
  update diagnostic_ai_runs set reserved_micro=reserved_micro+p_reserve,calls=calls+1 where id=p_run returning * into r;
  return jsonb_build_object('status','reserved','call_id',c.id,'spent_micro',r.spent_micro,'reserved_micro',r.reserved_micro,'limit_micro',r.limit_micro);
end $$;

create function public.settle_diagnostic_ai(p_call uuid,p_status text,p_charge bigint,p_usage jsonb,p_result jsonb,p_request_id text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare c diagnostic_ai_calls; r diagnostic_ai_runs; charge bigint;
begin
  if p_status not in ('complete','failed','uncertain') or p_charge < 0 then raise exception 'Invalid settlement'; end if;
  select * into c from diagnostic_ai_calls where id=p_call;
  if not found then raise exception 'Unknown reservation'; end if;
  -- Même ordre de verrous que la réservation : génération, puis appel.
  select * into r from diagnostic_ai_runs where id=c.run_id for update;
  select * into c from diagnostic_ai_calls where id=p_call for update;
  if c.status='running' then
    charge := case when p_status='uncertain' then c.reserved_micro else p_charge end;
    update diagnostic_ai_calls set status=p_status,charged_micro=charge,usage=p_usage,result=p_result,request_id=p_request_id,finished_at=now() where id=p_call;
    update diagnostic_ai_runs set reserved_micro=reserved_micro-c.reserved_micro,spent_micro=spent_micro+charge where id=c.run_id returning * into r;
  end if;
  return jsonb_build_object('spent_micro',r.spent_micro,'reserved_micro',r.reserved_micro,'limit_micro',r.limit_micro);
end $$;
revoke all on function public.reserve_diagnostic_ai(uuid,uuid,uuid,text,text,text,text,bigint,bigint) from public,anon,authenticated;
revoke all on function public.settle_diagnostic_ai(uuid,text,bigint,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.reserve_diagnostic_ai(uuid,uuid,uuid,text,text,text,text,bigint,bigint) to service_role;
grant execute on function public.settle_diagnostic_ai(uuid,text,bigint,jsonb,jsonb,text) to service_role;
