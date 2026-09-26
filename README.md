# Nova — collaboration workspace

Nova has public/private channels, direct/group messages, one-level threads, reactions, individual @mentions, private attachments, workspace message search, in-app Activity, and lightweight workspace projects with tasks and decisions. Phases 1–8 were manually validated. Phase 9 hardens access control, upload bounds, navigation, and project/Activity pagination; its signed-in walkthrough and full data restore drill remain. GitHub sign-in, profiles, workspaces, roles, and invitation links remain live.

## Requirements

- Node.js 22.13 or newer
- pnpm 11.19.0 (Corepack can run it without a global pnpm installation)
- A Supabase project and a GitHub OAuth App

## Configure Supabase

1. Create a Supabase project. In **Connect** or **Settings → API Keys**, copy its Project URL and **publishable key**. Put them in `.env.local` using `.env.example` as the template:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   ```

   Current Supabase docs use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in place of the older `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Both are public client credentials; this app uses the publishable key and relies on RLS for data security. Do not use a `service_role`, `sb_secret_...`, or GitHub client secret in `.env.local` or a `NEXT_PUBLIC_` variable.

2. Apply the versioned migrations in order with the CLI:

   ```bat
   corepack pnpm exec supabase login
   corepack pnpm exec supabase link --project-ref YOUR-PROJECT-REF
   corepack pnpm exec supabase db push
   ```

   Review the SQL first. These commands target the linked project and require your Supabase CLI login. Phase 7 creates the private `conversation-attachments` Storage bucket, attachment metadata and policies, a bounded message search RPC, notifications, and an hourly Nova cleanup job. Phase 8 adds workspace projects, tasks, decisions, and a bounded project activity table with RLS. Phase 9 corrects task creator authorization. Phase 10 restricts attachment finalization to the trusted inspection function. The cleanup job calls the deployed `cleanup-attachments` Edge Function with a database-generated token. Migration `20260925010400_phase7_nova_cleanup_schedule.sql` contains Nova's project URL; replace that URL when deploying to a different Supabase project. A first authenticated request inserts the user's own profile. The insert is idempotent and does not overwrite later edits.

3. Under **Authentication → URL Configuration**, set **Site URL** to `http://localhost:3001` and add `http://localhost:3001/auth/callback` to **Redirect URLs**. For a later deployment, add its exact `https://YOUR-DOMAIN/auth/callback` and set the production Site URL accordingly. Avoid broad production redirect wildcards.

4. Under **Authentication → Sign In / Providers → GitHub**, copy the Supabase provider **Callback URL**. It has the form `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`.

5. Under **Realtime → Settings**, disable **Allow public access to channels** before using Phase 4 private topics. The app joins with `private: true` and its migration supplies a membership-scoped Realtime policy. See [Phase 4 verification](docs/channel-phase4-tests.md).

## Configure GitHub OAuth

1. Open [GitHub Developer settings → OAuth Apps](https://github.com/settings/developers) and register a new OAuth App. Use your app name and `http://localhost:3001` for the homepage during local development. For **Authorization callback URL**, paste the **Supabase provider callback URL** from step 4 above. This is distinct from Nova's `/auth/callback` URL.
2. Copy the GitHub **Client ID**, generate a **Client Secret**, and enter both only in Supabase **Authentication → Sign In / Providers → GitHub**. Enable the provider and save. Keep the secret in GitHub/Supabase dashboards.
3. For production, update the GitHub homepage URL to your deployed origin. The GitHub authorization callback continues pointing to Supabase for that project.

Supabase's [GitHub provider guide](https://supabase.com/docs/guides/auth/social-login/auth-github) documents the dashboard flow. The app uses Supabase's [SSR client and PKCE code exchange](https://supabase.com/docs/guides/auth/server-side/creating-a-client). It does not request GitHub repository access.

## Run locally

```bat
cd /d C:\Projects\slack
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Open `http://localhost:3001`. If pnpm is not recognized in Command Prompt, use `corepack pnpm` as shown. If Node is too old, run `nvm use 24.13.1` first. If nvm needs elevation, use an Administrator Command Prompt; a session-only alternative is `set "PATH=C:\Users\Admin\AppData\Local\nvm\v24.13.1;%PATH%"`.

Without `.env.local`, `/` redirects to `/login`, which shows a setup message. After configuration, sign in through GitHub. **Continue with GitHub** keeps the usual fast flow. After signing out of Nova, **Use another GitHub account** asks GitHub to show its supported account picker. If the other account is not listed, sign in to it on GitHub first or use another browser profile; Nova sign-out does not end the GitHub browser session. A user with no workspace lands on `/onboarding`; create a workspace there, then use the workspace switcher and `/w/[workspaceSlug]/settings` to manage members and invitation links. Owners and admins can create channels from the sidebar or empty state. Private-channel members can add other workspace members from channel details when they are also a workspace owner or admin. Any workspace member can use **New message** to open a direct or group conversation. The composer sends text, individual @mentions, and up to three attachments; paste a clipboard image/file into its text area to add it to the same attachment tray, while text-only paste remains text. Enter sends and Shift+Enter inserts a newline. Message times use the viewer's browser timezone. The sidebar search looks only in the current workspace and Activity lists mentions and thread replies. **Projects** opens `/w/[workspaceSlug]/projects`; a message action can create a linked task or decision. Sign-out is available in the sidebar and profile settings at `/settings/profile`.

The active conversation follows new messages while you are near the bottom. If you scroll up, new messages append without moving your position and a jump button appears. Other conversations receive unread hints over the existing private user topic and re-read durable rows under RLS. Escape closes a local menu, dialog, or thread first; on secondary pages it returns to a safe previous Nova route or the page's parent.

### Lightweight projects

Owners/admins create workspace projects; current members read them and create tasks or decisions in active projects. Project creators and workspace leaders may edit metadata or archive projects. A task creator, assignee, or workspace leader may edit an active task. Assignees must be current workspace members; leaving the workspace clears their assignment. Decisions are durable records of outcomes and remain when a source message is deleted. Tasks and decisions can link to a readable source message without copying its text automatically. Source context is fetched through message/conversation RLS on each project-page request, so a private source appears as **Source message unavailable** to a project member who lacks conversation access. Project activity is bounded and contains event metadata, not source text. Project search, project notifications, and project Realtime are deferred; regular page refresh reflects durable rows. See [Phase 8 data model and verification](docs/phase8-projects-tasks-decisions-tests.md).

### Private file sharing

The bucket is `conversation-attachments`, private, with a 10 MB object limit. Nova accepts PNG, JPEG, WEBP, GIF, PDF, UTF-8 TXT, Markdown, CSV, and valid UTF-8 JSON. It rejects mismatched file signatures and content, executable/archive/audio/video formats, more than three files, and more than 15 MB combined per message. Original names are metadata only; object paths use workspace UUID, conversation UUID, and a random UUID. Downloads use the viewer's authenticated Storage request, so access changes take effect on the next request. No signed URL is persisted.

The browser reserves an attachment for its newly created message, then uploads the file directly to Supabase Storage with its own session. The authenticated Storage policy accepts only the exact reserved path. The `finalize-attachments` Supabase Edge Function checks the stored bytes, declared MIME, and reserved size before its service-only RPC marks the files ready. A `validating` state freezes the objects during inspection. Failed validation soft-deletes the message, attempts Storage API removal, and leaves failed removals for hourly cleanup. Vercel receives no file body and needs no service-role key. Deploy this function for a new Supabase project with `corepack pnpm exec supabase functions deploy finalize-attachments --use-api` (JWT verification must stay enabled). See [Phase 10 deployment guide](docs/phase10-deployment.md).

Nova V1 attachments expire automatically 72 hours after the upload is finalized to protect the Supabase Free-plan Storage quota. Each attachment stores a UTC `expires_at`. Active files show an expiration hint with an exact time in the viewer's browser-local timezone. At expiry, Storage downloads are denied immediately; the message remains visible with an **Attachment expired** placeholder. The hourly worker removes the object through the Storage API and retains only the expired placeholder metadata. Existing ready attachments receive a fresh 72-hour window when the expiration migration is applied.

Soft deletion hides attachment metadata immediately and queues object removal. The browser retries cleanup for its own files, and the same hourly Supabase Cron job calls `cleanup-attachments` to remove abandoned, deleted-message, and expired objects through the Storage API. Its private token is generated inside Postgres and is not a browser credential. Deploy the function with `corepack pnpm exec supabase functions deploy cleanup-attachments --use-api --no-verify-jwt`; Nova already has it deployed. The worker uses Supabase's hosted `SUPABASE_SERVICE_ROLE_KEY` only inside the Edge Function. Do not put that key in `.env.local` or browser code. Monitor the Cron job and queued rows as described in [Phase 7 verification](docs/phase7-files-search-activity-tests.md).

## Verification

```bat
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
```

The [Phase 9 task authorization test](supabase/tests/phase9_task_creator_policy.sql) and Phase 3–8 SQL regression suites run transactionally and roll back synthetic data. Phases 1–8 were manually validated by the user. The clean local migration rebuild and local export passed. Complete the [Phase 9 signed-in walkthrough](docs/phase9-verification.md) and a full data restore into a disposable target using the [recovery guide](docs/phase9-recovery.md) before a public beta. See also the [security review](docs/phase9-security.md), [free-tier envelope](docs/phase9-free-tier.md), and [production configuration guide](docs/phase9-production-config.md).

Phase 10 direct-upload, Edge inspection, local API, and Phase 3–9 regression results are recorded in the [Phase 10 verification report](docs/phase10-verification.md). Real signed-in browser checks on the final Vercel domain remain manual.

The [postdeployment UX verification](docs/postdeploy-ux-verification.md) covers account selection, clipboard attachments, Realtime unread hints, scroll/read behavior, Escape routing, and active-conversation typing and navigation feedback. The additive Realtime migrations are `20260926115326_realtime_unread_hints.sql` and `20260926123429_private_typing_broadcast.sql`.

## Deployment notes

The existing Vercel deployment uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Keep the configured production and localhost Auth callback URLs, GitHub's Supabase provider callback, and the GitHub client secret in its current dashboard location. Do not cache authenticated pages or responses containing refreshed auth cookies. Once the postdeployment UX changes are committed, a push to the connected production branch should trigger a Vercel redeploy; confirm the deployment in Vercel before retesting. The [Phase 10 deployment guide](docs/phase10-deployment.md) describes the original setup.

## Project layout

```text
src/app/                 Next.js pages, callback route, styles, and server route protection
src/lib/supabase/        Supabase SSR clients and session refresh proxy
src/features/profile/    Profile read/create/edit and avatar display
src/features/auth/       GitHub sign-in and sign-out actions
src/features/workspaces/ Real workspace reads, actions, validation, and UI
src/features/workspace/  Workspace rail and conversation sidebar
src/features/channels/   Channel reads, actions, shared timeline, Realtime, and membership UI
src/features/direct/     Direct/group creation, list, profiles, and details UI
src/features/conversation/ Shared composer, mentions, local time, and message item
src/features/search/    Workspace-scoped message search UI
src/features/activity/  Durable in-app notifications UI
src/features/projects/   Workspace projects, tasks, decisions, and source-link UI
supabase/migrations/     Versioned profile, workspace, conversation, file, search, and Activity schema/RLS
supabase/functions/      Trusted attachment inspection and hourly private cleanup workers
supabase/tests/          Transactional workspace, conversation, and mention access tests
docs/                    Architecture, roadmap, and verification plans
```

See [architecture](docs/architecture.md) and [roadmap](docs/roadmap.md). Later features remain deferred.
