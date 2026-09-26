# Phase 8: projects, tasks, decisions, and source links

Nova project: `bowkdnxhnqdncohnsgls`. Phase 8 migrations
`20260925191444` through `20260925194025` are applied. No dashboard setting,
new paid service, new scheduler, or project Realtime subscription is needed.

## Data and permission model

| Record | Scope and fields | Read | Write |
| --- | --- | --- | --- |
| `projects` | Workspace ID, name, stable slug, description, active/archived, creator, UTC timestamps | Current workspace members, including archived records | Owner/admin create; project creator or current owner/admin edit/archive |
| `project_tasks` | Project ID, title, description, todo/in progress/done, optional assignee/due/source, creator, UTC timestamps | Current members of the project's workspace | Members create in active projects; creator, current assignee, or owner/admin edit active tasks |
| `project_decisions` | Project ID, title, body, optional source ID, creator, decided time | Current members of the project's workspace | Members record in active projects; V1 decisions are append-only |
| `project_activity` | Project ID, actor, event, optional task/decision ID, time | Current members of the project's workspace | Database triggers only; no client insert/update |

Every table has RLS and explicit grants. A source ID is accepted only when the
creator can read that live message and it belongs to the project's workspace.
Project item text is intentionally authored; message text is never copied
automatically. Project pages resolve source context with ordinary message and
conversation RLS. Deleted, inaccessible private-channel, or unrelated DM
sources display **Source message unavailable**. Decisions and tasks survive
source deletion. Removing a workspace member clears their task assignments,
while preserving historical creator/actor IDs.

## Automated checks

Run [the transactional Phase 8 suite](../supabase/tests/phase8_projects_tasks_decisions.sql)
in Nova's SQL Editor as a privileged session. It rolls back synthetic users and
records. It checks owner/admin creation, member and outsider reads, archived
visibility, member creation denial, assignment membership, status permissions,
cross-workspace and inaccessible source rejection, private DM source privacy,
decision survival after source deletion, departed-assignee clearing, activity,
grants, and removal revocation. Run Phase 3–7 SQL suites afterward, plus
`node supabase/tests/phase4_realtime_anon.mjs`,
`node --experimental-strip-types tests/phase7_attachment_validation.mjs`,
`node tests/phase7_attachment_cleanup.mjs`, `corepack pnpm lint`,
`corepack pnpm typecheck`, and `corepack pnpm build`.

## Signed-in browser walkthrough

Use an owner, an ordinary member, and an admin who is outside a private
channel/DM. Use another workspace member to test assignment.

1. Open **Projects** from the workspace sidebar. As owner/admin, create a
   project with a readable slug and description. Confirm its list row and
   `/w/[workspaceSlug]/projects/[projectSlug]` URL. A member can read it but
   cannot create a project. Edit name/description and archive/reactivate;
   archived records remain readable and reject new tasks/decisions.
2. In the project, create a task with and without an assignee and due date.
   Move it through To do, In progress, Done, and reopen. Confirm the creator,
   assignee, and owner/admin can edit it; another member cannot. Remove an
   assigned member and confirm the assignment becomes **Unassigned**.
3. Record a decision manually. Confirm title, body, creator, local decided
   time, and recent project Activity. Project activity should show meaningful
   creation/status/assignment events without message content.
4. In a public channel, use a message's **Create task or decision** action.
   Choose a project and enter deliberate item text. Confirm the source link
   opens the conversation and highlights the message. Repeat for a thread
   reply; it should open the thread before highlighting the reply.
5. Link an item to a private-channel or DM message. A participant should see
   a working source link. A workspace member/admin outside that conversation
   should see **Source message unavailable**, without message text or channel
   context. Delete the source message and confirm the decision remains and
   its source becomes unavailable.
6. Open the project list, task/decision forms, source links, and activity at
   phone width. Verify readable rows, no horizontal overflow, keyboard form
   access, and that the mobile workspace navigation still opens/closes.

## Deliberate V1 limits

Projects use normal page refresh after mutations, with no additional Realtime
topics. The existing message search remains message-only. Project assignment
and completion do not create in-app notifications; the Project Activity section
holds recent project events instead. No drag-and-drop, sprints, time tracking,
AI summaries, repository integration, or advanced analytics. Project/task/
decision/activity reads are paged in Phase 9 at 40/50/40/30 rows, with older
rows reachable through next/previous links. Decisions are append-only
in V1 to keep the outcome history stable. No email or push fanout is added.
