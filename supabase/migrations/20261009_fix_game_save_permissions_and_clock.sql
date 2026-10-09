-- Repair PostgREST's insert-count query without adding a public read policy.
grant select on table public.career_ladder_games to anon, authenticated;

-- The game now starts with five minutes and permits extra time extensions.
alter table public.career_ladder_games
  drop constraint if exists career_ladder_games_elapsed_seconds_check;
alter table public.career_ladder_games
  add constraint career_ladder_games_elapsed_seconds_check
  check (elapsed_seconds between 0 and 3600);

notify pgrst, 'reload schema';

