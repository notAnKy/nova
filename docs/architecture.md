# Collaboration app architecture

Status: architecture approved; Phases 1–8 user validated. Phase 9 hardening and Phase 10 direct-upload preparation are migrated to Nova. The production Vercel URL, final-domain OAuth checks, and full data restore drill remain. Last checked: 2026-09-26.

## Phase 9 beta hardening

Project lists and project task/decision/activity views request bounded, ordered pages with explicit next/previous navigation. Activity uses 50-row pages; existing message/thread cursor paging and 30-hit search remain. Workspace, channel, DM, member, and invitation reads have explicit pilot bounds documented in [the free-tier envelope](phase9-free-tier.md). The mobile drawer is hidden from keyboard focus while closed. Phase 9 capped multipart upload request bodies; Phase 10 removed that route after switching to direct Storage uploads.

The task UPDATE RLS policy now qualifies the task's `created_by`; previously a subquery could use the project's `created_by` and let a demoted project creator edit someone else's task. The additive migration and focused regression preserve task creator, assignee, and current owner/admin access. See [security review](phase9-security.md), [recovery guide](phase9-recovery.md), [Phase 10 deployment guide](phase10-deployment.md), and [signed-in guide](phase9-verification.md). No Vercel deployment has started.

## Phase 7 files, search, and Activity

`conversation-attachments` is a private Storage bucket restricted to 10 MB per object and the accepted MIME list. The browser sends bytes directly to Storage with its Supabase session, while the trusted Edge Function checks the stored bytes. A message can have at most three files and 15 MB combined. `message_attachments` stores an opaque UUID path under workspace/conversation UUIDs, original name, MIME, size, uploader, UTC `expires_at`, and a pending/validating/ready/deleting/expired state. Reservation and service-only finalization enforce ownership and limits; Storage object policies require a reservation to upload and current conversation access plus a future expiration to download. The table exposes ready or expired placeholder metadata on live messages to current readers. No signed URLs or service credentials reach the browser. Threads use this same path.

On upload or inspection failure, the browser or Edge Function removes completed objects through the Storage API and soft-deletes the new message. On normal soft deletion, a trigger hides metadata and queues objects for removal. The uploader's browser retries queued work; an hourly Supabase Cron job calls a deployed Edge Function with a database-generated private token to remove abandoned pending/validating/deleting objects and expired files. The worker's hosted service credential stays inside the function. Direct SQL deletion of `storage.objects` is intentionally avoided because it does not remove the underlying file. The cleanup schedule is Nova-specific in its migration URL.

`messages.search_vector` is a stored simple-language `tsvector` with a GIN index only for nondeleted messages. `search_messages` is `SECURITY INVOKER`, workspace-filtered, limited to 30 results, and inherits `messages` and `conversations` RLS. It includes replies. The UI resolves mention tokens to current profile names and uses a target message query parameter; a reply result opens its thread.

`notifications` stores references and read state, not a copy of private message bodies. After message insert or edit, a trigger creates idempotent mention rows for valid non-self recipients. A new reply notifies its root author unless they wrote the reply. Recipient membership is checked at generation, and notification SELECT/UPDATE policies check current source access, so loss of access hides old activity. One private `activity:<user UUID>` Broadcast topic carries only workspace-scoped refetch hints. Activity and unread badge use bounded reads; durable rows remain authoritative. See [Phase 7 verification](phase7-files-search-activity-tests.md).

## Phase 6 local time and individual mentions

Postgres continues to store `timestamptz` in UTC. The shared message item renders a browser-local timestamp after hydration, using `Intl.DateTimeFormat` without a fixed timezone. Today shows time; older dates include month/day and a year when needed. A full local datetime is available on the time element. Rendering the same placeholder on the server and initial client pass avoids hydration differences across timezones.

Mention-bearing message bodies store canonical `@[user-uuid]` tokens. The composer and edit field show display names, track selected mention spans, and encode them to tokens only when sending. The timeline resolves tokens through a bounded profile lookup and renders current display names with restrained emphasis, so profile rename does not sever identity. Plain `@` text, including email addresses and special words, stays plain unless a user token is selected. The browser never displays the stored UUID token as message text.

The `message_mentions` relation has one row per distinct mentioned user/message and an index for recipient lookups. It has RLS enabled and no `anon` or `authenticated` table grant or policy; clients read the already-authorized message body instead. An after-insert/update trigger in `nova_private` parses tokens, validates each target against current workspace membership for public channels or explicit conversation membership for private channels and DMs, and replaces metadata in the same transaction. Soft deletion clears both the body and mention rows. Existing message RLS and owner-only editing remain authoritative. The existing ID-only message broadcasts and refetch path carry mention edits. See [Phase 6 part 1 verification](phase6-time-mentions-tests.md).

## Phase 6 threads and reactions

Replies reuse `messages` with nullable `parent_message_id`. A composite foreign key enforces the same conversation, and an insert trigger rejects reply-to-reply nesting. The main message RPC pages only roots; a separate bounded reply RPC pages the open thread. A bulk summary RPC gives reply counts and latest reply time for loaded roots. A soft-deleted root remains a placeholder with its reply references intact. Replies do not advance the existing top-level conversation read cursor.

`message_reactions` has a unique `(message_id,user_id,emoji)` key and an indexed user lookup. RLS allows current readers to see reactions, users to add only their own curated emoji to a visible nondeleted message, and users to remove only their own row. Soft deletion removes reactions. Profiles, mention rendering, timestamps, and author edit/delete rules are reused for replies. One private Broadcast subscription per active conversation carries small message and `reaction.changed` notices, followed by authorized refetch; no subscription is created per thread or message. See [Phase 6 part 2 verification](phase6-threads-reactions-tests.md).

## Phase 5 direct and group conversations

`public.conversations` gains `direct` and `group_direct` kinds. A direct row stores its ordered pair of user IDs in `direct_user_low` and `direct_user_high`; a partial unique index on workspace and pair prevents duplicate 1:1 conversations under concurrent RPC calls. Both IDs reference current workspace membership. A transactional `create_or_get_direct` RPC checks the caller and recipient, inserts the row with `ON CONFLICT DO NOTHING`, and returns the existing pair when present. `create_group_direct` checks 2–11 distinct recipients, includes the creator, and inserts all memberships in the same transaction. Names and URLs contain no participant names or email addresses; the UI derives labels from visible member profiles.

DM memberships are fixed after creation. The existing `conversation_members` foreign keys keep participants inside the workspace; clients still have no direct insert grant. A deferred constraint trigger checks exactly two members in a direct and at least three including the creator in a group. Direct member rows are constrained to the stored pair. Losing a workspace member removes their DM membership; a direct with fewer than two members or group with fewer than three or without its creator is removed. A channel retains its existing last-member rule. Neither workspace admins nor owners bypass DM membership.

The Phase 4 message table, pagination RPC, read cursor, RLS access helper, ID-only `channel:<conversation UUID>` Broadcast topic, and browser timeline are reused for DMs. The internal topic prefix remains `channel:` for compatibility; it carries opaque conversation IDs and the policy evaluates current membership for every conversation kind. A server-authorized `/w/[workspaceSlug]/dm/[conversationId]` route uses an opaque UUID, while a bounded 50-row sidebar query bulk-loads memberships and profiles. The Phase 5 migration is applied to Nova; its transactional SQL test and Phase 3/4 regressions passed.

## Current Phase 4 implementation

`public.conversations` holds only `public_channel` and `private_channel` rows in Phase 4, with a unique slug per workspace. Public-channel access inherits workspace membership. `public.conversation_members` records explicit private-channel membership and has composite foreign keys to both the channel and current workspace membership. A private channel's creator is added atomically. The last private member cannot be removed, including through workspace removal, to prevent an orphaned channel.

`public.messages` stores plain text, author, immutable channel/creation fields, and edit/delete timestamps. Authenticated users get column-scoped INSERT and UPDATE grants; RLS checks current channel access and message ownership. A trigger clears deleted bodies and protects identity fields. There is no table DELETE grant. `public.conversation_reads` stores a monotonic message cursor per user/channel; the sidebar uses it for a basic unread indicator. Its writes go through `mark_channel_read`.

The narrow RPCs are `create_channel`, `add_private_channel_member`, `remove_private_channel_member`, `mark_channel_read`, and the security-invoker `list_channel_messages` cursor query. Role and access helpers live in the unexposed `nova_private` schema. The private Realtime topic is `channel:<conversation UUID>`; a database trigger broadcasts only message and channel IDs for create/edit/delete events. `realtime.messages` SELECT policy checks live channel access on join. The client subscribes only to its active channel, fetches authoritative rows for events, merges by ID and edit version, and refetches on reconnect or tab focus. Realtime policy caching means an already-open socket may retain access until reconnect/JWT refresh after removal; durable reads and writes are immediately denied by current RLS. See [Phase 4 verification](channel-phase4-tests.md).

## Current Phase 3 implementation

`public.workspaces` stores ID, unique normalized slug, name, creator, and timestamps. `public.workspace_members` stores one current row per user/workspace with owner, admin, or member role. `public.workspace_invitations` stores a SHA-256 token hash, role, expiry, use cap and count, revocation, creator, and timestamps. All three tables have RLS. Only members may select workspaces and rosters; invitations have no direct client table grant or policy. All writes use authenticated public RPC wrappers around `nova_private` functions with current `auth.uid()` and role checks. The private schema is not exposed by the Data API; definer functions use an empty search path and explicit grants.

The RPCs are `create_workspace` (atomically add owner), `update_workspace_settings`, `change_workspace_member_role`, `remove_workspace_member`, `leave_workspace`, `create_workspace_invitation`, `list_workspace_invitations`, `revoke_workspace_invitation`, `preview_workspace_invitation`, and `accept_workspace_invitation`. Invitation creation returns the raw token once; only its hash persists. Accept/revoke/removal lock the workspace row and acceptance locks the invitation row, serializing use and revocation. Removal revokes outstanding links. An owner-protection trigger and role checks prevent an ownerless workspace. Ownership transfer and workspace deletion are deferred, so an owner cannot leave or be removed in Phase 3.

The workspace routes are `/onboarding`, `/w/[workspaceSlug]`, `/w/[workspaceSlug]/settings`, and `/invite/[token]`. The slug resolves under member-scoped RLS; a nonmember gets a not-found response. Signed-out invitation visitors return to the invitation after GitHub OAuth and explicitly click Join. Phase 4 adds `/w/[workspaceSlug]/channels/new` and `/w/[workspaceSlug]/c/[channelSlug]`. [Workspace verification](workspace-phase3-tests.md).

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
projects 1---* project_tasks / project_decisions / project_activity
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

Phase 10 implementation: the browser creates a message, reserves each exact UUID path through an authenticated RPC, and sends bytes directly to private Supabase Storage with its own JWT. Storage RLS checks the reservation and current conversation access. A JWT-protected Supabase Edge Function freezes all reservations as `validating`, downloads the objects with its hosted service credential, checks bytes and sizes, then calls a service-only RPC to mark them `ready` and assign a 72-hour expiry. Browser roles cannot execute finalization or mutate an object while validation is in progress. The existing hourly Storage API worker cleans stale `pending`/`validating`, deleted, and expired files. No attachment body passes through Next.js or Vercel.

Use one private Supabase Storage bucket for conversation attachments. A storage path encodes workspace/conversation/random object ID; the database attachment row is the discoverable reference and carries MIME, size and original filename. Upload only after checking conversation posting rights; storage RLS verifies scope again. Restrict type, size, count and total pilot quota; randomize object names and never trust browser MIME/filename. Serve via authenticated download or short-lived signed URL. Signed URLs remain usable until expiry even after membership revocation, so keep lifetimes short and avoid caching them publicly. Add deletion/cleanup for abandoned uploads and removed messages. Keep avatars separate; choose public avatars only if users explicitly understand they are public.

Start search with Postgres full-text search on message bodies and a GIN index, scoped through RLS to conversations the user may read. Limit result count and require pagination; filter by workspace and optionally conversation/date/author. Search must not leak private-channel or DM snippets through a privileged function, count, or autocomplete. No external search service is required. Revisit stemming/language support and index growth with real usage.

### Phase 8 project layer

`projects` are workspace scoped and use stable workspace-local slugs. All current workspace members can read active and archived projects. Only an owner/admin creates a project; its creator or a current owner/admin edits metadata and archives/reactivates it. No project-specific membership table exists.

`project_tasks` have `todo`, `in_progress`, and `done` states, optional current-member assignee and due time, and optional source message ID. Members create tasks in active projects. The task creator, current assignee, or workspace owner/admin edits active tasks. A membership deletion clears assignments in the same workspace; creator IDs remain historical. `project_decisions` are append-only for V1: any member can record one in an active project, and subsequent message deletion does not remove it. Decision title/body are deliberate project text entered by the user, not an automatic private-message copy.

The invoker validation trigger checks every new source ID against the caller's message/conversation RLS and same workspace before accepting it. Source IDs persist if a message is hard-deleted; the project page fetches current source context separately through ordinary RLS and excludes soft-deleted messages. An unavailable private/deleted source renders a placeholder rather than conversation metadata or text. The existing conversation URL accepts `thread` and `message` parameters to open and highlight a source. `project_activity` stores only bounded event metadata for project/task/decision creation, task status, and assignment; it contains no message body. Project pages read at most 100 projects, 150 tasks, 100 decisions, and 50 activity events per request. Realtime and project search are deferred to avoid extra Free-tier fanout and indexing.

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
