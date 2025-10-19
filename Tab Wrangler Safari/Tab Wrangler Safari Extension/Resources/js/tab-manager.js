"use strict";

/**
 * TabManager - 统一的标签页管理系统
 * 提供中央事件分发、状态同步和优先级管理
 */
const TabManager = {
  // 标签页状态存储
  tabs: new Map(),

  // 窗口状态存储
  windows: new Map(),

  // 模块注册表
  modules: new Map(),

  // 正在处理的标签页关闭事件，防止重复处理
  processingRemovals: new Set(),

  /**
   * 初始化管理器
   */
  async initialize() {
    console.log("🎯 TabManager: 初始化");

    this.tabs.clear();
    this.windows.clear();
    this.modules.clear();

    await this.loadPersistedState();
    await this.loadCurrentState();

    if (this.windows.size === 0) {
      throw new Error("TabManager 初始化失败：没有窗口");
    }

    this.setupEventListeners();
    this.startPeriodicSave();

    console.log(`🎯 TabManager: 初始化完成 (${this.tabs.size} 标签页, ${this.windows.size} 窗口)`);
  },

  /**
   * 加载当前标签页和窗口状态
   */
  async loadCurrentState() {
    return new Promise((resolve) => {
      chrome.windows.getAll({ populate: true }, (windows) => {
        windows.forEach((window) => {
          // 检查是否已有持久化的窗口状态
          let windowState = this.windows.get(window.id);

          if (!windowState) {
            // 创建新的窗口状态
            windowState = {
              id: window.id,
              focused: window.focused,
              activeTabId: null,
              tabHistory: [],
            };
            this.windows.set(window.id, windowState);
          } else {
            // 更新现有状态的基本信息
            windowState.focused = window.focused;
          }

          // 存储标签页信息
          window.tabs.forEach((tab) => {
            this.tabs.set(tab.id, {
              id: tab.id,
              url: tab.url,
              windowId: tab.windowId,
              active: tab.active,
              index: tab.index,
              status: tab.status,
            });

            // 更新活动标签页
            if (tab.active) {
              windowState.activeTabId = tab.id;

              // 如果历史记录中没有这个标签页，添加到最前面
              if (!windowState.tabHistory.includes(tab.id)) {
                windowState.tabHistory.unshift(tab.id);
              }
            } else {
              // 如果历史记录中没有这个标签页，添加到末尾
              if (!windowState.tabHistory.includes(tab.id)) {
                windowState.tabHistory.push(tab.id);
              }
            }
          });

          // 清理历史记录中不存在的标签页
          windowState.tabHistory = windowState.tabHistory.filter((tabId) =>
            window.tabs.some((tab) => tab.id === tabId)
          );
        });


        resolve();
      });
    });
  },

  /**
   * 注册功能模块
   */
  registerModule(name, module, priority = 0) {
    this.modules.set(name, { module, priority });
    console.log(`🎯 TabManager: 注册模块 ${name} (优先级 ${priority})`);
  },

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    chrome.tabs.onCreated.addListener(this.handleTabCreated.bind(this));
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
    chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this));
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));
    chrome.tabs.onReplaced.addListener(this.handleTabReplaced.bind(this));
    chrome.windows.onRemoved.addListener(this.handleWindowRemoved.bind(this));
  },

  /**
   * 分发事件到所有注册的模块
   */
  async dispatchEvent(eventType, data) {
    console.log("┌─────────────────────────────────────────┐");
    console.log(`│  📡 分发事件: ${eventType.padEnd(20)} │`);
    console.log("└─────────────────────────────────────────┘");

    const sortedModules = Array.from(this.modules.entries()).sort(
      ([, a], [, b]) => b.priority - a.priority
    );

    console.log("📋 已注册的模块（按优先级排序）:");
    sortedModules.forEach(([name, { module, priority }]) => {
      const hasHandler = typeof module[eventType] === "function";
      console.log(`  ${hasHandler ? "✅" : "⏭️ "} ${name} (优先级 ${priority}) ${hasHandler ? "- 将处理此事件" : "- 无此事件处理器"}`);
    });

    for (const [name, { module }] of sortedModules) {
      try {
        const handler = module[eventType];
        if (typeof handler === "function") {
          console.log(`🔄 调用 ${name}.${eventType}() ...`);
          await handler.call(module, data);
          console.log(`✅ ${name}.${eventType}() 执行完成`);
        }
      } catch (error) {
        console.error(`❌ TabManager: ${name}.${eventType} 失败:`, error);
      }
    }

    console.log("✅ 事件分发完成");
    console.log("└─────────────────────────────────────────┘");
  },

  /**
   * 处理标签页创建事件
   */
  handleTabCreated(tab) {
    // 🔍 详细调试日志
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🆕 TabManager: onTabCreated 事件触发");
    console.log("📋 标签页详细信息:", {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      status: tab.status,
      windowId: tab.windowId,
      index: tab.index,
      openerTabId: tab.openerTabId,
      pendingUrl: tab.pendingUrl,
    });
    console.log("⏰ 时间戳:", new Date().toISOString());

    this.tabs.set(tab.id, {
      id: tab.id,
      url: tab.url,
      windowId: tab.windowId,
      active: tab.active,
      index: tab.index,
      status: tab.status,
    });

    // 更新窗口状态
    const windowState = this.windows.get(tab.windowId);
    if (windowState) {
      if (tab.active) {
        console.log("✅ 标签页已激活，更新窗口状态");
        windowState.activeTabId = tab.id;
        windowState.tabHistory.unshift(tab.id);
      } else {
        console.log("⏸️  标签页在后台创建");
        windowState.tabHistory.push(tab.id);
      }
    }

    console.log("📤 分发 onTabCreated 事件到所有模块");
    this.dispatchEvent("onTabCreated", {
      tab,
      tabState: this.tabs.get(tab.id),
    });
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  },

  /**
   * 处理标签页更新事件
   */
  handleTabUpdated(tabId, changeInfo, tab) {
    // 🔍 详细调试日志
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔄 TabManager: onTabUpdated 事件触发");
    console.log("📋 标签页 ID:", tabId);
    console.log("📝 变更信息 (changeInfo):", changeInfo);
    console.log("📋 标签页完整信息:", {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      status: tab.status,
      windowId: tab.windowId,
      index: tab.index,
    });
    console.log("⏰ 时间戳:", new Date().toISOString());

    const tabState = this.tabs.get(tabId);
    if (tabState) {
      console.log("📊 更新前的状态:", { ...tabState });
      // 更新状态
      Object.assign(tabState, {
        url: tab.url,
        status: tab.status,
        index: tab.index,
      });
      console.log("📊 更新后的状态:", { ...tabState });
    } else {
      console.warn("⚠️  警告: 标签页状态不存在于 TabManager 中");
    }

    console.log("📤 分发 onTabUpdated 事件到所有模块");
    this.dispatchEvent("onTabUpdated", {
      tabId,
      changeInfo,
      tab,
      tabState: this.tabs.get(tabId),
    });
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  },

  /**
   * 处理标签页激活事件
   */
  handleTabActivated(activeInfo) {
    const { tabId, windowId } = activeInfo;

    // 🔍 详细调试日志
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⚡ TabManager: onTabActivated 事件触发");
    console.log("📋 激活信息:", { tabId, windowId });
    console.log("⏰ 时间戳:", new Date().toISOString());

    let windowState = this.windows.get(windowId);

    if (!windowState) {
      console.log("🆕 创建新的窗口状态");
      windowState = {
        id: windowId,
        focused: true,
        activeTabId: null,
        tabHistory: [],
      };
      this.windows.set(windowId, windowState);
    }

    const previousActiveTabId = windowState.activeTabId;
    console.log("📊 窗口状态 (更新前):", {
      previousActiveTabId,
      tabHistory: [...windowState.tabHistory],
    });

    windowState.activeTabId = tabId;

    // 更新历史记录
    windowState.tabHistory = windowState.tabHistory.filter(id => id !== tabId);
    windowState.tabHistory.unshift(tabId);

    if (previousActiveTabId && previousActiveTabId !== tabId) {
      windowState.tabHistory = windowState.tabHistory.filter(id => id !== previousActiveTabId);
      windowState.tabHistory.splice(1, 0, previousActiveTabId);
    }

    console.log("📊 窗口状态 (更新后):", {
      activeTabId: windowState.activeTabId,
      tabHistory: [...windowState.tabHistory],
    });

    // 确保标签页状态存在
    if (!this.tabs.has(tabId)) {
      console.log("⚠️  标签页状态不存在，尝试获取");
      chrome.tabs.get(tabId, (tab) => {
        if (!chrome.runtime.lastError && tab) {
          console.log("✅ 成功获取标签页信息:", tab);
          this.tabs.set(tabId, {
            id: tab.id,
            url: tab.url,
            windowId: tab.windowId,
            active: tab.active,
            index: tab.index,
            status: tab.status,
          });
        } else {
          console.error("❌ 获取标签页信息失败:", chrome.runtime.lastError);
        }
      });
    }

    const activatedTabState = this.tabs.get(tabId);
    console.log("📋 被激活的标签页信息:", activatedTabState);
    console.log("📤 分发 onTabActivated 事件到所有模块");

    this.dispatchEvent("onTabActivated", {
      activeInfo,
      windowState,
      tabState: activatedTabState,
    });

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    this.saveState();
  },

  /**
   * 处理标签页关闭事件
   */
  async handleTabRemoved(tabId, removeInfo) {
    const { windowId, isWindowClosing } = removeInfo;

    if (this.processingRemovals.has(tabId)) return;

    this.processingRemovals.add(tabId);

    try {
      const tabState = this.tabs.get(tabId);
      const windowState = this.windows.get(windowId);

      await this.dispatchEvent("onTabRemoved", {
        tabId,
        removeInfo,
        tabState,
        windowState,
      });

      this.tabs.delete(tabId);

      if (!isWindowClosing && windowState) {
        windowState.tabHistory = windowState.tabHistory.filter(id => id !== tabId);
        if (windowState.activeTabId === tabId) {
          windowState.activeTabId = null;
        }
      }
    } finally {
      this.processingRemovals.delete(tabId);
    }
  },

  /**
   * 处理标签页替换事件
   */
  handleTabReplaced(addedTabId, removedTabId) {
    const oldTabState = this.tabs.get(removedTabId);
    this.tabs.delete(removedTabId);

    // 获取新标签页信息
    chrome.tabs.get(addedTabId, (tab) => {
      if (!chrome.runtime.lastError) {
        this.tabs.set(addedTabId, {
          id: tab.id,
          url: tab.url,
          windowId: tab.windowId,
          active: tab.active,
          index: tab.index,
          status: tab.status,
        });

        this.dispatchEvent("onTabReplaced", {
          addedTabId,
          removedTabId,
          oldTabState,
          newTabState: this.tabs.get(addedTabId),
        });
      }
    });
  },

  /**
   * 处理窗口关闭事件
   */
  handleWindowRemoved(windowId) {
    // 清理窗口相关的标签页
    for (const [tabId, tabState] of this.tabs) {
      if (tabState.windowId === windowId) {
        this.tabs.delete(tabId);
      }
    }

    const windowState = this.windows.get(windowId);
    this.windows.delete(windowId);

    this.dispatchEvent("onWindowRemoved", { windowId, windowState });
  },

  /**
   * 获取同一窗口中相同URL的标签页
   */
  getTabsByUrl(url, windowId) {
    const tabs = [];
    for (const [, tabState] of this.tabs) {
      if (
        tabState.url === url &&
        (!windowId || tabState.windowId === windowId)
      ) {
        tabs.push(tabState);
      }
    }
    return tabs;
  },

  /**
   * 获取窗口的标签页历史
   */
  getTabHistory(windowId) {
    const windowState = this.windows.get(windowId);
    return windowState ? windowState.tabHistory : [];
  },

  /**
   * 关闭指定标签页（公共方法）
   */
  async closeTab(tabId) {
    try {
      await chrome.tabs.get(tabId);
      await chrome.tabs.remove(tabId);
      console.log(`TabManager: 已关闭标签页 ${tabId}`);
    } catch (error) {
      if (!error.message?.includes("No tab with id")) {
        console.warn(`TabManager: 关闭标签页 ${tabId} 失败:`, error.message);
      }
    }
  },

  /**
   * 激活指定标签页（公共方法）
   */
  async activateTab(tabId, windowId) {
    console.log("┌─────────────────────────────────────────┐");
    console.log("│  🔧 TabManager.activateTab() 被调用    │");
    console.log("└─────────────────────────────────────────┘");
    console.log("📋 参数:", { tabId, windowId });
    console.log("⏰ 时间戳:", new Date().toISOString());

    try {
      console.log("🔍 步骤 1: 检查标签页是否存在");
      const tab = await chrome.tabs.get(tabId);
      console.log("✅ 标签页存在:", {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        active: tab.active,
        windowId: tab.windowId,
      });

      if (windowId) {
        console.log(`🔍 步骤 2: 聚焦窗口 ${windowId}`);
        await chrome.windows.update(windowId, { focused: true });
        console.log("✅ 窗口已聚焦");
      }

      console.log(`🔍 步骤 3: 激活标签页 ${tabId}`);
      await chrome.tabs.update(tabId, { active: true });
      console.log(`✅ TabManager: 已激活标签页 ${tabId}`);
      console.log("└─────────────────────────────────────────┘");
    } catch (error) {
      console.error("❌ TabManager: 激活标签页失败");
      console.error("错误详情:", error);
      console.warn(`TabManager: 激活标签页 ${tabId} 失败:`, error.message);
      console.log("└─────────────────────────────────────────┘");
    }
  },

  /**
   * 从持久化存储加载状态
   */
  async loadPersistedState() {
    try {
      const result = await chrome.storage.local.get(["windowStates", "lastSaved"]);
      const windowStates = result.windowStates || {};
      const lastSaved = result.lastSaved || 0;

      // 检查数据是否过期（1小时）
      const isStale = Date.now() - lastSaved > 3600000;

      if (!isStale && Object.keys(windowStates).length > 0) {
        for (const [windowId, state] of Object.entries(windowStates)) {
          this.windows.set(parseInt(windowId), {
            id: parseInt(windowId),
            focused: state.focused || false,
            activeTabId: state.activeTabId || null,
            tabHistory: state.tabHistory || [],
          });
        }
        console.log(`💾 TabManager: 恢复了 ${Object.keys(windowStates).length} 个窗口状态`);
      }
    } catch (error) {
      console.error("💾 TabManager: 加载状态失败:", error);
    }
  },

  /**
   * 保存状态到持久化存储
   */
  async saveState() {
    try {
      const windowStates = {};

      for (const [windowId, state] of this.windows) {
        if (state.tabHistory?.length > 0) {
          windowStates[windowId] = {
            focused: state.focused,
            activeTabId: state.activeTabId,
            tabHistory: state.tabHistory.slice(0, 50),
          };
        }
      }

      await chrome.storage.local.set({
        windowStates,
        lastSaved: Date.now(),
      });
    } catch (error) {
      console.error("💾 TabManager: 保存状态失败:", error);
    }
  },

  /**
   * 启动定期保存（每30秒）
   */
  startPeriodicSave() {
    setInterval(() => this.saveState(), 30000);
  },
};

// 导出管理器
globalThis.TabManager = TabManager;
