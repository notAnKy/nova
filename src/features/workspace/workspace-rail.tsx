"use client";

import { House, Plus, Sun, Moon } from "lucide-react";
import Link from "next/link";
import { ProfileAvatar } from "@/features/profile/profile-avatar";
import type { Profile } from "@/features/profile/profile";
import { IconButton } from "@/components/ui/icon-button";
import { type Workspace, workspaces } from "@/fixtures/workspace";

type WorkspaceRailProps = {
  profile: Profile;
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onHome: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
};

export function WorkspaceRail({ profile, selectedWorkspaceId, onSelectWorkspace, onHome, theme, onToggleTheme }: WorkspaceRailProps) {
  return (
    <nav className="workspace-rail" aria-label="Workspaces">
      <IconButton label="App home" className="rail-home" onClick={onHome}><House size={20} strokeWidth={2} /></IconButton>
      <span className="rail-divider" aria-hidden="true" />
      <div className="rail-workspaces">
        {workspaces.map((workspace: Workspace) => (
          <button
            className={`rail-workspace ${selectedWorkspaceId === workspace.id ? "is-selected" : ""}`}
            key={workspace.id}
            type="button"
            title={workspace.name}
            aria-label={workspace.name}
            aria-current={selectedWorkspaceId === workspace.id ? "page" : undefined}
            onClick={() => onSelectWorkspace(workspace.id)}
          >
            <span className={`rail-workspace__mark rail-workspace__mark--${workspace.color}`}>{workspace.initials}</span>
          </button>
        ))}
        <IconButton label="Add workspace — available in a later phase" disabled className="rail-add"><Plus size={20} /></IconButton>
      </div>
      <div className="rail-bottom">
        <IconButton label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} onClick={onToggleTheme}>
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
        </IconButton>
        <Link href="/settings/profile" className="rail-profile" title={`Profile settings for ${profile.display_name}`} aria-label="Profile settings"><ProfileAvatar profile={profile} /></Link>
      </div>
    </nav>
  );
}
