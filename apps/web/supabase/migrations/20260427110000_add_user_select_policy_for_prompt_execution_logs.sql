begin;

drop policy if exists "prompt_execution_logs_user_select_own" on public.prompt_execution_logs;

create policy "prompt_execution_logs_user_select_own"
on public.prompt_execution_logs
for select
to authenticated
using (auth.uid() = user_id);

commit;
