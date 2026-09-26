export function escapeParent(pathname: string): string | null {
  if (pathname === "/settings/profile" || pathname === "/onboarding") return "/";
  const match = pathname.match(/^\/w\/([a-z0-9][a-z0-9-]*)\/(.+)$/);
  if (!match) return null;
  const base = `/w/${match[1]}`;
  const suffix = match[2];
  if (suffix === "dm/new" || /^dm\/[^/]+$/.test(suffix)) return `${base}/dm`;
  if (/^projects\/[^/]+$/.test(suffix)) return `${base}/projects`;
  return base;
}

export function safeNovaPrevious(pathname: string | null): pathname is string {
  return !!pathname && pathname.startsWith("/") && !pathname.startsWith("//") &&
    !pathname.startsWith("/login") && !pathname.startsWith("/auth/");
}

export function canHandlePageEscape(event: {
  key: string; defaultPrevented: boolean; ctrlKey: boolean; metaKey: boolean;
  altKey: boolean; shiftKey: boolean; isComposing: boolean;
}, dialogOpen: boolean) {
  return event.key === "Escape" && !event.defaultPrevented && !dialogOpen && !event.isComposing &&
    !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}
