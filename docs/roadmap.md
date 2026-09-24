# Phased delivery roadmap

Status: proposed, for review before Phase 1. Each phase ends with a reviewable, working increment. No application code exists yet.

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| 0 — Architecture | Repository audit; product/data/security plan; free-tier constraints; decisions | Architecture reviewed, pilot scope and hosting/auth assumptions accepted |
| 1 — Foundation and app shell | Initialize Git and Next.js/TypeScript/Tailwind; pin versions and lockfile; lint/typecheck; design tokens and core primitives; desktop/mobile navigation, realistic empty/loading/error states; deployable static shell | Responsive shell is keyboard usable; visual states reviewed; no fake backend behavior presented as real |
| 2 — Auth and profiles | Supabase project/local config and migrations; OAuth/PKCE; SSR session refresh; profile creation/editing; signed-out routes | Sign-in/out and session expiry work; profile RLS tests pass; secrets remain server-side |
| 3 — Workspaces and invitations | Workspace creation; membership roles; invite-link creation/acceptance/revocation; switcher; settings | Cross-workspace isolation and invite race/expiry tests pass; no admin-only action relies on frontend checks |
| 4 — Channels and durable messaging | Public/private channels; timeline pagination; composer; edit/delete; read cursor; active-topic Broadcast; basic presence/typing if quota permits | Two users exchange durable messages; private outsider is denied by DB and Realtime; reconnect and pagination work |
| 5 — Direct and group conversations | Unique 1:1 creation, group membership rules, conversation list | DM privacy and duplicate-creation race tests pass; sidebar stays usable with many conversations |
| 6 — Threads and social context | Thread panel, reactions, mentions, bookmarks, pins if needed | Thread links and keyboard navigation work; notification fanout is bounded; authorization is inherited correctly |
| 7 — Files, search and activity | Private attachments, cleanup, RLS-scoped full-text search, in-app notifications | Unauthorized downloads/search hits are impossible in tests; upload failure recovery and quotas work |
| 8 — Project collaboration | Project home, small task list, decisions with links to source messages | Users can connect a conversation to a task or decision without duplicating messaging workflows |
| 9 — Polish and hardening | Accessibility audit, mobile refinement, usage/performance measurements, rate limits, policy review, retention/export | Critical flows pass keyboard/screen-reader checks; RLS/storage/Realtime negative tests pass; usage fits pilot envelope |
| 10 — Production verification and deployment | Preview and production envs, migrations, manual restore drill, observability, final Vercel deploy if eligible | Deployment and rollback documented; auth callbacks/invites tested on real domains; hosting terms and SMTP constraints resolved |

## Exactly what to build first after approval

Begin **Phase 1 only**: create the Git repository and pinned Next.js App Router scaffold, establish visual tokens and a small component set, and build the responsive workspace shell with one sample conversation screen, onboarding empty state, and loading/error variants. Use local sample data clearly marked as UI fixtures. Do not connect Supabase or claim that messaging works until Phase 2–4. Before merging Phase 1, run typecheck/lint/build and do a manual keyboard/mobile review.

Phase 2 starts only after an actual Supabase project and OAuth-provider choice exist. Schema migrations should be reviewed as a separate change before real user data is stored.

## Decision gates

- **Now:** approve architecture, pilot scope, and Phase 1 visual direction.
- **Before Phase 2:** choose OAuth providers, Supabase region and environment ownership.
- **Before inviting external pilot users:** decide on SMTP or OAuth-only access, invitation limits, privacy notice and backup/export process.
- **Before commercial launch:** use hosting that permits commercial use; verify current provider limits and recovery options.
