import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./background.js", import.meta.url), "utf8");
const A = "firefox-container-1";
const B = "firefox-container-2";

function fixture({ names = ["Client-A", "Client-B"], tabs = [], groups = [], map = {} } = {}) {
  const identities = [A, B].map((cookieStoreId, i) => ({
    cookieStoreId,
    name: names[i],
    color: i ? "blue" : "red",
  }));
  const state = {
    tabs: tabs.map((tab) => ({ windowId: 1, groupId: -1, pinned: false, ...tab })),
    groups: groups.map((group) => ({ windowId: 1, ...group })),
    storage: { containerGroupMap: structuredClone(map) },
  };
  const event = { addListener() {} };
  const errors = [];
  let nextGroupId = 100;
  const browser = {
    storage: {
      local: {
        async get(key) {
          return structuredClone({ [key]: state.storage[key] });
        },
        async set(value) {
          Object.assign(state.storage, structuredClone(value));
        },
      },
    },
    contextualIdentities: {
      async get(id) {
        const identity = identities.find((item) => item.cookieStoreId === id);
        if (!identity) throw new Error("Unknown container");
        return { ...identity };
      },
      onUpdated: event,
      onRemoved: event,
    },
    tabs: {
      async query(query) {
        return state.tabs
          .filter((tab) => Object.entries(query).every(([key, value]) => tab[key] === value))
          .map((tab) => ({ ...tab }));
      },
      async get(id) {
        const tab = state.tabs.find((item) => item.id === id);
        if (!tab) throw new Error("Missing tab");
        return { ...tab };
      },
      async group({ tabIds, groupId, createProperties }) {
        if (groupId == null) {
          groupId = nextGroupId++;
          state.groups.push({ id: groupId, windowId: createProperties.windowId });
        }
        const group = state.groups.find((item) => item.id === groupId);
        assert.ok(group, "Target group exists");
        for (const id of tabIds) {
          const tab = state.tabs.find((item) => item.id === id);
          assert.equal(tab.windowId, group.windowId);
          tab.groupId = groupId;
        }
        state.groups = state.groups.filter((item) =>
          state.tabs.some((tab) => tab.groupId === item.id)
        );
        return groupId;
      },
      onCreated: event,
      onUpdated: event,
      onAttached: event,
      onActivated: event,
    },
    tabGroups: {
      async get(id) {
        const group = state.groups.find((item) => item.id === id);
        if (!group) throw new Error("Missing group");
        return { ...group };
      },
      async query({ windowId }) {
        return state.groups.filter((group) => group.windowId === windowId);
      },
      async update(id, changes) {
        const group = state.groups.find((item) => item.id === id);
        assert.ok(group, "Updated group exists");
        Object.assign(group, changes);
      },
      onRemoved: event,
    },
    windows: {
      async getAll() {
        return [...new Set(state.tabs.map((tab) => tab.windowId))].map((id) => ({
          id,
          type: "normal",
        }));
      },
    },
    runtime: { onInstalled: event, onStartup: event, onMessage: event },
    commands: { onCommand: event },
  };
  const context = vm.createContext({
    browser,
    console: { log() {}, warn() {}, error: (...args) => errors.push(args) },
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(source, context);
  return {
    ...state,
    state,
    async run(code = "regroupAllWindows()") {
      await vm.runInContext(code, context);
      assert.deepEqual(errors, [], "Background operations must succeed");
    },
    groupFor(id) {
      const tab = state.tabs.find((item) => item.id === id);
      return state.groups.find((group) => group.id === tab.groupId);
    },
  };
}

for (const names of [
  ["Client-A", "Client-B"],
  ["Client_A", "Client_B"],
  ["Client", "Client"],
]) {
  test(`keeps containers separate: ${names.join(", ")}`, async () => {
    const f = fixture({
      names,
      tabs: [
        { id: 1, cookieStoreId: B },
        { id: 2, cookieStoreId: A },
      ],
    });
    await f.run("handleSingleTab(1)");
    await f.run("handleSingleTab(2)");
    assert.notEqual(f.groupFor(1).id, f.groupFor(2).id);
    assert.equal(f.groupFor(1).title, names[1]);
    assert.equal(f.groupFor(2).title, names[0]);
  });
}

test("rejects a cached group ID now belonging to another container", async () => {
  const f = fixture({
    tabs: [
      { id: 1, cookieStoreId: B, groupId: 10 },
      { id: 2, cookieStoreId: A },
    ],
    groups: [{ id: 10, title: "Client-B" }],
    map: { [`1::${A}`]: 10, [`1::${B}`]: 10 },
  });
  await f.run("handleSingleTab(2)");
  assert.equal(f.groupFor(1).id, 10);
  assert.equal(f.groupFor(1).title, "Client-B");
  assert.notEqual(f.groupFor(2).id, 10);
  assert.equal(f.state.storage.containerGroupMap[`1::${A}`], f.groupFor(2).id);
});

test("regroup repairs a mixed group and conflicting cached entries", async () => {
  const f = fixture({
    tabs: [
      { id: 1, cookieStoreId: A, groupId: 10 },
      { id: 2, cookieStoreId: B, groupId: 10 },
    ],
    groups: [{ id: 10, title: "Client-B" }],
    map: { [`1::${A}`]: 10, [`1::${B}`]: 10 },
  });
  await f.run();
  assert.notEqual(f.groupFor(1).id, f.groupFor(2).id);
  assert.equal(f.groupFor(1).title, "Client-A");
  assert.equal(f.groupFor(2).title, "Client-B");
  const ids = f.state.tabs.map((tab) => tab.groupId);
  await f.run();
  assert.deepEqual(
    f.state.tabs.map((tab) => tab.groupId),
    ids
  );
});

for (const title of ["Old name", "Client-A ♪"]) {
  test(`recovers a container's group without cache, title: ${title}`, async () => {
    const f = fixture({
      tabs: [
        { id: 1, cookieStoreId: A, groupId: 10 },
        { id: 2, cookieStoreId: A },
      ],
      groups: [{ id: 10, title }],
    });
    await f.run("handleSingleTab(2)");
    assert.equal(f.groupFor(2).id, 10);
    assert.equal(f.groupFor(2).title, "Client-A");
  });
}

test("does not adopt another container's group with a matching title", async () => {
  const f = fixture({
    tabs: [
      { id: 1, cookieStoreId: B, groupId: 10 },
      { id: 2, cookieStoreId: A },
    ],
    groups: [{ id: 10, title: "Client-A" }],
  });
  await f.run("handleSingleTab(2)");
  assert.notEqual(f.groupFor(2).id, 10);
});

test("keeps windows separate and replaces missing or wrong-window cache entries", async () => {
  const f = fixture({
    tabs: [
      { id: 1, cookieStoreId: A, groupId: 10 },
      { id: 2, windowId: 2, cookieStoreId: A },
    ],
    groups: [{ id: 10, title: "Client-A" }],
    map: { [`1::${A}`]: 999, [`2::${A}`]: 10 },
  });
  await f.run();
  assert.equal(f.groupFor(1).id, 10);
  assert.notEqual(f.groupFor(2).id, 10);
  assert.equal(f.groupFor(2).windowId, 2);
});

test("leaves pinned, default and unknown-container tabs alone", async () => {
  const f = fixture({
    tabs: [
      { id: 1, cookieStoreId: A, pinned: true },
      { id: 2, cookieStoreId: "firefox-default" },
      { id: 3, cookieStoreId: "deleted-container" },
      { id: 4 },
    ],
  });
  await f.run();
  assert.ok(f.state.tabs.every((tab) => tab.groupId === -1));
});
