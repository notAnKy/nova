import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/features/profile/profile";
import type { Channel } from "@/features/channels/types";

export type DirectConversation = Omit<Channel, "kind" | "unread"> & {
  kind: "direct" | "group_direct";
  participants: Profile[];
  displayName: string;
  unread: boolean;
};

type DirectRow = Omit<DirectConversation, "participants" | "displayName" | "unread">;
const fields = "id,workspace_id,kind,name,slug,topic,created_by,created_at,updated_at,last_message_at,last_message_id";
const kinds = ["direct", "group_direct"];

async function hydrate(db: SupabaseClient, rows: DirectRow[], userId: string): Promise<DirectConversation[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const workspaceId = rows[0].workspace_id;
  const [membersResult, readsResult] = await Promise.all([
    db.from("conversation_members").select("conversation_id,user_id").in("conversation_id", ids),
    db.from("conversation_reads").select("conversation_id,last_read_created_at,last_read_id")
      .eq("workspace_id", workspaceId).eq("user_id", userId).in("conversation_id", ids),
  ]);
  if (membersResult.error || readsResult.error) throw new Error("We couldn’t load direct messages.");
  const members = membersResult.data ?? [];
  const profileIds = [...new Set(members.map((member) => member.user_id))];
  const profilesResult = profileIds.length
    ? await db.from("profiles").select("user_id,display_name,status_text,avatar_url").in("user_id", profileIds)
    : { data: [], error: null };
  if (profilesResult.error) throw new Error("We couldn’t load direct message participants.");
  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.user_id, profile as Profile]));
  const byConversation = new Map<string, Profile[]>();
  for (const member of members) {
    const list = byConversation.get(member.conversation_id) ?? [];
    list.push(profiles.get(member.user_id) ?? {
      user_id: member.user_id, display_name: "Workspace member", status_text: "", avatar_url: null,
    });
    byConversation.set(member.conversation_id, list);
  }
  const reads = new Map((readsResult.data ?? []).map((read) => [read.conversation_id, read]));
  return rows.map((row) => {
    const participants = byConversation.get(row.id) ?? [];
    const others = participants.filter((person) => person.user_id !== userId)
      .sort((a, b) => a.display_name.localeCompare(b.display_name) || a.user_id.localeCompare(b.user_id));
    const displayName = others.map((person) => person.display_name).join(", ") || "Direct message";
    const read = reads.get(row.id);
    const unread = !!row.last_message_at && (!read
      || row.last_message_at > read.last_read_created_at
      || (row.last_message_at === read.last_read_created_at && (row.last_message_id ?? "") > read.last_read_id));
    return { ...row, participants, displayName, unread };
  });
}

export async function listDirectConversations(db: SupabaseClient, workspaceId: string, userId: string) {
  const { data, error } = await db.from("conversations").select(fields)
    .eq("workspace_id", workspaceId).in("kind", kinds)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(50);
  if (error) throw new Error("We couldn’t load direct messages.");
  return hydrate(db, (data ?? []) as DirectRow[], userId);
}

export async function getDirectConversation(db: SupabaseClient, workspaceId: string, conversationId: string, userId: string) {
  const { data, error } = await db.from("conversations").select(fields)
    .eq("workspace_id", workspaceId).eq("id", conversationId).in("kind", kinds).maybeSingle();
  if (error) throw new Error("We couldn’t load this direct message.");
  if (!data) return null;
  return (await hydrate(db, [data as DirectRow], userId))[0] ?? null;
}
