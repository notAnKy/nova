# Phase 7 verification: files, search, and Activity

Nova project: `bowkdnxhnqdncohnsgls`. The Phase 7 migrations through
`20260925010600_phase7_attachment_expiration.sql` are applied. The private
`conversation-attachments` bucket, `cleanup-attachments` Edge Function, and
hourly `nova-attachment-cleanup-hourly` Cron job are active. A direct worker
invocation after the expiration update returned HTTP 200 with `removed: 0, failed: 0`.

## Automated checks

Run [the transactional Phase 7 SQL suite](../supabase/tests/phase7_attachments_search_activity.sql)
in the Nova SQL Editor as a privileged session. It rolls back synthetic users,
messages, and metadata. It checks public/private/DM/reply search, deleted and
removed-member exclusion, mention and thread-reply notifications, self-exclusion,
own read state, private attachment metadata and object policy access, guessed
path denial, oversized/unsupported reservation rejection, 72-hour assignment,
pre-expiry access, post-expiry denial, cleanup selection, placeholder retention,
idempotent metadata cleanup, abandoned uploads, queue-on-delete,
private bucket configuration, and narrow grants. The Phase 3–6 SQL suites also
pass on Nova. For code checks, run `corepack pnpm lint`,
`corepack pnpm typecheck`, `corepack pnpm build`, and
`node --experimental-strip-types tests/phase7_attachment_validation.mjs`, and
`node tests/phase7_attachment_cleanup.mjs`.

The SQL suite tests Storage policy predicates and metadata. The worker test
uses a mock Storage API to check removal order, failures, retries, and object
absence before metadata changes. Neither test creates a real Storage blob;
complete the signed-in browser checks below to verify authenticated upload,
download, expiration, and rendering against the Storage API.

## Signed-in browser walkthrough

Use two real signed-in workspace members in separate browsers. Use a third
workspace admin who is not a participant for DM and private-channel denial.

1. In a public channel, attach a small PNG with a short message. Confirm the
   message renders with an inline preview for both members, downloads with its
   original filename, and survives reload. Send a PDF and TXT/CSV/JSON file;
   confirm their filename, type, size, and download. Try attachment-only send.
2. Select two or three files, remove one before sending, and confirm only the
   remaining files appear. Try four files, an 11 MB file, and files totaling
   over 15 MB. Rename an executable or archive to `.txt` and confirm content
   validation rejects it. Try a corrupt JSON file.
3. Attach to a private channel, 1:1 DM, group DM, and thread reply. Confirm
   participants can open files in fresh tabs. An outsider to the private channel
   and an admin outside the DM should receive no metadata or Storage download,
   even if given the full object path. After removing a participant, retry a
   fresh download and confirm denial. Existing downloaded local blobs cannot
   be retroactively erased from a user's device.
4. Delete an attachment message. Confirm the UI hides its file and the
   metadata disappears. The sender's browser attempts immediate Storage
   cleanup. An interrupted or failed cleanup remains queued for the hourly
   worker; check `message_attachments` for pending/deleting rows and the
   `nova-attachment-cleanup-hourly` Cron run history when testing failure
   recovery. Never delete rows directly from `storage.objects`.
   For a fresh file, confirm the expiration hint gives an exact local time in
   its tooltip. A file past `expires_at` should show **Attachment expired**
   without a download control, while its parent message remains. A fresh
   authenticated Storage request using the old path must be denied. The next
   hourly run removes the object and leaves the expired placeholder.
5. Search from the sidebar or Ctrl/Cmd+K for a word in a public message,
   private channel, DM, and thread reply. Confirm each result shows current
   author name, context, time, and readable mention names. Jump to an older
   root and a reply; the latter should open its thread. Confirm deleted
   messages do not appear, a private outsider sees no private result, an
   admin sees no unrelated DM, and a removed member sees none from the workspace.
6. Mention member B in a root message and a thread reply; as B, confirm
   Activity shows those entries, unread badge changes, and each jump opens
   its source. Reply to A's root; A should receive a thread-reply notification.
   Confirm actors get no self-notification. Mark one read and then mark all
   visible read; reload and confirm durable state. Delete or revoke access to
   a source and confirm Activity no longer exposes its text or context.
7. Keep B's Activity open while A mentions B. Confirm the single private
   Realtime hint refreshes the badge/list. Disconnect and reconnect the tab,
   or refocus it, and confirm durable state catches up. No subscription is
   created per notification.
8. Repeat the file picker/list, image/file rows, search results, Activity
   list, and jump behavior at phone width. Check keyboard navigation and that
   long filenames/snippets do not overflow.

## Limits and cleanup operations

- Bucket: private, 10 MB per object. Message: three attachments, 15 MB total.
- MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`,
  `application/pdf`, `text/plain`, `text/markdown`, `text/csv`,
  `application/json`.
- The route validates actual bytes, not just extension or browser MIME.
  Images use signatures; text must decode as UTF-8, and JSON must parse.
- Nova V1 attachments expire 72 hours after successful upload finalization.
  The UTC `expires_at` is durable; existing ready files get 72 hours from the
  migration. The browser renders the exact deadline in its local timezone.
- Pending reservations older than one hour, all deleting rows, and ready rows
  past `expires_at` are eligible for the hourly worker. It calls the Storage
  API first. It removes pending/deleting metadata after object absence, or
  changes expired ready metadata to a durable `expired` placeholder. It
  processes at most 100 rows per run and retries failures on later runs.
  Already expired placeholders are excluded from future cleanup scans.
  The uploader's browser also retries up to 20 pending/deleting rows when
  opening a conversation.
- Cron targets Nova by URL in the migration. On another project, change that
  URL before applying the schedule migration and deploy the Edge Function.
  The database-generated token is never copied into source or client code.

## Deferred

Office documents, ZIP, audio, video, external search services, advanced search
filters, email/push notifications, DM activity, bookmarks, and projects are
outside Phase 7. The browser walkthrough is not claimed complete by the SQL
or build checks.
