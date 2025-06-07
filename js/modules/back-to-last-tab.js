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
    console.log("🔧 BackToLastTab: 初始化现代化标签页历史管理器");

    // 注册到统一管理系统
    TabManager.registerModule("BackToLastTab", this, 50); // 中等优先级

    console.log("🔧 BackToLastTab: 模块注册完成，优先级: 50");
    console.log(
      "🔧 BackToLastTab: 可用方法:",
      Object.getOwnPropertyNames(this).filter(
        (name) => typeof this[name] === "function"
      )
    );
  },

  /**
   * 处理标签页关闭事件
   */
  async onTabRemoved({ tabId, removeInfo, windowState }) {
    const { isWindowClosing } = removeInfo;

    console.log(`🚀 BackToLastTab: 收到标签页关闭事件 ${tabId}`);
    console.log(`🚀 BackToLastTab: 是否窗口关闭: ${isWindowClosing}`);
    console.log(`🚀 BackToLastTab: 是否正在处理: ${this.processing}`);
    console.log(`🚀 BackToLastTab: 窗口状态存在: ${!!windowState}`);

    if (windowState) {
      console.log(
        `🚀 BackToLastTab: 当前活动标签页: ${windowState.activeTabId}`
      );
      console.log(`🚀 BackToLastTab: 历史记录:`, windowState.tabHistory);
    }

    // 跳过窗口关闭或已在处理中的情况
    if (isWindowClosing || this.processing) {
      console.log(
        `🚀 BackToLastTab: 跳过处理 - 窗口关闭: ${isWindowClosing}, 正在处理: ${this.processing}`
      );
      return;
    }

    // 检查是否是当前活动标签页被关闭
    if (windowState && windowState.activeTabId === tabId) {
      console.log(
        `🚀 BackToLastTab: ✅ 检测到活动标签页 ${tabId} 被关闭，准备激活上一个标签页`
      );
      await this.activateNextTab(windowState, tabId);
    } else {
      console.log(`🚀 BackToLastTab: ❌ 不是活动标签页被关闭，无需处理`);
    }
  },

  /**
   * 激活下一个标签页
   */
  async activateNextTab(windowState, closedTabId) {
    try {
      this.processing = true;

      // 从历史记录中找到下一个有效的标签页（排除即将关闭的标签页）
      const nextTabId = this.findNextValidTab(
        windowState.tabHistory,
        closedTabId
      );

      if (nextTabId) {
        console.log(`BackToLastTab: 激活下一个标签页 - ${nextTabId}`);

        // 延迟激活，避免与浏览器默认行为冲突
        setTimeout(async () => {
          await this.activateTab(nextTabId);
          this.processing = false;
        }, 50); // 减少延迟，提高响应速度
      } else {
        console.log("BackToLastTab: 没有找到可激活的标签页");
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
  findNextValidTab(tabHistory, closedTabId) {
    console.log(
      `BackToLastTab: 在历史记录中查找下一个标签页，排除 ${closedTabId}`
    );
    console.log(`BackToLastTab: 当前历史记录:`, tabHistory);

    // 从历史记录中找到第一个不是即将关闭的标签页
    for (let i = 0; i < tabHistory.length; i++) {
      const tabId = tabHistory[i];

      // 跳过即将关闭的标签页
      if (tabId === closedTabId) {
        continue;
      }

      // 验证标签页是否仍然存在于我们的状态中
      if (TabManager.tabs.has(tabId)) {
        console.log(`BackToLastTab: 找到有效标签页 ${tabId} (位置 ${i})`);
        return tabId;
      }
    }

    console.log("BackToLastTab: 没有找到有效的标签页");
    return null;
  },

  /**
   * 验证标签页是否真实存在
   */
  async validateTabExists(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.get(tabId, () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  },

  /**
   * 激活指定标签页
   */
  async activateTab(tabId) {
    console.log(`🎯 BackToLastTab: 尝试激活标签页 ${tabId}`);

    return new Promise((resolve) => {
      // 先验证标签页是否存在
      chrome.tabs.get(tabId, () => {
        if (chrome.runtime.lastError) {
          console.warn(
            `🎯 BackToLastTab: 标签页 ${tabId} 不存在，跳过激活:`,
            chrome.runtime.lastError.message
          );
          resolve();
          return;
        }

        console.log(`🎯 BackToLastTab: 标签页 ${tabId} 存在，执行激活`);

        // 标签页存在，执行激活
        chrome.tabs.update(tabId, { active: true }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "🎯 BackToLastTab: 激活标签页失败:",
              chrome.runtime.lastError.message
            );
          } else {
            console.log(`🎯 BackToLastTab: ✅ 成功激活标签页 ${tabId}`);
          }
          resolve();
        });
      });
    });
  },
};

// 导出模块
globalThis.BackToLastTab = BackToLastTab;
