"use client";

import { Bell, ChevronDown, ChevronRight, Hash, House, Layers3, LockKeyhole, MessageCircle, Plus, Search, Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import { ProfileAvatar } from "@/features/profile/profile-avatar";
import type { Profile } from "@/features/profile/profile";
import { IconButton } from "@/components/ui/icon-button";
import { conversations, personById, workspaces } from "@/fixtures/workspace";

export type SidebarView = "home" | "activity" | "direct" | "projects" | "conversation";

type WorkspaceSidebarProps = {
  profile: Profile;
  workspaceId: string;
  selectedConversationId: string;
  view: SidebarView;
  onSelectConversation: (id: string) => void;
  onSelectView: (view: SidebarView) => void;
  onSelectWorkspace: (id: string) => void;
  onCloseMobile: () => void;
  mobileOpen: boolean;
};

export function WorkspaceSidebar({ profile, workspaceId, selectedConversationId, view, onSelectConversation, onSelectView, onSelectWorkspace, onCloseMobile, mobileOpen }: WorkspaceSidebarProps) {
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  useEffect(() => {
    if (!workspaceMenuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setWorkspaceMenuOpen(false);
    }
    function closeOnOutsideClick(event: PointerEvent) {
      if (!(event.target instanceof Element) || event.target.closest(".workspace-title-wrap, .workspace-menu")) return;
      setWorkspaceMenuOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [workspaceMenuOpen]);

  const workspace = workspaces.find((item) => item.id === workspaceId) ?? workspaces[0];
  const isNova = workspaceId === "nova";

  return (
    <>
      {mobileOpen && <button className="mobile-scrim" type="button" aria-label="Close navigation" onClick={onCloseMobile} />}
      <aside className={`workspace-sidebar ${mobileOpen ? "is-mobile-open" : ""}`} aria-label={`${workspace.name} navigation`} role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined}>
        <div className="workspace-sidebar__header">
          <div className="workspace-title-wrap">
            <button className="workspace-title" type="button" aria-expanded={workspaceMenuOpen} aria-controls="workspace-menu" onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}>
              <span className="workspace-title__name">{workspace.name}</span><ChevronDown size={16} aria-hidden="true" />
            </button>
            <span className="workspace-plan">Free preview</span>
          </div>
          <IconButton label="Close navigation" className="sidebar-mobile-close" onClick={onCloseMobile}><X size={18} /></IconButton>
          <IconButton label="Workspace settings — available in a later phase" disabled className="sidebar-settings"><Settings2 size={18} /></IconButton>
        </div>
        {workspaceMenuOpen && (
          <div className="workspace-menu" id="workspace-menu" role="menu" aria-label="Switch workspace">
            <p>Preview workspaces</p>
            {workspaces.map((item) => (
              <button key={item.id} type="button" role="menuitemradio" aria-checked={item.id === workspaceId} onClick={() => { onSelectWorkspace(item.id); setWorkspaceMenuOpen(false); }}>
                <span className={`mini-workspace mini-workspace--${item.color}`}>{item.initials}</span>{item.name}
              </button>
            ))}
          </div>
        )}
        <div className="sidebar-scroll">
          <button className="sidebar-search" type="button" disabled title="Search arrives in Phase 7"><Search size={16} aria-hidden="true" /><span>Search in {workspace.name}</span><kbd>⌘ K</kbd></button>
          <nav className="sidebar-primary" aria-label="Workspace sections">
            <SidebarNavItem icon={<House size={18} />} label="Home" active={view === "home"} onClick={() => onSelectView("home")} />
            <SidebarNavItem icon={<Bell size={18} />} label="Activity" active={view === "activity"} onClick={() => onSelectView("activity")} />
            <SidebarNavItem icon={<MessageCircle size={18} />} label="Direct messages" active={view === "direct"} onClick={() => onSelectView("direct")} />
            <SidebarNavItem icon={<Layers3 size={18} />} label="Projects" active={view === "projects"} onClick={() => onSelectView("projects")} />
          </nav>
          <div className="sidebar-section">
            <div className="sidebar-section__head">
              <button type="button" className="sidebar-section__toggle" aria-expanded={channelsOpen} onClick={() => setChannelsOpen(!channelsOpen)}>
                {channelsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span>Channels</span>
              </button>
              <IconButton label="Add channel — available in a later phase" disabled><Plus size={16} /></IconButton>
            </div>
            {channelsOpen && <div className="sidebar-section__items">
              {isNova && conversations.filter((item) => item.kind !== "dm").map((item) => (
                <button key={item.id} type="button" className={`sidebar-channel ${view === "conversation" && selectedConversationId === item.id ? "is-selected" : ""} ${item.unread ? "has-unread" : ""}`} aria-current={view === "conversation" && selectedConversationId === item.id ? "page" : undefined} onClick={() => onSelectConversation(item.id)}>
                  {item.kind === "private" ? <LockKeyhole size={16} aria-hidden="true" /> : <Hash size={17} aria-hidden="true" />}
                  <span>{item.name}</span>{item.unread && <span className="sidebar-unread">{item.unread}</span>}
                </button>
              ))}
              {!isNova && <p className="sidebar-section__hint">No channels in this preview.</p>}
            </div>}
          </div>
          <div className="sidebar-section sidebar-section--dms">
            <div className="sidebar-section__head">
              <button type="button" className="sidebar-section__toggle" aria-expanded={dmsOpen} onClick={() => setDmsOpen(!dmsOpen)}>
                {dmsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span>Direct messages</span>
              </button>
              <IconButton label="New direct message — available in Phase 5" disabled><Plus size={16} /></IconButton>
            </div>
            {dmsOpen && <div className="sidebar-section__items">
              {isNova && conversations.filter((item) => item.kind === "dm").map((item) => {
                const person = personById(item.personId ?? "");
                return <button key={item.id} type="button" className={`sidebar-channel sidebar-dm ${view === "conversation" && selectedConversationId === item.id ? "is-selected" : ""} ${item.unread ? "has-unread" : ""}`} aria-current={view === "conversation" && selectedConversationId === item.id ? "page" : undefined} onClick={() => onSelectConversation(item.id)}>
                  <Avatar person={person} size="sm" online={person.online} /><span>{item.name}</span>{item.unread && <span className="sidebar-unread">{item.unread}</span>}
                </button>;
              })}
              {!isNova && <p className="sidebar-section__hint">No conversations yet.</p>}
            </div>}
          </div>
        </div>
        <div className="sidebar-account"><Link href="/settings/profile" className="sidebar-account__profile"><ProfileAvatar profile={profile} /><span>{profile.display_name}</span></Link><form action={signOut}><button type="submit">Sign out</button></form></div>
        <div className="sidebar-footer"><span className="sidebar-footer__dot" /><span>Phase 2 preview</span><span className="sidebar-footer__version">v0.2</span></div>
      </aside>
    </>
  );
}

function SidebarNavItem({ icon, label, active, badge, onClick }: { icon: React.ReactNode; label: string; active: boolean; badge?: string; onClick: () => void }) {
  return <button type="button" className={`sidebar-nav-item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick}>{icon}<span>{label}</span>{badge && <span className="sidebar-nav-badge">{badge}</span>}</button>;
}
