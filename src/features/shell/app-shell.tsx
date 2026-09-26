"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Hash, Layers3, LockKeyhole, Menu, Moon, Plus, Sun, MessageCircle } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { StateView } from "@/components/ui/state-view";
import { ChannelPanel } from "@/features/channels/channel-panel";
import { ChannelDetails } from "@/features/channels/channel-details";
import { WorkspaceRail } from "@/features/workspace/workspace-rail";
import { WorkspaceSidebar, type SidebarView } from "@/features/workspace/workspace-sidebar";
import type { Profile } from "@/features/profile/profile";
import type { Workspace, WorkspaceMember, WorkspaceRole } from "@/features/workspaces/types";
import type { Channel, MessagePage } from "@/features/channels/types";
import { DirectDetails } from "@/features/direct/direct-details";
import type { DirectConversation } from "@/features/direct/data";
import { createClient } from "@/lib/supabase/client";
import { MessageSearch } from "@/features/search/message-search";
import { ActivityView } from "@/features/activity/activity-view";
import { listChannels } from "@/features/channels/data";
import { listDirectConversations } from "@/features/direct/data";

type Theme = "dark" | "light";

function getTheme(): Theme {
  const stored = window.localStorage.getItem("nova-theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeTheme(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", callback);
  window.addEventListener("nova-theme-change", callback);
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("nova-theme-change", callback);
    media.removeEventListener("change", callback);
  };
}

export function AppShell({ profile, workspace, workspaces, role, channels, dms, channel, direct, initialPage, workspaceMembers, channelMemberIds, eligibleMentions = [], initialView, projectsContent }: {
  profile: Profile; workspace: Workspace; workspaces: Workspace[]; role: WorkspaceRole;
  channels: Channel[]; dms: DirectConversation[]; channel: Channel | null; direct: DirectConversation | null;
  initialPage: MessagePage | null; initialView?: SidebarView;
  projectsContent?: React.ReactNode;
  workspaceMembers: WorkspaceMember[]; channelMemberIds: string[];
  eligibleMentions?: Profile[];
}) {
  const router = useRouter();
  const db = useMemo(() => createClient(), []);
  const [view, setView] = useState<SidebarView>(initialView ?? (channel || direct ? "conversation" : "home"));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [liveChannels, setLiveChannels] = useState(channels);
  const [liveDms, setLiveDms] = useState(dms);
  const conversationRefreshVersion = useRef(0);
  const [unreadActivity, setUnreadActivity] = useState(0);
  const [activityVersion, setActivityVersion] = useState(0);
  const theme = useSyncExternalStore<Theme>(subscribeTheme, getTheme, () => "dark");
  const displayedChannels = liveChannels;
  const displayedDms = liveDms;
  const activeConversation = channel ?? direct;

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const refreshConversations = useCallback(async () => {
    const version = ++conversationRefreshVersion.current;
    try {
      const [nextChannels, nextDms] = await Promise.all([
        listChannels(db, workspace.id, profile.user_id),
        listDirectConversations(db, workspace.id, profile.user_id),
      ]);
      if (version === conversationRefreshVersion.current) {
        setLiveChannels(nextChannels);
        setLiveDms(nextDms);
      }
    } catch { /* The next authorized hint or focus will retry. */ }
  }, [db, workspace.id, profile.user_id]);

  const refreshActivity = useCallback(async () => {
    const { data, error } = await db.from("notifications").select("id")
      .eq("workspace_id", workspace.id).is("read_at", null).limit(100);
    if (!error) setUnreadActivity((data ?? []).length);
    setActivityVersion((value) => value + 1);
  }, [db, workspace.id]);

  useEffect(() => {
    let closed = false;
    let subscription: ReturnType<typeof db.channel> | null = null;
    queueMicrotask(() => { if (!closed) void refreshActivity(); });
    async function connect() {
      try {
        await db.realtime.setAuth();
        if (closed) return;
        subscription = db.channel(`activity:${profile.user_id}`, { config: { private: true } })
          .on("broadcast", { event: "activity.changed" }, ({ payload }) => {
            if (payload.workspace_id === workspace.id) void refreshActivity();
          })
          .on("broadcast", { event: "conversation.changed" }, ({ payload }) => {
            if (payload.workspace_id === workspace.id) void refreshConversations();
          }).subscribe((status) => {
            if (status === "SUBSCRIBED") { void refreshActivity(); void refreshConversations(); }
          });
      } catch { /* Focus refresh remains available. */ }
    }
    function onFocus() { if (document.visibilityState === "visible") { void refreshActivity(); void refreshConversations(); } }
    void connect();
    window.addEventListener("focus", onFocus);
    return () => { closed = true; window.removeEventListener("focus", onFocus); if (subscription) void db.removeChannel(subscription); };
  }, [db, profile.user_id, workspace.id, refreshActivity, refreshConversations]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setView("search"); setMobileNavOpen(false); setDetailOpen(false);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen && !detailOpen) return;
    const panel = document.querySelector<HTMLElement>(mobileNavOpen ? ".workspace-sidebar" : ".detail-panel");
    if (!panel) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.querySelector<HTMLButtonElement>(mobileNavOpen ? ".sidebar-mobile-close" : 'button[aria-label="Close detail panel"]')?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing) {
        event.preventDefault();
        if (mobileNavOpen) setMobileNavOpen(false);
        else setDetailOpen(false);
        return;
      }
      if (event.key !== "Tab" || (!mobileNavOpen && !window.matchMedia("(max-width: 1260px)").matches)) return;
      const focusable = Array.from(panel!.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled]), select:not([disabled])'))
        .filter((element) => getComputedStyle(element).display !== "none");
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); if (previous?.isConnected) previous.focus(); };
  }, [mobileNavOpen, detailOpen]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem("nova-theme", next);
    window.dispatchEvent(new Event("nova-theme-change"));
  }

  function selectWorkspace(id: string) {
    const next = workspaces.find((item) => item.id === id);
    if (next && next.id !== workspace.id) router.push(`/w/${next.slug}`);
    setMobileNavOpen(false);
  }

  function selectChannel(id: string) {
    const next = channels.find((item) => item.id === id);
    if (next) router.push(`/w/${workspace.slug}/c/${next.slug}`);
    setView("conversation");
    setMobileNavOpen(false);
    setDetailOpen(false);
  }

  function selectDirect(id: string) {
    if (dms.some((item) => item.id === id)) router.push(`/w/${workspace.slug}/dm/${id}`);
    setView("conversation");
    setMobileNavOpen(false);
    setDetailOpen(false);
  }

  function selectView(next: SidebarView) {
    if (next === "home") router.push(`/w/${workspace.slug}`);
    else if (next === "direct") router.push(`/w/${workspace.slug}/dm`);
    else if (next === "projects") router.push(`/w/${workspace.slug}/projects`);
    setView(next); setMobileNavOpen(false); setDetailOpen(false);
  }

  function jumpToMessage(url: string) {
    setView("conversation"); setMobileNavOpen(false); setDetailOpen(false); router.push(url);
  }

  return <div className="app-frame">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <WorkspaceRail profile={profile} workspaces={workspaces} selectedWorkspaceId={workspace.id}
      onSelectWorkspace={selectWorkspace} onHome={() => selectView("home")} theme={theme} onToggleTheme={toggleTheme} />
    <WorkspaceSidebar profile={profile} workspace={workspace} workspaces={workspaces} channels={displayedChannels} dms={displayedDms}
      canCreate={role === "owner" || role === "admin"} selectedConversationId={activeConversation?.id ?? ""} view={view}
      onSelectConversation={selectChannel} onSelectDirect={selectDirect} onSelectView={selectView} onSelectWorkspace={selectWorkspace}
      onCloseMobile={() => setMobileNavOpen(false)} mobileOpen={mobileNavOpen}
      activityBadge={unreadActivity ? unreadActivity >= 100 ? "99+" : String(unreadActivity) : undefined} />
    <main id="main-content" className="main-pane" tabIndex={-1}>
      {view === "conversation" && activeConversation && initialPage
        ? <ChannelPanel key={activeConversation.id} channel={activeConversation} initialPage={initialPage} currentUser={profile}
            eligibleMentions={eligibleMentions}
            onOpenMobileNav={() => setMobileNavOpen(true)} onOpenDetails={() => setDetailOpen(true)}
            onOpenThread={() => setDetailOpen(false)}
            onRead={() => {
              setLiveChannels((current) => current.map((item) => item.id === activeConversation.id ? { ...item, unread: false } : item));
              setLiveDms((current) => current.map((item) => item.id === activeConversation.id ? { ...item, unread: false } : item));
              void refreshConversations();
            }}
            theme={theme} onToggleTheme={toggleTheme} />
        : <section className="overview-pane">
          <div className="overview-pane__top"><IconButton label="Open navigation" className="mobile-nav-trigger" onClick={() => setMobileNavOpen(true)}><Menu size={21} /></IconButton><span>{workspace.name}</span><IconButton label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className="mobile-theme-trigger" onClick={toggleTheme}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</IconButton></div>
          {view === "home" ? <WorkspaceHome workspace={workspace} channels={displayedChannels}
            canCreate={role === "owner" || role === "admin"} onSelectChannel={selectChannel} />
            : view === "direct" ? <DirectHome workspace={workspace} dms={displayedDms} onSelectDirect={selectDirect} />
            : view === "search" ? <MessageSearch workspaceId={workspace.id} workspaceSlug={workspace.slug}
                dms={displayedDms} onJump={jumpToMessage} />
            : view === "activity" ? <ActivityView workspaceId={workspace.id} workspaceSlug={workspace.slug}
                dms={displayedDms} refreshKey={activityVersion} onRead={() => void refreshActivity()}
                onJump={jumpToMessage} />
            : view === "projects" && projectsContent ? projectsContent : <SectionPreview />}
        </section>}
    </main>
    {detailOpen && channel && view === "conversation" && <>
      <button className="detail-scrim" type="button" aria-label="Close detail panel" onClick={() => setDetailOpen(false)} />
      <ChannelDetails channel={channel} role={role} currentUserId={profile.user_id}
        workspaceMembers={workspaceMembers} memberIds={channelMemberIds} onClose={() => setDetailOpen(false)} />
    </>}
    {detailOpen && direct && view === "conversation" && <>
      <button className="detail-scrim" type="button" aria-label="Close detail panel" onClick={() => setDetailOpen(false)} />
      <DirectDetails conversation={direct} onClose={() => setDetailOpen(false)} />
    </>}
  </div>;
}

function DirectHome({ workspace, dms, onSelectDirect }: {
  workspace: Workspace; dms: DirectConversation[]; onSelectDirect: (id: string) => void;
}) {
  return <div className="home-preview"><div className="home-preview__eyebrow">WORKSPACE / DIRECT MESSAGES</div>
    <h1>Your messages<span className="home-preview__period">.</span></h1>
    <p className="home-preview__lede">Private conversations with people in {workspace.name}.</p>
    <div className="home-preview__rule" />
    <div className="home-preview__section-head"><div><h2>Recent conversations</h2><p>Only participants can see each message.</p></div></div>
    {dms.length ? <div className="home-preview__list">{dms.map((item) =>
      <button type="button" key={item.id} onClick={() => onSelectDirect(item.id)} className="home-preview__row">
        <span className="home-preview__hash"><MessageCircle size={18} /></span>
        <span><strong>{item.displayName}</strong><small>{item.kind === "group_direct" ? "Group message" : "Direct message"}</small></span>
        {item.unread && <span className="home-preview__unread">New</span>}<ArrowRight size={17} />
      </button>)}</div>
      : <div className="channel-empty"><span><MessageCircle size={26} /></span><h2>No direct messages yet</h2>
        <p>Start a private conversation with a workspace member.</p></div>}
    <Link className="workspace-submit dm-new-link" href={`/w/${workspace.slug}/dm/new`}><Plus size={17} /> New message</Link>
  </div>;
}

function WorkspaceHome({ workspace, channels, canCreate, onSelectChannel }: {
  workspace: Workspace; channels: Channel[]; canCreate: boolean; onSelectChannel: (id: string) => void;
}) {
  return <div className="home-preview">
    <div className="home-preview__eyebrow">WORKSPACE / CHANNELS</div>
    <h1>{workspace.name}<span className="home-preview__period">.</span></h1>
    <p className="home-preview__lede">Your team’s conversations, all in one place.</p>
    <div className="home-preview__rule" />
    <div className="home-preview__section-head"><div><h2>Channels</h2><p>Public channels are visible to everyone in this workspace. Private channels appear only to their members.</p></div></div>
    {channels.length ? <div className="home-preview__list">{channels.map((item) =>
      <button type="button" key={item.id} onClick={() => onSelectChannel(item.id)} className="home-preview__row">
        <span className="home-preview__hash">{item.kind === "private_channel" ? <LockKeyhole size={18} /> : <Hash size={18} />}</span>
        <span><strong>{item.name}</strong><small>{item.topic || (item.kind === "private_channel" ? "Private channel" : "Public channel")}</small></span>
        {item.unread && <span className="home-preview__unread">New</span>}<ArrowRight size={17} />
      </button>)}</div>
      : <div className="channel-empty"><span><Hash size={26} /></span><h2>No channels yet</h2>
        <p>{canCreate ? "Create the first channel to start a durable conversation." : "Ask a workspace owner or admin to create a channel."}</p>
        {canCreate && <Link className="workspace-submit" href={`/w/${workspace.slug}/channels/new`}><Plus size={17} /> Create channel</Link>}
      </div>}
    {channels.length > 0 && canCreate && <Link className="text-action" href={`/w/${workspace.slug}/channels/new`}><Plus size={16} /> Create channel</Link>}
  </div>;
}

function SectionPreview() {
  const content = { icon: Layers3, title: "Projects will live here", description: "Tasks and decisions arrive in Phase 8." };
  const Icon = content.icon;
  return <div className="section-preview"><span className="section-preview__icon"><Icon size={25} strokeWidth={1.7} /></span><span className="section-preview__eyebrow">COMING IN A LATER PHASE</span><StateView title={content.title} description={content.description} /></div>;
}
