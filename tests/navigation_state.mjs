import assert from "node:assert/strict";
import { navigationPresentation, workspaceView } from "../src/features/shell/navigation-state.ts";

const base = "/w/test1";
const channels = [{ id: "public-id", slug: "general" }, { id: "private-id", slug: "private-test" }];
const dm = `${base}/dm/7ecd3170-b6c9-4743-97da-d16b293254c3`;
const publicChannel = `${base}/c/general`;
const privateChannel = `${base}/c/private-test`;
const activity = `${base}?view=activity`;

function snapshot(url, renderedPath = url.split("?")[0], pending = null, transitionPending = false,
  activeConversationId = null) {
  const parsed = new URL(url, "http://localhost:3001");
  return navigationPresentation({ pathname: parsed.pathname, query: parsed.searchParams.toString(),
    renderedPath, workspaceSlug: "test1", activeConversationId, channels, pending, transitionPending });
}

// Every committed URL selects its own content and sidebar item, including back/forward.
for (const [url, view, selected] of [
  [activity, "activity", ""], [publicChannel, "conversation", "public-id"],
  [privateChannel, "conversation", "private-id"],
  [dm, "conversation", dm.split("/").at(-1)], [`${base}/projects`, "projects", ""],
  [`${base}/settings`, "settings", ""], [`${base}/dm`, "direct", ""],
  [base, "home", ""], [`${base}?view=search`, "search", ""],
]) {
  const result = snapshot(url);
  assert.equal(result.view, view, url);
  assert.equal(result.selectedConversationId, selected, url);
  assert.equal(result.showSkeleton, false, url);
}
assert.equal(workspaceView("/w/other/dm/one", null, "test1"), null);
for (const [url, oldRenderedPath, expectedView] of [
  [activity, dm, "activity"], [dm, publicChannel, "conversation"],
  [publicChannel, dm, "conversation"], [`${base}/projects`, base, "projects"],
]) {
  const duringHistoryNavigation = snapshot(url, oldRenderedPath);
  assert.equal(duringHistoryNavigation.view, expectedView);
  assert.equal(duringHistoryNavigation.showSkeleton, true, `back/forward must hide ${oldRenderedPath} under ${url}`);
}

// Activity -> every sidebar route: immediate feedback, then retained old shell
// while the browser URL has advanced, then the committed destination.
for (const [target, view, selected] of [
  [dm, "conversation", dm.split("/").at(-1)], [publicChannel, "conversation", "public-id"],
  [privateChannel, "conversation", "private-id"], [`${base}/projects`, "projects", undefined],
  [`${base}/settings`, "settings", undefined],
]) {
  const pending = { href: target, view, conversationId: selected };
  const clicked = snapshot(activity, base, pending, true);
  assert.equal(clicked.view, view, target);
  assert.equal(clicked.showSkeleton, true, target);
  if (selected) assert.equal(clicked.pendingConversationId, selected, target);
  const delayed = snapshot(target, base, pending, false);
  assert.equal(delayed.view, view, target);
  assert.equal(delayed.showSkeleton, true, `old Activity under ${target}`);
  const committed = snapshot(target, target);
  assert.equal(committed.view, view, target);
  assert.equal(committed.showSkeleton, false, target);
}

// Return from DM/channel to Activity, and cross between DM and channel.
for (const origin of [dm, publicChannel, privateChannel]) {
  const pending = { href: activity, view: "activity" };
  assert.equal(snapshot(origin, origin, pending, true).showSkeleton, true);
  const delayed = snapshot(activity, origin, pending, false);
  assert.equal(delayed.view, "activity");
  assert.equal(delayed.selectedConversationId, "");
  assert.equal(delayed.showSkeleton, true);
  assert.equal(snapshot(activity).showSkeleton, false);
}
for (const [origin, target, selected] of [[dm, publicChannel, "public-id"],
  [publicChannel, dm, dm.split("/").at(-1)]]) {
  const pending = { href: target, view: "conversation", conversationId: selected };
  const clicked = snapshot(origin, origin, pending, true);
  assert.equal(clicked.selectedConversationId, selected);
  assert.equal(clicked.showSkeleton, true);
  const delayed = snapshot(target, origin, pending, false);
  assert.equal(delayed.selectedConversationId, selected);
  assert.equal(delayed.showSkeleton, true);
  assert.equal(snapshot(target).showSkeleton, false);
}

// A second fast click supersedes the first destination, while a failed push
// restores the selection matching the unchanged URL.
const second = { href: dm, view: "conversation", conversationId: dm.split("/").at(-1) };
assert.equal(snapshot(publicChannel, base, second, true).selectedConversationId, second.conversationId);
assert.equal(snapshot(publicChannel, base, second, true).showSkeleton, true);
const third = { href: privateChannel, view: "conversation", conversationId: "private-id" };
assert.equal(snapshot(dm, base, third, true).selectedConversationId, "private-id");
assert.equal(snapshot(privateChannel, base, third, false).showSkeleton, true);
const failed = snapshot(activity, base, second, false);
assert.equal(failed.view, "activity");
assert.equal(failed.showSkeleton, false);
assert.equal(failed.pendingConversationId, null);

console.log("Navigation state regression checks passed");
