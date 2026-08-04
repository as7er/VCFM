import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ReplayManager, ReplayUI } from "../js/matchview-replay.js";

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
    this.className = "";
    this.dataset = {};
    this.textContent = "";
    this.children = [];
    this.listeners = {};
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  replaceChildren(...children) {
    this.children = children;
  }
  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }
}

const fakeDocument = {
  createElement(tagName) {
    return new FakeElement(fakeDocument, tagName);
  },
};
const container = fakeDocument.createElement("section");
const manager = new ReplayManager();
const dangerousText = '<img src=x onerror="globalThis.injected=true">';
manager.saveHighlight("goal", [{ ball: {}, players: [] }], {
  minute: 12,
  text: dangerousText,
  score: { home: 1, away: 0 },
});

let playedId = null;
const ui = new ReplayUI(manager, container);
ui.onPlay((id) => {
  playedId = id;
});
ui.render();

const list = container.children[0];
const item = list.children[0];
const info = item.children[1];
const replayText = info.children[2];
assert.equal(replayText.textContent, dangerousText, "event text must remain plain text");
assert.equal(replayText.children.length, 0, "event text must not create markup");
item.listeners.click();
assert.equal(playedId, "highlight_1");

manager.clearAll();
ui.render();
assert.equal(container.children[0].className, "replay-empty");
assert.equal(container.children[0].textContent, "暂无精彩回放");

const matchViewSource = readFileSync(new URL("../js/matchview.js", import.meta.url), "utf8");
const highlightStart = matchViewSource.indexOf("async playGoalHighlight");
const highlightEnd = matchViewSource.indexOf("async replayEvents", highlightStart);
const highlightSource = matchViewSource.slice(highlightStart, highlightEnd);
assert.ok(highlightStart >= 0 && highlightEnd > highlightStart, "goal replay implementation must exist");
assert.ok(
  highlightSource.includes("replayReturn") && highlightSource.includes("this.simDrive = false"),
  "post-match replay must temporarily release terminal and spatial-drive locks"
);
assert.ok(
  highlightSource.includes("'GOAL_SEQUENCE', 'CELEBRATE'"),
  "goal replay must complete the FSM celebration phase"
);

const mainSource = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
const storedReplayStart = mainSource.indexOf("async function replayStoredGoal");
const storedReplayEnd = mainSource.indexOf("function readPref", storedReplayStart);
const storedReplaySource = mainSource.slice(storedReplayStart, storedReplayEnd);
assert.ok(
  storedReplaySource.includes('classList.remove("match-report-only")') &&
    storedReplaySource.includes("scrollIntoView"),
  "post-match replay must reveal and focus the pitch"
);

console.log(JSON.stringify({ safeText: replayText.textContent, clickId: playedId }, null, 2));
