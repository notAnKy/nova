import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/features/profile/profile";
import { mentionIds } from "@/features/conversation/mentions";
import type { Channel, ChannelMessage, MessageAttachment, MessageCursor, MessagePage } from "./types";

const channelFields = "id,workspace_id,kind,name,slug,topic,created_by,created_at,updated_at,last_message_at,last_message_id";
const messageFields = "id,conversation_id,author_id,body,created_at,edited_at,deleted_at,parent_message_id";
export const PAGE_SIZE = 30;

export async function listChannels(db: SupabaseClient, workspaceId: string, userId: string): Promise<Channel[]> {
  const { data, error } = await db.from("conversations").select(channelFields)
    .eq("workspace_id", workspaceId).in("kind", ["public_channel", "private_channel"])
    .order("created_at", { ascending: true }).limit(200);
  if (error) throw new Error("We couldn’t load channels.");
  const channels = (data ?? []) as Channel[];
  if (!channels.length) return channels;
  const { data: reads, error: readError } = await db.from("conversation_reads")
    .select("conversation_id,last_read_created_at,last_read_id").eq("workspace_id", workspaceId)
    .eq("user_id", userId).in("conversation_id", channels.map((item) => item.id));
  if (readError) throw new Error("We couldn’t load channel read state.");
  const byId = new Map((reads ?? []).map((read) => [read.conversation_id, read]));
  return channels.map((channel) => {
    const read = byId.get(channel.id);
    return { ...channel, unread: !!channel.last_message_at && (!read
      || channel.last_message_at > read.last_read_created_at
      || (channel.last_message_at === read.last_read_created_at && (channel.last_message_id ?? "") > read.last_read_id)) };
  });
}

export async function getChannelBySlug(db: SupabaseClient, workspaceId: string, slug: string): Promise<Channel | null> {
  const { data, error } = await db.from("conversations").select(channelFields)
    .eq("workspace_id", workspaceId).eq("slug", slug)
    .in("kind", ["public_channel", "private_channel"]).maybeSingle();
  if (error) throw new Error("We couldn’t load this channel.");
  return data as Channel | null;
}

type BareMessage = Omit<ChannelMessage, "profile" | "mentionProfiles" | "replyCount" | "latestReplyAt" | "reactions" | "attachments">;
type ThreadSummary = { root_id: string; reply_count: number; latest_reply_at: string | null };

async function withProfiles(db: SupabaseClient, rows: BareMessage[]): Promise<ChannelMessage[]> {
  const ids = [...new Set(rows.flatMap((row) => [row.author_id, ...mentionIds(row.body)]))];
  if (!ids.length) return [];
  const profiles = new Map<string, Profile>();
  for (let start = 0; start < ids.length; start += 80) {
    const { data, error } = await db.from("profiles").select("user_id,display_name,status_text,avatar_url")
      .in("user_id", ids.slice(start, start + 80));
    if (error) throw new Error("We couldn’t load message authors.");
    for (const profile of data ?? []) profiles.set(profile.user_id, profile as Profile);
  }
  const messageIds = rows.map((row) => row.id);
  const rootIds = rows.filter((row) => !row.parent_message_id).map((row) => row.id);
  const [threadResult, reactionResult, attachmentResult] = await Promise.all([
    rootIds.length ? db.rpc("list_thread_summaries", {
      p_conversation_id: rows[0].conversation_id, p_root_ids: rootIds,
    }) : Promise.resolve({ data: [], error: null }),
    db.from("message_reactions").select("message_id,user_id,emoji").in("message_id", messageIds),
    db.from("message_attachments").select("id,message_id,storage_path,original_name,mime_type,size_bytes,state,expires_at")
      .in("message_id", messageIds),
  ]);
  if (threadResult.error || reactionResult.error || attachmentResult.error) throw new Error("We couldn’t load message activity.");
  const threads = new Map<string, ThreadSummary>(
    ((threadResult.data ?? []) as ThreadSummary[]).map((row) => [row.root_id, row]));
  const reactionGroups = new Map<string, Map<string, { emoji: string; count: number; reacted: boolean }>>();
  const attachments = new Map<string, MessageAttachment[]>();
  for (const item of (attachmentResult.data ?? []) as MessageAttachment[]) {
    attachments.set(item.message_id, [...(attachments.get(item.message_id) ?? []), item]);
  }
  const { data: { user } } = await db.auth.getUser();
  for (const row of reactionResult.data ?? []) {
    const byEmoji = reactionGroups.get(row.message_id) ?? new Map();
    const group = byEmoji.get(row.emoji) ?? { emoji: row.emoji, count: 0, reacted: false };
    group.count++;
    if (row.user_id === user?.id) group.reacted = true;
    byEmoji.set(row.emoji, group);
    reactionGroups.set(row.message_id, byEmoji);
  }
  return rows.map((row) => ({ ...row, profile: profiles.get(row.author_id) ?? null,
    replyCount: Number(threads.get(row.id)?.reply_count ?? 0),
    latestReplyAt: threads.get(row.id)?.latest_reply_at ?? null,
    reactions: [...(reactionGroups.get(row.id)?.values() ?? [])],
    attachments: row.deleted_at ? [] : (attachments.get(row.id) ?? []),
    mentionProfiles: Object.fromEntries(mentionIds(row.body).flatMap((id) => {
      const profile = profiles.get(id);
      return profile ? [[id, profile]] : [];
    })) }));
}

export async function getMessagePage(db: SupabaseClient, channelId: string, before?: MessageCursor): Promise<MessagePage> {
  const { data, error } = await db.rpc("list_channel_messages", {
    p_conversation_id: channelId, p_before_created_at: before?.created_at ?? null,
    p_before_id: before?.id ?? null, p_limit: PAGE_SIZE + 1,
  });
  if (error) throw new Error("We couldn’t load messages.");
  const descending = (data ?? []) as BareMessage[];
  const page = descending.slice(0, PAGE_SIZE);
  const olderCursor = descending.length > PAGE_SIZE && page.length
    ? { created_at: page[page.length - 1].created_at, id: page[page.length - 1].id } : null;
  return { messages: (await withProfiles(db, page)).reverse(), olderCursor };
}

export async function getMessageById(db: SupabaseClient, channelId: string, id: string): Promise<ChannelMessage | null> {
  const { data, error } = await db.from("messages").select(messageFields)
    .eq("conversation_id", channelId).eq("id", id).maybeSingle();
  if (error) throw new Error("We couldn’t refresh this message.");
  const rows = data ? await withProfiles(db, [data as BareMessage]) : [];
  return rows[0] ?? null;
}

export async function getMessagesByIds(db: SupabaseClient, channelId: string, ids: string[]): Promise<ChannelMessage[]> {
  const rows: BareMessage[] = [];
  for (let start = 0; start < ids.length; start += 80) {
    const { data, error } = await db.from("messages").select(messageFields)
      .eq("conversation_id", channelId).in("id", ids.slice(start, start + 80));
    if (error) throw new Error("We couldn’t refresh visible messages.");
    rows.push(...((data ?? []) as BareMessage[]));
  }
  return withProfiles(db, rows);
}

export async function getThreadPage(db: SupabaseClient, conversationId: string, rootId: string,
  before?: MessageCursor): Promise<MessagePage> {
  const { data, error } = await db.rpc("list_thread_replies", {
    p_conversation_id: conversationId, p_root_id: rootId,
    p_before_created_at: before?.created_at ?? null, p_before_id: before?.id ?? null,
    p_limit: PAGE_SIZE + 1,
  });
  if (error) throw new Error("We couldn’t load thread replies.");
  const descending = (data ?? []) as BareMessage[];
  const page = descending.slice(0, PAGE_SIZE);
  const olderCursor = descending.length > PAGE_SIZE && page.length
    ? { created_at: page[page.length - 1].created_at, id: page[page.length - 1].id } : null;
  return { messages: (await withProfiles(db, page)).reverse(), olderCursor };
}

export async function getPrivateMemberIds(db: SupabaseClient, channelId: string): Promise<string[]> {
  const { data, error } = await db.from("conversation_members").select("user_id").eq("conversation_id", channelId);
  if (error) throw new Error("We couldn’t load private channel members.");
  return (data ?? []).map((row) => row.user_id);
}
