# Phase 5 direct and group message verification

Nova project: `bowkdnxhnqdncohnsgls`. Migrations: `20260924221624_phase5_direct_group_conversations.sql` and `20260924223915_phase5_direct_high_member_index.sql`.

## Database gate

The Phase 5 migration was applied to Nova on 2026-09-24. The transactional Phase 5 test and the Phase 3/4 regressions passed against the linked project. To repeat them, run:

```bat
corepack pnpm exec supabase db query --linked --file supabase/tests/phase5_direct_group_conversations.sql
corepack pnpm exec supabase db query --linked --file supabase/tests/phase4_channels_messages.sql
corepack pnpm exec supabase db query --linked --file supabase/tests/phase4_realtime_policy.sql
corepack pnpm exec supabase db query --linked --file supabase/tests/phase3_workspaces.sql
```

The Phase 5 test uses six synthetic users and rolls back. It checks pair reuse in either order, the unique pair index, direct/group membership and message privacy, workspace-admin non-access, cross-workspace and duplicate recipient rejection, edit/delete ownership, read cursors, Realtime topic authorization, and revocation after workspace removal. The unique index enforces races; repeated RPC calls in one session test reuse, while a true concurrent two-session race remains a separate manual check.

The remote catalog confirms RLS on conversations, members, reads, and messages; SELECT grants only for `authenticated`; membership-scoped policies; and no `anon` EXECUTE grant on the two DM creation RPCs. The test left zero synthetic Phase 5 users. The Supabase security advisor reports no new Phase 5 finding. It still reports the existing policy-free `workspace_invitations` table (access through controlled RPCs) and disabled leaked-password protection. The new direct-member foreign keys now have covering indexes. The performance advisor still lists four older unindexed foreign keys and the two newly created Phase 5 indexes as unused before production DM traffic.

## Two or three-account browser walkthrough

1. Sign in to `http://localhost:3001` as A and B in separate browser profiles. Open the same workspace. As A, choose **New message**, select B, and send. Confirm B sees the DM after navigation/refresh and receives new messages while its DM is open.
2. Send, edit, and delete from both browsers. Confirm live updates, ownership controls, deleted placeholders, and persistence after refresh. Send more than 30 messages and load an older page without duplicates.
3. Create the A/B DM again from B's picker. It should open the same opaque conversation URL. Check that direct messages appear in recent-activity order and unread dots clear on opening.
4. With a third account C in the workspace but outside that DM, confirm its sidebar, URL, metadata, participant list, and messages do not reveal the A/B DM. C may be a workspace admin; that status must not grant DM access.
5. As A, create a group with B and C. All three should read and send. A fourth workspace member outside the group must not open its direct URL. Confirm group labels and the participant panel on desktop and phone widths.
6. Remove a DM participant from the workspace and refresh. Their durable access should end. A direct with one remaining participant, or group with fewer than three, is deleted by design. Check reconnect/focus recovery and channel messaging again.

The database tests can simulate C and a fourth user even if only two real GitHub accounts are available. Do not report a third-account browser result without a third real session. Group membership editing, advanced unread counts, typing, presence, threads, reactions, and attachments are deferred.

The user confirmed Phase 5 in two signed-in browser sessions on 2026-09-25: the same 1:1 DM opens for both participants, both can send, and messages appear correctly. The broader checklist above remains useful for later regression passes; checks that require a third real account should not be inferred from the two-browser result.
