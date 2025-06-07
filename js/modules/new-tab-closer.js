"use strict";

/**
 * NewTabCloser - 现代化空白标签页关闭器
 * 使用统一事件管理系统，智能关闭未使用的空白标签页
 */
const NewTabCloser = {
  // 空白标签页URL模式
  NEW_TAB_PATTERNS: [
    'edge://newtab/',
    'chrome://newtab/',
    'edge://newtab',
    'chrome://newtab',
    'about:newtab',
    'about:blank',
    'chrome-search://local-ntp/local-ntp.html'
  ],

  // 处理中的标签页，防止重复处理
  processingTabs: new Set(),

  /**
   * 初始化模块
   */
  initialize() {
    console.log("NewTabCloser: 初始化现代化空白标签页关闭器");
    
    // 清理状态
    this.processingTabs.clear();
    
    // 注册到统一管理系统
    TabManager.registerModule('NewTabCloser', this, 10); // 最低优先级
  },

  /**
   * 处理标签页激活事件
   */
  async onTabActivated({ activeInfo, windowState }) {
    const { tabId } = activeInfo;

    // 获取上一个活动的标签页ID
    const previousTabId = this.getPreviousActiveTab(
      windowState.tabHistory,
      tabId
    );

    if (previousTabId && !this.processingTabs.has(previousTabId)) {
      // 延迟检查，避免与其他操作冲突
      setTimeout(() => {
        this.checkAndCloseIfEmpty(previousTabId);
      }, 150);
    }
  },

  /**
   * 获取上一个活动的标签页ID
   */
  getPreviousActiveTab(tabHistory, currentTabId) {
    // 在历史记录中找到当前标签页的位置，返回下一个标签页
    const currentIndex = tabHistory.indexOf(currentTabId);
    if (currentIndex > 0 && currentIndex < tabHistory.length) {
      return tabHistory[currentIndex + 1];
    }
    return null;
  },

  /**
   * 检查并关闭空白标签页
   */
  async checkAndCloseIfEmpty(tabId) {
    if (this.processingTabs.has(tabId)) return;
    
    this.processingTabs.add(tabId);
    
    try {
      const tabState = TabManager.tabs.get(tabId);
      
      if (tabState && this.isNewTabPage(tabState.url)) {
        console.log(`NewTabCloser: 关闭空白标签页 - ${tabId}`);
        await this.closeTab(tabId);
      }
    } catch (error) {
      console.error("NewTabCloser: 检查空白标签页时出错", error);
    } finally {
      this.processingTabs.delete(tabId);
    }
  },

  /**
   * 关闭指定标签页
   */
  async closeTab(tabId) {
    return new Promise((resolve) => {
      // 先验证标签页是否存在
      chrome.tabs.get(tabId, () => {
        if (chrome.runtime.lastError) {
          console.warn(`NewTabCloser: 标签页 ${tabId} 不存在，跳过关闭`);
          resolve();
          return;
        }

        chrome.tabs.remove(tabId, () => {
          if (chrome.runtime.lastError) {
            // 如果是拖动错误，稍后重试
            if (chrome.runtime.lastError.message.includes("dragging")) {
              setTimeout(() => this.closeTab(tabId), 500);
            } else {
              console.error(
                "NewTabCloser: 关闭标签页失败",
                chrome.runtime.lastError.message
              );
            }
          }
          resolve();
        });
      });
    });
  },

  /**
   * 检查URL是否为空白标签页
   */
  isNewTabPage(url) {
    if (!url) return false;
    return this.NEW_TAB_PATTERNS.some(pattern => url.startsWith(pattern));
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
