# Phase 6 part 2: threads and reactions

Nova project: `bowkdnxhnqdncohnsgls`. Applied migrations:
`20260925000038_phase6_threads_reactions.sql`,
`20260925001010_phase6_thread_parent_policy_fix.sql`, and
`20260925001309_phase6_thread_reply_index.sql`.

## Automated verification

Run [the transactional thread/reaction SQL suite](../supabase/tests/phase6_threads_reactions.sql)
in Nova's SQL Editor using a privileged SQL session. It rolls back all synthetic users
and rows. It checks public/private/DM/group replies, parent scope, no nesting,
top-level paging, outsider and removed-member denial, a deleted root retaining
replies, reaction uniqueness and ownership, private reaction privacy, counts,
and reaction cleanup on soft deletion.

The Phase 3, Phase 4 channel and Realtime, Phase 5, and Phase 6 mention SQL suites
also passed after these migrations. Run each SQL file separately in the same way.
For code checks, run `corepack pnpm lint`, `corepack pnpm typecheck`, and
`corepack pnpm build` from the project directory.

## Signed-in browser walkthrough

Use two real signed-in workspace accounts in separate browsers:

1. Open a public channel, click **Reply in thread** on a message, and confirm the
   right panel opens. Its URL has `?thread=<message UUID>`. Refresh, go back and
   forward, and close it. On phone width, the thread should take the full screen
   with a clear Close control and Escape support.
2. Send a reply. It should appear in the panel, increase the root's reply count,
   and stay out of the main timeline. Open the same channel in the second browser;
   the reply and count should update live. Verify older main timeline pages still
   contain only root messages.
3. Edit and soft-delete your own reply. Confirm the second browser sees both
   changes. Mention an eligible user in a reply and check its rendered name,
   including after editing. Try a private channel, 1:1 DM, and group DM.
4. Add a reaction from account A, then the same emoji from B. Counts should show
   two and update live. Click the same reaction again from one account to remove
   only that account's row. Try all seven picker choices and phone width.
5. Soft-delete a root with replies. The root should show a deleted placeholder,
   the thread should still open, and its replies should remain. Reactions on that
   deleted root should disappear and its picker should be unavailable.
6. Confirm a workspace member outside a private channel/DM cannot open its
   thread URL or see its replies/reactions. Remove a participant's membership
   and verify a fresh request denies access.
7. Leave a thread open in one browser, send/edit/delete a reply in the other,
   and add/remove reactions in both directions. Confirm updates recover after
   disconnect/reconnect or tab refocus.

Codex did not run the signed-in browser walkthrough because no signed-in browser
session was available. The SQL suites prove database access and integrity; they
do not prove mobile interaction or socket delivery.

Thread replies use a bounded 30-item page with **Load older replies**. They do
not advance the existing top-level conversation read cursor in this iteration.
Reply counts include soft-deleted placeholders so thread structure stays stable.
Reactions on soft-deleted messages are removed and cannot be added.
