-- Run once in the SQL Editor of your FREE Supabase project.
-- Each authenticated account can access only its own study records.
create table if not exists public.study_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_id text not null check (length(bank_id) between 1 and 80),
  state jsonb not null check (jsonb_typeof(state) = 'object' and state->>'version' = '1' and octet_length(state::text) < 10485760),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, bank_id)
);
alter table public.study_records enable row level security;
revoke all on public.study_records from anon;
grant usage on schema public to authenticated;
grant select, insert, update on public.study_records to authenticated;
drop policy if exists "Read own study records" on public.study_records;
create policy "Read own study records" on public.study_records for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Insert own study records" on public.study_records;
create policy "Insert own study records" on public.study_records for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own study records" on public.study_records;
create policy "Update own study records" on public.study_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.study_record_revision() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.revision <> 1 then raise exception 'Initial revision must be 1'; end if;
  else
    if NEW.user_id <> OLD.user_id or NEW.bank_id <> OLD.bank_id or NEW.revision <> OLD.revision + 1 then
      raise exception 'Invalid study record revision';
    end if;
  end if;
  NEW.updated_at = now();
  return NEW;
end;
$$;
drop trigger if exists study_record_revision on public.study_records;
create trigger study_record_revision before insert or update on public.study_records for each row execute function public.study_record_revision();
