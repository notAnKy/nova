# Nova — collaboration workspace

Phase 2 adds GitHub sign-in and editable profiles. Workspace, channel, message, and direct-message content remains fixture data and cannot be persisted yet.

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

2. Apply the versioned migration at `supabase/migrations/20260924003652_profiles_phase2.sql` **before signing in**. The CLI route is:

   ```bat
   corepack pnpm exec supabase login
   corepack pnpm exec supabase link --project-ref YOUR-PROJECT-REF
   corepack pnpm exec supabase db push
   ```

   Review the SQL first. These commands target the linked project and require your Supabase credentials; they have not been run against a remote database. The migration creates only `public.profiles`, its timestamp trigger, grants, and RLS policies. A first authenticated request inserts the user's own profile. The insert is idempotent and does not overwrite later edits.

3. Under **Authentication → URL Configuration**, set **Site URL** to `http://localhost:3001` and add `http://localhost:3001/auth/callback` to **Redirect URLs**. For a later deployment, add its exact `https://YOUR-DOMAIN/auth/callback` and set the production Site URL accordingly. Avoid broad production redirect wildcards.

4. Under **Authentication → Sign In / Providers → GitHub**, copy the Supabase provider **Callback URL**. It has the form `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`.

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

Open the **Local** URL printed by Next.js. If pnpm is not recognized in Command Prompt, use `corepack pnpm` as shown. If Node is too old, run `nvm use 24.13.1` first. If nvm needs elevation, use an Administrator Command Prompt; a session-only alternative is `set "PATH=C:\Users\Admin\AppData\Local\nvm\v24.13.1;%PATH%"`.

Without `.env.local`, `/` redirects to `/login`, which shows a setup message. After configuration, sign in through GitHub. Sign-out is available in the sidebar and profile settings. Profile settings are at `/settings/profile`.

## Verification

```bat
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
```

After dashboard setup, use [the profile RLS test plan](docs/profile-rls-tests.md) with two distinct GitHub accounts. Live OAuth, database, and policy verification require the real project configuration.

## Deployment notes

For a later Vercel deployment, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the project environment settings for each relevant environment. Add every deployed app origin's `/auth/callback` to Supabase Redirect URLs. Keep GitHub's callback URL pointed at Supabase and keep its client secret only in the Supabase provider settings. Do not cache authenticated pages or responses containing refreshed auth cookies.

## Project layout

```text
src/app/                 Next.js pages, callback route, styles, and server route protection
src/lib/supabase/        Supabase SSR clients and session refresh proxy
src/features/profile/    Profile read/create/edit and avatar display
src/features/auth/       GitHub sign-in and sign-out actions
src/features/workspace/  Fixture workspace rail and sidebar
src/features/conversation/ Fixture timeline, composer, and detail panel
src/fixtures/            Sample collaboration content retained for Phase 2
supabase/migrations/     Versioned profiles schema and RLS migration
docs/                    Architecture, roadmap, and RLS test plan
```

See [architecture](docs/architecture.md) and [roadmap](docs/roadmap.md). Phase 3 requires separate approval.
