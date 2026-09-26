export const WORKSPACE_NAME_MIN = 2;
export const WORKSPACE_NAME_MAX = 80;
export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

export function normalizeSlug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48).replace(/-$/g, "");
}

export function validateWorkspaceInput(nameValue: FormDataEntryValue | null, slugValue: FormDataEntryValue | null) {
  if (typeof nameValue !== "string" || typeof slugValue !== "string") return { error: "Enter a workspace name and URL slug." };
  const name = nameValue.trim();
  const slug = normalizeSlug(slugValue);
  if (name.length < WORKSPACE_NAME_MIN || name.length > WORKSPACE_NAME_MAX) return { error: "Workspace name must be 2 to 80 characters." };
  if (!WORKSPACE_SLUG_PATTERN.test(slug) || slug.includes("--")) return { error: "Use a URL slug of 3 to 48 letters, numbers, or single hyphens." };
  return { name, slug };
}
