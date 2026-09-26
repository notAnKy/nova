import type { Profile } from "@/features/profile/profile";

export type Channel = {
  id: string;
  workspace_id: string;
  kind: "public_channel" | "private_channel";
  name: string;
  slug: string;
  topic: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_id: string | null;
  unread?: boolean;
};

export type ChannelMessage = {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  parent_message_id: string | null;
  profile: Profile | null;
  mentionProfiles: Record<string, Profile>;
  replyCount: number;
  latestReplyAt: string | null;
  reactions: { emoji: string; count: number; reacted: boolean }[];
  attachments: MessageAttachment[];
};

export type MessageAttachment = {
  id: string;
  message_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  state: "ready" | "expired";
  expires_at: string;
};

export type MessageCursor = { created_at: string; id: string };
export type MessagePage = { messages: ChannelMessage[]; olderCursor: MessageCursor | null };
