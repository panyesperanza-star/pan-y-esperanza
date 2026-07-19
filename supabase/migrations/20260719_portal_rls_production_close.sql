create or replace function public.can_donor_portal_action(action_id text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or public.can_app_permission('donations', action_id)
    or public.can_app_permission('settings', 'edit')
$$;

drop policy if exists "authenticated_read_donors" on public.donors;
drop policy if exists "authenticated_write_donors" on public.donors;
drop policy if exists "authenticated_read_donor_portal_otps" on public.donor_portal_otps;
drop policy if exists "authenticated_write_donor_portal_otps" on public.donor_portal_otps;
drop policy if exists "authenticated_read_donor_profile_updates" on public.donor_portal_profile_updates;
drop policy if exists "authenticated_write_donor_profile_updates" on public.donor_portal_profile_updates;
drop policy if exists "authenticated_read_donor_certificates" on public.donor_certificates;
drop policy if exists "authenticated_write_donor_certificates" on public.donor_certificates;

create policy "authenticated_read_donors" on public.donors for select to authenticated using (public.can_donor_portal_action('view'));
create policy "authenticated_write_donors" on public.donors for all to authenticated using (public.can_donor_portal_action('edit')) with check (public.can_donor_portal_action('create') or public.can_donor_portal_action('edit'));
create policy "authenticated_read_donor_portal_otps" on public.donor_portal_otps for select to authenticated using (public.can_donor_portal_action('view'));
create policy "authenticated_write_donor_portal_otps" on public.donor_portal_otps for all to authenticated using (public.can_donor_portal_action('edit')) with check (public.can_donor_portal_action('create') or public.can_donor_portal_action('edit'));
create policy "authenticated_read_donor_profile_updates" on public.donor_portal_profile_updates for select to authenticated using (public.can_donor_portal_action('view'));
create policy "authenticated_write_donor_profile_updates" on public.donor_portal_profile_updates for all to authenticated using (public.can_donor_portal_action('edit')) with check (public.can_donor_portal_action('create') or public.can_donor_portal_action('edit'));
create policy "authenticated_read_donor_certificates" on public.donor_certificates for select to authenticated using (public.can_donor_portal_action('view'));
create policy "authenticated_write_donor_certificates" on public.donor_certificates for all to authenticated using (public.can_donor_portal_action('edit')) with check (public.can_donor_portal_action('create') or public.can_donor_portal_action('edit'));

drop policy if exists "portal_sessions_access_by_authenticated" on public.portal_sessions;
create policy "portal_sessions_access_by_authenticated"
on public.portal_sessions for all to authenticated
using (
  public.is_app_admin()
  or public.can_app_permission('beneficiaries', 'view')
  or public.can_app_permission('donations', 'view')
  or public.can_app_permission('resources', 'view')
  or public.can_app_permission('settings', 'edit')
)
with check (
  public.is_app_admin()
  or public.can_app_permission('beneficiaries', 'create')
  or public.can_app_permission('donations', 'create')
  or public.can_app_permission('resources', 'create')
  or public.can_app_permission('settings', 'edit')
);

grant execute on function public.can_donor_portal_action(text) to authenticated;
