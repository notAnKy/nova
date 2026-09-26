# Phase 6 local time and individual mentions

Nova project: `bowkdnxhnqdncohnsgls`. Applied migration: `20260924233331_phase6_individual_mentions.sql`.

## Automated verification

The transactional [Phase 6 SQL test](../supabase/tests/phase6_mentions.sql) creates synthetic users, workspace memberships, channels, a direct conversation, and a group conversation, then rolls everything back. It confirms eligible public/private/DM/group mentions, rejects recipients outside each audience, checks a nonmember cannot inspect a private roster or message, verifies the metadata table has RLS and no client grants, and checks edit replacement and soft-delete cleanup. Phase 3, Phase 4, and Phase 5 SQL suites passed after this migration.

To repeat the database checks, run each file below separately in the Nova SQL Editor using a privileged SQL session. Each script ends with `ROLLBACK`, so its synthetic data is not retained:

1. `supabase/tests/phase6_mentions.sql`
2. `supabase/tests/phase5_direct_group_conversations.sql`
3. `supabase/tests/phase4_channels_messages.sql`
4. `supabase/tests/phase4_realtime_policy.sql`
5. `supabase/tests/phase3_workspaces.sql`

From the project directory, run the code checks with `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm build`.

The Supabase security advisor flags `public.message_mentions` as RLS-enabled without a policy. That is intentional: `anon` and `authenticated` have no table grants, and the trigger in the private schema maintains it. The older `workspace_invitations` finding and password-protection setting remain outside this iteration.

## Signed-in browser walkthrough

1. In a public channel, type `@`, then `@zou`. Confirm the menu opens, filters current workspace members, and supports Up/Down, Enter, Tab, Escape, and mouse selection. The selected name should remain readable in the composer. Send, then confirm the message renders a subtle highlighted name without a UUID.
2. Repeat in a private channel. Only its members should appear. In a 1:1 DM, only the two participants should appear. In a group DM, only its participants should appear. Try with a nonmember account to confirm it cannot open the private conversation or infer its roster.
3. Edit a message to replace one mention with another eligible person, then remove the mention. Refresh after each edit. Soft-delete a mentioned message and confirm only the deleted placeholder remains. If a mentioned profile changes its display name, reopen the conversation and check the current name renders for the same stored user ID.
4. Send plain text containing an email address such as `a@b.com`, plus `@everyone`. Neither should become an individual mention. Try a long display name and check the menu at phone width. Keep another participant's browser open and verify mention-bearing messages still appear through the existing live message flow.
5. Compare a message timestamp in browsers with different local timezones. Today's messages should show time only; older dates should include a date, and a different year should include the year. Hover or focus the time for its full local date and time. Stored database timestamps remain UTC.

The user completed this browser walkthrough successfully in two real signed-in sessions and approved Phase 6 part 1. Database tests additionally verify authorization and durable state.
