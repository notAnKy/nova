# Phase 10 verification — 2026-09-26

## Implemented and deployed to Nova Supabase

- The browser sends attachment bytes directly to private Supabase Storage. The former Next `/api/message-attachments` route was removed. Client checks are for feedback; the `finalize-attachments` Edge Function inspects the stored bytes before they become visible.
- Migration `20260925213711_phase10_trusted_attachment_finalization.sql` adds a frozen `validating` state, service-only begin/finalize RPCs, revokes authenticated use of the old ready RPC, and extends stale cleanup to interrupted validation. The new function was deployed with JWT verification **enabled**. The existing `cleanup-attachments` worker remains active with its hourly `17 * * * *` Cron schedule.
- Nova reports 25 matching local/remote migrations and no pending migration. The bucket is private. Authenticated users have no EXECUTE on the old/new finalization RPCs; `service_role` has EXECUTE on the new pair. All public tables have RLS enabled. The three existing Storage policies remain scoped to authenticated users.

## Automated checks run

| Check | Result |
| --- | --- |
| Phase 3 workspace SQL | Pass, local transactional suite |
| Phase 4 channel/message and Realtime policy SQL | Pass, local transactional suites |
| Phase 4 anonymous Realtime network probe | Pass against Nova: public topic and anonymous private topic both rejected |
| Phase 5 direct/group SQL | Pass, local transactional suite |
| Phase 6 mentions and threads/reactions SQL | Pass, local transactional suites |
| Phase 7 attachments/search/activity SQL | Pass after updating trusted-finalization assertions |
| Phase 8 projects/tasks/decisions SQL | Pass, local transactional suite |
| Phase 9 task creator policy SQL | Pass, local transactional suite |
| Phase 7 content/size and cleanup/retry JavaScript | Pass |
| Phase 9 pagination JavaScript | Pass; retired multipart-route assertions moved to Phase 10 direct-upload tests |
| Phase 10 direct-upload and trusted-byte-inspection JavaScript | Pass |
| Phase 10 local API integration | Pass: real signed-in direct upload including three 5 MiB files in one 15 MiB message, Edge inspection, ready/72-hour metadata, private outsider download denial, unreserved path denial, client RPC bypass denial, outsider function denial, invalid-content rejection and physical Storage removal, immediate expiry download denial, parent message preserved |
| `corepack pnpm lint` / `corepack pnpm typecheck` / `corepack pnpm build` | Pass |
| `git diff --check` and untracked-file whitespace scan | Pass |
| Local development on port 3001 | `next dev` ready and `/login` returned HTTP 200 |
| Nova Edge Function | Active with `verify_jwt=true`; preflight HTTP 200, unauthenticated POST HTTP 401 |

The Supabase security advisor still reports two informational RLS-without-policy notices on intentionally RPC-only `message_mentions` and `workspace_invitations`, plus a leaked-password-protection warning. Nova currently uses GitHub OAuth rather than app passwords. No new Phase 10 advisor finding appeared.

## Manual checks before public beta

1. In the existing localhost app, sign in as a private-channel member and send a near-10 MB supported file and a multi-file message up to the 15 MB total. Confirm both appear, download, and show the local-time expiration hint. Confirm another private outsider or DM outsider/admin cannot open the file.
2. Confirm a deliberately abandoned upload is removed by the hourly worker and that deleting an attachment message queues/removes the object while keeping message history coherent.
3. Complete the Phase 9 signed-in keyboard/mobile walkthrough and a full Nova data restore to a separate disposable target. The earlier clean local migration rebuild and local export do not replace this restore drill.
4. After GitHub push and an approved Vercel deploy, obtain its stable HTTPS URL, make the exact Auth and GitHub homepage changes in [the deployment guide](phase10-deployment.md), then repeat sign-in, callback, private/DM, attachment, and localhost OAuth checks on both origins.

No Vercel deployment or production Site URL change was made.
