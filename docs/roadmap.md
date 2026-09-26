# Phased delivery roadmap

Status: Phases 1–8 are user validated. Phase 9 hardening and Phase 10 direct-upload preparation are implemented and migrated to Nova. The final-domain launch, signed-in walkthrough, and full data restore drill remain.

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| 0 — Architecture | Repository audit; product/data/security plan; free-tier constraints; decisions | Approved |
| 1 — Foundation and app shell | Initialize Git and Next.js/TypeScript/Tailwind; pin versions and lockfile; lint/typecheck; design tokens and core primitives; desktop/mobile navigation, realistic empty/loading/error states; deployable static shell | Implemented |
| 2 — Auth and profiles | Supabase project/local config and migrations; OAuth/PKCE; SSR session refresh; profile creation/editing; signed-out routes | Implemented and user validated |
| 3 — Workspaces and invitations | Workspace creation; membership roles; invite-link creation/acceptance/revocation; switcher; settings | Implemented and user validated |
| 4 — Channels and durable messaging | Public/private channels; timeline pagination; composer; edit/delete; read cursor; active-topic Broadcast | Implemented and user validated in two browsers |
| 5 — Direct and group conversations | Unique 1:1 creation, group membership rules, conversation list | DM privacy and duplicate-creation race tests pass; sidebar stays usable with many conversations |
| 6 — Threads and social context | Thread panel, reactions, mentions | Implemented and user validated |
| 7 — Files, search and activity | Private attachments, cleanup, RLS-scoped full-text search, in-app notifications | Implemented and user validated, including 72-hour expiration |
| 8 — Project collaboration | Project home, small task list, decisions with links to source messages | Implemented and user validated |
| 9 — Polish and hardening | Accessibility audit, mobile refinement, usage/performance measurements, abuse bounds, policy review, retention/export | Code/SQL and clean local migration rebuild pass; signed-in accessibility and full restore drill pending |
| 10 — Production verification and deployment | Direct Storage uploads, trusted file inspection, GitHub/Vercel/Auth configuration, manual restore drill, final Vercel deploy if approved | Upload blocker removed; deployment guide prepared; final-domain auth and restore checks remain before launch |

## Phase status

Phase 4 replaced fixture channels and messages with persistent channel conversations. Phase 5 extended those tables and the shared timeline for direct/group conversations. Phase 6 added browser-local message times, individual mentions, one-level threads, and reactions. Phase 7 added private files with 72-hour expiration, workspace search, and durable Activity. Phase 8 added workspace projects, tasks, decisions, source-message links, and bounded project activity. The user validated Phases 1–8. Phase 9 added navigable project and Activity pages, mobile keyboard cleanup, a task RLS correction, and operational guides. Phase 10 replaced the upload route with direct Storage transfer and trusted Supabase inspection; no Vercel deployment has happened.

See [Phase 9 verification](phase9-verification.md), [security review](phase9-security.md), [free-tier envelope](phase9-free-tier.md), [recovery guide](phase9-recovery.md), and [Phase 10 deployment guide](phase10-deployment.md).

## Decision gates

- **Now:** run the Phase 9 signed-in keyboard/mobile walkthrough, manually verify direct file uploads in the existing localhost app, and restore a private Nova export into a disposable test target. The clean local migration rebuild and local export completed; a full data restore did not.
- **Before inviting external pilot users:** decide on SMTP or OAuth-only access, invitation limits, privacy notice and backup/export process.
- **Before commercial launch:** use hosting that permits commercial use; verify current provider limits and recovery options.
