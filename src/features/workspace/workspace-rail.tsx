"use client";

import { House, Plus, Sun, Moon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { people, type Workspace, workspaces } from "@/fixtures/workspace";

type WorkspaceRailProps = {
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onHome: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
};

export function WorkspaceRail({ selectedWorkspaceId, onSelectWorkspace, onHome, theme, onToggleTheme }: WorkspaceRailProps) {
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
        <button type="button" className="rail-profile" title="Profile controls arrive with accounts in Phase 2" aria-label="Profile preview" disabled>
          <Avatar person={people[4]} size="sm" online />
        </button>
      </div>
    </nav>
  );
}
