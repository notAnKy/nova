"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRight, Bell, Hash, Layers3, Menu, Moon, Sun } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { StateView } from "@/components/ui/state-view";
import { ConversationSkeleton } from "@/components/ui/skeleton";
import { conversations, workspaces } from "@/fixtures/workspace";
import { ConversationPanel } from "@/features/conversation/conversation-panel";
import { DetailPanel } from "@/features/conversation/detail-panel";
import { WorkspaceRail } from "@/features/workspace/workspace-rail";
import { WorkspaceSidebar, type SidebarView } from "@/features/workspace/workspace-sidebar";
import type { Profile } from "@/features/profile/profile";

type Theme = "dark" | "light";
type PreviewState = "content" | "loading" | "error";

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

export function AppShell({ profile }: { profile: Profile }) {
  const [workspaceId, setWorkspaceId] = useState("nova");
  const [conversationId, setConversationId] = useState("game-dev");
  const [view, setView] = useState<SidebarView>("conversation");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [threadMessageId, setThreadMessageId] = useState<string | null>(null);
  const theme = useSyncExternalStore<Theme>(subscribeTheme, getTheme, () => "dark");
  const [previewState, setPreviewState] = useState<PreviewState>("content");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!mobileNavOpen && !detailOpen) return;
    const panel = document.querySelector<HTMLElement>(mobileNavOpen ? ".workspace-sidebar" : ".detail-panel");
    if (!panel) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.querySelector<HTMLButtonElement>(mobileNavOpen ? ".sidebar-mobile-close" : 'button[aria-label="Close detail panel"]')?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (mobileNavOpen) setMobileNavOpen(false);
        else setDetailOpen(false);
        return;
      }
      if (event.key !== "Tab" || (!mobileNavOpen && !window.matchMedia("(max-width: 1260px)").matches)) return;
      const focusable = Array.from(panel!.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled])'))
        .filter((element) => getComputedStyle(element).display !== "none");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, [mobileNavOpen, detailOpen]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem("nova-theme", next);
    window.dispatchEvent(new Event("nova-theme-change"));
  }

  function selectWorkspace(id: string) {
    setWorkspaceId(id);
    setView(id === "nova" ? "conversation" : "home");
    setConversationId("game-dev");
    setDetailOpen(false);
    setMobileNavOpen(false);
    setPreviewState("content");
  }

  function selectConversation(id: string) {
    setConversationId(id);
    setView("conversation");
    setDetailOpen(false);
    setThreadMessageId(null);
    setMobileNavOpen(false);
    setPreviewState("content");
  }

  function selectView(next: SidebarView) {
    setView(next);
    setDetailOpen(false);
    setMobileNavOpen(false);
    setPreviewState("content");
  }

  function openThread(id: string) {
    setThreadMessageId(id);
    setDetailOpen(true);
  }

  function openDetails() {
    setThreadMessageId(null);
    setDetailOpen(true);
  }

  const workspace = workspaces.find((item) => item.id === workspaceId) ?? workspaces[0];

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Skip to conversation</a>
      <WorkspaceRail profile={profile} selectedWorkspaceId={workspaceId} onSelectWorkspace={selectWorkspace} onHome={() => selectView("home")} theme={theme} onToggleTheme={toggleTheme} />
      <WorkspaceSidebar profile={profile} workspaceId={workspaceId} selectedConversationId={conversationId} view={view} onSelectConversation={selectConversation} onSelectView={selectView} onSelectWorkspace={selectWorkspace} onCloseMobile={() => setMobileNavOpen(false)} mobileOpen={mobileNavOpen} />
      <main id="main-content" className="main-pane" tabIndex={-1}>
        {view === "conversation" && workspaceId === "nova" ? <ConversationPanel conversationId={conversationId} onOpenMobileNav={() => setMobileNavOpen(true)} onOpenThread={openThread} onOpenDetails={openDetails} theme={theme} onToggleTheme={toggleTheme} /> : <section className="overview-pane">
          <div className="overview-pane__top"><IconButton label="Open navigation" className="mobile-nav-trigger" onClick={() => setMobileNavOpen(true)}><Menu size={21} /></IconButton><span>{workspace.name}</span><IconButton label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className="mobile-theme-trigger" onClick={toggleTheme}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</IconButton></div>
          {previewState === "loading" ? <div className="state-demo"><ConversationSkeleton /><button className="text-action" type="button" onClick={() => setPreviewState("content")}>Return to workspace <ArrowRight size={16} /></button></div> : previewState === "error" ? <StateView variant="error" title="That preview couldn’t load" description="This is the Phase 1 error-state example. Your workspace data has not been affected." action={<button className="text-action" onClick={() => setPreviewState("content")}>Return to workspace <ArrowRight size={16} /></button>} /> : view === "home" ? <HomePreview workspaceName={workspace.name} isNova={workspaceId === "nova"} onSelectConversation={selectConversation} onState={setPreviewState} /> : <SectionPreview view={view} />}
        </section>}
      </main>
      {detailOpen && workspaceId === "nova" && view === "conversation" && <><button className="detail-scrim" type="button" aria-label="Close detail panel" onClick={() => setDetailOpen(false)} /><DetailPanel conversationId={conversationId} threadMessageId={threadMessageId} onClose={() => setDetailOpen(false)} /></>}
    </div>
  );
}

function HomePreview({ workspaceName, isNova, onSelectConversation, onState }: { workspaceName: string; isNova: boolean; onSelectConversation: (id: string) => void; onState: (state: PreviewState) => void }) {
  return <div className="home-preview">
    <div className="home-preview__eyebrow">WORKSPACE / PREVIEW</div>
    <h1>Good morning, team<span className="home-preview__period">.</span></h1>
    <p className="home-preview__lede">A place for the conversations that move {workspaceName} forward.</p>
    <div className="home-preview__rule" />
    <div className="home-preview__section-head"><div><h2>Pick up where you left off</h2><p>Fixture conversations for exploring the shell.</p></div></div>
    {isNova ? <div className="home-preview__list">
      {conversations.filter((item) => ["game-dev", "engineering", "general"].includes(item.id)).map((item) => <button type="button" key={item.id} onClick={() => onSelectConversation(item.id)} className="home-preview__row"><span className="home-preview__hash"><Hash size={18} /></span><span><strong>{item.name}</strong><small>{item.topic}</small></span>{item.unread && <span className="home-preview__unread">{item.unread} unread</span>}<ArrowRight size={17} /></button>)}
    </div> : <StateView title="A new space to make your own" description="This second workspace is an empty-state preview. Creating real workspaces arrives in Phase 3." />}
    <div className="home-preview__state-tools"><span>Explore interface states</span><button type="button" onClick={() => onState("loading")}>Loading</button><button type="button" onClick={() => onState("error")}>Error</button></div>
  </div>;
}

function SectionPreview({ view }: { view: SidebarView }) {
  const content = view === "activity"
    ? { icon: Bell, title: "All caught up, for now", description: "Mentions, replies, and team activity will appear here once notifications are connected in Phase 7." }
    : view === "projects"
      ? { icon: Layers3, title: "Projects will live here", description: "Messages will connect to small tasks and decisions in Phase 8. This screen is a layout preview." }
      : { icon: Hash, title: "Your conversations, together", description: "Choose a direct message in the sidebar. Creating conversations arrives in Phase 5." };
  const Icon = content.icon;
  return <div className="section-preview"><span className="section-preview__icon"><Icon size={25} strokeWidth={1.7} /></span><span className="section-preview__eyebrow">COMING IN A LATER PHASE</span><StateView title={content.title} description={content.description} /></div>;
}
