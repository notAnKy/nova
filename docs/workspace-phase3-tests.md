# Phase 3 workspace verification

The Nova project (`bowkdnxhnqdncohnsgls`) has migration `20260924015354_phase3_workspaces.sql` applied. It does not create channels or messages.

## Database test

Run `supabase/tests/phase3_workspaces.sql` in a privileged Supabase SQL editor session or another trusted SQL connection. It inserts four synthetic auth users, switches to the `authenticated` database role with each user's JWT subject, runs assertions, and finishes with `ROLLBACK`. A failing assertion aborts the transaction; no fixture data is committed. Do not run it alongside users with the synthetic `phase3-*@example.invalid` addresses.

The test covers atomic workspace creation and owner assignment; owner/member/outsider and cross-workspace reads; direct membership insert denial; member self-promotion denial; valid, revoked, expired, and exhausted invitations; duplicate acceptance; admin inability to remove the owner; owner leave denial; and access loss after removal. Invitation acceptance locks the workspace and invitation row before checking and incrementing `uses`, so concurrent acceptances serialize. The script checks use exhaustion sequentially; it is not a load test.

The live catalog should show RLS on all three workspace tables. `authenticated` has only `SELECT` on `workspaces` and `workspace_members`; neither `authenticated` nor `anon` has table privileges on `workspace_invitations`. `anon` has no `EXECUTE` privilege on the public RPCs. The two `SELECT` policies use `nova_private.is_workspace_member`; invitations have no table policy. The private schema is not exposed through the Data API.

## Browser walkthrough with two GitHub accounts

1. Start `corepack pnpm dev` and open `http://localhost:3001` with account A. Existing Phase 2 sign-in, sign-out, and profile editing should still work.
2. Create a workspace from the no-workspace screen. Confirm its URL is `/w/<slug>` and the creator is shown as owner in Settings.
3. Create a member link with one use. Copy it once. In a separate browser profile, open it while signed out, sign in as account B, verify the page shows the workspace, then click **Join workspace**. Confirm B enters the workspace and appears in A's member list.
4. As B, verify the workspace is readable but invitation and role controls are hidden. A can switch between workspaces from the rail or sidebar menu and can change workspace name/slug in Settings.
5. As A, create and revoke another link; B or another account should see the revoked state on its invite page. Check an expired link after its configured expiry, or use the SQL test for expiry without waiting.
6. Remove B as A. Reload B's workspace URL: it should return a not-found state. A previous invitation for that workspace should be revoked. The owner cannot use Leave workspace; a member can.
7. At a phone width, confirm the sidebar opens, Settings remains reachable, forms fit, and the invitation URL can be copied.

This browser walkthrough requires two actual GitHub sign-ins and was not automated by the transactional SQL test. Do not share or log the raw invitation URL beyond the intended recipient. Channel and message previews remain fixtures in every real workspace.
