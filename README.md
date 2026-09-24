# Nova — collaboration workspace

Phase 1 is a responsive, accessible frontend shell with isolated fixture data. It does not connect to Supabase and cannot send or store messages.

## Requirements

- Node.js 22.13 or newer
- pnpm 11.19.0 (`corepack enable` if needed)

## Run locally

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. The UI labels itself as a preview. Switch fixture channels, open the thread panel, and test the mobile navigation. Composer actions are intentionally unavailable until messaging is implemented.

### Windows Command Prompt with nvm

If `pnpm` is not recognized, select Node.js 24 and run pnpm through Corepack:

```bat
nvm use 24.13.1
cd /d C:\Projects\slack
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

If `nvm use` needs administrator permission, open Command Prompt as Administrator and rerun it. As a session-only alternative, use `set "PATH=C:\Users\Admin\AppData\Local\nvm\v24.13.1;%PATH%"` instead of `nvm use 24.13.1`. Then run the same `corepack pnpm` commands. Open the **Local** URL printed by Next.js; if port 3000 is occupied, Next.js may choose another port.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Project layout

```text
src/app/                 Next.js route, layout and global styles
src/components/ui/       small reusable primitives
src/features/workspace/  rail and workspace sidebar
src/features/conversation/ timeline, composer and detail panel
src/features/shell/      local preview state and responsive shell
src/fixtures/            Phase 1 sample content, isolated for removal
docs/                    approved architecture and roadmap
```

See [architecture](docs/architecture.md) and [roadmap](docs/roadmap.md). Phase 2 will introduce Supabase Auth and profiles only after approval.
