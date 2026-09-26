export type PageQuery = string | string[] | undefined;

export function parsePage(value: PageQuery): number {
  if (typeof value !== "string" || !/^[1-9]\d{0,3}$/.test(value)) return 1;
  return Math.min(Number(value), 1000);
}

export function pageHref(path: string, pages: Record<string, number>, anchor?: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(pages)) if (value > 1) params.set(key, String(value));
  return `${path}${params.size ? `?${params}` : ""}${anchor ? `#${anchor}` : ""}`;
}
