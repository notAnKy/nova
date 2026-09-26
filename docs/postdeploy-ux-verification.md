# Postdeployment UX verification

The additive migration `20260926115326_realtime_unread_hints.sql` adds a trigger for top-level message inserts. It emits a small `conversation.changed` hint to each current reader's existing private `activity:<user UUID>` topic. Public channels target current workspace members; private channels, direct messages, and groups target current conversation participants who still belong to the workspace. Replies do not emit unread hints. The hint carries IDs only, and clients re-read bounded conversation/read rows through normal RLS. No new table, Storage policy, Edge Function, or scheduler is needed.

The prior client updated only the active conversation topic. Other sidebar conversations had no ordinary-message invalidation; activity hints covered mentions and thread replies. In the active timeline, Realtime state could append while the reader remained above the visible end, and the focus/reconnect path marked the newest message read even when the reader was scrolled up. The new timeline follows messages near the bottom, preserves a scrolled-up position, and advances the cursor only after the bottom is visible in an active tab. A jump button and separator appear for newly arrived messages while reading older content. Root messages merge by ID; replies stay in their thread and keep existing Activity semantics.

The login page has a separate account-picker submit that forwards [GitHub's documented `prompt=select_account`](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) through [Supabase `signInWithOAuth`](https://supabase.com/docs/reference/javascript/auth-signinwithoauth). Normal sign-in remains unchanged. Nova sign-out only ends the Nova/Supabase session. GitHub may list only accounts currently signed in at GitHub; the user must add the other account there or use a separate browser profile.

Pasting a clipboard file into either message or thread composer uses the existing attachment tray, size/count checks, content inspection, direct browser-to-Supabase upload, trusted finalization, and 72-hour expiry. A text-only clipboard is left for the browser's native paste. When a clipboard offers both file data and text, the file is selected without inserting duplicate text. Generic screenshots get a dated PNG/JPEG/WebP/GIF name.

Escape respects `defaultPrevented`, IME composition, modifiers, and local dialog/menu/thread handlers. Secondary pages use a known prior in-app path when available, otherwise their defined parent. The fallback never navigates outside Nova.

## Automated checks

- `node --experimental-strip-types tests/postdeploy_ux.mjs`: helper checks for account query parameter, clipboard handling and limits, scroll/read decisions, ID deduplication, and safe Escape routing.
- `supabase/tests/postdeploy_realtime_unread.sql`: transactional public/private fanout, reply exclusion, no read-on-hint, outsider exclusion, and revoked-member exclusion.
- `tests/postdeploy_realtime_local.mjs`: local three-account network test for public, private, and direct Realtime delivery, user hints, explicit read cursor, and outsider denial. Supply local-only values from `supabase status -o json` as `LOCAL_SUPABASE_URL`, `LOCAL_SUPABASE_PUBLISHABLE_KEY`, and `LOCAL_SUPABASE_SERVICE_ROLE_KEY`.
- Phase 3–9 transactional SQL suites, Phase 7 attachment JS tests, Phase 9 pagination test, and Phase 10 direct-upload/content/local Storage integration were rerun. Lint, typecheck, build, and `git diff --check` passed.

## Production browser check

1. Sign out, use each login button, and verify the second button shows GitHub's picker. Test a second signed-in GitHub identity; Nova sign-out should not sign out GitHub.
2. Paste a screenshot, a text-only clipboard, and an unsupported file into a message and a thread. Send a valid file and confirm the existing direct upload, private download, and expiration display.
3. With two accounts, test the same public channel at bottom and scrolled up; check the jump button, read cursor/unread indicator, and no duplicate rows. Send in a different channel, private channel, and DM; the other account's sidebar should update without refreshing. An outsider must not subscribe to or read a private conversation.
4. Press Escape in mention suggestions, a workspace menu, thread/detail panel, profile, workspace settings, and project detail. A hard-loaded secondary route should fall back to its parent; Escape must remain within Nova.
