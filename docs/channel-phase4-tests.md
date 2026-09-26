# Phase 4 channel and messaging verification

Nova project `bowkdnxhnqdncohnsgls` has two Phase 4 migrations: `20260924023102_phase4_channels_messages.sql` and `20260924025025_phase4_relation_indexes.sql`. They add only channel-relevant conversation tables and indexes. DM kinds, threads, files, and notifications remain absent.

## Database test

From the linked repository, run:

```bat
corepack pnpm exec supabase db query --linked --file supabase/tests/phase4_channels_messages.sql
```

The SQL inserts four synthetic auth users, switches between their `authenticated` roles and JWT subjects, asserts RLS and RPC behavior, and ends with `ROLLBACK`. It tests owner/member/outsider access, private name and message isolation, direct membership insert denial, channel creation permissions, author spoofing and message moves, blank-body rejection, own edit and soft delete, another user's edit/delete denial, read cursors, 20 nonoverlapping rows across two cursor pages, private member removal, workspace removal, and the topic-access helper. The Phase 3 test remains a regression check:

```bat
corepack pnpm exec supabase db query --linked --file supabase/tests/phase3_workspaces.sql
```

Both were run after applying the Phase 4 migrations, and no synthetic data remained. The SQL tests evaluate the same topic-access helper used by the `realtime.messages` RLS policy. A true WebSocket join still needs a signed-in browser session.

After a WebSocket client has initialized Realtime's daily partitions, run the direct Broadcast policy test:

```bat
corepack pnpm exec supabase db query --linked --file supabase/tests/phase4_realtime_policy.sql
```

It rolls back its synthetic users and data. It checks that the database trigger produces private, ID-only `message.created`, `message.updated`, and `message.deleted` Broadcast rows; that the private member and creator can read them; and that a workspace member without private membership, a removed private member, and `anon` cannot.

## Verified on Nova, 2026-09-24

- The Realtime service was enabled and **Allow public access to channels** was disabled in the saved Dashboard settings screenshot.
- `node supabase/tests/phase4_realtime_anon.mjs` reached the project over WebSocket. A public-topic join returned `PrivateOnly`; an anonymous private-topic join returned `Unauthorized`.
- The first WebSocket probe returned `MissingPartition` because this new project had no `realtime.messages` daily partition. A subsequent connection initialized Supabase's managed partitions; the authorization probe then returned the expected rejections. No partition was created by an application migration.
- The direct Broadcast policy test passed against the linked database. The standard four-user Phase 4 database test passed again. Both transactions rolled back.
- A positive signed-in WebSocket join and two-browser message delivery remain manual checks; no signed-in browser session was available to the verification run.

## Realtime strategy

Each open channel uses one private `channel:<conversation UUID>` topic. A database trigger calls `realtime.send` after a committed message insert or update with only the channel and message IDs. The client fetches the row through normal RLS before displaying it. Duplicate or out-of-order notices merge by message ID and edit/delete timestamp. It refetches the latest page and loaded message rows on subscription, reconnect, tab focus, and visibility return. Switching channels removes the old subscription. No sidebar row has its own subscription. There is no persistent typing or presence data.

The project-wide **Dashboard → Realtime → Settings → Allow public access to channels** setting is disabled. Supabase's Realtime Authorization guide requires this when enforcing private channels; the migration cannot set that Dashboard toggle. Keep the client subscription configured with `private: true`.

`realtime.messages` has a SELECT policy for authenticated listeners whose current workspace and private-channel membership permits reading that topic. Client-side Broadcast sends have no INSERT policy. Supabase caches private topic authorization for a connected client until it reconnects or refreshes its JWT, so removal blocks durable reads and writes immediately but an existing WebSocket may receive small ID-only notices briefly. No message body is present in those notices. [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization).

## Two-account browser walkthrough

1. Start `corepack pnpm dev` and open `http://localhost:3001` in two separate browser profiles signed in as accounts A and B. Use a workspace where A is owner/admin and B is a member.
2. As A, create a public `#general` channel. Confirm B sees it. Send a message as A; it should appear in B's open channel without a page reload. Reply as B and confirm A sees it.
3. Edit and delete one of A's messages. B should see the edited marker and then the deleted placeholder, with no deleted body. B should not see edit/delete controls on A's message.
4. Send more than 30 messages, use **Load older messages**, and check chronological order with no duplicates. Reload the page and confirm messages persist.
5. Create a private channel as A. B should not see its name or URL. Add B from channel details; it should then appear in B's sidebar. Remove B and confirm that reloading its direct URL returns not found and it cannot load the messages.
6. Leave one browser tab open, disconnect/reconnect its network or switch away and back. Durable history should reconcile on reconnect/focus. Open another workspace and confirm its channels stay separate.
7. At phone width, check sidebar navigation, channel creation, details, message composer, and edit/delete controls.

The two-account WebSocket and responsive visual walkthrough requires real GitHub sessions; SQL role simulation cannot replace it. Advanced unread counts, typing, and presence are deferred. The sidebar shows a basic unread indicator from a durable cursor, refreshed when the workspace page is loaded; it does not subscribe to every channel.
