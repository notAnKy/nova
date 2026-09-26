export function normalizeChannelSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export function validateChannelInput(nameInput: FormDataEntryValue | null, slugInput: FormDataEntryValue | null,
  topicInput: FormDataEntryValue | null, kindInput: FormDataEntryValue | null) {
  const name = typeof nameInput === "string" ? nameInput.trim() : "";
  const slug = typeof slugInput === "string" ? normalizeChannelSlug(slugInput) : "";
  const topic = typeof topicInput === "string" ? topicInput.trim() : "";
  const kind = kindInput === "private_channel" ? "private_channel" : kindInput === "public_channel" ? "public_channel" : null;
  if (name.length < 2 || name.length > 80) return { error: "Channel name must be 2 to 80 characters." };
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug) || slug.includes("--"))
    return { error: "Use a channel URL of 3 to 48 letters, numbers, or single hyphens." };
  if (topic.length > 500) return { error: "Topic must be at most 500 characters." };
  if (!kind) return { error: "Choose public or private visibility." };
  return { name, slug, topic, kind };
}
