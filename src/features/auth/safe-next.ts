export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const url = new URL(value, "http://nova.local");
    if (url.origin !== "http://nova.local") return "/";
    const path = url.pathname;
    if (path === "/" || path === "/onboarding" || path === "/settings/profile"
      || /^\/w\/[a-z0-9][a-z0-9-]{1,46}[a-z0-9](?:\/settings|\/channels\/new|\/c\/[a-z0-9][a-z0-9-]{1,46}[a-z0-9])?$/.test(path)
      || /^\/invite\/[0-9a-f]{64}$/.test(path)) {
      return path + url.search;
    }
  } catch { /* Invalid destinations return home. */ }
  return "/";
}
