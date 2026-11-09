-- The Orteig Prize — class leaderboard.
-- Lives in its own schema (orteig), which the REST API does not expose.
-- Browsers can only call the five public.orteig_* functions below.
-- The flight model in orteig.simulate must match assets/physics.js exactly.

create schema if not exists orteig;
revoke all on schema orteig from public, anon, authenticated;

create table if not exists orteig.classes (
  code text primary key,
  name text not null check (char_length(name) between 1 and 40),
  key_hash bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists orteig.flights (
  id bigint generated always as identity primary key,
  class_code text not null references orteig.classes(code) on delete cascade,
  pilot text not null,
  pilot_key text not null,
  wing text not null,
  engine text not null,
  tank text not null,
  crew text not null,
  events int not null,
  misses int not null,
  status text not null check (status in ('paris', 'fuel', 'crash')),
  distance int not null,
  hours numeric(7,3) not null,
  created_at timestamptz not null default now()
);
create index if not exists flights_class_pilot_idx on orteig.flights (class_code, pilot_key, created_at desc);

alter table orteig.classes enable row level security;
alter table orteig.flights enable row level security;
revoke all on all tables in schema orteig from public, anon, authenticated;
revoke all on all sequences in schema orteig from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Flight model (mirror of assets/physics.js)
-- ---------------------------------------------------------------------------
create or replace function orteig.simulate(
  p_wing text, p_engine text, p_tank text, p_crew text, p_outcomes int[],
  out status text, out distance float8, out hours float8, out events int, out misses int
)
language plpgsql immutable set search_path = '' as $$
declare
  w_weight float8; w_lift float8; w_drag float8;
  e_weight float8; e_hp float8; e_speed float8; e_burn float8;
  t_gal float8; t_weight float8; c_weight float8; c_pilots int;
  v_weight float8; v_maxto float8; v float8; endur float8;
  times float8[] := array[5,9,13,17,20,23,26,29,32,35,38,41,44,47]::float8[];
  t float8 := 0; p float8 := 0; e float8; d float8; win int; r int; arrive float8;
begin
  case p_wing
    when 'mono'  then w_weight := 400; w_lift := 5200; w_drag := 1.0;
    when 'bi'    then w_weight := 550; w_lift := 6000; w_drag := 1.3;
    when 'racer' then w_weight := 250; w_lift := 3200; w_drag := 0.8;
    else raise exception 'bad_part';
  end case;
  case p_engine
    when 'whirlwind' then e_weight := 510; e_hp := 223; e_speed := 115; e_burn := 12;
    when 'liberty'   then e_weight := 850; e_hp := 400; e_speed := 135; e_burn := 24;
    when 'ox5'       then e_weight := 390; e_hp := 90;  e_speed := 75;  e_burn := 6;
    else raise exception 'bad_part';
  end case;
  case p_tank
    when 'small'  then t_gal := 100; t_weight := 30;
    when 'medium' then t_gal := 250; t_weight := 60;
    when 'large'  then t_gal := 450; t_weight := 100;
    else raise exception 'bad_part';
  end case;
  case p_crew
    when 'solo' then c_weight := 170; c_pilots := 1;
    when 'duo'  then c_weight := 340; c_pilots := 2;
    else raise exception 'bad_part';
  end case;

  events := 0; misses := 0;
  v_weight := 1200 + w_weight + e_weight + t_weight + t_gal * 6 + c_weight;
  v_maxto := least(w_lift, e_hp * 30);
  if v_weight > v_maxto then
    status := 'crash'; distance := 0; hours := 0; return;
  end if;

  v := e_speed / sqrt(w_drag);
  endur := t_gal / e_burn;

  if c_pilots = 1 then
    for i in 1 .. array_length(times, 1) loop
      e := times[i];
      exit when p + v * (e - t) >= 3600;
      exit when e >= endur;
      p := p + v * (e - t);
      t := e;
      win := greatest(800, 1600 - 100 * (i - 1));
      r := case when p_outcomes is not null and coalesce(array_length(p_outcomes, 1), 0) >= i
                then p_outcomes[i] else null end;
      if r is null or r < 0 or r > win then
        d := 1.5::float8; misses := misses + 1;
      else
        d := (greatest(250, r)::float8 / 1000::float8) * 0.8::float8;
      end if;
      events := events + 1;
      if t + d >= endur then
        status := 'fuel'; distance := p; hours := endur; return;
      end if;
      t := t + d;
    end loop;
  end if;

  arrive := t + (3600 - p) / v;
  if arrive <= endur then
    status := 'paris'; distance := 3600; hours := arrive; return;
  end if;
  status := 'fuel'; distance := p + v * (endur - t); hours := endur;
end $$;

revoke all on function orteig.simulate(text, text, text, text, int[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function orteig.norm_code(p_code text) returns text
language sql immutable set search_path = '' as $$
  select case when upper(btrim(coalesce(p_code, ''))) ~ '^[A-Z0-9]{5}$'
              then upper(btrim(p_code)) end
$$;
revoke all on function orteig.norm_code(text) from public, anon, authenticated;

create or replace function orteig.norm_pilot(p_pilot text) returns text
language sql immutable set search_path = '' as $$
  select case when x ~ '^[[:alnum:] .''-]{1,20}$' and x ~ '[[:alnum:]]' then x end
  from (select regexp_replace(btrim(coalesce(p_pilot, '')), '\s+', ' ', 'g') as x) s
$$;
revoke all on function orteig.norm_pilot(text) from public, anon, authenticated;

-- Best flight per pilot, ranked.
create or replace function orteig.board_rows(p_code text)
returns table (pilot text, pilot_key text, status text, distance int, hours numeric, wing text, engine text,
               tank text, crew text, misses int, flights bigint, best_id bigint, last_at timestamptz)
language sql stable set search_path = '' as $$
  with ranked as (
    select f.*,
           row_number() over (partition by f.pilot_key order by f.distance desc, f.hours asc, f.id asc) as rn,
           count(*) over (partition by f.pilot_key) as n,
           max(f.created_at) over (partition by f.pilot_key) as last_at
    from orteig.flights f
    where f.class_code = p_code
  )
  select r.pilot, r.pilot_key, r.status, r.distance, r.hours, r.wing, r.engine, r.tank, r.crew,
         r.misses, r.n, r.id, r.last_at
  from ranked r
  where r.rn = 1
  order by r.distance desc, r.hours asc, r.id asc
$$;
revoke all on function orteig.board_rows(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public API (the only things a browser can call)
-- ---------------------------------------------------------------------------
create or replace function public.orteig_create_class(p_name text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_code text; v_key text; tries int := 0;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    return json_build_object('ok', false, 'error', 'bad_name');
  end if;
  if (select count(*) from orteig.classes where created_at > now() - interval '1 hour') >= 60
     or (select count(*) from orteig.classes) >= 5000 then
    return json_build_object('ok', false, 'error', 'busy');
  end if;
  loop
    tries := tries + 1;
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      into v_code from generate_series(1, 5);
    exit when not exists (select 1 from orteig.classes c where c.code = v_code);
    if tries > 20 then return json_build_object('ok', false, 'error', 'busy'); end if;
  end loop;
  v_key := translate(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+/', '-_');
  insert into orteig.classes (code, name, key_hash)
  values (v_code, v_name, extensions.digest(v_key, 'sha256'));
  return json_build_object('ok', true, 'code', v_code, 'name', v_name, 'key', v_key);
end $$;

create or replace function public.orteig_class(p_code text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare v_code text := orteig.norm_code(p_code); v_name text;
begin
  select c.name into v_name from orteig.classes c where c.code = v_code;
  if v_name is null then return json_build_object('ok', false, 'error', 'class_not_found'); end if;
  return json_build_object('ok', true, 'code', v_code, 'name', v_name);
end $$;

create or replace function public.orteig_submit(
  p_code text, p_pilot text, p_wing text, p_engine text, p_tank text, p_crew text, p_outcomes int[]
) returns json language plpgsql security definer set search_path = '' as $$
declare
  v_code text := orteig.norm_code(p_code);
  v_pilot text := orteig.norm_pilot(p_pilot);
  v_key text;
  sim record;
  v_dist int; v_hours numeric;
  v_rank int; v_pilots int; best record;
begin
  if v_code is null or not exists (select 1 from orteig.classes c where c.code = v_code) then
    return json_build_object('ok', false, 'error', 'class_not_found');
  end if;
  if v_pilot is null then return json_build_object('ok', false, 'error', 'bad_pilot'); end if;
  if p_wing not in ('mono', 'bi', 'racer') or p_engine not in ('whirlwind', 'liberty', 'ox5')
     or p_tank not in ('small', 'medium', 'large') or p_crew not in ('solo', 'duo') then
    return json_build_object('ok', false, 'error', 'bad_part');
  end if;
  if p_outcomes is not null and coalesce(array_length(p_outcomes, 1), 0) > 20 then
    return json_build_object('ok', false, 'error', 'bad_outcomes');
  end if;
  v_key := lower(v_pilot);
  if exists (select 1 from orteig.flights f where f.class_code = v_code and f.pilot_key = v_key
             and f.created_at > now() - interval '2 seconds') then
    return json_build_object('ok', false, 'error', 'too_fast');
  end if;
  if (select count(*) from orteig.flights f where f.class_code = v_code) >= 5000 then
    return json_build_object('ok', false, 'error', 'class_full');
  end if;

  select * into sim from orteig.simulate(p_wing, p_engine, p_tank, p_crew, p_outcomes);
  v_dist := case when sim.status = 'paris' then 3600
                 else least(3599, floor(sim.distance)::int) end;
  v_hours := round(sim.hours::numeric, 3);

  insert into orteig.flights (class_code, pilot, pilot_key, wing, engine, tank, crew,
                              events, misses, status, distance, hours)
  values (v_code, v_pilot, v_key, p_wing, p_engine, p_tank, p_crew,
          sim.events, sim.misses, sim.status, v_dist, v_hours);

  select b.*, row_number() over (order by b.distance desc, b.hours asc, b.best_id asc) as pos,
         count(*) over () as total
    into best
  from orteig.board_rows(v_code) b
  order by (b.pilot_key = v_key) desc
  limit 1;

  select count(*) into v_pilots from orteig.board_rows(v_code);
  select x.pos into v_rank from (
    select b.pilot_key, row_number() over (order by b.distance desc, b.hours asc, b.best_id asc) as pos
    from orteig.board_rows(v_code) b
  ) x where x.pilot_key = v_key;

  return json_build_object(
    'ok', true,
    'flight', json_build_object('status', sim.status, 'distance', v_dist, 'hours', v_hours,
                                'events', sim.events, 'misses', sim.misses),
    'best', json_build_object('status', best.status, 'distance', best.distance, 'hours', best.hours),
    'rank', v_rank, 'pilots', v_pilots
  );
end $$;

create or replace function public.orteig_board(p_code text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare v_code text := orteig.norm_code(p_code); v_name text;
begin
  select c.name into v_name from orteig.classes c where c.code = v_code;
  if v_name is null then return json_build_object('ok', false, 'error', 'class_not_found'); end if;
  return json_build_object(
    'ok', true, 'code', v_code, 'name', v_name, 'now', now(),
    'flights', (select count(*) from orteig.flights f where f.class_code = v_code),
    'pilots', coalesce((select json_agg(json_build_object(
                 'pilot', b.pilot, 'status', b.status, 'distance', b.distance, 'hours', b.hours,
                 'wing', b.wing, 'engine', b.engine, 'tank', b.tank, 'crew', b.crew,
                 'misses', b.misses, 'flights', b.flights, 'last_at', b.last_at)
               order by b.distance desc, b.hours asc, b.best_id asc)
               from (select * from orteig.board_rows(v_code) limit 300) b), '[]'::json),
    'first', (select json_build_object('pilot', f.pilot, 'hours', f.hours, 'at', f.created_at)
              from orteig.flights f where f.class_code = v_code and f.status = 'paris'
              order by f.id asc limit 1),
    'recent', coalesce((select json_agg(json_build_object(
                 'pilot', r.pilot, 'status', r.status, 'distance', r.distance, 'hours', r.hours, 'at', r.created_at)
               order by r.id desc)
               from (select * from orteig.flights f where f.class_code = v_code order by f.id desc limit 8) r), '[]'::json),
    'builds', coalesce((select json_agg(json_build_object(
                 'wing', g.wing, 'engine', g.engine, 'tank', g.tank, 'crew', g.crew,
                 'flights', g.n, 'paris', g.paris) order by g.n desc)
               from (select f.wing, f.engine, f.tank, f.crew, count(*) as n,
                            count(*) filter (where f.status = 'paris') as paris
                     from orteig.flights f where f.class_code = v_code
                     group by 1, 2, 3, 4 order by count(*) desc limit 12) g), '[]'::json)
  );
end $$;

create or replace function public.orteig_remove_pilot(p_code text, p_key text, p_pilot text)
returns json language plpgsql security definer set search_path = '' as $$
declare v_code text := orteig.norm_code(p_code); v_removed int;
begin
  if v_code is null or not exists (
       select 1 from orteig.classes c
       where c.code = v_code and c.key_hash = extensions.digest(coalesce(p_key, ''), 'sha256')) then
    return json_build_object('ok', false, 'error', 'not_teacher');
  end if;
  delete from orteig.flights f
  where f.class_code = v_code and f.pilot_key = lower(regexp_replace(btrim(coalesce(p_pilot, '')), '\s+', ' ', 'g'));
  get diagnostics v_removed = row_count;
  return json_build_object('ok', true, 'removed', v_removed);
end $$;

-- Only these five are callable from the browser.
revoke all on function public.orteig_create_class(text) from public;
revoke all on function public.orteig_class(text) from public;
revoke all on function public.orteig_submit(text, text, text, text, text, text, int[]) from public;
revoke all on function public.orteig_board(text) from public;
revoke all on function public.orteig_remove_pilot(text, text, text) from public;
grant execute on function public.orteig_create_class(text) to anon, authenticated;
grant execute on function public.orteig_class(text) to anon, authenticated;
grant execute on function public.orteig_submit(text, text, text, text, text, text, int[]) to anon, authenticated;
grant execute on function public.orteig_board(text) to anon, authenticated;
grant execute on function public.orteig_remove_pilot(text, text, text) to anon, authenticated;
