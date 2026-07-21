begin;

-- Repair migration history for objects that were present in schema.sql
-- but did not have a dedicated migration in supabase/migrations.

alter table public.organization_settings
  add column if not exists paypal_settings jsonb not null default '{}'::jsonb,
  add column if not exists bizum_settings jsonb not null default '{}'::jsonb,
  add column if not exists stripe_settings jsonb not null default '{}'::jsonb,
  add column if not exists resend_settings jsonb not null default '{}'::jsonb,
  add column if not exists supabase_settings jsonb not null default '{}'::jsonb,
  add column if not exists public_variables jsonb not null default '{}'::jsonb,
  add column if not exists erp_preferences jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists organization_settings_updated_at on public.organization_settings;
create trigger organization_settings_updated_at
before update on public.organization_settings
for each row execute function public.set_updated_at();

create or replace function public.can_beneficiary_portal_action(action_id text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or public.can_app_permission('beneficiaries', action_id)
    or public.can_app_permission('settings', 'edit')
    or (
      action_id = 'view'
      and public.can_app_permission('deliveries', 'view')
    )
$$;

drop policy if exists "beneficiary_portal_accounts_select_by_permission" on public.beneficiary_portal_accounts;
drop policy if exists "beneficiary_portal_accounts_insert_by_permission" on public.beneficiary_portal_accounts;
drop policy if exists "beneficiary_portal_accounts_update_by_permission" on public.beneficiary_portal_accounts;
drop policy if exists "beneficiary_portal_otps_access" on public.beneficiary_portal_otps;
drop policy if exists "beneficiary_portal_notices_select_by_permission" on public.beneficiary_portal_notices;
drop policy if exists "beneficiary_portal_notices_insert_by_permission" on public.beneficiary_portal_notices;
drop policy if exists "beneficiary_portal_notices_update_by_permission" on public.beneficiary_portal_notices;
drop policy if exists "beneficiary_portal_renewals_select_by_permission" on public.beneficiary_portal_renewals;
drop policy if exists "beneficiary_portal_renewals_insert_by_permission" on public.beneficiary_portal_renewals;
drop policy if exists "beneficiary_portal_renewals_update_by_permission" on public.beneficiary_portal_renewals;
drop policy if exists "beneficiary_portal_profile_updates_select_by_permission" on public.beneficiary_portal_profile_updates;
drop policy if exists "beneficiary_portal_profile_updates_insert_by_permission" on public.beneficiary_portal_profile_updates;
drop policy if exists "beneficiary_portal_profile_updates_update_by_permission" on public.beneficiary_portal_profile_updates;

create policy "beneficiary_portal_accounts_select_by_permission"
on public.beneficiary_portal_accounts for select to authenticated
using (public.can_beneficiary_portal_action('view'));

create policy "beneficiary_portal_accounts_insert_by_permission"
on public.beneficiary_portal_accounts for insert to authenticated
with check (public.can_beneficiary_portal_action('create') or public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_accounts_update_by_permission"
on public.beneficiary_portal_accounts for update to authenticated
using (public.can_beneficiary_portal_action('edit'))
with check (public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_otps_access"
on public.beneficiary_portal_otps for all to authenticated
using (public.can_beneficiary_portal_action('view'))
with check (public.can_beneficiary_portal_action('create') or public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_notices_select_by_permission"
on public.beneficiary_portal_notices for select to authenticated
using (public.can_beneficiary_portal_action('view'));

create policy "beneficiary_portal_notices_insert_by_permission"
on public.beneficiary_portal_notices for insert to authenticated
with check (public.can_beneficiary_portal_action('create') or public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_notices_update_by_permission"
on public.beneficiary_portal_notices for update to authenticated
using (public.can_beneficiary_portal_action('edit'))
with check (public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_renewals_select_by_permission"
on public.beneficiary_portal_renewals for select to authenticated
using (public.can_beneficiary_portal_action('view'));

create policy "beneficiary_portal_renewals_insert_by_permission"
on public.beneficiary_portal_renewals for insert to authenticated
with check (public.can_beneficiary_portal_action('create') or public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_renewals_update_by_permission"
on public.beneficiary_portal_renewals for update to authenticated
using (public.can_beneficiary_portal_action('edit'))
with check (public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_profile_updates_select_by_permission"
on public.beneficiary_portal_profile_updates for select to authenticated
using (public.can_beneficiary_portal_action('view'));

create policy "beneficiary_portal_profile_updates_insert_by_permission"
on public.beneficiary_portal_profile_updates for insert to authenticated
with check (public.can_beneficiary_portal_action('create') or public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_profile_updates_update_by_permission"
on public.beneficiary_portal_profile_updates for update to authenticated
using (public.can_beneficiary_portal_action('edit'))
with check (public.can_beneficiary_portal_action('edit'));

grant execute on function public.can_beneficiary_portal_action(text) to authenticated;
grant select, insert, update on public.beneficiary_portal_accounts to authenticated;
grant select, insert, update on public.beneficiary_portal_otps to authenticated;
grant select, insert, update on public.beneficiary_portal_notices to authenticated;
grant select, insert, update on public.beneficiary_portal_renewals to authenticated;
grant select, insert, update on public.beneficiary_portal_profile_updates to authenticated;
revoke delete on public.beneficiary_portal_accounts from authenticated;
revoke delete on public.beneficiary_portal_otps from authenticated;
revoke delete on public.beneficiary_portal_notices from authenticated;
revoke delete on public.beneficiary_portal_renewals from authenticated;
revoke delete on public.beneficiary_portal_profile_updates from authenticated;

notify pgrst, 'reload schema';

commit;
