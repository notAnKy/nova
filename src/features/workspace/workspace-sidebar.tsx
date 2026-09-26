"use client";

import { Bell, ChevronDown, ChevronRight, Hash, House, Layers3, LockKeyhole, MessageCircle, Plus, Search, Settings2, X, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import { ProfileAvatar } from "@/features/profile/profile-avatar";
import type { Profile } from "@/features/profile/profile";
import { IconButton } from "@/components/ui/icon-button";
import type { Workspace } from "@/features/workspaces/types";
import type { Channel } from "@/features/channels/types";
import type { DirectConversation } from "@/features/direct/data";

export type SidebarView = "home" | "activity" | "search" | "direct" | "projects" | "conversation";

// The page shell is recreated for each conversation route. Keep only disclosure UI
// state across those client navigations; no workspace data is cached here.
const sectionState = new Map<string, { channels: boolean; dms: boolean }>();

type WorkspaceSidebarProps = {
  profile: Profile;
  workspace: Workspace;
  workspaces: Workspace[];
  channels: Channel[];
  dms: DirectConversation[];
  canCreate: boolean;
  selectedConversationId: string;
  pendingConversationId?: string | null;
  view: SidebarView;
  onSelectConversation: (id: string) => void;
  onSelectDirect: (id: string) => void;
  onSelectView: (view: SidebarView) => void;
  onSelectWorkspace: (id: string) => void;
  onCloseMobile: () => void;
  mobileOpen: boolean;
  activityBadge?: string;
};

export function WorkspaceSidebar({ profile, workspace, workspaces, channels, dms, canCreate, selectedConversationId, pendingConversationId, view, onSelectConversation, onSelectDirect, onSelectView, onSelectWorkspace, onCloseMobile, mobileOpen, activityBadge }: WorkspaceSidebarProps) {
  const [channelsOpen, setChannelsOpen] = useState(() => sectionState.get(workspace.id)?.channels ?? true);
  const [dmsOpen, setDmsOpen] = useState(() => sectionState.get(workspace.id)?.dms ?? true);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  useEffect(() => {
    if (!workspaceMenuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing) {
        event.preventDefault();
        setWorkspaceMenuOpen(false);
      }
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

  return (
    <>
      {mobileOpen && <button className="mobile-scrim" type="button" aria-label="Close navigation" onClick={onCloseMobile} />}
      <aside className={`workspace-sidebar ${mobileOpen ? "is-mobile-open" : ""}`} aria-label={`${workspace.name} navigation`} role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined}>
        <div className="workspace-sidebar__header">
          <div className="workspace-title-wrap">
            <button className="workspace-title" type="button" aria-expanded={workspaceMenuOpen} aria-controls="workspace-menu" onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}>
              <span className="workspace-title__name">{workspace.name}</span><ChevronDown size={16} aria-hidden="true" />
            </button>
            <span className="workspace-plan">Your team’s space</span>
          </div>
          <IconButton label="Close navigation" className="sidebar-mobile-close" onClick={onCloseMobile}><X size={18} /></IconButton>
          <Link href={`/w/${workspace.slug}/settings`} className="icon-button sidebar-settings" aria-label="Workspace settings"><Settings2 size={18} /></Link>
        </div>
        {workspaceMenuOpen && (
          <div className="workspace-menu" id="workspace-menu">
            <p>Your workspaces</p>
            {workspaces.map((item, index) => (
              <button key={item.id} type="button" aria-current={item.id === workspace.id ? "page" : undefined} onClick={() => { onSelectWorkspace(item.id); setWorkspaceMenuOpen(false); }}>
                <span className={`mini-workspace mini-workspace--${index % 2 === 0 ? "violet" : "coral"}`}>{item.name.slice(0, 2).toUpperCase()}</span>{item.name}
              </button>
            ))}
            {workspaces.length === 100 && <p>Showing the first 100 workspaces.</p>}
            <Link href="/onboarding" className="workspace-menu__create" onClick={() => setWorkspaceMenuOpen(false)}>Create workspace</Link>
          </div>
        )}
        <div className="sidebar-scroll">
          <button className="sidebar-search" type="button" onClick={() => onSelectView("search")}><Search size={16} aria-hidden="true" /><span>Search in {workspace.name}</span><kbd>Ctrl K</kbd></button>
          <nav className="sidebar-primary" aria-label="Workspace sections">
            <SidebarNavItem icon={<House size={18} />} label="Home" active={view === "home"} onClick={() => onSelectView("home")} />
            <SidebarNavItem icon={<Bell size={18} />} label="Activity" badge={activityBadge} active={view === "activity"} onClick={() => onSelectView("activity")} />
            <SidebarNavItem icon={<MessageCircle size={18} />} label="Direct messages" active={view === "direct"} onClick={() => onSelectView("direct")} />
            <SidebarNavItem icon={<Layers3 size={18} />} label="Projects" active={view === "projects"} onClick={() => onSelectView("projects")} />
            <Link href={`/w/${workspace.slug}/settings`} className="sidebar-nav-item" onClick={onCloseMobile}><Settings2 size={18} /><span>Workspace settings</span></Link>
          </nav>
          <div className="sidebar-section">
            <div className="sidebar-section__head">
              <button type="button" className="sidebar-section__toggle" aria-expanded={channelsOpen} onClick={() => {
                const next = !channelsOpen;
                sectionState.set(workspace.id, { channels: next, dms: dmsOpen });
                setChannelsOpen(next);
              }}>
                {channelsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span>Channels</span>
              </button>
              {canCreate && <Link href={`/w/${workspace.slug}/channels/new`} className="icon-button sidebar-add-channel" aria-label="Create channel" title="Create channel"><Plus size={16} /></Link>}
            </div>
            {channelsOpen && <div className="sidebar-section__items">
              {channels.map((item) => (
                <button key={item.id} type="button" className={`sidebar-channel ${pendingConversationId === item.id || view === "conversation" && !pendingConversationId && selectedConversationId === item.id ? "is-selected" : ""} ${pendingConversationId === item.id ? "is-opening" : ""} ${item.unread ? "has-unread" : ""}`} aria-current={view === "conversation" && !pendingConversationId && selectedConversationId === item.id ? "page" : undefined} aria-busy={pendingConversationId === item.id || undefined} onClick={() => onSelectConversation(item.id)}>
                  {item.kind === "private_channel" ? <LockKeyhole size={16} aria-hidden="true" /> : <Hash size={17} aria-hidden="true" />}
                  <span>{item.name}</span>{pendingConversationId === item.id && <span className="sidebar-opening" aria-hidden="true" />}{item.unread && <span className="sidebar-unread" aria-label="Unread messages">•</span>}
                </button>
              ))}
              {!channels.length && <p className="sidebar-section__hint">No channels yet.</p>}
              {channels.length === 200 && <p className="sidebar-section__hint">Showing the first 200 channels. Older channels remain available by direct link.</p>}
            </div>}
          </div>
          <div className="sidebar-section sidebar-section--dms">
            <div className="sidebar-section__head">
              <button type="button" className="sidebar-section__toggle" aria-expanded={dmsOpen} onClick={() => {
                const next = !dmsOpen;
                sectionState.set(workspace.id, { channels: channelsOpen, dms: next });
                setDmsOpen(next);
              }}>
                {dmsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span>Direct messages</span>
              </button>
              <Link href={`/w/${workspace.slug}/dm/new`} className="icon-button sidebar-add-channel" aria-label="New direct message" title="New message"><Plus size={16} /></Link>
            </div>
            {dmsOpen && <div className="sidebar-section__items">
              {dms.map((item) => {
                const other = item.kind === "direct" ? item.participants.find((person) => person.user_id !== profile.user_id) : null;
                const groupFaces = item.kind === "group_direct" ? item.participants.filter((person) => person.user_id !== profile.user_id).slice(0, 2) : [];
                return <button key={item.id} type="button" className={`sidebar-channel sidebar-dm ${pendingConversationId === item.id || view === "conversation" && !pendingConversationId && selectedConversationId === item.id ? "is-selected" : ""} ${pendingConversationId === item.id ? "is-opening" : ""} ${item.unread ? "has-unread" : ""}`}
                  aria-current={view === "conversation" && !pendingConversationId && selectedConversationId === item.id ? "page" : undefined} aria-busy={pendingConversationId === item.id || undefined}
                  onClick={() => onSelectDirect(item.id)}>
                  {other ? <ProfileAvatar profile={other} /> : groupFaces.length
                    ? <span className="dm-avatar-stack" aria-hidden="true">{groupFaces.map((person) => <ProfileAvatar key={person.user_id} profile={person} />)}</span>
                    : <UsersRound size={17} aria-hidden="true" />}
                  <span>{item.displayName}</span>{pendingConversationId === item.id && <span className="sidebar-opening" aria-hidden="true" />}{item.unread && <span className="sidebar-unread" aria-label="Unread messages">•</span>}
                </button>;
              })}
              {!dms.length && <p className="sidebar-section__hint">No direct messages yet.</p>}
              {dms.length === 50 && <p className="sidebar-section__hint">Showing 50 recent conversations.</p>}
            </div>}
          </div>
        </div>
        <div className="sidebar-account"><Link href="/settings/profile" className="sidebar-account__profile"><ProfileAvatar profile={profile} /><span>{profile.display_name}</span></Link><form action={signOut}><button type="submit">Sign out</button></form></div>
        <div className="sidebar-footer"><span className="sidebar-footer__dot" /><span>Live conversations</span><span className="sidebar-footer__version">v0.5</span></div>
      </aside>
    </>
  );
}

function SidebarNavItem({ icon, label, active, badge, onClick }: { icon: React.ReactNode; label: string; active: boolean; badge?: string; onClick: () => void }) {
  return <button type="button" className={`sidebar-nav-item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick}>{icon}<span>{label}</span>{badge && <span className="sidebar-nav-badge">{badge}</span>}</button>;
}
