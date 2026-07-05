begin;

update public.roles
set modules = case
    when modules ? '*' then modules
    when not (modules ? 'accounting') then (modules - 'treasury') || '["accounting"]'::jsonb
    else modules - 'treasury'
  end
where modules ? 'treasury' or not (modules ? 'accounting');

update public.app_users
set permissions = case
    when permissions ? '*' then permissions
    when not (permissions ? 'accounting') then (permissions - 'treasury') || '["accounting"]'::jsonb
    else permissions - 'treasury'
  end,
  permission_matrix = jsonb_set(
    coalesce(permission_matrix, '{}'::jsonb) - 'treasury',
    '{accounting}',
    case
      when role = 'Superadministrador' then jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true)
      when role in ('Voluntario', 'Coordinadora', 'Coordinador') then jsonb_build_object('view', true, 'create', false, 'edit', false, 'delete', false)
      else jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', false)
    end,
    true
  )
where permissions ? 'treasury'
   or not (permissions ? 'accounting')
   or coalesce(permission_matrix, '{}'::jsonb) ? 'treasury'
   or not (coalesce(permission_matrix, '{}'::jsonb) ? 'accounting');

drop policy if exists "authenticated_read_treasury_incomes" on public.treasury_incomes;
drop policy if exists "treasury_incomes_select_by_permission" on public.treasury_incomes;
drop policy if exists "treasury_write_treasury_incomes" on public.treasury_incomes;
drop policy if exists "treasury_incomes_insert_by_permission" on public.treasury_incomes;
drop policy if exists "treasury_incomes_update_by_permission" on public.treasury_incomes;
drop policy if exists "treasury_incomes_delete_by_permission" on public.treasury_incomes;
create policy "treasury_incomes_select_accounting" on public.treasury_incomes for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "treasury_incomes_insert_accounting" on public.treasury_incomes for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "treasury_incomes_update_accounting" on public.treasury_incomes for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "treasury_incomes_delete_accounting" on public.treasury_incomes for delete to authenticated using (public.can_app_permission('accounting', 'delete'));

drop policy if exists "authenticated_read_treasury_expenses" on public.treasury_expenses;
drop policy if exists "treasury_expenses_select_by_permission" on public.treasury_expenses;
drop policy if exists "treasury_write_treasury_expenses" on public.treasury_expenses;
drop policy if exists "treasury_expenses_insert_by_permission" on public.treasury_expenses;
drop policy if exists "treasury_expenses_update_by_permission" on public.treasury_expenses;
drop policy if exists "treasury_expenses_delete_by_permission" on public.treasury_expenses;
create policy "treasury_expenses_select_accounting" on public.treasury_expenses for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "treasury_expenses_insert_accounting" on public.treasury_expenses for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "treasury_expenses_update_accounting" on public.treasury_expenses for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "treasury_expenses_delete_accounting" on public.treasury_expenses for delete to authenticated using (public.can_app_permission('accounting', 'delete'));

drop policy if exists "authenticated_read_treasury_loans" on public.treasury_loans;
drop policy if exists "treasury_loans_select_by_permission" on public.treasury_loans;
drop policy if exists "treasury_write_treasury_loans" on public.treasury_loans;
drop policy if exists "treasury_loans_insert_by_permission" on public.treasury_loans;
drop policy if exists "treasury_loans_update_by_permission" on public.treasury_loans;
drop policy if exists "treasury_loans_delete_by_permission" on public.treasury_loans;
create policy "treasury_loans_select_accounting" on public.treasury_loans for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "treasury_loans_insert_accounting" on public.treasury_loans for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "treasury_loans_update_accounting" on public.treasury_loans for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "treasury_loans_delete_accounting" on public.treasury_loans for delete to authenticated using (public.can_app_permission('accounting', 'delete'));

drop policy if exists "authenticated_read_treasury_accounts" on public.treasury_accounts;
drop policy if exists "treasury_accounts_select_by_permission" on public.treasury_accounts;
drop policy if exists "treasury_write_treasury_accounts" on public.treasury_accounts;
drop policy if exists "treasury_accounts_insert_by_permission" on public.treasury_accounts;
drop policy if exists "treasury_accounts_update_by_permission" on public.treasury_accounts;
drop policy if exists "treasury_accounts_delete_by_permission" on public.treasury_accounts;
create policy "treasury_accounts_select_accounting" on public.treasury_accounts for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "treasury_accounts_insert_accounting" on public.treasury_accounts for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "treasury_accounts_update_accounting" on public.treasury_accounts for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "treasury_accounts_delete_accounting" on public.treasury_accounts for delete to authenticated using (public.can_app_permission('accounting', 'delete'));

grant select, insert, update, delete on public.treasury_incomes to authenticated;
grant select, insert, update, delete on public.treasury_expenses to authenticated;
grant select, insert, update, delete on public.treasury_loans to authenticated;
grant select, insert, update, delete on public.treasury_accounts to authenticated;

commit;
