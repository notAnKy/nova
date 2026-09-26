import type { SidebarView } from "@/features/workspace/workspace-sidebar";

export type PendingNavigation = { href: string; view: SidebarView | null; conversationId?: string };

export function workspaceView(pathname: string, queryView: string | null, workspaceSlug: string): SidebarView | null {
  const base = `/w/${workspaceSlug}`;
  if (pathname === base) return queryView === "activity" || queryView === "search" ? queryView : "home";
  if (pathname === `${base}/dm`) return "direct";
  if (pathname.startsWith(`${base}/dm/`) || pathname.startsWith(`${base}/c/`)) return "conversation";
  if (pathname === `${base}/projects` || pathname.startsWith(`${base}/projects/`)) return "projects";
  if (pathname === `${base}/settings`) return "settings";
  return null;
}

export function navigationPresentation({ pathname, query, renderedPath, workspaceSlug, activeConversationId,
  channels, pending, transitionPending }: {
    pathname: string; query: string; renderedPath: string; workspaceSlug: string;
    activeConversationId: string | null; channels: { id: string; slug: string }[];
    pending: PendingNavigation | null; transitionPending: boolean;
  }) {
  const location = `${pathname}${query ? `?${query}` : ""}`;
  // The URL may advance before the server component carrying the new page arrives.
  const routeReady = pathname === renderedPath;
  const pendingPath = pending?.href.split("?")[0];
  const pendingVisible = !!pending && (routeReady
    ? transitionPending && location !== pending.href
    : transitionPending || pathname === pendingPath);
  const view = pendingVisible ? pending.view : workspaceView(pathname, new URLSearchParams(query).get("view"), workspaceSlug);
  const base = `/w/${workspaceSlug}`;
  let selectedConversationId = "";
  if (view === "conversation") {
    if (pendingVisible && pending?.conversationId) selectedConversationId = pending.conversationId;
    else if (pathname.startsWith(`${base}/dm/`)) selectedConversationId = pathname.slice(`${base}/dm/`.length);
    else if (pathname.startsWith(`${base}/c/`)) {
      const slug = pathname.slice(`${base}/c/`.length);
      selectedConversationId = channels.find((item) => item.slug === slug)?.id ?? "";
    } else if (routeReady) selectedConversationId = activeConversationId ?? "";
  }
  return { view, selectedConversationId, pendingConversationId: pendingVisible ? pending?.conversationId ?? null : null,
    showSkeleton: !routeReady || pendingVisible };
}
