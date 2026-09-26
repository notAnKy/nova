import assert from "node:assert/strict";
import { parsePage, pageHref } from "../src/features/projects/pagination.ts";

assert.equal(parsePage(undefined), 1);
assert.equal(parsePage(["2", "3"]), 1);
assert.equal(parsePage("0"), 1);
assert.equal(parsePage("2abc"), 1);
assert.equal(parsePage("19"), 19);
assert.equal(parsePage("9999"), 1000);
assert.equal(pageHref("/w/team/projects/p", { tasks: 2, decisions: 1, activity: 3 }, "tasks"),
  "/w/team/projects/p?tasks=2&activity=3#tasks");

console.log("Phase 9 pagination checks passed. Direct upload bounds are covered by Phase 7/10 tests.");
