"use client";

import { House, Plus, Sun, Moon } from "lucide-react";
import Link from "next/link";
import { ProfileAvatar } from "@/features/profile/profile-avatar";
import type { Profile } from "@/features/profile/profile";
import { IconButton } from "@/components/ui/icon-button";
import type { Workspace } from "@/features/workspaces/types";

type WorkspaceRailProps = {
  profile: Profile;
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onHome: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
};

export function WorkspaceRail({ profile, workspaces, selectedWorkspaceId, onSelectWorkspace, onHome, theme, onToggleTheme }: WorkspaceRailProps) {
  return (
    <nav className="workspace-rail" aria-label="Workspaces">
      <IconButton label="App home" className="rail-home" onClick={onHome}><House size={20} strokeWidth={2} /></IconButton>
      <span className="rail-divider" aria-hidden="true" />
      <div className="rail-workspaces">
        {workspaces.map((workspace, index) => (
          <button
            className={`rail-workspace ${selectedWorkspaceId === workspace.id ? "is-selected" : ""}`}
            key={workspace.id}
            type="button"
            title={workspace.name}
            aria-label={workspace.name}
            aria-current={selectedWorkspaceId === workspace.id ? "page" : undefined}
            onClick={() => onSelectWorkspace(workspace.id)}
          >
            <span className={`rail-workspace__mark rail-workspace__mark--${index % 2 === 0 ? "violet" : "coral"}`}>{workspace.name.slice(0, 2).toUpperCase()}</span>
          </button>
        ))}
        <Link href="/onboarding" aria-label="Create workspace" title="Create workspace" className="rail-add"><Plus size={20} /></Link>
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
