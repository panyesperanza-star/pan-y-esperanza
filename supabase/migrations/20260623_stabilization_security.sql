alter table public.app_users drop column if exists password;

create or replace function public.can_app_permission(module_id text, action_id text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where (u.auth_user_id = auth.uid()
       or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and u.is_active = true
      and coalesce(u.status, 'Activo') = 'Activo'
      and (
        u.role = 'Superadministrador'
        or u.permissions ? '*'
        or (
          action_id = 'view'
          and u.permissions ? module_id
        )
        or coalesce((u.permission_matrix -> module_id ->> action_id)::boolean, false) = true
      )
  )
$$;

drop policy if exists "authenticated_write_beneficiaries" on public.beneficiaries;
drop policy if exists "authenticated_write_organization_settings" on public.organization_settings;
drop policy if exists "authenticated_write_families" on public.families;
drop policy if exists "authenticated_write_social_history" on public.social_history;
drop policy if exists "authenticated_write_beneficiary_documents" on public.beneficiary_documents;
drop policy if exists "authenticated_write_deliveries" on public.deliveries;
drop policy if exists "authenticated_write_email_logs" on public.email_logs;
drop policy if exists "authenticated_write_inventory_items" on public.inventory_items;
drop policy if exists "authenticated_write_inventory_movements" on public.inventory_movements;
drop policy if exists "authenticated_write_donations" on public.donations;
drop policy if exists "authenticated_write_volunteers" on public.volunteers;
drop policy if exists "authenticated_write_volunteer_history" on public.volunteer_history;
drop policy if exists "authenticated_write_roles" on public.roles;
drop policy if exists "authenticated_write_audit_logs" on public.audit_logs;

drop policy if exists "authenticated_read_beneficiaries" on public.beneficiaries;
drop policy if exists "authenticated_read_organization_settings" on public.organization_settings;
drop policy if exists "authenticated_read_families" on public.families;
drop policy if exists "authenticated_read_social_history" on public.social_history;
drop policy if exists "authenticated_read_beneficiary_documents" on public.beneficiary_documents;
drop policy if exists "authenticated_read_deliveries" on public.deliveries;
drop policy if exists "authenticated_read_email_logs" on public.email_logs;
drop policy if exists "authenticated_read_inventory_items" on public.inventory_items;
drop policy if exists "authenticated_read_inventory_movements" on public.inventory_movements;
drop policy if exists "authenticated_read_donations" on public.donations;
drop policy if exists "authenticated_read_volunteers" on public.volunteers;
drop policy if exists "authenticated_read_volunteer_history" on public.volunteer_history;
drop policy if exists "authenticated_read_roles" on public.roles;
drop policy if exists "authenticated_read_audit_logs" on public.audit_logs;
drop policy if exists "authenticated_read_treasury_incomes" on public.treasury_incomes;
drop policy if exists "authenticated_read_treasury_expenses" on public.treasury_expenses;
drop policy if exists "authenticated_read_treasury_loans" on public.treasury_loans;
drop policy if exists "authenticated_read_treasury_accounts" on public.treasury_accounts;
drop policy if exists "treasury_write_treasury_incomes" on public.treasury_incomes;
drop policy if exists "treasury_write_treasury_expenses" on public.treasury_expenses;
drop policy if exists "treasury_write_treasury_loans" on public.treasury_loans;
drop policy if exists "treasury_write_treasury_accounts" on public.treasury_accounts;

create policy "beneficiaries_select_by_permission" on public.beneficiaries for select to authenticated using (public.can_app_permission('beneficiaries', 'view'));
create policy "beneficiaries_insert_by_permission" on public.beneficiaries for insert to authenticated with check (public.can_app_permission('beneficiaries', 'create'));
create policy "beneficiaries_update_by_permission" on public.beneficiaries for update to authenticated using (public.can_app_permission('beneficiaries', 'edit')) with check (public.can_app_permission('beneficiaries', 'edit'));
create policy "beneficiaries_delete_by_permission" on public.beneficiaries for delete to authenticated using (public.can_app_permission('beneficiaries', 'delete'));

create policy "families_select_by_permission" on public.families for select to authenticated using (public.can_app_permission('families', 'view'));
create policy "families_insert_by_permission" on public.families for insert to authenticated with check (public.can_app_permission('families', 'create'));
create policy "families_update_by_permission" on public.families for update to authenticated using (public.can_app_permission('families', 'edit')) with check (public.can_app_permission('families', 'edit'));
create policy "families_delete_by_permission" on public.families for delete to authenticated using (public.can_app_permission('families', 'delete'));

create policy "deliveries_select_by_permission" on public.deliveries for select to authenticated using (public.can_app_permission('deliveries', 'view'));
create policy "deliveries_insert_by_permission" on public.deliveries for insert to authenticated with check (public.can_app_permission('deliveries', 'create'));
create policy "deliveries_update_by_permission" on public.deliveries for update to authenticated using (public.can_app_permission('deliveries', 'edit')) with check (public.can_app_permission('deliveries', 'edit'));
create policy "deliveries_delete_by_permission" on public.deliveries for delete to authenticated using (public.can_app_permission('deliveries', 'delete'));

create policy "inventory_items_select_by_permission" on public.inventory_items for select to authenticated using (public.can_app_permission('inventory', 'view'));
create policy "inventory_items_insert_by_permission" on public.inventory_items for insert to authenticated with check (public.can_app_permission('inventory', 'create'));
create policy "inventory_items_update_by_permission" on public.inventory_items for update to authenticated using (public.can_app_permission('inventory', 'edit')) with check (public.can_app_permission('inventory', 'edit'));
create policy "inventory_items_delete_by_permission" on public.inventory_items for delete to authenticated using (public.can_app_permission('inventory', 'delete'));

create policy "inventory_movements_select_by_permission" on public.inventory_movements for select to authenticated using (public.can_app_permission('inventory', 'view'));
create policy "inventory_movements_insert_by_permission" on public.inventory_movements for insert to authenticated with check (public.can_app_permission('inventory', 'create'));
create policy "inventory_movements_update_by_permission" on public.inventory_movements for update to authenticated using (public.can_app_permission('inventory', 'edit')) with check (public.can_app_permission('inventory', 'edit'));
create policy "inventory_movements_delete_by_permission" on public.inventory_movements for delete to authenticated using (public.can_app_permission('inventory', 'delete'));

create policy "donations_select_by_permission" on public.donations for select to authenticated using (public.can_app_permission('donations', 'view'));
create policy "donations_insert_by_permission" on public.donations for insert to authenticated with check (public.can_app_permission('donations', 'create'));
create policy "donations_update_by_permission" on public.donations for update to authenticated using (public.can_app_permission('donations', 'edit')) with check (public.can_app_permission('donations', 'edit'));
create policy "donations_delete_by_permission" on public.donations for delete to authenticated using (public.can_app_permission('donations', 'delete'));

create policy "treasury_incomes_select_by_permission" on public.treasury_incomes for select to authenticated using (public.can_app_permission('treasury', 'view'));
create policy "treasury_incomes_insert_by_permission" on public.treasury_incomes for insert to authenticated with check (public.can_app_permission('treasury', 'create'));
create policy "treasury_incomes_update_by_permission" on public.treasury_incomes for update to authenticated using (public.can_app_permission('treasury', 'edit')) with check (public.can_app_permission('treasury', 'edit'));
create policy "treasury_incomes_delete_by_permission" on public.treasury_incomes for delete to authenticated using (public.can_app_permission('treasury', 'delete'));

create policy "treasury_expenses_select_by_permission" on public.treasury_expenses for select to authenticated using (public.can_app_permission('treasury', 'view'));
create policy "treasury_expenses_insert_by_permission" on public.treasury_expenses for insert to authenticated with check (public.can_app_permission('treasury', 'create'));
create policy "treasury_expenses_update_by_permission" on public.treasury_expenses for update to authenticated using (public.can_app_permission('treasury', 'edit')) with check (public.can_app_permission('treasury', 'edit'));
create policy "treasury_expenses_delete_by_permission" on public.treasury_expenses for delete to authenticated using (public.can_app_permission('treasury', 'delete'));

create policy "treasury_loans_select_by_permission" on public.treasury_loans for select to authenticated using (public.can_app_permission('treasury', 'view'));
create policy "treasury_loans_insert_by_permission" on public.treasury_loans for insert to authenticated with check (public.can_app_permission('treasury', 'create'));
create policy "treasury_loans_update_by_permission" on public.treasury_loans for update to authenticated using (public.can_app_permission('treasury', 'edit')) with check (public.can_app_permission('treasury', 'edit'));
create policy "treasury_loans_delete_by_permission" on public.treasury_loans for delete to authenticated using (public.can_app_permission('treasury', 'delete'));

create policy "treasury_accounts_select_by_permission" on public.treasury_accounts for select to authenticated using (public.can_app_permission('treasury', 'view'));
create policy "treasury_accounts_insert_by_permission" on public.treasury_accounts for insert to authenticated with check (public.can_app_permission('treasury', 'create'));
create policy "treasury_accounts_update_by_permission" on public.treasury_accounts for update to authenticated using (public.can_app_permission('treasury', 'edit')) with check (public.can_app_permission('treasury', 'edit'));
create policy "treasury_accounts_delete_by_permission" on public.treasury_accounts for delete to authenticated using (public.can_app_permission('treasury', 'delete'));

create policy "volunteers_select_by_permission" on public.volunteers for select to authenticated using (public.can_app_permission('volunteers', 'view'));
create policy "volunteers_insert_by_permission" on public.volunteers for insert to authenticated with check (public.can_app_permission('volunteers', 'create'));
create policy "volunteers_update_by_permission" on public.volunteers for update to authenticated using (public.can_app_permission('volunteers', 'edit')) with check (public.can_app_permission('volunteers', 'edit'));
create policy "volunteers_delete_by_permission" on public.volunteers for delete to authenticated using (public.can_app_permission('volunteers', 'delete'));

create policy "social_history_select_by_permission" on public.social_history for select to authenticated using (public.can_app_permission('beneficiaries', 'view'));
create policy "social_history_insert_by_permission" on public.social_history for insert to authenticated with check (public.can_app_permission('beneficiaries', 'edit'));
create policy "social_history_update_by_permission" on public.social_history for update to authenticated using (public.can_app_permission('beneficiaries', 'edit')) with check (public.can_app_permission('beneficiaries', 'edit'));
create policy "social_history_delete_by_permission" on public.social_history for delete to authenticated using (public.can_app_permission('beneficiaries', 'delete'));

create policy "beneficiary_documents_select_by_permission" on public.beneficiary_documents for select to authenticated using (public.can_app_permission('beneficiaries', 'view'));
create policy "beneficiary_documents_insert_by_permission" on public.beneficiary_documents for insert to authenticated with check (public.can_app_permission('beneficiaries', 'edit'));
create policy "beneficiary_documents_update_by_permission" on public.beneficiary_documents for update to authenticated using (public.can_app_permission('beneficiaries', 'edit')) with check (public.can_app_permission('beneficiaries', 'edit'));
create policy "beneficiary_documents_delete_by_permission" on public.beneficiary_documents for delete to authenticated using (public.can_app_permission('beneficiaries', 'delete'));

create policy "email_logs_select_by_permission" on public.email_logs for select to authenticated using (public.can_app_permission('communications', 'view') or public.can_app_permission('receipts', 'view'));
create policy "email_logs_insert_by_permission" on public.email_logs for insert to authenticated with check (public.can_app_permission('communications', 'create') or public.can_app_permission('receipts', 'create'));
create policy "email_logs_update_by_permission" on public.email_logs for update to authenticated using (public.can_app_permission('communications', 'edit') or public.can_app_permission('receipts', 'edit')) with check (public.can_app_permission('communications', 'edit') or public.can_app_permission('receipts', 'edit'));
create policy "email_logs_delete_by_permission" on public.email_logs for delete to authenticated using (public.can_app_permission('communications', 'delete') or public.can_app_permission('receipts', 'delete'));

create policy "organization_settings_select_by_permission" on public.organization_settings for select to authenticated using (public.can_app_permission('settings', 'view'));
create policy "organization_settings_write_by_permission" on public.organization_settings for all to authenticated using (public.can_app_permission('settings', 'edit')) with check (public.can_app_permission('settings', 'edit'));

create policy "roles_select_by_permission" on public.roles for select to authenticated using (public.can_app_permission('users', 'view'));
create policy "roles_write_by_permission" on public.roles for all to authenticated using (public.can_app_permission('users', 'edit')) with check (public.can_app_permission('users', 'edit'));

create policy "audit_logs_select_by_permission" on public.audit_logs for select to authenticated using (public.can_app_permission('users', 'view') or public.can_app_permission('settings', 'view'));
create policy "audit_logs_insert_active_user" on public.audit_logs for insert to authenticated with check (public.current_app_user() is not null);

create policy "volunteer_history_select_by_permission" on public.volunteer_history for select to authenticated using (public.can_app_permission('volunteers', 'view'));
create policy "volunteer_history_insert_by_permission" on public.volunteer_history for insert to authenticated with check (public.can_app_permission('volunteers', 'edit'));
create policy "volunteer_history_update_by_permission" on public.volunteer_history for update to authenticated using (public.can_app_permission('volunteers', 'edit')) with check (public.can_app_permission('volunteers', 'edit'));
create policy "volunteer_history_delete_by_permission" on public.volunteer_history for delete to authenticated using (public.can_app_permission('volunteers', 'delete'));

grant execute on function public.can_app_permission(text, text) to authenticated;
