# Collaboration app architecture

Status: proposed, for review before Phase 1. Last checked: 2026-09-24.

## 1. Product boundary and first release

Build an original, desktop-first workspace for small teams to talk in channels and direct conversations, then connect messages to lightweight projects, tasks, and recorded decisions. The first usable release should cover sign-in, workspace membership, public and private channels, durable messages, and reliable unread state. A polished shell precedes backend features, but the shell must be built around realistic data and permission states. AI, GitHub integration, and email digests are optional additions; no core flow depends on them.

The initial deployment target is a **small, personal, non-commercial pilot**. A commercial startup deployment cannot assume Vercel Hobby eligibility. Supabase Free also provides no production availability or backup guarantee. Keep deployment portable so hosting can change without rewriting the domain model.

## 2. Application architecture

Use the current stable Next.js App Router release, TypeScript strict mode, Tailwind CSS, and a pinned lockfile when Phase 1 begins. Use Node.js 22 or newer: current Supabase JS libraries have dropped Node.js 20 support. Use React Server Components for authenticated page data and small Client Components for navigation, composer state, dialogs, and Realtime. Put Supabase Postgres/Auth/Realtime/Storage behind feature-specific data modules. Route handlers and server actions handle workflows, validation, and redirects; database RLS remains the final authorization boundary. Do not use a service/secret key for ordinary user requests.

Suggested structure once code exists:

```text
src/app/                         routes, layouts, loading/error states
src/features/{auth,workspaces,conversations,messages,...}/
  components/                    feature UI
  data/                          focused Supabase queries and mutations
  validation/                    input schemas
  types.ts                       domain-facing types
src/components/ui/               small design-system primitives
src/lib/supabase/                browser/server/proxy clients
src/lib/                       shared utilities with a real cross-feature use
supabase/migrations/             versioned schema, policies, indexes
docs/                            architecture, roadmap, later decisions
```

Keep generated database types separate from domain-facing types. Pin `@supabase/supabase-js` and `@supabase/ssr` only after checking their current API; `@supabase/ssr` is still described as beta. Do not add a state-management framework until local component state and server data prove insufficient. Use a small validation library for untrusted input, not a second authorization layer.

### Server/client boundary

- Server: initial workspace/conversation pages, permission-aware queries, invitation acceptance, mutations requiring transactions, metadata and redirects.
- Browser: composer, optimistic pending messages, keyboard navigation, active conversation Realtime, upload progress and accessible dialogs.
- Database: constraints, foreign keys, atomic membership/invitation operations, RLS and indexes. Security rules should not depend on UI state.
- Persistent data comes from Postgres. Realtime is a hint that data changed; after reconnect, refetch the authoritative timeline/read state.

## 3. Experience and navigation

Use a recognizable but original identity: a calm neutral canvas, one distinctive accent, compact but generous typography, and deliberate density. Define surface, border, text, accent, danger, focus, spacing, radius, and motion tokens once. Build reusable Button, IconButton, Input, Dialog, Menu, Tooltip, Avatar, Badge, Skeleton, EmptyState and Toast primitives with keyboard and screen-reader behavior.

Desktop: narrow workspace rail; workspace sidebar with Home, Activity, DMs, channel sections and later Projects; central conversation timeline/composer; contextual right panel for a thread, details or members. Search opens a global command-style dialog rather than occupying permanent navigation space. Keep a stable conversation header showing name, purpose, membership and actions. Treat unread markers and jump-to-latest as first-class navigation. Onboarding shows one clear next action at a time: create/join workspace, create a channel, invite by link, send a first message.

Tablet: collapse the workspace rail and make the detail panel an overlay. Phone: one pane at a time, with workspace/conversation lists and conversation view connected by predictable back navigation; composer stays visible above the keyboard. Respect safe areas, reduced motion, pointer/touch targets, high contrast and text zoom. Do not rely on hover for important actions.

Keyboard: skip link, visible focus, logical tab order, Escape closes overlays, Enter sends a message and Shift+Enter inserts a newline, with a discoverable setting if this is changed. Announce new messages carefully without reading a busy timeline aloud. Provide loading skeletons, retryable errors and confirmation for destructive actions. Use virtualized lists only if real message volume warrants them; start with cursor pagination and stable scroll anchoring.

### Route map

| Route | Purpose |
| --- | --- |
| `/` | Lightweight landing or redirect to last workspace |
| `/login`, `/auth/callback` | Sign-in and PKCE callback |
| `/onboarding` | Create workspace or accept invitation |
| `/invite/[token]` | Review and accept an invitation after sign-in |
| `/w/[workspaceSlug]` | Workspace home and catch-up overview |
| `/w/[workspaceSlug]/c/[conversationId]` | Channel timeline |
| `/w/[workspaceSlug]/dm/[conversationId]` | Direct/group timeline |
| `/w/[workspaceSlug]/activity` | Mentions and actionable notifications |
| `/w/[workspaceSlug]/saved` | Bookmarks, later phase |
| `/w/[workspaceSlug]/projects` and `/projects/[projectId]` | Project overview and detail, later phase |
| `/w/[workspaceSlug]/settings`, `/members` | Workspace controls, role-gated actions |
| `/settings/profile` | Personal profile and preferences |

Use opaque IDs for conversation URLs and a workspace slug for readability. Every page resolves and authorizes the workspace on the server; a slug or ID never implies access. Thread selection can use a URL search parameter so it is shareable and works with browser history.

### Main feature modules

1. Identity and profile.
2. Workspaces, membership, roles and invitations.
3. Conversations: public/private channels and direct/group conversations.
4. Messages, threads, reactions, mentions and bookmarks.
5. Activity, read state and notifications.
6. Files and search.
7. Projects, tasks and decisions.

## 4. Data model

Use one `conversations` table for timelines and one `messages` foreign key, avoiding duplicate channel/DM message code. Conversation `kind` is `public_channel`, `private_channel`, `direct`, or `group_direct`; kind-specific constraints and transactional creation logic enforce valid shapes. Public channels inherit workspace membership. Private channels and DMs require explicit `conversation_members` rows. Keep `conversation_reads` separate so opening every public channel does not create membership rows for every workspace user. Store role in `workspace_members`, never in editable profile metadata or stale JWT claims.

| Table | Key fields and purpose | Access rule |
| --- | --- | --- |
| `profiles` | `user_id` PK/FK to `auth.users`, display name, avatar path, status text | User edits self; workspace peers see limited public profile fields |
| `workspaces` | id, unique slug, name, creator, timestamps | Members read; owners/admins edit allowed fields |
| `workspace_members` | `(workspace_id,user_id)` PK, role, joined/removed timestamps | Current members see roster; privileged role changes are transactional |
| `workspace_invitations` | id, workspace, `token_hash` unique, optional bound email, intended role, expiry, max uses/uses, revocation | Admin/owner creates; acceptance uses a narrow validated database operation; never expose token hash |
| `conversations` | id, workspace, kind, optional channel slug/name/topic, creator, archive state, timestamps; direct pair identity if needed | Public: workspace members; private/direct: explicit members |
| `conversation_members` | `(conversation_id,user_id)` PK, joined/left timestamps | Only members see private/direct participant data; mutation rules vary by kind |
| `conversation_reads` | `(conversation_id,user_id)` PK, last-read message/time | Only the user writes their cursor, after authorization |
| `messages` | id, conversation FK, author FK, optional `parent_message_id`, body, created/edited/deleted timestamps | Readers of parent conversation; authors edit/delete own messages under policy |
| `message_reactions` | `(message_id,user_id,emoji)` PK | Conversation readers see; actor adds/removes self |
| `message_bookmarks` | `(message_id,user_id)` PK | Private to owner |
| `notifications` | id, recipient, workspace, actor, kind, target IDs, created/read timestamps | Private to recipient; generated from authorized server/database workflow |
| `message_attachments` | id, message FK, storage path, uploader, original name, MIME, size, created timestamp | Same read boundary as parent message; uploader/authorized role deletes |

Phase 8 adds `projects`, `project_members` only if project membership differs from workspace membership, `tasks`, and `decisions`. Tasks and decisions link to source `message_id` where useful, but remain first-class records so deleting a message does not silently destroy project state. Avoid a persistent `user_presence` table initially: online and typing state is ephemeral and does not belong in Postgres. If durable “last seen” is later needed, store a coarse timestamp with strict retention and opt-out.

### Relationships and invariants

```text
auth.users 1---1 profiles
workspaces 1---* workspace_members *---1 auth.users
workspaces 1---* conversations 1---* messages
conversations 1---* conversation_members *---1 auth.users
conversations 1---* conversation_reads *---1 auth.users
messages 1---* messages (thread replies via parent_message_id)
messages 1---* message_reactions / message_attachments
workspaces 1---* workspace_invitations / notifications / projects
```

- A reply's parent must belong to the same conversation; replies are one level deep in the UI, with the root message recorded explicitly or validated transactionally. Limit body length, attachment size/count, channel names and participant count in the database or verified operations.
- A direct conversation has exactly two distinct participants and is unique per workspace and unordered user pair. A group direct conversation has 3+ members. Use a transaction/RPC to create membership and identity atomically; enforce membership with constraints/triggers where plain constraints cannot express it.
- Workspace membership removal invalidates access to all its conversations. Ownership cannot be removed without transferring ownership or deleting the workspace. Private-channel membership must be in the same workspace.
- Soft-delete messages (`deleted_at`, cleared body/attachments as policy dictates) to keep thread references coherent; document retention and purge policy before launch.
- Index workspace slug; `(workspace_id,kind,updated_at)` conversations; `(conversation_id,created_at,id)` messages for cursor pagination; `(parent_message_id,created_at)` replies; `(user_id,...)` notification/read lookups; membership foreign-key sides. Add indexes based on measured queries, not every column.

## 5. Identity, invitations and authorization

Start with Supabase Auth using OAuth for a small pilot (GitHub and/or Google, subject to provider configuration). This avoids relying on Supabase's restricted default SMTP for arbitrary external email addresses. Use PKCE and cookie-based SSR via `@supabase/ssr`; refresh sessions in the Next.js proxy. Verify server-side claims/user as recommended by current Supabase docs, then let RLS enforce every data query and mutation. Never trust `getSession()` alone in server authorization. Email/password or magic-link onboarding requires a production-capable SMTP service and domain setup; revisit before offering it broadly. Keep auth provider separate from workspace membership.

Invitation flow: an owner/admin creates a random high-entropy token; only its hash is stored. Show the invitation link once and let the inviter share it. A visitor opens the link, signs in, sees workspace name and terms, then explicitly accepts. A database transaction checks token hash, expiry, revocation, email binding if set, remaining uses, and current membership; inserts membership idempotently and increments use count atomically. A reusable invite link has a configured use cap. A removed member cannot regain access via a stale token. Do not put authorization decisions in an editable profile or JWT `user_metadata`.

Role matrix, initial version:

| Action | Owner | Admin | Member |
| --- | :---: | :---: | :---: |
| Read public channels / send where not restricted | ✓ | ✓ | ✓ |
| Create public channel, invite members | ✓ | ✓ | Policy choice: no initially |
| Create private channel / manage its members | ✓ | ✓ | Creator may manage own if enabled later |
| Edit workspace settings / remove members | ✓ | ✓ | — |
| Transfer ownership / delete workspace | ✓ | — | — |
| Edit/delete own messages | ✓ | ✓ | ✓ |
| Moderate others' messages | ✓ | ✓ | — |

Channel-specific posting restrictions can be added later as explicit fields and policies. An admin still cannot read a private channel without membership by default; an exceptional recovery/moderation path would need separate, auditable design. DMs remain private even from workspace admins.

### RLS strategy

- Enable RLS on every exposed `public` table; explicitly grant Data API access where the new Supabase project settings require it. Default deny, then per-operation policies using current workspace membership and conversation visibility. `TO authenticated` alone is never sufficient.
- Use simple, index-supported membership predicates. For complex invite acceptance, owner transfer and unique DM creation, expose narrow transactional functions after a security review. Any `SECURITY DEFINER` function lives in a non-exposed schema, checks `auth.uid()` and all inputs, sets a safe search path, and has explicit `EXECUTE` grants. Prefer security-invoker code otherwise.
- `UPDATE` requires matching `SELECT`, `USING`, and `WITH CHECK`; prevent changing ownership, conversation IDs, authors and roles through ordinary update endpoints. Validate foreign-key scope to prevent cross-workspace references.
- Storage policies reflect the same conversation visibility. Realtime Broadcast/Presence topics have their own `realtime.messages` policies. Do not broadcast full private row content unless authorization has been proved for that exact topic.
- Add automated policy tests with at least owner, admin, member, nonmember, removed member, private-channel outsider and DM outsider identities. Test read, write, update, deletion, search, file download and Realtime join attempts.

## 6. Realtime, read state and notifications

Use one private Realtime topic for the **active conversation** per tab; add one user-scoped topic for notification/read-count hints only when that feature arrives. Use database-triggered Broadcast of small events (`message.created`, `message.updated`, `message.deleted`, reaction summary) after durable writes, with topic authorization tied to current membership. The client merges an event or refetches a page; it never treats an optimistic or broadcast-only event as a committed message. Presence and typing use short-lived Broadcast/Presence on the active topic, throttled and never written for each keystroke. Remove subscriptions when switching conversations. On reconnect, tab focus, or missed sequence, query Postgres again. Do not subscribe each sidebar row to Postgres Changes: Supabase recommends Broadcast for better scale, and many subscriptions consume free-tier quota.

There is a revocation caveat: Realtime topic permissions are cached on connection/JWT refresh. On membership removal, force affected clients to leave/reconnect when possible and use short token lifetime appropriate to UX; confidential operations still consult current RLS on durable data. Do not use Realtime alone to enforce instant revocation.

Unread state is based on each user's read cursor and latest visible message, updated with debounce when the timeline is actually viewed. The initial sidebar fetches a bounded aggregate rather than one query per conversation. Persist actionable notifications for mentions, replies and later assignments; store recipient and target IDs, then render content through authorized data reads. A user-scoped Realtime hint updates the activity badge. In-app notifications work without email or push infrastructure. Rate-limit notification fanout and avoid notifying the actor.

## 7. Files and search

Use one private Supabase Storage bucket for conversation attachments. A storage path encodes workspace/conversation/random object ID; the database attachment row is the discoverable reference and carries MIME, size and original filename. Upload only after checking conversation posting rights; storage RLS verifies scope again. Restrict type, size, count and total pilot quota; randomize object names and never trust browser MIME/filename. Serve via authenticated download or short-lived signed URL. Signed URLs remain usable until expiry even after membership revocation, so keep lifetimes short and avoid caching them publicly. Add deletion/cleanup for abandoned uploads and removed messages. Keep avatars separate; choose public avatars only if users explicitly understand they are public.

Start search with Postgres full-text search on message bodies and a GIN index, scoped through RLS to conversations the user may read. Limit result count and require pagination; filter by workspace and optionally conversation/date/author. Search must not leak private-channel or DM snippets through a privileged function, count, or autocomplete. No external search service is required. Revisit stemming/language support and index growth with real usage.

## 8. Free-tier operating envelope and risks

As of 2026-09-24, Supabase Free lists 500 MB database, 1 GB file storage, 5 GB egress plus 5 GB cached egress, 50,000 monthly active users, 200 peak Realtime connections and 2 million Realtime messages/month; free projects pause after one week of inactivity and have no automatic backups. These figures are plan limits, not capacity guarantees for this app. Establish pilot quotas, alert on usage in provider dashboards, cap upload size and retention, paginate reads, keep payloads small, and test a restore from a periodic manual export. Re-check limits before launch. [Supabase pricing](https://supabase.com/pricing)

Vercel Hobby is free but restricted to personal, non-commercial use; exceeding usage can pause the application. Its runtime limits can change, so keep request handlers short and avoid server-side long polling, queues and background workers. Browser-to-Supabase Realtime carries live traffic; Next.js handles pages and bounded mutations. Commercial use needs an eligible paid plan or another host, even if traffic stays below quota. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Vercel terms](https://vercel.com/legal/terms)

Supabase's default Auth SMTP currently delivers only to authorized project-team addresses and is not a production email service. An OAuth-first pilot plus manually shared invite links can run without paid email infrastructure; broad email sign-up/invites require a suitable SMTP provider, potentially with a free allowance but not guaranteed $0 at scale. Custom email templates also changed for new Free projects in June 2026. [Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp) · [Supabase breaking changes](https://supabase.com/changelog?types=breaking-change)

Other launch risks: no built-in free backup SLA; abuse/spam and API floods; bot-created workspaces; oversized files and egress; invitation token leakage; cross-tenant data exposure through RLS/Realtime/search/storage; stale membership on open WebSocket topics; XSS from rich text and filenames; CSRF/session mistakes; and incomplete data deletion. Begin with plain text plus safely rendered links, strict input limits, RLS integration tests, audit of privileged functions, and server-side rate limiting appropriate to the available platform. No paid Redis, queue or WebSocket provider is required. An optional future GitHub integration must use least-scope OAuth and encrypted server-side credentials, and should never block core messaging.

## 9. Open product decisions before implementation

1. Pilot identity/brand and visual direction; avoid implying affiliation with Slack.
2. First pilot audience and auth providers (GitHub, Google, or both); external email auth waits for SMTP choice.
3. Whether the initial deployment is strictly personal/non-commercial; this determines Vercel Hobby eligibility.
4. Initial invite policy: owner/admin only, token expiry and max uses, whether links bind to an email address.
5. Message edit/delete window, moderation policy, file limits and retention/deletion behavior.
6. Regional data location and privacy expectations for initial users.

## Reference docs checked

- [Supabase changelog, breaking changes](https://supabase.com/changelog?types=breaking-change) — new Data API exposure default, Realtime schema restrictions and Free email-template change.
- [Supabase Next.js SSR guidance](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs) and [SSR overview](https://supabase.com/docs/guides/auth/server-side).
- [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization) and [database changes guidance](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes).
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), and [full-text search](https://supabase.com/docs/guides/database/full-text-search).
- [Supabase pricing](https://supabase.com/pricing), [Vercel Hobby](https://vercel.com/docs/plans/hobby), and [Vercel terms](https://vercel.com/legal/terms).
