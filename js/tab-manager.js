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
  
  // 事件队列
  eventQueue: [],
  
  // 处理中标记
  processing: false,

  /**
   * 初始化管理器
   */
  async initialize() {
    console.log("TabManager: 初始化统一管理系统");
    
    // 清理状态
    this.tabs.clear();
    this.windows.clear();
    this.modules.clear();
    
    // 初始化当前状态
    await this.loadCurrentState();
    
    // 设置事件监听
    this.setupEventListeners();
  },

  /**
   * 加载当前标签页和窗口状态
   */
  async loadCurrentState() {
    return new Promise((resolve) => {
      chrome.windows.getAll({ populate: true }, (windows) => {
        windows.forEach(window => {
          // 存储窗口信息
          this.windows.set(window.id, {
            id: window.id,
            focused: window.focused,
            activeTabId: null,
            tabHistory: []
          });

          // 存储标签页信息
          window.tabs.forEach(tab => {
            this.tabs.set(tab.id, {
              id: tab.id,
              url: tab.url,
              windowId: tab.windowId,
              active: tab.active,
              index: tab.index,
              status: tab.status
            });

            // 设置活动标签页
            if (tab.active) {
              const windowState = this.windows.get(window.id);
              windowState.activeTabId = tab.id;
              windowState.tabHistory.unshift(tab.id);
            } else {
              this.windows.get(window.id).tabHistory.push(tab.id);
            }
          });
        });
        
        console.log(`TabManager: 加载了 ${this.tabs.size} 个标签页，${this.windows.size} 个窗口`);
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
    // 按优先级排序模块
    const sortedModules = Array.from(this.modules.entries())
      .sort(([,a], [,b]) => b.priority - a.priority);

    for (const [name, { module }] of sortedModules) {
      try {
        const handler = module[eventType];
        if (typeof handler === 'function') {
          await handler.call(module, data);
        }
      } catch (error) {
        console.error(`TabManager: 模块 ${name} 处理事件 ${eventType} 时出错:`, error);
      }
    }
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
      status: tab.status
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

    this.dispatchEvent('onTabCreated', { tab, tabState: this.tabs.get(tab.id) });
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
        index: tab.index
      });
    }

    this.dispatchEvent('onTabUpdated', { 
      tabId, 
      changeInfo, 
      tab, 
      tabState: this.tabs.get(tabId) 
    });
  },

  /**
   * 处理标签页激活事件
   */
  handleTabActivated(activeInfo) {
    const { tabId, windowId } = activeInfo;
    const windowState = this.windows.get(windowId);
    
    if (windowState) {
      const previousActiveTabId = windowState.activeTabId;
      windowState.activeTabId = tabId;
      
      // 更新历史记录
      windowState.tabHistory = windowState.tabHistory.filter(id => id !== tabId);
      windowState.tabHistory.unshift(tabId);
      
      if (previousActiveTabId && previousActiveTabId !== tabId) {
        windowState.tabHistory = windowState.tabHistory.filter(id => id !== previousActiveTabId);
        windowState.tabHistory.splice(1, 0, previousActiveTabId);
      }
    }

    this.dispatchEvent('onTabActivated', { 
      activeInfo, 
      windowState: this.windows.get(windowId),
      tabState: this.tabs.get(tabId)
    });
  },

  /**
   * 处理标签页关闭事件
   */
  handleTabRemoved(tabId, removeInfo) {
    const { windowId, isWindowClosing } = removeInfo;
    const tabState = this.tabs.get(tabId);
    
    // 从状态中移除
    this.tabs.delete(tabId);
    
    if (!isWindowClosing) {
      const windowState = this.windows.get(windowId);
      if (windowState) {
        windowState.tabHistory = windowState.tabHistory.filter(id => id !== tabId);
        
        // 如果关闭的是活动标签页，更新活动标签页
        if (windowState.activeTabId === tabId) {
          windowState.activeTabId = windowState.tabHistory[0] || null;
        }
      }
    }

    this.dispatchEvent('onTabRemoved', { 
      tabId, 
      removeInfo, 
      tabState,
      windowState: this.windows.get(windowId)
    });
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
          status: tab.status
        });

        this.dispatchEvent('onTabReplaced', { 
          addedTabId, 
          removedTabId, 
          oldTabState,
          newTabState: this.tabs.get(addedTabId)
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

    this.dispatchEvent('onWindowRemoved', { windowId, windowState });
  },

  /**
   * 获取同一窗口中相同URL的标签页
   */
  getTabsByUrl(url, windowId) {
    const tabs = [];
    for (const [tabId, tabState] of this.tabs) {
      if (tabState.url === url && (!windowId || tabState.windowId === windowId)) {
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
  }
};

// 导出管理器
globalThis.TabManager = TabManager;
