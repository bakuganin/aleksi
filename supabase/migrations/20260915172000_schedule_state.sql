create table public.schedule_state (
  id text primary key,
  revision bigint not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  constraint schedule_state_singleton check (id = 'primary'),
  constraint schedule_state_revision_range check (revision between 1 and 1000000000),
  constraint schedule_state_object check (jsonb_typeof(state) = 'object'),
  constraint schedule_state_top_level_shape check (
    state = jsonb_build_object(
      'schemaVersion', state -> 'schemaVersion',
      'revision', state -> 'revision',
      'timeZone', state -> 'timeZone',
      'updatedAt', state -> 'updatedAt',
      'templates', state -> 'templates',
      'sessions', state -> 'sessions'
    )
  ),
  constraint schedule_state_schema check (
    state ? 'schemaVersion'
    and jsonb_typeof(state -> 'schemaVersion') = 'number'
    and (state ->> 'schemaVersion') = '4'
  ),
  constraint schedule_state_timezone check (
    state ? 'timeZone'
    and jsonb_typeof(state -> 'timeZone') = 'string'
    and (state ->> 'timeZone') = 'Europe/Tallinn'
  ),
  constraint schedule_state_revision_matches check (
    state ? 'revision'
    and jsonb_typeof(state -> 'revision') = 'number'
    and (state ->> 'revision') ~ '^[0-9]+$'
    and (state ->> 'revision')::numeric = revision
  ),
  constraint schedule_state_size check (
    octet_length(state::text) <= 100000
  ),
  constraint schedule_state_collections check (
    case
      when jsonb_typeof(state -> 'templates') = 'array'
       and jsonb_typeof(state -> 'sessions') = 'array'
      then jsonb_array_length(state -> 'templates') <= 120
       and jsonb_array_length(state -> 'sessions') <= 80
      else false
    end
  )
);

alter table public.schedule_state enable row level security;
alter table public.schedule_state force row level security;

revoke all on table public.schedule_state from public, anon, authenticated;
grant select, insert, update on table public.schedule_state to service_role;

insert into public.schedule_state (id, revision, state)
values (
  'primary',
  1,
  $schedule${"schemaVersion":4,"revision":1,"timeZone":"Europe/Tallinn","updatedAt":"2026-09-15T00:00:00.000Z","templates":[{"id":"template-159sgiu-8e7fzk","venue":"sillamae","title":{"ru":"Дети и подростки","et":"Lapsed ja noored","en":"Children and teenagers"},"audience":{"ru":"6–16 лет","et":"6–16-aastased","en":"Ages 6–16"},"durationMinutes":60},{"id":"template-1cit8tx-ggqh8n","venue":"sillamae","title":{"ru":"Первое знакомство","et":"Esimene tutvus","en":"First introduction"},"audience":{"ru":"Малыши до 4 лет","et":"Väikelapsed kuni 4 aastat","en":"Toddlers up to age 4"},"durationMinutes":45},{"id":"template-df95cx-taw2l3","venue":"narva","title":{"ru":"Детская группа","et":"Lasterühm","en":"Children’s group"},"audience":{"ru":"От 5–6 лет","et":"Alates 5.–6. eluaastast","en":"Ages 5–6 and up"},"durationMinutes":60}],"sessions":[{"id":"sillamae-children-mon","weekday":1,"recurrence":"weekly","weekdays":[1],"date":"","startsOn":"","endsOn":"","start":"17:00","end":"18:00","venue":"sillamae","title":{"ru":"Дети и подростки","et":"Lapsed ja noored","en":"Children and teenagers"},"audience":{"ru":"6–16 лет","et":"6–16-aastased","en":"Ages 6–16"},"status":"active"},{"id":"sillamae-children-wed","weekday":3,"recurrence":"weekly","weekdays":[3],"date":"","startsOn":"","endsOn":"","start":"17:00","end":"18:00","venue":"sillamae","title":{"ru":"Дети и подростки","et":"Lapsed ja noored","en":"Children and teenagers"},"audience":{"ru":"6–16 лет","et":"6–16-aastased","en":"Ages 6–16"},"status":"active"},{"id":"sillamae-children-fri","weekday":5,"recurrence":"weekly","weekdays":[5],"date":"","startsOn":"","endsOn":"","start":"17:00","end":"18:00","venue":"sillamae","title":{"ru":"Дети и подростки","et":"Lapsed ja noored","en":"Children and teenagers"},"audience":{"ru":"6–16 лет","et":"6–16-aastased","en":"Ages 6–16"},"status":"active"},{"id":"sillamae-toddlers-sat","weekday":6,"recurrence":"weekly","weekdays":[6],"date":"","startsOn":"","endsOn":"","start":"10:00","end":"10:45","venue":"sillamae","title":{"ru":"Первое знакомство","et":"Esimene tutvus","en":"First introduction"},"audience":{"ru":"Малыши до 4 лет","et":"Väikelapsed kuni 4 aastat","en":"Toddlers up to age 4"},"status":"active"},{"id":"narva-children-tue","weekday":2,"recurrence":"weekly","weekdays":[2],"date":"","startsOn":"","endsOn":"","start":"18:00","end":"19:00","venue":"narva","title":{"ru":"Детская группа","et":"Lasterühm","en":"Children’s group"},"audience":{"ru":"От 5–6 лет","et":"Alates 5.–6. eluaastast","en":"Ages 5–6 and up"},"status":"active"},{"id":"narva-children-thu","weekday":4,"recurrence":"weekly","weekdays":[4],"date":"","startsOn":"","endsOn":"","start":"18:00","end":"19:00","venue":"narva","title":{"ru":"Детская группа","et":"Lasterühm","en":"Children’s group"},"audience":{"ru":"От 5–6 лет","et":"Alates 5.–6. eluaastast","en":"Ages 5–6 and up"},"status":"active"},{"id":"narva-children-sat","weekday":6,"recurrence":"weekly","weekdays":[6],"date":"","startsOn":"","endsOn":"","start":"11:00","end":"12:00","venue":"narva","title":{"ru":"Детская группа","et":"Lasterühm","en":"Children’s group"},"audience":{"ru":"От 5–6 лет","et":"Alates 5.–6. eluaastast","en":"Ages 5–6 and up"},"status":"active"}]}$schedule$::jsonb
)
on conflict (id) do nothing;

create or replace function public.compare_and_set_schedule_state(
  p_expected_revision bigint,
  p_state jsonb
)
returns table (
  applied boolean,
  current_revision bigint,
  current_state jsonb
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  stored_revision bigint;
  stored_state jsonb;
  next_revision bigint;
begin
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision > 999999999 then
    raise exception 'invalid expected revision' using errcode = '22023';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid schedule state' using errcode = '22023';
  end if;

  begin
    next_revision := (p_state ->> 'revision')::bigint;
  exception when others then
    raise exception 'invalid schedule revision' using errcode = '22023';
  end;
  if next_revision <> p_expected_revision + 1 then
    raise exception 'schedule revision does not follow expected revision' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('aleksi.schedule_state.primary', 0)
  );

  select schedule.revision, schedule.state
    into stored_revision, stored_state
    from public.schedule_state as schedule
    where schedule.id = 'primary'
    for update;

  if not found then
    if p_expected_revision <> 0 then
      return query select false, 0::bigint, null::jsonb;
      return;
    end if;

    insert into public.schedule_state (id, revision, state)
    values ('primary', next_revision, p_state);
    return query select true, next_revision, p_state;
    return;
  end if;

  if stored_revision <> p_expected_revision then
    return query select false, stored_revision, stored_state;
    return;
  end if;

  update public.schedule_state as schedule
    set revision = next_revision,
        state = p_state,
        updated_at = now()
    where schedule.id = 'primary';

  return query select true, next_revision, p_state;
end;
$$;

revoke all on function public.compare_and_set_schedule_state(bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.compare_and_set_schedule_state(bigint, jsonb)
  to service_role;
