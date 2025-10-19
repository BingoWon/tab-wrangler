"use strict";

/**
 * BackToLastTab - Safari 标签页历史管理器
 * 当活动标签页关闭时，自动返回到上一个标签页
 */
const BackToLastTab = {
  processing: false,

  /**
   * 初始化模块
   */
  initialize() {
    console.log("⏮️ BackToLastTab: 初始化");
    TabManager.registerModule("BackToLastTab", this, 50);
  },

  /**
   * 处理标签页关闭事件
   */
  async onTabRemoved({ tabId, removeInfo, windowState }) {
    if (removeInfo.isWindowClosing || this.processing || !windowState?.tabHistory?.length) {
      return;
    }

    // 保存原始状态，避免被后续操作影响
    const originalState = {
      activeTabId: windowState.activeTabId,
      tabHistory: [...windowState.tabHistory]
    };

    // 只处理活动标签页关闭
    if (originalState.activeTabId === tabId) {
      console.log(`⏮️ BackToLastTab: 活动标签页 ${tabId} 关闭，激活上一个标签页`);
      await this.activateNextTab(originalState.tabHistory, tabId);
    }
  },

  /**
   * 激活下一个标签页
   */
  async activateNextTab(tabHistory, closedTabId) {
    if (this.processing) return;

    try {
      this.processing = true;
      const nextTabId = this.findNextValidTab(tabHistory, closedTabId);

      if (nextTabId) {
        // 延迟激活，避免与浏览器默认行为冲突
        setTimeout(async () => {
          await TabManager.activateTab(nextTabId);
          this.processing = false;
        }, 50);
      } else {
        this.processing = false;
      }
    } catch (error) {
      console.error("⏮️ BackToLastTab: 激活失败", error);
      this.processing = false;
    }
  },

  /**
   * 从历史记录中找到下一个有效的标签页
   */
  findNextValidTab(tabHistory, closedTabId) {
    for (let i = 1; i < tabHistory.length; i++) {
      const tabId = tabHistory[i];
      if (tabId !== closedTabId && TabManager.tabs.has(tabId)) {
        return tabId;
      }
    }
    return null;
  },
};

// 导出模块
globalThis.BackToLastTab = BackToLastTab;
