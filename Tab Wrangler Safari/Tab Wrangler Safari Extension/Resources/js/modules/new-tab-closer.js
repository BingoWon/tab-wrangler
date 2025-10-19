"use strict";

/**
 * NewTabCloser - Safari 空白标签页关闭器
 * 当用户切换标签页时，自动关闭当前窗口中的所有空白标签页
 */
const NewTabCloser = {
  // Safari 空白标签页 URL 模式
  EMPTY_TAB_PATTERNS: [
    'about:blank',
    'https://www.apple.com/startpage/',
    'favorites://',
  ],

  // 处理中的标签页，防止重复处理
  processingTabs: new Set(),

  /**
   * 初始化模块
   */
  initialize() {
    console.log("🧹 NewTabCloser: 初始化");
    this.processingTabs.clear();
    TabManager.registerModule('NewTabCloser', this, 10);
  },

  /**
   * 处理标签页激活事件
   */
  async onTabActivated({ activeInfo }) {
    const { windowId } = activeInfo;
    await this.closeAllEmptyTabsInWindow(windowId);
  },

  /**
   * 关闭指定窗口中的所有空白标签页
   */
  async closeAllEmptyTabsInWindow(windowId) {
    try {
      const tabs = await chrome.tabs.query({ windowId });
      const emptyTabs = tabs.filter(tab => !tab.active && this.isEmptyTab(tab.url));

      if (emptyTabs.length === 0) return;

      console.log(`🧹 NewTabCloser: 发现 ${emptyTabs.length} 个空白标签页`);

      // 使用 allSettled 避免单个失败影响其他标签页
      await Promise.allSettled(
        emptyTabs.map(tab => this.closeEmptyTab(tab.id))
      );

      console.log(`🧹 NewTabCloser: 已关闭 ${emptyTabs.length} 个空白标签页`);
    } catch (error) {
      console.error("🧹 NewTabCloser: 关闭失败", error);
    }
  },

  /**
   * 关闭单个空白标签页
   */
  async closeEmptyTab(tabId) {
    if (this.processingTabs.has(tabId)) return;

    this.processingTabs.add(tabId);
    try {
      await TabManager.closeTab(tabId);
    } finally {
      this.processingTabs.delete(tabId);
    }
  },

  /**
   * 检查 URL 是否为空白标签页
   */
  isEmptyTab(url) {
    if (!url) return true;
    return this.EMPTY_TAB_PATTERNS.some(pattern => url.startsWith(pattern));
  },

  /**
   * 清理资源
   */
  cleanup() {
    this.processingTabs.clear();
  }
};

// 导出模块
globalThis.NewTabCloser = NewTabCloser;
