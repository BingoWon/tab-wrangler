"use strict";

/**
 * DuplicateTabCloser - 现代化重复标签页关闭器
 * 使用统一事件管理系统，优雅处理重复标签页
 */
const DuplicateTabCloser = {
  // 最近关闭的URL记录（防止立即重复关闭）
  recentlyClosedUrls: new Map(),

  // 清理定时器
  cleanupTimer: null,

  /**
   * 初始化模块
   */
  initialize() {
    console.log("DuplicateTabCloser: 初始化现代化重复标签页关闭器");

    // 清理数据
    this.recentlyClosedUrls.clear();

    // 注册到统一管理系统
    TabManager.registerModule("DuplicateTabCloser", this, 100); // 最高优先级

    // 启动定期清理
    this.startCleanupTimer();
  },

  /**
   * 处理标签页更新事件
   */
  async onTabUpdated({ tabId, changeInfo, tab }) {
    // 只在URL变化或加载完成时检测
    if (!changeInfo.url && changeInfo.status !== "complete") return;

    // 跳过特殊页面
    if (this.isSpecialUrl(tab.url)) return;

    // 检查是否最近关闭过相同URL
    if (this.isRecentlyClosed(tab.url)) {
      console.log(`DuplicateTabCloser: 跳过最近关闭的URL - ${tab.url}`);
      return;
    }

    // 查找重复标签页
    const duplicates = TabManager.getTabsByUrl(tab.url, tab.windowId).filter(
      (tabState) => tabState.id !== tabId
    );

    if (duplicates.length > 0) {
      await this.closeDuplicateTab(tabId, tab, duplicates[0]);
    }
  },

  /**
   * 关闭重复标签页并激活原有标签页
   */
  async closeDuplicateTab(duplicateTabId, duplicateTab, originalTabState) {
    try {
      console.log(
        `DuplicateTabCloser: 发现重复标签页 - 关闭 ${duplicateTabId}，激活 ${originalTabState.id}`
      );

      // 记录关闭的URL
      this.recordClosedUrl(duplicateTab.url);

      // 激活原有标签页
      await this.activateTab(originalTabState.id, duplicateTab.windowId);

      // 关闭重复标签页
      await this.closeTab(duplicateTabId);
    } catch (error) {
      console.error("DuplicateTabCloser: 关闭重复标签页时出错", error);
    }
  },

  /**
   * 激活指定标签页
   */
  async activateTab(tabId, windowId) {
    return new Promise((resolve) => {
      // 先验证标签页是否存在
      chrome.tabs.get(tabId, () => {
        if (chrome.runtime.lastError) {
          console.warn(`DuplicateTabCloser: 标签页 ${tabId} 不存在，跳过激活`);
          resolve();
          return;
        }

        // 先聚焦窗口
        chrome.windows.update(windowId, { focused: true }, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "DuplicateTabCloser: 聚焦窗口失败",
              chrome.runtime.lastError.message
            );
          }

          // 再激活标签页
          chrome.tabs.update(tabId, { active: true }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "DuplicateTabCloser: 激活标签页失败",
                chrome.runtime.lastError.message
              );
            }
            resolve();
          });
        });
      });
    });
  },

  /**
   * 关闭指定标签页
   */
  async closeTab(tabId) {
    return new Promise((resolve) => {
      // 先验证标签页是否存在
      chrome.tabs.get(tabId, () => {
        if (chrome.runtime.lastError) {
          console.warn(`DuplicateTabCloser: 标签页 ${tabId} 不存在，跳过关闭`);
          resolve();
          return;
        }

        chrome.tabs.remove(tabId, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "DuplicateTabCloser: 关闭标签页失败",
              chrome.runtime.lastError.message
            );
          }
          resolve();
        });
      });
    });
  },

  /**
   * 记录关闭的URL
   */
  recordClosedUrl(url) {
    if (!url) return;

    try {
      const normalizedUrl = new URL(url).href;
      this.recentlyClosedUrls.set(normalizedUrl, Date.now());
    } catch (error) {
      // URL解析失败，使用原始URL
      this.recentlyClosedUrls.set(url, Date.now());
    }
  },

  /**
   * 检查URL是否最近被关闭
   */
  isRecentlyClosed(url) {
    if (!url) return false;

    try {
      const normalizedUrl = new URL(url).href;
      const timestamp = this.recentlyClosedUrls.get(normalizedUrl);

      if (!timestamp) return false;

      // 1秒保护期
      return Date.now() - timestamp < 1000;
    } catch (error) {
      // URL解析失败，检查原始URL
      const timestamp = this.recentlyClosedUrls.get(url);
      return timestamp && Date.now() - timestamp < 1000;
    }
  },

  /**
   * 检查是否为特殊URL（不需要处理的URL）
   */
  isSpecialUrl(url) {
    if (!url) return true;

    const specialPrefixes = [
      "chrome://",
      "edge://",
      "about:",
      "moz-extension://",
      "chrome-extension://",
      "data:",
      "javascript:",
    ];

    return specialPrefixes.some((prefix) => url.startsWith(prefix));
  },

  /**
   * 启动定期清理定时器
   */
  startCleanupTimer() {
    // 每30秒清理一次过期记录
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredRecords();
    }, 30000);
  },

  /**
   * 清理过期的关闭记录
   */
  cleanupExpiredRecords() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [url, timestamp] of this.recentlyClosedUrls) {
      if (now - timestamp > 5000) {
        // 5秒后清理
        expiredKeys.push(url);
      }
    }

    expiredKeys.forEach((key) => this.recentlyClosedUrls.delete(key));

    if (expiredKeys.length > 0) {
      console.log(
        `DuplicateTabCloser: 清理了 ${expiredKeys.length} 条过期记录`
      );
    }
  },

  /**
   * 清理资源
   */
  cleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.recentlyClosedUrls.clear();
  },
};

// 导出模块
globalThis.DuplicateTabCloser = DuplicateTabCloser;
