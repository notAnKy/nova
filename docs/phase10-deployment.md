# Phase 10 deployment preparation

Nova is a small personal/student public beta. Keep the existing localhost development URL at `http://localhost:3001`. Do not enter a placeholder production origin in any dashboard. Do not deploy to Vercel until the repository and Nova checks are complete and the user approves it.

## File upload path

1. The browser checks selection size/count and file signature for immediate feedback. It inserts a message under message RLS and reserves up to three attachment rows through `reserve_attachment`. The database enforces 10 MiB per file, 15 MiB per message, permitted MIME, uploader identity, message ownership, and current conversation access.
2. For each random path `<workspace UUID>/<conversation UUID>/<object UUID>`, the browser calls Supabase Storage `upload` with its signed-in session and `upsert: false`. The private bucket and Storage INSERT policy require that exact pending reservation, matching uploader, and conversation access. No file body passes through a Next route or Vercel Function.
3. The browser invokes `finalize-attachments` with only the message UUID. Supabase verifies the user JWT; the Edge Function gets the user from Auth. Its service-only begin RPC checks message ownership and current conversation access, then moves all rows to `validating`. The uploader's Storage INSERT/DELETE policies no longer match those frozen rows. The function downloads each object from Supabase Storage, compares actual byte length with the reserved size, detects permitted content, and compares the detected MIME with reserved MIME. Its service-only final RPC rechecks authorization and object presence, marks all rows ready, and assigns one UTC expiry 72 hours from successful finalization. Authenticated clients cannot execute the old or new ready RPCs.
4. On validation failure, the function soft-deletes the message, removes objects through the Storage API, and clears removed metadata. If a removal fails or the function stops mid-validation, the hourly `cleanup-attachments` worker finds the queued/stale rows and retries. The browser also attempts own cleanup after a failed send. Message deletion and expiration keep their existing lifecycle.

Downloads always use authenticated Storage requests. Ready objects are accessible only through current conversation membership and only before `expires_at`. The message remains visible as **Attachment expired** after expiry; the hourly worker removes the object. No long-lived signed URL or browser service key exists. The Edge Function's hosted `SUPABASE_SERVICE_ROLE_KEY` never belongs in Vercel or `.env.local`.

## GitHub repository

The checkout is already a Git repository on `main`. Review `git status --short` before committing; earlier Phase 3–9 files are still uncommitted and must be included. `.env.local`, `.vercel`, Supabase temp directories, dump files, and local backups are ignored. Never add service-role keys, OAuth secrets, database passwords, access tokens, or production exports.

GitHub CLI is not installed in this workspace. In [GitHub's new repository page](https://github.com/new), create an empty repository named `nova` under your account (private unless you deliberately choose public). Do not initialize it with a README, `.gitignore`, or license because this checkout already has project history. Then run:

```bat
cd /d C:\Projects\slack
git status --short
git add -A
git diff --cached --check
git diff --cached --stat
git commit -m "Prepare Nova for Phase 10 deployment"
git remote add origin https://github.com/YOUR-OWNER/nova.git
git push -u origin main
```

Replace `YOUR-OWNER` with your GitHub username or organization. If you chose another repository name or already created one, replace `nova` with its actual name. No remote is configured in this checkout yet.

## Vercel Hobby project (after approval)

Import the GitHub repository as a Next.js project. Use the repo root, the committed `pnpm-lock.yaml`, the Node version supported by this Next release, and the normal Next build command `corepack pnpm build` (or Vercel's detected equivalent). No Docker image, filesystem persistence, cron job, separate server, or Vercel Storage integration is needed. Do not put attachment uploads behind a Vercel Function. The cleanup Cron and both attachment Edge Functions run on Supabase.

Set only these Vercel environment variables for the production environment:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://bowkdnxhnqdncohnsgls.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Nova publishable key from Supabase>
```

The key is public and protected by RLS. Do not set a service-role key, `sb_secret_...`, cleanup token, GitHub client secret, database password, `NEXT_PUBLIC_APP_URL`, or localhost origin in Vercel. The OAuth action derives the deployed origin from the request. Preview deployments may render, but preview OAuth is deliberately unsupported until an exact callback is allowlisted.

## Once Vercel gives the final stable HTTPS URL

Suppose the assigned origin is `https://YOUR-FINAL-DOMAIN` (replace it with the real URL; do not enter the placeholder):

1. In **Nova Supabase → Authentication → URL Configuration**, set **Site URL** to `https://YOUR-FINAL-DOMAIN`. In **Redirect URLs**, add the exact `https://YOUR-FINAL-DOMAIN/auth/callback` and retain `http://localhost:3001/auth/callback`. Avoid broad preview wildcards.
2. In the existing **GitHub OAuth App**, change **Homepage URL** to `https://YOUR-FINAL-DOMAIN`. Keep **Authorization callback URL** as `https://bowkdnxhnqdncohnsgls.supabase.co/auth/v1/callback`. Leave the GitHub client ID and secret in **Supabase Authentication → Sign In / Providers → GitHub** only; they do not go to Vercel.
3. Verify the flow: Nova on Vercel → Supabase Auth → GitHub → Supabase `/auth/v1/callback` → Nova `/auth/callback`. Test sign-in, sign-out, workspace membership, private channels, DMs, attachments, and a denied outsider on the actual domain. Test localhost OAuth still works.

## Local checks and limits

Run `corepack pnpm dev` from the repository; the dev script pins port 3001. Run `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm build` before deployment. The SQL suites in `supabase/tests/` are transactional. Run `node --experimental-strip-types tests/phase10_direct_upload.mjs` and the Phase 7 attachment tests. Compare `supabase migration list` local/remote and confirm no pending migration before inviting users.

Free-plan limits are an operational constraint. Each attachment message adds one Supabase Edge Function inspection invocation and server-side Storage reads before ready. The 72-hour expiry and hourly cleanup limit retained Storage bytes; user downloads and previews still consume egress. Monitor Supabase Storage, Edge Function, database, Realtime, and Auth usage during the beta. See the [free-tier envelope](phase9-free-tier.md) and [backup/restore guide](phase9-recovery.md). The full Nova data restore into a disposable target still needs a separate manual drill before public launch.
