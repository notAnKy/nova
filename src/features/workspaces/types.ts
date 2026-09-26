import type { Profile } from "@/features/profile/profile";

export type WorkspaceRole = "owner" | "admin" | "member";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMember = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
  profile: Profile | null;
};

export type WorkspaceInvitation = {
  id: string;
  intended_role: "admin" | "member";
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked_at: string | null;
  created_at: string;
  status: "active" | "revoked" | "expired" | "exhausted";
  expires_label: string;
};

export type InvitationPreview = {
  status: "active" | "already_member" | "invalid" | "expired" | "revoked" | "exhausted";
  workspace_name?: string;
  workspace_slug?: string;
  intended_role?: "admin" | "member";
  expires_at?: string;
  uses?: number;
  max_uses?: number;
};
