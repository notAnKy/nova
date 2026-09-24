# Profile RLS verification

Run these checks after applying `20260924003652_profiles_phase2.sql` to the intended Supabase project. Use two separate GitHub users, A and B. Their IDs can be read from Supabase **Authentication → Users**. Never put a service key in the browser to perform these checks.

1. **Unauthenticated route:** In a fresh private browser window, open `/` and `/settings/profile`. Both must redirect to `/login`. The public login page must show no profile information.
2. **Profile creation and persistence:** Sign in as A. The app must create exactly one `profiles` row with `user_id` equal to A's Auth ID. Refresh twice; the row count for A must remain one. Edit display name and status in `/settings/profile`, save, and refresh. Values must persist. Sign out and confirm `/` redirects to `/login`.
3. **Read access:** Sign in as B and create B's profile. With each user's publishable-key session, `profiles.select('user_id,display_name,status_text,avatar_url')` may read both profiles. This is intentional: these fields are member-visible. The table contains no email or private Auth fields.
4. **Cross-user update:** While signed in as A, attempt `profiles.update({ display_name: 'changed' }).eq('user_id', B_ID).select()`. It must return zero rows and B's profile must be unchanged. A's same update targeting A_ID must affect one row.
5. **Identity immutability:** While signed in as A, attempt to update `user_id` to B_ID and to update `avatar_url`. Both must be rejected by column privileges. Attempting to insert a profile with `user_id = B_ID` must be rejected by the insert policy.
6. **Anonymous access:** Sign out and make a Data API request with only the publishable key. Selecting `profiles` must expose no rows; insert/update must fail. The migration explicitly revokes table privileges from `anon`.
7. **Validation:** A blank display name, a name over 80 characters, status over 160 characters, and an avatar URL outside `https://avatars.githubusercontent.com/` must be rejected by database constraints. The profile form also validates before sending changes.

For API checks, use each user's normal browser Supabase session and publishable key; do not use SQL Editor's privileged role as a substitute for a user session. The UI route and server action checks confirm the application boundary, while the API requests confirm RLS and column grants independently.
