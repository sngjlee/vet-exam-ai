-- =============================================================================
-- /admin/users hotfix — admins can SELECT all profiles
-- =============================================================================
-- Bug: PR-D /admin/users only showed the requesting admin's own row because
--      the existing profiles RLS limits SELECT to id = auth.uid(). The page
--      runs profile lookup with the user's JWT (not via SECURITY DEFINER RPC),
--      so non-self rows were filtered out before reaching the app layer.
--
-- Fix: Add a permissive policy that lets is_admin() callers read every row.
--      No write-side change — mutations still flow through SECURITY DEFINER
--      RPCs (set_user_role / set_user_active / etc.) with their own guards.
--      Other admin pages that join on profiles (audit / reports / corrections)
--      also benefit automatically.
-- =============================================================================

create policy "admins can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());
