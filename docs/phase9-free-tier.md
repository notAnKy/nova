# Free-tier pilot envelope

This is an operational target for a small, non-commercial beta, not a platform-enforced quota. Vercel Hobby is restricted to personal/non-commercial use; confirm eligibility before deployment. Check current [Supabase usage](https://supabase.com/docs/guides/platform/billing-on-supabase) and [Vercel Hobby terms](https://vercel.com/docs/plans/hobby) before inviting outside users.

| Area | Current behavior and pilot bound |
| --- | --- |
| Database | Messages and project records persist. Main timelines and threads fetch 30 at a time; project list 40, tasks 50, decisions 40, project activity 30 per page. Source context is fetched only for visible project rows. Activity uses 50 per page. Search returns at most 30 hits. |
| Navigation | Up to 100 workspaces, 200 channels, 50 recent DMs, and 200 workspace members are loaded for the shell/settings. Invitation RPC returns the 50 most recent links. The UI signals when a cap is reached. These caps are intended for small pilot teams; expanding beyond them needs pagination before onboarding larger organizations. |
| Storage/egress | Private attachments: three files/message, 10 MB/file, 15 MB/message, 72-hour lifetime. Image previews download only near the viewport; expired objects are denied immediately and cleaned hourly. Browser downloads still consume Storage egress. |
| Realtime | One private active-conversation topic and one private user Activity topic per open client. No per-row topics or polling loop. Refocus/reconnect fetches durable state. ID-only broadcasts reduce payloads, though a busy channel can still generate many messages. |
| Edge Functions | One `finalize-attachments` invocation per attachment message for trusted byte inspection, plus the existing hourly cleanup invocation and batch removal work. No separate queue or paid scheduler. Monitor failures and the pending/validating/deleting backlog. |
| Auth | GitHub OAuth only. Each unique signer consumes an Auth MAU. Invitation links are short-lived/use-capped, but creation and login attempts have no app-level distributed rate limiter. |

At audit time the Nova database measured **14 MB** with one workspace, three conversations, 28 messages, and three attachment rows. This is a point-in-time measurement, not a forecast. Review usage weekly during the pilot, especially database growth, Storage objects/egress, Realtime messages/connections, Edge Function invocations, and Auth MAU. If caps are reached, stop growth and add navigation before raising them. Do not silently increase list limits.

Phase 10 sends file bytes directly from the browser to Supabase Storage, so the 15 MB message limit no longer crosses the Vercel Function request-body limit. The trusted Supabase Edge Function downloads each stored file once for inspection; monitor its invocation, duration, and Storage egress usage. See the [deployment guide](phase10-deployment.md) before launch.
