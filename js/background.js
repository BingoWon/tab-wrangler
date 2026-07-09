"use strict";

const APP_NAME = "Tab Wrangler";
const DEBUG = true;
const STORAGE_KEY = "tabWranglerState";
const MAX_HISTORY_PER_WINDOW = 80;
const DUPLICATE_GUARD_MS = 1000;
const RESTORE_POSITION_MS = 10000;
const ACTIVATION_GRACE_MS = 1200;

const SPECIAL_URL_PREFIXES = [
  "about:",
  "chrome://",
  "edge://",
  "moz-extension://",
  "chrome-extension://",
  "safari-extension://",
  "safari-web-extension://",
  "data:",
  "javascript:",
];

const BLANK_URL_PREFIXES = [
  "about:blank",
  "about:newtab",
  "chrome://newtab",
  "chrome-search://local-ntp/local-ntp.html",
  "edge://newtab",
  "favorites://",
];

const tabsById = new Map();
const windowsById = new Map();
const internalClosures = new Set();
const recentActivations = new Map();
const recentlyClosedDuplicates = new Map();
const closedTabPositions = new Map();
const newTabsPendingActivation = new Set();

let initializationPromise = null;
let persistQueued = false;

function callChrome(invoker) {
  return new Promise((resolve, reject) => {
    invoker((result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result);
    });
  });
}

function reportError(context, error) {
  console.error(`${APP_NAME}: ${context}`, error);
}

function debug(message, data) {
  if (!DEBUG) return;

  if (data === undefined) {
    console.info(`${APP_NAME}: ${message}`);
  } else {
    console.info(`${APP_NAME}: ${message}`, data);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(url) {
  if (!url) return "";

  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

function tabUrl(tab) {
  return normalizeUrl(tab?.url || tab?.pendingUrl || "");
}

function tabSummary(tab) {
  if (!tab) return null;

  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    active: tab.active,
    pinned: tab.pinned,
    status: tab.status,
    url: tab.url,
    pendingUrl: tab.pendingUrl,
  };
}

function hasPrefix(url, prefixes) {
  return prefixes.some((prefix) => url.startsWith(prefix));
}

function isSpecialUrl(url) {
  return !url || hasPrefix(url, SPECIAL_URL_PREFIXES);
}

function isBlankUrl(url) {
  return !url || hasPrefix(url, BLANK_URL_PREFIXES);
}

function ensureWindow(windowId) {
  if (!windowsById.has(windowId)) {
    windowsById.set(windowId, {
      id: windowId,
      activeTabId: null,
      history: [],
    });
  }

  return windowsById.get(windowId);
}

function uniqueTabIds(ids) {
  const seen = new Set();
  const result = [];

  for (const id of ids) {
    if (typeof id !== "number" || seen.has(id) || !tabsById.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

function snapshotTab(tab, existing = {}) {
  return {
    id: tab.id,
    url: tabUrl(tab),
    windowId: tab.windowId,
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    index: typeof tab.index === "number" ? tab.index : existing.index ?? -1,
    status: tab.status || existing.status || "complete",
    createdAt: existing.createdAt || Date.now(),
  };
}

function rememberTab(tab) {
  if (!tab || typeof tab.id !== "number") return null;

  const existing = tabsById.get(tab.id);
  const snapshot = snapshotTab(tab, existing);
  tabsById.set(tab.id, snapshot);

  const windowState = ensureWindow(snapshot.windowId);
  if (!windowState.history.includes(snapshot.id)) {
    windowState.history.push(snapshot.id);
  }

  if (snapshot.active) {
    promoteActiveTab(snapshot.windowId, snapshot.id);
  }

  return snapshot;
}

function promoteActiveTab(windowId, tabId) {
  const windowState = ensureWindow(windowId);
  windowState.activeTabId = tabId;
  windowState.history = uniqueTabIds([
    tabId,
    ...windowState.history.filter((id) => id !== tabId),
  ]).slice(0, MAX_HISTORY_PER_WINDOW);

  for (const tab of tabsById.values()) {
    if (tab.windowId === windowId) {
      tab.active = tab.id === tabId;
    }
  }
}

function removeTabFromWindow(windowId, tabId) {
  const windowState = windowsById.get(windowId);
  if (!windowState) return;

  windowState.history = windowState.history.filter((id) => id !== tabId);
  if (windowState.activeTabId === tabId) {
    windowState.activeTabId = windowState.history[0] || null;
  }
}

async function getTab(tabId) {
  return callChrome((callback) => chrome.tabs.get(tabId, callback));
}

async function queryTabs(queryInfo) {
  return callChrome((callback) => chrome.tabs.query(queryInfo, callback));
}

async function getAllWindows() {
  if (!chrome.windows?.getAll) {
    debug("windows.getAll unavailable; falling back to tabs.query");

    const allTabs = await queryTabs({});
    const windows = new Map();

    for (const tab of allTabs) {
      if (!windows.has(tab.windowId)) {
        windows.set(tab.windowId, {
          id: tab.windowId,
          focused: Boolean(tab.active),
          tabs: [],
        });
      }

      windows.get(tab.windowId).tabs.push(tab);
    }

    return Array.from(windows.values());
  }

  return callChrome((callback) =>
    chrome.windows.getAll({ populate: true }, callback)
  );
}

async function updateTab(tabId, updateProperties) {
  return callChrome((callback) =>
    chrome.tabs.update(tabId, updateProperties, callback)
  );
}

async function removeTab(tabId) {
  return callChrome((callback) => chrome.tabs.remove(tabId, callback));
}

async function moveTab(tabId, moveProperties) {
  return callChrome((callback) =>
    chrome.tabs.move(tabId, moveProperties, callback)
  );
}

async function loadStoredState() {
  try {
    const result = await callChrome((callback) =>
      chrome.storage.local.get(STORAGE_KEY, callback)
    );
    const windows = result[STORAGE_KEY]?.windows || {};
    debug("loaded stored state", {
      windows: Object.keys(windows).length,
      savedAt: result[STORAGE_KEY]?.savedAt || null,
    });
    return windows;
  } catch (error) {
    reportError("could not load stored tab state", error);
    return {};
  }
}

async function persistState() {
  const windows = {};

  for (const [windowId, state] of windowsById) {
    const history = uniqueTabIds(state.history).slice(0, MAX_HISTORY_PER_WINDOW);
    if (!history.length) continue;

    windows[windowId] = {
      activeTabId: state.activeTabId,
      history,
    };
  }

  try {
    await callChrome((callback) =>
      chrome.storage.local.set(
        {
          [STORAGE_KEY]: {
            savedAt: Date.now(),
            windows,
          },
        },
        callback
      )
    );
  } catch (error) {
    reportError("could not persist tab state", error);
  }
}

function queuePersist() {
  if (persistQueued) return;

  persistQueued = true;
  queueMicrotask(() => {
    persistQueued = false;
    void persistState();
  });
}

function pruneTransientState() {
  const now = Date.now();

  for (const [url, timestamp] of recentlyClosedDuplicates) {
    if (now - timestamp > DUPLICATE_GUARD_MS) {
      recentlyClosedDuplicates.delete(url);
    }
  }

  for (const [windowId, recordsByUrl] of closedTabPositions) {
    for (const [url, records] of recordsByUrl) {
      const freshRecords = records.filter(
        (record) => now - record.timestamp <= RESTORE_POSITION_MS
      );

      if (freshRecords.length) {
        recordsByUrl.set(url, freshRecords);
      } else {
        recordsByUrl.delete(url);
      }
    }

    if (!recordsByUrl.size) {
      closedTabPositions.delete(windowId);
    }
  }
}

async function initializeState() {
  debug("initializing state");

  const [storedWindows, browserWindows] = await Promise.all([
    loadStoredState(),
    getAllWindows(),
  ]);

  tabsById.clear();
  windowsById.clear();
  recentActivations.clear();
  newTabsPendingActivation.clear();
  pruneTransientState();

  for (const browserWindow of browserWindows) {
    const windowState = ensureWindow(browserWindow.id);
    const tabIds = [];
    let activeTabId = null;

    for (const tab of browserWindow.tabs || []) {
      const snapshot = snapshotTab(tab);
      tabsById.set(snapshot.id, snapshot);
      tabIds.push(snapshot.id);

      if (snapshot.active) {
        activeTabId = snapshot.id;
      }
    }

    const storedHistory = storedWindows[browserWindow.id]?.history || [];
    windowState.activeTabId = activeTabId || tabIds[0] || null;
    windowState.history = uniqueTabIds([
      windowState.activeTabId,
      ...storedHistory,
      ...tabIds,
    ]).slice(0, MAX_HISTORY_PER_WINDOW);
  }

  debug("state initialized", {
    browserWindows: browserWindows.length,
    storedWindows: Object.keys(storedWindows).length,
    tabs: tabsById.size,
    windows: windowsById.size,
  });

  queuePersist();
}

function readyState(force = false) {
  if (force || !initializationPromise) {
    debug(force ? "forcing state initialization" : "starting state initialization");
    initializationPromise = initializeState().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

function withState(handler) {
  return (...args) => {
    void readyState()
      .then(() => handler(...args))
      .catch((error) => reportError(`handler failed: ${handler.name}`, error));
  };
}

async function syncWindowTabs(windowId) {
  const browserTabs = await queryTabs({ windowId });
  const liveIds = new Set();
  let activeTabId = null;

  for (const tab of browserTabs) {
    const snapshot = rememberTab(tab);
    liveIds.add(snapshot.id);

    if (snapshot.active) {
      activeTabId = snapshot.id;
    }
  }

  for (const [tabId, tab] of tabsById) {
    if (tab.windowId === windowId && !liveIds.has(tabId)) {
      tabsById.delete(tabId);
    }
  }

  const windowState = ensureWindow(windowId);
  windowState.history = uniqueTabIds(windowState.history).filter((id) =>
    liveIds.has(id)
  );

  if (activeTabId) {
    promoteActiveTab(windowId, activeTabId);
  }
}

async function closeTab(tabId, { recordPosition = true } = {}) {
  debug("closing tab", { tabId, recordPosition });

  if (!recordPosition) {
    internalClosures.add(tabId);
  }

  try {
    await removeTab(tabId);
    debug("closed tab", { tabId, recordPosition });
    setTimeout(() => internalClosures.delete(tabId), ACTIVATION_GRACE_MS * 2);
  } catch (error) {
    internalClosures.delete(tabId);

    if (!error.message.includes("No tab with id")) {
      reportError(`could not close tab ${tabId}`, error);
    }
  }
}

async function activateTab(tabId) {
  debug("activating tab", { tabId });
  const tab = await updateTab(tabId, { active: true });
  const snapshot = rememberTab(tab);
  promoteActiveTab(snapshot.windowId, snapshot.id);
  debug("activated tab", { tab: tabSummary(tab) });
  return snapshot;
}

async function maybeActivateNewTab(tab) {
  const current = tabsById.get(tab.id) || rememberTab(tab);
  if (!current) return null;
  if (!newTabsPendingActivation.has(current.id)) return current;

  if (current.active || current.pinned) {
    newTabsPendingActivation.delete(current.id);
    return current;
  }

  if (isSpecialUrl(current.url) || isBlankUrl(current.url)) return current;

  newTabsPendingActivation.delete(current.id);
  const age = Date.now() - current.createdAt;
  debug("new tab activation candidate", {
    tab: current,
    age,
  });

  try {
    return await activateTab(current.id);
  } catch (error) {
    reportError(`could not activate new tab ${current.id}`, error);
    return current;
  }
}

function rememberClosedPosition(tab) {
  if (!tab?.url || isSpecialUrl(tab.url) || isBlankUrl(tab.url)) return;

  if (!closedTabPositions.has(tab.windowId)) {
    closedTabPositions.set(tab.windowId, new Map());
  }

  const recordsByUrl = closedTabPositions.get(tab.windowId);
  const records = recordsByUrl.get(tab.url) || [];
  records.unshift({
    index: tab.index,
    timestamp: Date.now(),
  });
  recordsByUrl.set(tab.url, records.slice(0, 5));

  debug("recorded closed tab position", {
    tabId: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    url: tab.url,
  });
}

function consumeClosedPosition(windowId, url) {
  pruneTransientState();

  const recordsByUrl = closedTabPositions.get(windowId);
  const records = recordsByUrl?.get(url);
  if (!records?.length) return null;

  const [record, ...remaining] = records;
  if (remaining.length) {
    recordsByUrl.set(url, remaining);
  } else {
    recordsByUrl.delete(url);
  }

  if (!recordsByUrl.size) {
    closedTabPositions.delete(windowId);
  }

  return record;
}

async function maybeRestorePosition(tab) {
  const url = tabUrl(tab);
  if (isSpecialUrl(url) || isBlankUrl(url)) return;

  const recordsByUrl = closedTabPositions.get(tab.windowId);
  if (!recordsByUrl?.has(url)) return;

  if (typeof chrome.tabs.move !== "function") {
    debug("restore-position skipped: tabs.move unavailable", {
      tab: tabSummary(tab),
      url,
    });
    return;
  }

  debug("restore-position candidate found", {
    tab: tabSummary(tab),
    url,
  });

  await delay(100);

  let browserTabs;
  try {
    browserTabs = await queryTabs({ windowId: tab.windowId });
  } catch (error) {
    reportError("could not inspect tabs before position restore", error);
    return;
  }

  const currentTab = browserTabs.find((candidate) => candidate.id === tab.id);
  if (!currentTab || currentTab.index !== browserTabs.length - 1) {
    debug("restore-position skipped: tab is not at window end", {
      tabId: tab.id,
      currentIndex: currentTab?.index ?? null,
      tabCount: browserTabs.length,
    });
    return;
  }

  const record = consumeClosedPosition(tab.windowId, url);
  if (!record) return;

  const targetIndex = Math.min(record.index, browserTabs.length - 1);
  if (targetIndex === currentTab.index) {
    debug("restore-position skipped: already at target index", {
      tabId: tab.id,
      targetIndex,
    });
    return;
  }

  try {
    const moved = await moveTab(tab.id, { index: targetIndex });
    rememberTab(Array.isArray(moved) ? moved[0] : moved);
    await syncWindowTabs(tab.windowId);
    debug("restored tab position", {
      tabId: tab.id,
      fromIndex: currentTab.index,
      toIndex: targetIndex,
    });
  } catch (error) {
    reportError(`could not restore tab ${tab.id} position`, error);
  }
}

function isDuplicateGuarded(url) {
  const timestamp = recentlyClosedDuplicates.get(url);
  return Boolean(timestamp && Date.now() - timestamp <= DUPLICATE_GUARD_MS);
}

function findOriginalTab(current) {
  const duplicates = [];

  for (const tab of tabsById.values()) {
    if (tab.id === current.id || tab.windowId !== current.windowId) continue;
    if (tab.url === current.url) {
      duplicates.push(tab);
    }
  }

  return duplicates.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.index - b.index;
  })[0];
}

async function maybeCloseDuplicate(tab) {
  const current = tabsById.get(tab.id) || rememberTab(tab);
  if (!current?.url || isSpecialUrl(current.url) || isBlankUrl(current.url)) {
    return;
  }

  if (current.pinned || isDuplicateGuarded(current.url)) return;

  const original = findOriginalTab(current);
  if (!original) return;

  const isFreshTab = Date.now() - current.createdAt < 3000;
  if (current.active && !isFreshTab) {
    debug("duplicate skipped: active tab is not fresh", {
      current,
      original,
    });
    return;
  }

  recentlyClosedDuplicates.set(current.url, Date.now());

  debug("duplicate found", {
    duplicate: current,
    original,
    isFreshTab,
  });

  if (current.active && !original.active) {
    await activateTab(original.id);
  }

  await closeTab(current.id, { recordPosition: false });
  debug("duplicate closed", {
    duplicateTabId: current.id,
    originalTabId: original.id,
    url: current.url,
  });
}

async function closeBlankTabIfUnused(tabId) {
  await readyState();

  let tab;
  try {
    tab = await getTab(tabId);
  } catch {
    return;
  }

  const snapshot = rememberTab(tab);
  if (snapshot.active || snapshot.pinned || !isBlankUrl(snapshot.url)) {
    debug("blank cleanup skipped", {
      tabId,
      active: snapshot.active,
      pinned: snapshot.pinned,
      url: snapshot.url,
    });
    return;
  }

  const siblingTabs = await queryTabs({ windowId: snapshot.windowId });
  if (siblingTabs.length <= 1) {
    debug("blank cleanup skipped: last tab in window", {
      tabId,
      windowId: snapshot.windowId,
    });
    return;
  }

  await closeTab(snapshot.id, { recordPosition: false });
  debug("blank tab closed", {
    tabId: snapshot.id,
    windowId: snapshot.windowId,
    url: snapshot.url,
  });
}

function scheduleBlankTabCleanup(tabId) {
  debug("blank cleanup scheduled", { tabId });

  setTimeout(() => {
    void closeBlankTabIfUnused(tabId).catch((error) =>
      reportError(`could not clean blank tab ${tabId}`, error)
    );
  }, 150);
}

async function handleTabCreated(tab) {
  debug("event tabs.onCreated", { tab: tabSummary(tab) });
  if (typeof tab.id === "number") {
    newTabsPendingActivation.add(tab.id);
  }

  const current = await maybeActivateNewTab(tab);
  if (!current) {
    queuePersist();
    return;
  }

  tab = current;
  await maybeRestorePosition(tab);
  await maybeCloseDuplicate(tab);
  queuePersist();
}

async function handleTabUpdated(tabId, changeInfo, tab) {
  debug("event tabs.onUpdated", {
    tabId,
    changeInfo,
    tab: tabSummary(tab),
  });

  rememberTab(tab);

  if (changeInfo.url || changeInfo.status === "complete") {
    tab = await maybeActivateNewTab(tab);
    await maybeRestorePosition(tab);
    await maybeCloseDuplicate(tab);
  }

  queuePersist();
}

async function handleTabActivated({ tabId, windowId }) {
  debug("event tabs.onActivated", { tabId, windowId });

  const windowState = ensureWindow(windowId);
  const previousTabId = windowState.activeTabId;
  const previousHistory = [...windowState.history];

  if (previousTabId && previousTabId !== tabId) {
    recentActivations.set(windowId, {
      previousTabId,
      previousHistory,
      timestamp: Date.now(),
    });

    const previousTab = tabsById.get(previousTabId);
    if (previousTab) {
      previousTab.active = false;
    }

    scheduleBlankTabCleanup(previousTabId);
  }

  try {
    rememberTab(await getTab(tabId));
  } catch {
    promoteActiveTab(windowId, tabId);
  }

  queuePersist();
}

async function handleTabRemoved(tabId, removeInfo) {
  const tab = tabsById.get(tabId);
  const wasInternal = internalClosures.delete(tabId);
  const windowId = removeInfo.windowId || tab?.windowId;
  const activation = windowId ? recentActivations.get(windowId) : null;
  const wasJustActivatedAway =
    activation?.previousTabId === tabId &&
    Date.now() - activation.timestamp <= ACTIVATION_GRACE_MS;
  const historyBeforeRemoval = wasJustActivatedAway
    ? activation.previousHistory
    : [...(windowsById.get(windowId)?.history || [])];
  const wasActive =
    windowsById.get(windowId)?.activeTabId === tabId ||
    Boolean(tab?.active) ||
    wasJustActivatedAway;

  debug("event tabs.onRemoved", {
    tabId,
    removeInfo,
    tab,
    wasInternal,
    wasActive,
    wasJustActivatedAway,
  });

  if (!removeInfo.isWindowClosing && !wasInternal && tab) {
    rememberClosedPosition(tab);
  }

  tabsById.delete(tabId);
  newTabsPendingActivation.delete(tabId);

  if (windowId) {
    removeTabFromWindow(windowId, tabId);
  }

  if (!removeInfo.isWindowClosing && !wasInternal && wasActive) {
    const nextTabId = historyBeforeRemoval.find(
      (candidateId) => candidateId !== tabId && tabsById.has(candidateId)
    );

    if (nextTabId) {
      debug("restoring previous active tab", {
        closedTabId: tabId,
        nextTabId,
      });
      await delay(50);
      await activateTab(nextTabId).catch((error) =>
        reportError(`could not restore last active tab ${nextTabId}`, error)
      );
    }
  }

  queuePersist();
}

async function handleTabMoved(tabId, moveInfo) {
  debug("event tabs.onMoved", { tabId, moveInfo });

  const tab = tabsById.get(tabId);
  if (tab) {
    tab.index = moveInfo.toIndex;
    tab.windowId = moveInfo.windowId;
  }

  await syncWindowTabs(moveInfo.windowId);
  queuePersist();
}

function handleTabDetached(tabId, detachInfo) {
  debug("event tabs.onDetached", { tabId, detachInfo });
  removeTabFromWindow(detachInfo.oldWindowId, tabId);
  queuePersist();
}

async function handleTabAttached(tabId, attachInfo) {
  debug("event tabs.onAttached", { tabId, attachInfo });

  try {
    rememberTab(await getTab(tabId));
    await syncWindowTabs(attachInfo.newWindowId);
  } catch (error) {
    reportError(`could not attach tab ${tabId}`, error);
  }

  queuePersist();
}

async function handleTabReplaced(addedTabId, removedTabId) {
  debug("event tabs.onReplaced", { addedTabId, removedTabId });

  const oldTab = tabsById.get(removedTabId);
  const shouldActivateNewTab = newTabsPendingActivation.delete(removedTabId);
  tabsById.delete(removedTabId);
  if (shouldActivateNewTab) {
    newTabsPendingActivation.add(addedTabId);
  }

  if (oldTab) {
    removeTabFromWindow(oldTab.windowId, removedTabId);
  }

  try {
    const tab = await getTab(addedTabId);
    rememberTab(tab);
    await maybeCloseDuplicate(await maybeActivateNewTab(tab));
  } catch (error) {
    reportError(`could not replace tab ${removedTabId}`, error);
  }

  queuePersist();
}

function handleWindowRemoved(windowId) {
  debug("event windows.onRemoved", { windowId });

  windowsById.delete(windowId);
  recentActivations.delete(windowId);
  closedTabPositions.delete(windowId);

  for (const [tabId, tab] of tabsById) {
    if (tab.windowId === windowId) {
      tabsById.delete(tabId);
      newTabsPendingActivation.delete(tabId);
    }
  }

  queuePersist();
}

debug("service worker loaded", {
  runtimeId: chrome.runtime.id,
  version:
    typeof chrome.runtime.getManifest === "function"
      ? chrome.runtime.getManifest().version
      : null,
  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
});

debug("api support", {
  windowsGetAll: typeof chrome.windows?.getAll === "function",
  windowsOnRemoved: Boolean(chrome.windows?.onRemoved),
  tabsMove: typeof chrome.tabs.move === "function",
  tabsOnMoved: Boolean(chrome.tabs.onMoved),
  tabsOnReplaced: Boolean(chrome.tabs.onReplaced),
  tabsOnAttached: Boolean(chrome.tabs.onAttached),
  tabsOnDetached: Boolean(chrome.tabs.onDetached),
  storageLocal: Boolean(chrome.storage?.local),
});

chrome.runtime.onInstalled.addListener(() => {
  debug("event runtime.onInstalled");
  void readyState(true).catch((error) =>
    reportError("could not initialize after install", error)
  );
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    debug("event runtime.onStartup");
    void readyState(true).catch((error) =>
      reportError("could not initialize on startup", error)
    );
  });
}

chrome.tabs.onCreated.addListener(withState(handleTabCreated));
chrome.tabs.onUpdated.addListener(withState(handleTabUpdated));
chrome.tabs.onActivated.addListener(withState(handleTabActivated));
chrome.tabs.onRemoved.addListener(withState(handleTabRemoved));

if (chrome.tabs.onMoved) {
  chrome.tabs.onMoved.addListener(withState(handleTabMoved));
}

if (chrome.tabs.onReplaced) {
  chrome.tabs.onReplaced.addListener(withState(handleTabReplaced));
}

if (chrome.windows?.onRemoved) {
  chrome.windows.onRemoved.addListener(withState(handleWindowRemoved));
}

if (chrome.tabs.onDetached) {
  chrome.tabs.onDetached.addListener(withState(handleTabDetached));
}

if (chrome.tabs.onAttached) {
  chrome.tabs.onAttached.addListener(withState(handleTabAttached));
}

void readyState().catch((error) => reportError("could not initialize", error));
