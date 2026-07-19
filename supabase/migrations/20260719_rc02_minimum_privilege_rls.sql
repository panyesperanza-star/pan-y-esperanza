-- RC-02: cierre de politicas amplias detectadas en RELEASE_3_RC_REPORT.md.
-- Principio aplicado: el frontend autenticado solo accede segun permisos ERP.
-- Los portales validan sesiones y OTP desde API servidor con service_role.

create or replace function public.can_module_action(module_id text, action_id text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or public.can_app_permission(module_id, action_id)
    or (
      action_id = 'view'
      and module_id = 'resources'
      and public.can_app_permission('settings', 'view')
    )
    or (
      module_id in ('settings', 'users')
      and public.can_app_permission('settings', 'edit')
    )
$$;

drop policy if exists "authenticated_read_beneficiaries" on public.beneficiaries;
drop policy if exists "authenticated_write_beneficiaries" on public.beneficiaries;
drop policy if exists "beneficiaries_select_by_permission" on public.beneficiaries;
drop policy if exists "beneficiaries_insert_by_permission" on public.beneficiaries;
drop policy if exists "beneficiaries_update_by_permission" on public.beneficiaries;
drop policy if exists "beneficiaries_delete_by_permission" on public.beneficiaries;
create policy "beneficiaries_select_by_permission" on public.beneficiaries for select to authenticated using (public.can_module_action('beneficiaries', 'view'));
create policy "beneficiaries_insert_by_permission" on public.beneficiaries for insert to authenticated with check (public.can_module_action('beneficiaries', 'create'));
create policy "beneficiaries_update_by_permission" on public.beneficiaries for update to authenticated using (public.can_module_action('beneficiaries', 'edit')) with check (public.can_module_action('beneficiaries', 'edit'));
create policy "beneficiaries_delete_by_permission" on public.beneficiaries for delete to authenticated using (public.can_module_action('beneficiaries', 'delete'));

drop policy if exists "authenticated_read_families" on public.families;
drop policy if exists "authenticated_write_families" on public.families;
drop policy if exists "families_select_by_permission" on public.families;
drop policy if exists "families_insert_by_permission" on public.families;
drop policy if exists "families_update_by_permission" on public.families;
drop policy if exists "families_delete_by_permission" on public.families;
create policy "families_select_by_permission" on public.families for select to authenticated using (public.can_module_action('beneficiaries', 'view'));
create policy "families_insert_by_permission" on public.families for insert to authenticated with check (public.can_module_action('beneficiaries', 'create'));
create policy "families_update_by_permission" on public.families for update to authenticated using (public.can_module_action('beneficiaries', 'edit')) with check (public.can_module_action('beneficiaries', 'edit'));
create policy "families_delete_by_permission" on public.families for delete to authenticated using (public.can_module_action('beneficiaries', 'delete'));

drop policy if exists "authenticated_read_social_history" on public.social_history;
drop policy if exists "authenticated_write_social_history" on public.social_history;
drop policy if exists "social_history_select_by_permission" on public.social_history;
drop policy if exists "social_history_insert_by_permission" on public.social_history;
drop policy if exists "social_history_update_by_permission" on public.social_history;
drop policy if exists "social_history_delete_by_permission" on public.social_history;
create policy "social_history_select_by_permission" on public.social_history for select to authenticated using (public.can_module_action('beneficiaries', 'view'));
create policy "social_history_insert_by_permission" on public.social_history for insert to authenticated with check (public.can_module_action('beneficiaries', 'create') or public.can_module_action('beneficiaries', 'edit'));
create policy "social_history_update_by_permission" on public.social_history for update to authenticated using (public.can_module_action('beneficiaries', 'edit')) with check (public.can_module_action('beneficiaries', 'edit'));
create policy "social_history_delete_by_permission" on public.social_history for delete to authenticated using (public.can_module_action('beneficiaries', 'delete'));

drop policy if exists "authenticated_read_beneficiary_documents" on public.beneficiary_documents;
drop policy if exists "authenticated_write_beneficiary_documents" on public.beneficiary_documents;
drop policy if exists "beneficiary_documents_select_by_permission" on public.beneficiary_documents;
drop policy if exists "beneficiary_documents_insert_by_permission" on public.beneficiary_documents;
drop policy if exists "beneficiary_documents_update_by_permission" on public.beneficiary_documents;
drop policy if exists "beneficiary_documents_delete_by_permission" on public.beneficiary_documents;
create policy "beneficiary_documents_select_by_permission" on public.beneficiary_documents for select to authenticated using (public.can_module_action('beneficiaries', 'view'));
create policy "beneficiary_documents_insert_by_permission" on public.beneficiary_documents for insert to authenticated with check (public.can_module_action('beneficiaries', 'create') or public.can_module_action('beneficiaries', 'edit'));
create policy "beneficiary_documents_update_by_permission" on public.beneficiary_documents for update to authenticated using (public.can_module_action('beneficiaries', 'edit')) with check (public.can_module_action('beneficiaries', 'edit'));
create policy "beneficiary_documents_delete_by_permission" on public.beneficiary_documents for delete to authenticated using (public.can_module_action('beneficiaries', 'delete'));

drop policy if exists "authenticated_read_deliveries" on public.deliveries;
drop policy if exists "authenticated_write_deliveries" on public.deliveries;
drop policy if exists "deliveries_select_by_permission" on public.deliveries;
drop policy if exists "deliveries_insert_by_permission" on public.deliveries;
drop policy if exists "deliveries_update_by_permission" on public.deliveries;
drop policy if exists "deliveries_delete_by_permission" on public.deliveries;
drop policy if exists "deliveries_update_superadmin_only" on public.deliveries;
drop policy if exists "deliveries_delete_superadmin_only" on public.deliveries;
create policy "deliveries_select_by_permission" on public.deliveries for select to authenticated using (public.can_module_action('deliveries', 'view'));
create policy "deliveries_insert_by_permission" on public.deliveries for insert to authenticated with check (public.can_module_action('deliveries', 'create'));
create policy "deliveries_update_by_permission" on public.deliveries for update to authenticated using (public.can_module_action('deliveries', 'edit')) with check (public.can_module_action('deliveries', 'edit'));
create policy "deliveries_delete_by_permission" on public.deliveries for delete to authenticated using (public.can_module_action('deliveries', 'delete'));

drop policy if exists "authenticated_read_inventory_items" on public.inventory_items;
drop policy if exists "authenticated_write_inventory_items" on public.inventory_items;
drop policy if exists "inventory_items_select_by_permission" on public.inventory_items;
drop policy if exists "inventory_items_insert_by_permission" on public.inventory_items;
drop policy if exists "inventory_items_update_by_permission" on public.inventory_items;
drop policy if exists "inventory_items_delete_by_permission" on public.inventory_items;
drop policy if exists "inventory_items_delete_superadmin_only" on public.inventory_items;
create policy "inventory_items_select_by_permission" on public.inventory_items for select to authenticated using (public.can_module_action('inventory', 'view'));
create policy "inventory_items_insert_by_permission" on public.inventory_items for insert to authenticated with check (public.can_module_action('inventory', 'create') or public.can_module_action('inventory', 'edit'));
create policy "inventory_items_update_by_permission" on public.inventory_items for update to authenticated using (public.can_module_action('inventory', 'edit')) with check (public.can_module_action('inventory', 'edit'));
create policy "inventory_items_delete_by_permission" on public.inventory_items for delete to authenticated using (public.can_module_action('inventory', 'delete'));

drop policy if exists "authenticated_read_inventory_movements" on public.inventory_movements;
drop policy if exists "authenticated_write_inventory_movements" on public.inventory_movements;
drop policy if exists "inventory_movements_select_by_permission" on public.inventory_movements;
drop policy if exists "inventory_movements_insert_by_permission" on public.inventory_movements;
drop policy if exists "inventory_movements_update_by_permission" on public.inventory_movements;
drop policy if exists "inventory_movements_delete_by_permission" on public.inventory_movements;
create policy "inventory_movements_select_by_permission" on public.inventory_movements for select to authenticated using (public.can_module_action('inventory', 'view'));
create policy "inventory_movements_insert_by_permission" on public.inventory_movements for insert to authenticated with check (public.can_module_action('inventory', 'create') or public.can_module_action('inventory', 'edit'));
create policy "inventory_movements_update_by_permission" on public.inventory_movements for update to authenticated using (public.can_module_action('inventory', 'edit')) with check (public.can_module_action('inventory', 'edit'));
create policy "inventory_movements_delete_by_permission" on public.inventory_movements for delete to authenticated using (public.can_module_action('inventory', 'delete'));

drop policy if exists "authenticated_read_donations" on public.donations;
drop policy if exists "authenticated_write_donations" on public.donations;
drop policy if exists "donations_select_by_permission" on public.donations;
drop policy if exists "donations_insert_by_permission" on public.donations;
drop policy if exists "donations_update_by_permission" on public.donations;
drop policy if exists "donations_delete_by_permission" on public.donations;
create policy "donations_select_by_permission" on public.donations for select to authenticated using (public.can_module_action('donations', 'view'));
create policy "donations_insert_by_permission" on public.donations for insert to authenticated with check (public.can_module_action('donations', 'create'));
create policy "donations_update_by_permission" on public.donations for update to authenticated using (public.can_module_action('donations', 'edit')) with check (public.can_module_action('donations', 'edit'));
create policy "donations_delete_by_permission" on public.donations for delete to authenticated using (public.can_module_action('donations', 'delete'));

drop policy if exists "authenticated_read_volunteers" on public.volunteers;
drop policy if exists "authenticated_write_volunteers" on public.volunteers;
drop policy if exists "volunteers_select_by_permission" on public.volunteers;
drop policy if exists "volunteers_insert_by_permission" on public.volunteers;
drop policy if exists "volunteers_update_by_permission" on public.volunteers;
drop policy if exists "volunteers_delete_by_permission" on public.volunteers;
create policy "volunteers_select_by_permission" on public.volunteers for select to authenticated using (public.can_module_action('volunteers', 'view'));
create policy "volunteers_insert_by_permission" on public.volunteers for insert to authenticated with check (public.can_module_action('volunteers', 'create'));
create policy "volunteers_update_by_permission" on public.volunteers for update to authenticated using (public.can_module_action('volunteers', 'edit')) with check (public.can_module_action('volunteers', 'edit'));
create policy "volunteers_delete_by_permission" on public.volunteers for delete to authenticated using (public.can_module_action('volunteers', 'delete'));

drop policy if exists "authenticated_read_volunteer_history" on public.volunteer_history;
drop policy if exists "authenticated_write_volunteer_history" on public.volunteer_history;
drop policy if exists "volunteer_history_select_by_permission" on public.volunteer_history;
drop policy if exists "volunteer_history_insert_by_permission" on public.volunteer_history;
drop policy if exists "volunteer_history_update_by_permission" on public.volunteer_history;
drop policy if exists "volunteer_history_delete_by_permission" on public.volunteer_history;
create policy "volunteer_history_select_by_permission" on public.volunteer_history for select to authenticated using (public.can_module_action('volunteers', 'view'));
create policy "volunteer_history_insert_by_permission" on public.volunteer_history for insert to authenticated with check (public.can_module_action('volunteers', 'create') or public.can_module_action('volunteers', 'edit'));
create policy "volunteer_history_update_by_permission" on public.volunteer_history for update to authenticated using (public.can_module_action('volunteers', 'edit')) with check (public.can_module_action('volunteers', 'edit'));
create policy "volunteer_history_delete_by_permission" on public.volunteer_history for delete to authenticated using (public.can_module_action('volunteers', 'delete'));

drop policy if exists "authenticated_read_organization_settings" on public.organization_settings;
drop policy if exists "authenticated_write_organization_settings" on public.organization_settings;
drop policy if exists "organization_settings_select_by_permission" on public.organization_settings;
drop policy if exists "organization_settings_insert_by_permission" on public.organization_settings;
drop policy if exists "organization_settings_update_by_permission" on public.organization_settings;
drop policy if exists "organization_settings_delete_by_permission" on public.organization_settings;
create policy "organization_settings_select_by_permission" on public.organization_settings for select to authenticated using (public.can_module_action('settings', 'view'));
create policy "organization_settings_insert_by_permission" on public.organization_settings for insert to authenticated with check (public.can_module_action('settings', 'create') or public.can_module_action('settings', 'edit'));
create policy "organization_settings_update_by_permission" on public.organization_settings for update to authenticated using (public.can_module_action('settings', 'edit')) with check (public.can_module_action('settings', 'edit'));
create policy "organization_settings_delete_by_permission" on public.organization_settings for delete to authenticated using (public.can_module_action('settings', 'delete'));

drop policy if exists "authenticated_read_email_logs" on public.email_logs;
drop policy if exists "authenticated_write_email_logs" on public.email_logs;
drop policy if exists "email_logs_select_by_permission" on public.email_logs;
drop policy if exists "email_logs_insert_by_permission" on public.email_logs;
drop policy if exists "email_logs_update_by_permission" on public.email_logs;
drop policy if exists "email_logs_delete_by_permission" on public.email_logs;
create policy "email_logs_select_by_permission" on public.email_logs for select to authenticated using (public.can_module_action('communications', 'view') or public.can_module_action('settings', 'view'));
create policy "email_logs_insert_by_permission" on public.email_logs for insert to authenticated with check (public.can_module_action('communications', 'create') or public.can_module_action('settings', 'edit'));
create policy "email_logs_update_by_permission" on public.email_logs for update to authenticated using (public.can_module_action('communications', 'edit') or public.can_module_action('settings', 'edit')) with check (public.can_module_action('communications', 'edit') or public.can_module_action('settings', 'edit'));
create policy "email_logs_delete_by_permission" on public.email_logs for delete to authenticated using (public.can_module_action('communications', 'delete') or public.can_module_action('settings', 'delete'));

drop policy if exists "public_read_active_resource_categories" on public.categorias_recursos;
drop policy if exists "resource_categories_select_by_scope" on public.categorias_recursos;
create policy "resource_categories_select_by_scope" on public.categorias_recursos for select using (
  activa = true
  or public.can_module_action('resources', 'view')
  or public.can_module_action('settings', 'view')
);

drop policy if exists "authenticated_write_resource_categories" on public.categorias_recursos;
drop policy if exists "resource_categories_insert_by_permission" on public.categorias_recursos;
drop policy if exists "resource_categories_update_by_permission" on public.categorias_recursos;
drop policy if exists "resource_categories_delete_by_permission" on public.categorias_recursos;
create policy "resource_categories_insert_by_permission" on public.categorias_recursos for insert to authenticated with check (public.can_module_action('resources', 'create') or public.can_module_action('settings', 'edit'));
create policy "resource_categories_update_by_permission" on public.categorias_recursos for update to authenticated using (public.can_module_action('resources', 'edit') or public.can_module_action('settings', 'edit')) with check (public.can_module_action('resources', 'edit') or public.can_module_action('settings', 'edit'));
create policy "resource_categories_delete_by_permission" on public.categorias_recursos for delete to authenticated using (public.can_module_action('resources', 'delete') or public.can_module_action('settings', 'delete'));

drop policy if exists "public_read_published_resources" on public.recursos;
drop policy if exists "authenticated_write_resources" on public.recursos;
drop policy if exists "resources_select_by_scope" on public.recursos;
drop policy if exists "resources_insert_by_permission" on public.recursos;
drop policy if exists "resources_update_by_permission" on public.recursos;
drop policy if exists "resources_delete_by_permission" on public.recursos;
create policy "resources_select_by_scope" on public.recursos for select using (
  (publicado = true and status = 'published')
  or public.can_module_action('resources', 'view')
  or public.can_module_action('settings', 'view')
);
create policy "resources_insert_by_permission" on public.recursos for insert to authenticated with check (public.can_module_action('resources', 'create') or public.can_module_action('settings', 'edit'));
create policy "resources_update_by_permission" on public.recursos for update to authenticated using (public.can_module_action('resources', 'edit') or public.can_module_action('settings', 'edit')) with check (public.can_module_action('resources', 'edit') or public.can_module_action('settings', 'edit'));
create policy "resources_delete_by_permission" on public.recursos for delete to authenticated using (public.can_module_action('resources', 'delete') or public.can_module_action('settings', 'delete'));

drop policy if exists "authenticated_read_roles" on public.roles;
drop policy if exists "authenticated_write_roles" on public.roles;
drop policy if exists "roles_select_by_permission" on public.roles;
drop policy if exists "roles_insert_by_permission" on public.roles;
drop policy if exists "roles_update_by_permission" on public.roles;
drop policy if exists "roles_delete_by_permission" on public.roles;
create policy "roles_select_by_permission" on public.roles for select to authenticated using (public.can_module_action('users', 'view') or public.can_module_action('settings', 'view'));
create policy "roles_insert_by_permission" on public.roles for insert to authenticated with check (public.can_module_action('users', 'create') or public.can_module_action('settings', 'edit'));
create policy "roles_update_by_permission" on public.roles for update to authenticated using (public.can_module_action('users', 'edit') or public.can_module_action('settings', 'edit')) with check (public.can_module_action('users', 'edit') or public.can_module_action('settings', 'edit'));
create policy "roles_delete_by_permission" on public.roles for delete to authenticated using (public.can_module_action('users', 'delete') or public.can_module_action('settings', 'delete'));

drop policy if exists "authenticated_read_audit_logs" on public.audit_logs;
drop policy if exists "authenticated_write_audit_logs" on public.audit_logs;
drop policy if exists "audit_logs_select_by_permission" on public.audit_logs;
drop policy if exists "audit_logs_insert_by_authenticated_user" on public.audit_logs;
drop policy if exists "audit_logs_no_update" on public.audit_logs;
drop policy if exists "audit_logs_no_delete" on public.audit_logs;
create policy "audit_logs_select_by_permission" on public.audit_logs for select to authenticated using (public.can_module_action('users', 'view') or public.can_module_action('settings', 'view'));
create policy "audit_logs_insert_by_authenticated_user" on public.audit_logs for insert to authenticated with check (public.current_app_user() is not null);
create policy "audit_logs_no_update" on public.audit_logs for update to authenticated using (false) with check (false);
create policy "audit_logs_no_delete" on public.audit_logs for delete to authenticated using (false);

drop policy if exists "portal_sessions_access_by_authenticated" on public.portal_sessions;
drop policy if exists "portal_sessions_select_admin_only" on public.portal_sessions;
drop policy if exists "portal_sessions_insert_admin_only" on public.portal_sessions;
drop policy if exists "portal_sessions_update_admin_only" on public.portal_sessions;
drop policy if exists "portal_sessions_no_delete" on public.portal_sessions;
create policy "portal_sessions_select_admin_only" on public.portal_sessions for select to authenticated using (public.can_module_action('settings', 'view') or public.can_module_action('users', 'view'));
create policy "portal_sessions_insert_admin_only" on public.portal_sessions for insert to authenticated with check (public.can_module_action('settings', 'edit'));
create policy "portal_sessions_update_admin_only" on public.portal_sessions for update to authenticated using (public.can_module_action('settings', 'edit')) with check (public.can_module_action('settings', 'edit'));
create policy "portal_sessions_no_delete" on public.portal_sessions for delete to authenticated using (false);

grant execute on function public.can_module_action(text, text) to authenticated;
