# Manual backup and recovery drill

Supabase Free has no daily managed database backup. Keep encrypted, access-controlled exports off the repository and off the development machine. [Supabase recommends regular CLI exports for Free projects](https://supabase.com/docs/guides/platform/backups); database dumps do **not** include the actual Storage objects.

## Export to a private directory

Use a directory outside this Git checkout with restricted access. `supabase db dump --help` was checked against the installed CLI 2.117.0. The CLI may prompt for the Nova database password; enter it interactively, never in a command line, script, issue, or commit.

```powershell
cd C:\Projects\slack
corepack pnpm exec supabase migration list --project-ref bowkdnxhnqdncohnsgls
corepack pnpm exec supabase db dump --project-ref bowkdnxhnqdncohnsgls --file C:\PRIVATE-BACKUPS\nova-schema.sql
corepack pnpm exec supabase db dump --project-ref bowkdnxhnqdncohnsgls --data-only --use-copy --file C:\PRIVATE-BACKUPS\nova-data.sql
```

Check that both files exist, have nonzero size, and are readable. Encrypt them before offsite transfer. Treat the data file as containing private messages, identities, and invitation metadata. Do not commit it. Record the export time and migration version. For a full new-project migration, follow the [official CLI backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), including roles, managed-schema customizations, migration history, extensions, and project-specific secrets. A public-schema dump alone is not a full Supabase project backup.

## Safe reconstruction and restore test

1. Start Docker Desktop locally, then run `corepack pnpm exec supabase start`. In a **local-only** database, run `corepack pnpm exec supabase db reset --local` to rebuild from all versioned migrations. Never run `db reset --linked` against Nova. Confirm the local table/RLS inventory and run the transactional Phase 3–9 SQL suites there. This verifies schema reconstruction independently of a live project.
2. For a data recovery drill, create a separate disposable Supabase test project or isolated local database. Follow the official restore guide for the chosen target and use the encrypted exports. Never restore over Nova. Verify row counts, sample workspace membership, an authorized message read, denied private/DM reads, and attachment metadata consistency.
3. Separately back up wanted Storage objects through the Storage API under a privileged, controlled process. A SQL dump contains only object metadata. Expired or deleted attachments are deliberately unrecoverable; unexported live blobs would also be lost. Re-uploading blobs may need an application-level mapping to their original opaque paths.
4. Reconfigure project-specific values after recovery: Supabase Auth redirect and Site URL, GitHub provider callback/secret, private Realtime setting, Edge Function secrets/deployment, and the hourly cleanup schedule URL/token. Validate against a test domain before DNS cutover.

Phase 9 **did** start a fresh local database: all 24 migrations applied, 16 public tables had RLS, and the Phase 9 task policy regression passed with zero fixture users left behind. CLI schema and data exports from that empty local database succeeded (130,425 and 7,185 bytes); the temporary files were removed afterward, and the local container was stopped with its volume preserved. The data-only dump warned about circular foreign keys on `messages`, so a real restore must follow the official restore procedure with appropriate trigger handling. The live migration parity check also passed (24 matching local/remote versions, no pending migration). A **full data restore of Nova into a disposable target remains untested** because it requires a private production export, database password entered manually, and a separate target. No live reset or production data export was attempted.
