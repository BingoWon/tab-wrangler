"use strict";

/**
 * BackToLastTab - 现代化标签页历史管理器
 * 使用统一事件管理系统，智能返回到上一个标签页
 */
const BackToLastTab = {
  // 处理中的操作，防止重复处理
  processing: false,

  /**
   * 初始化模块
   */
  initialize() {
    console.log("🔧 BackToLastTab: 初始化标签页历史管理器");
    TabManager.registerModule("BackToLastTab", this, 50);
  },

  /**
   * 处理标签页关闭事件
   */
  async onTabRemoved({ tabId, removeInfo, windowState }) {
    const { isWindowClosing } = removeInfo;

    // 跳过窗口关闭或已在处理中的情况
    if (isWindowClosing || this.processing || !windowState?.tabHistory?.length) {
      return;
    }

    // 立即保存原始状态，避免被后续操作影响
    const originalState = {
      activeTabId: windowState.activeTabId,
      tabHistory: [...windowState.tabHistory]
    };

    console.log(`🚀 BackToLastTab: 标签页 ${tabId} 关闭，活动标签页: ${originalState.activeTabId}`);

    // 只处理活动标签页关闭
    if (originalState.activeTabId === tabId) {
      console.log(`🚀 BackToLastTab: ✅ 激活上一个标签页`);
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
        console.log(`🎯 BackToLastTab: 激活标签页 ${nextTabId}`);
        // 延迟激活，避免与浏览器默认行为冲突
        setTimeout(async () => {
          await this.activateTab(nextTabId);
          this.processing = false;
        }, 50);
      } else {
        console.log("🎯 BackToLastTab: 没有找到可激活的标签页");
        this.processing = false;
      }
    } catch (error) {
      console.error("🎯 BackToLastTab: 激活失败", error);
      this.processing = false;
    }
  },

  /**
   * 从历史记录中找到下一个有效的标签页
   */
  findNextValidTab(tabHistory, closedTabId) {
    // 从历史记录第二位开始查找（跳过被关闭的标签页）
    for (let i = 1; i < tabHistory.length; i++) {
      const tabId = tabHistory[i];
      if (tabId !== closedTabId && TabManager.tabs.has(tabId)) {
        console.log(`🔍 BackToLastTab: 找到有效标签页 ${tabId}`);
        return tabId;
      }
    }
    return null;
  },

  /**
   * 激活指定标签页
   */
  async activateTab(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.update(tabId, { active: true }, () => {
        if (chrome.runtime.lastError) {
          console.error(`❌ BackToLastTab: 激活失败 ${tabId}:`, chrome.runtime.lastError.message);
        } else {
          console.log(`✅ BackToLastTab: 激活成功 ${tabId}`);
        }
        resolve();
      });
    });
  },
};

// 导出模块
globalThis.BackToLastTab = BackToLastTab;
