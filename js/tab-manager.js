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
    console.log("TabManager: 初始化统一管理系统");

    // 清理状态
    this.tabs.clear();
    this.windows.clear();
    this.modules.clear();

    // 先尝试从持久化存储恢复状态
    await this.loadPersistedState();

    // 然后加载当前状态（合并或补充）
    await this.loadCurrentState();

    // 验证初始化是否成功
    if (this.windows.size === 0) {
      console.error("TabManager: 初始化失败，没有加载到任何窗口状态");
      throw new Error("TabManager 初始化失败");
    }

    // 只有在状态完全加载后才设置事件监听
    this.setupEventListeners();

    // 启动定期保存
    this.startPeriodicSave();

    console.log("TabManager: 初始化完成，开始监听事件");
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

        console.log(
          `TabManager: 加载了 ${this.tabs.size} 个标签页，${this.windows.size} 个窗口`
        );
        resolve();
      });
    });
  },

  /**
   * 注册功能模块
   */
  registerModule(name, module, priority = 0) {
    this.modules.set(name, { module, priority });
    console.log(`TabManager: 注册模块 ${name}，优先级 ${priority}`);
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
    console.log(`📡 TabManager: 分发事件 ${eventType}`);

    // 按优先级排序模块
    const sortedModules = Array.from(this.modules.entries()).sort(
      ([, a], [, b]) => b.priority - a.priority
    );

    console.log(
      `📡 TabManager: 已注册模块:`,
      sortedModules.map(([name, { priority }]) => `${name}(${priority})`)
    );

    for (const [name, { module }] of sortedModules) {
      try {
        const handler = module[eventType];
        if (typeof handler === "function") {
          console.log(`📡 TabManager: 调用模块 ${name} 的 ${eventType} 处理器`);
          await handler.call(module, data);
          console.log(`📡 TabManager: 模块 ${name} 处理完成`);
        } else {
          console.log(`📡 TabManager: 模块 ${name} 没有 ${eventType} 处理器`);
        }
      } catch (error) {
        console.error(
          `TabManager: 模块 ${name} 处理事件 ${eventType} 时出错:`,
          error
        );
      }
    }

    console.log(`📡 TabManager: 事件 ${eventType} 分发完成`);
  },

  /**
   * 处理标签页创建事件
   */
  handleTabCreated(tab) {
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
        windowState.activeTabId = tab.id;
        windowState.tabHistory.unshift(tab.id);
      } else {
        windowState.tabHistory.push(tab.id);
      }
    }

    this.dispatchEvent("onTabCreated", {
      tab,
      tabState: this.tabs.get(tab.id),
    });
  },

  /**
   * 处理标签页更新事件
   */
  handleTabUpdated(tabId, changeInfo, tab) {
    const tabState = this.tabs.get(tabId);
    if (tabState) {
      // 更新状态
      Object.assign(tabState, {
        url: tab.url,
        status: tab.status,
        index: tab.index,
      });
    }

    this.dispatchEvent("onTabUpdated", {
      tabId,
      changeInfo,
      tab,
      tabState: this.tabs.get(tabId),
    });
  },

  /**
   * 处理标签页激活事件
   */
  handleTabActivated(activeInfo) {
    const { tabId, windowId } = activeInfo;
    let windowState = this.windows.get(windowId);

    console.log(
      `⚡ TabManager: 处理标签页激活事件 - 标签页: ${tabId}, 窗口: ${windowId}`
    );
    console.log(`⚡ TabManager: 窗口状态存在: ${!!windowState}`);

    // 如果窗口状态不存在，创建一个新的状态
    if (!windowState) {
      console.warn(
        `⚡ TabManager: 窗口状态不存在，创建新状态 - 窗口ID: ${windowId}`
      );
      windowState = {
        id: windowId,
        focused: true,
        activeTabId: null,
        tabHistory: [],
      };
      this.windows.set(windowId, windowState);
    }

    const previousActiveTabId = windowState.activeTabId;
    windowState.activeTabId = tabId;

    console.log(
      `⚡ TabManager: 上一个活动标签页: ${previousActiveTabId}, 新活动标签页: ${tabId}`
    );

    // 更新历史记录
    windowState.tabHistory = windowState.tabHistory.filter(
      (id) => id !== tabId
    );
    windowState.tabHistory.unshift(tabId);

    if (previousActiveTabId && previousActiveTabId !== tabId) {
      windowState.tabHistory = windowState.tabHistory.filter(
        (id) => id !== previousActiveTabId
      );
      windowState.tabHistory.splice(1, 0, previousActiveTabId);
    }

    console.log(`⚡ TabManager: 更新后的历史记录:`, windowState.tabHistory);

    // 确保标签页状态也存在
    let tabState = this.tabs.get(tabId);
    if (!tabState) {
      console.warn(
        `⚡ TabManager: 标签页状态不存在，获取标签页信息 - 标签页ID: ${tabId}`
      );
      // 异步获取标签页信息
      chrome.tabs.get(tabId, (tab) => {
        if (!chrome.runtime.lastError && tab) {
          this.tabs.set(tabId, {
            id: tab.id,
            url: tab.url,
            windowId: tab.windowId,
            active: tab.active,
            index: tab.index,
            status: tab.status,
          });
          console.log(`⚡ TabManager: 标签页状态已创建:`, this.tabs.get(tabId));
        }
      });
    }

    this.dispatchEvent("onTabActivated", {
      activeInfo,
      windowState,
      tabState: this.tabs.get(tabId),
    });

    // 立即保存状态变化
    this.saveState();
  },

  /**
   * 处理标签页关闭事件
   */
  async handleTabRemoved(tabId, removeInfo) {
    const { windowId, isWindowClosing } = removeInfo;

    // 防止重复处理同一个标签页
    if (this.processingRemovals.has(tabId)) {
      console.log(`🔥 TabManager: 标签页 ${tabId} 正在处理中，跳过重复处理`);
      return;
    }

    this.processingRemovals.add(tabId);

    try {
      const tabState = this.tabs.get(tabId);
      const windowState = this.windows.get(windowId);

      console.log(`🔥 TabManager: 标签页 ${tabId} 关闭，活动标签页: ${windowState?.activeTabId}`);

      // 分发事件给模块处理，等待所有模块完成
    await this.dispatchEvent("onTabRemoved", {
      tabId,
      removeInfo,
      tabState,
      windowState,
    });

      // 清理状态
      this.tabs.delete(tabId);

      if (!isWindowClosing && windowState) {
        windowState.tabHistory = windowState.tabHistory.filter(id => id !== tabId);
        if (windowState.activeTabId === tabId) {
          windowState.activeTabId = null;
        }
      }
    } finally {
      // 清理处理状态
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
   * 从持久化存储加载状态
   */
  async loadPersistedState() {
    try {
      const result = await chrome.storage.local.get([
        "windowStates",
        "lastSaved",
      ]);
      const windowStates = result.windowStates || {};
      const lastSaved = result.lastSaved || 0;

      // 检查数据是否过期（1小时）
      const isStale = Date.now() - lastSaved > 3600000;

      if (!isStale && Object.keys(windowStates).length > 0) {
        console.log("📦 TabManager: 从持久化存储恢复状态");

        for (const [windowId, state] of Object.entries(windowStates)) {
          this.windows.set(parseInt(windowId), {
            id: parseInt(windowId),
            focused: state.focused || false,
            activeTabId: state.activeTabId || null,
            tabHistory: state.tabHistory || [],
          });
        }

        console.log(
          `📦 TabManager: 恢复了 ${
            Object.keys(windowStates).length
          } 个窗口的状态`
        );
      } else {
        console.log("📦 TabManager: 没有有效的持久化状态或数据已过期");
      }
    } catch (error) {
      console.error("📦 TabManager: 加载持久化状态时出错:", error);
    }
  },

  /**
   * 保存状态到持久化存储
   */
  async saveState() {
    try {
      const windowStates = {};

      for (const [windowId, state] of this.windows) {
        // 只保存有历史记录的窗口
        if (state.tabHistory && state.tabHistory.length > 0) {
          windowStates[windowId] = {
            focused: state.focused,
            activeTabId: state.activeTabId,
            tabHistory: state.tabHistory.slice(0, 50), // 限制历史记录长度
          };
        }
      }

      await chrome.storage.local.set({
        windowStates,
        lastSaved: Date.now(),
      });

      console.log(
        `💾 TabManager: 保存了 ${Object.keys(windowStates).length} 个窗口的状态`
      );
    } catch (error) {
      console.error("💾 TabManager: 保存状态时出错:", error);
    }
  },

  /**
   * 启动定期保存
   */
  startPeriodicSave() {
    // 每30秒保存一次
    setInterval(() => {
      this.saveState();
    }, 30000);

    console.log("⏰ TabManager: 启动定期保存机制");
  },
};

// 导出管理器
globalThis.TabManager = TabManager;
