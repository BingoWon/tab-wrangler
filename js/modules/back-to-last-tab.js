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
    console.log("BackToLastTab: 初始化现代化标签页历史管理器");

    // 注册到统一管理系统
    TabManager.registerModule("BackToLastTab", this, 50); // 中等优先级
  },

  /**
   * 处理标签页关闭事件
   */
  async onTabRemoved({ tabId, removeInfo, windowState }) {
    const { isWindowClosing } = removeInfo;

    // 跳过窗口关闭或已在处理中的情况
    if (isWindowClosing || this.processing) return;

    // 检查是否是当前活动标签页被关闭
    if (windowState && windowState.activeTabId === tabId) {
      await this.activateNextTab(windowState);
    }
  },

  /**
   * 激活下一个标签页
   */
  async activateNextTab(windowState) {
    try {
      this.processing = true;

      // 从历史记录中找到下一个有效的标签页
      const nextTabId = this.findNextValidTab(windowState.tabHistory);

      if (nextTabId) {
        console.log(`BackToLastTab: 激活下一个标签页 - ${nextTabId}`);

        // 延迟激活，避免与浏览器默认行为冲突
        setTimeout(async () => {
          await this.activateTab(nextTabId);
          this.processing = false;
        }, 100);
      } else {
        this.processing = false;
      }
    } catch (error) {
      console.error("BackToLastTab: 激活下一个标签页时出错", error);
      this.processing = false;
    }
  },

  /**
   * 从历史记录中找到下一个有效的标签页
   */
  findNextValidTab(tabHistory) {
    // 跳过第一个（当前关闭的标签页），找到下一个存在的标签页
    for (let i = 1; i < tabHistory.length; i++) {
      const tabId = tabHistory[i];
      if (TabManager.tabs.has(tabId)) {
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
          console.error(
            "BackToLastTab: 激活标签页失败",
            chrome.runtime.lastError.message
          );
        }
        resolve();
      });
    });
  },
};

// 导出模块
globalThis.BackToLastTab = BackToLastTab;
