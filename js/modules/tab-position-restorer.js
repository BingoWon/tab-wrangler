"use strict";

/**
 * TabPositionRestorer - 标签页位置恢复器
 * 恢复通过 Cmd+Shift+T 重新打开的标签页到原始位置
 */
const TabPositionRestorer = {
  // 关闭记录：windowId -> Map(url -> {index, timestamp})
  closedTabs: new Map(),

  // 处理中的标签页
  processing: new Set(),

  initialize() {
    console.log("🔄 TabPositionRestorer: 初始化标签页位置恢复器");
    TabManager.registerModule("TabPositionRestorer", this, 80);

    // 每30秒清理过期记录
    setInterval(() => this.cleanup(), 30000);
    console.log("🔄 TabPositionRestorer: 模块注册完成，优先级: 80");
  },

  async onTabRemoved({ removeInfo, tabState }) {
    console.log("🔄 TabPositionRestorer: onTabRemoved 被调用", {
      removeInfo,
      tabState,
    });

    if (removeInfo.isWindowClosing) {
      console.log("🔄 TabPositionRestorer: 跳过 - 窗口正在关闭");
      return;
    }

    if (!tabState?.url) {
      console.log("🔄 TabPositionRestorer: 跳过 - 无URL");
      return;
    }

    if (this.isSpecialUrl(tabState.url)) {
      console.log("🔄 TabPositionRestorer: 跳过 - 特殊URL:", tabState.url);
      return;
    }

    const { windowId, url, index } = tabState;
    console.log(
      `🔄 TabPositionRestorer: ✅ 记录关闭标签页 ${url} 位置 ${index}`
    );

    if (!this.closedTabs.has(windowId)) {
      this.closedTabs.set(windowId, new Map());
    }

    this.closedTabs.get(windowId).set(url, {
      index,
      timestamp: Date.now(),
    });

    console.log("🔄 TabPositionRestorer: 当前记录:", this.closedTabs);
  },

  onTabCreated({ tab }) {
    console.log("🔄 TabPositionRestorer: onTabCreated 被调用", tab);

    if (this.processing.has(tab.id)) {
      console.log("🔄 TabPositionRestorer: 跳过 - 正在处理中");
      return;
    }

    if (this.isSpecialUrl(tab.url)) {
      console.log("🔄 TabPositionRestorer: 跳过 - 特殊URL:", tab.url);
      return;
    }

    const windowRecord = this.closedTabs.get(tab.windowId);
    if (!windowRecord) {
      console.log("🔄 TabPositionRestorer: 跳过 - 窗口无记录");
      return;
    }

    const closedInfo = windowRecord.get(tab.url);
    if (!closedInfo) {
      console.log("🔄 TabPositionRestorer: 跳过 - URL无记录");
      return;
    }

    const timeDiff = Date.now() - closedInfo.timestamp;
    if (timeDiff > 5000) {
      console.log(`🔄 TabPositionRestorer: 跳过 - 时间过期 ${timeDiff}ms`);
      return;
    }

    console.log(
      `🔄 TabPositionRestorer: ✅ 找到匹配记录，原位置: ${closedInfo.index}`
    );

    // 等待浏览器完成恢复操作后再检查位置
    setTimeout(() => {
      chrome.tabs.query({ windowId: tab.windowId }, (tabs) => {
        // 从tabs数组中找到当前标签页的实际位置
        const currentTab = tabs.find((t) => t.id === tab.id);
        if (!currentTab) {
          console.log("🔄 TabPositionRestorer: 标签页不存在，跳过");
          return;
        }

        const actualIndex = currentTab.index;
        console.log(
          `🔄 TabPositionRestorer: 延迟检查 - 实际位置 ${actualIndex}，总数 ${tabs.length}`
        );

        if (actualIndex === tabs.length - 1) {
          console.log("🔄 TabPositionRestorer: ✅ 确认在末尾，开始恢复");
          this.processing.add(tab.id);
          const targetIndex = Math.min(closedInfo.index, tabs.length - 1);

          console.log(
            `🔄 TabPositionRestorer: 移动从 ${actualIndex} 到 ${targetIndex}`
          );

          if (targetIndex !== actualIndex) {
            chrome.tabs.move(tab.id, { index: targetIndex }, () => {
              if (chrome.runtime.lastError) {
                console.error(
                  "🔄 TabPositionRestorer: 移动失败",
                  chrome.runtime.lastError
                );
              } else {
                console.log("🔄 TabPositionRestorer: ✅ 移动成功");
              }
            });
          } else {
            console.log("🔄 TabPositionRestorer: 位置相同，无需移动");
          }

          this.processing.delete(tab.id);
          windowRecord.delete(tab.url);
        } else {
          console.log("🔄 TabPositionRestorer: 延迟检查后仍不在末尾，跳过");
        }
      });
    }, 100); // 100ms延迟等待浏览器完成恢复
  },

  isSpecialUrl(url) {
    return [
      "chrome://",
      "edge://",
      "about:",
      "moz-extension://",
      "chrome-extension://",
      "data:",
      "javascript:",
    ].some((prefix) => url.startsWith(prefix));
  },

  cleanup() {
    const now = Date.now();
    const expiredTime = 10000; // 10秒过期

    for (const [windowId, windowRecord] of this.closedTabs) {
      for (const [url, info] of windowRecord) {
        if (now - info.timestamp > expiredTime) {
          windowRecord.delete(url);
        }
      }

      if (windowRecord.size === 0) {
        this.closedTabs.delete(windowId);
      }
    }
  },
};

globalThis.TabPositionRestorer = TabPositionRestorer;
