grant select, insert, update on public.donors to authenticated;
grant select, insert, update on public.donor_portal_otps to authenticated;
grant select, insert, update on public.donor_portal_profile_updates to authenticated;
grant select, insert, update on public.donor_certificates to authenticated;

revoke delete on public.donors from authenticated;
revoke delete on public.donor_portal_otps from authenticated;
revoke delete on public.donor_portal_profile_updates from authenticated;
revoke delete on public.donor_certificates from authenticated;
