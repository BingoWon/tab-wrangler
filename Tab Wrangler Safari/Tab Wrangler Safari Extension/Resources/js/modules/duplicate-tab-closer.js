"use strict";

/**
 * DuplicateTabCloser - Safari 重复标签页关闭器
 * 检测并关闭重复的标签页，聚焦到已存在的标签页
 */
const DuplicateTabCloser = {
  // 最近关闭的 URL 记录（防止立即重复关闭）
  recentlyClosedUrls: new Map(),
  cleanupTimer: null,

  /**
   * 初始化模块
   */
  initialize() {
    console.log("🔄 DuplicateTabCloser: 初始化");
    this.recentlyClosedUrls.clear();
    TabManager.registerModule("DuplicateTabCloser", this, 100);
    this.startCleanupTimer();
  },

  /**
   * 处理标签页更新事件
   * 只处理在后台打开的标签页，避免干扰用户正在使用的标签页
   */
  async onTabUpdated({ tabId, changeInfo, tab }) {
    // 只在 URL 变化或加载完成时检测
    if (!changeInfo.url && changeInfo.status !== "complete") return;

    // 🔑 关键修复：如果标签页是激活状态，说明用户正在使用，不应该关闭
    if (tab.active) {
      console.log(`🔄 DuplicateTabCloser: 跳过激活标签页 ${tabId} (用户正在使用)`);
      return;
    }

    // 跳过特殊页面
    if (this.isSpecialUrl(tab.url)) return;

    // 检查是否最近关闭过相同 URL
    if (this.isRecentlyClosed(tab.url)) return;

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
      console.log(`🔄 DuplicateTabCloser: 关闭重复 ${duplicateTabId}，激活 ${originalTabState.id}`);

      this.recordClosedUrl(duplicateTab.url);
      await TabManager.activateTab(originalTabState.id, duplicateTab.windowId);
      await TabManager.closeTab(duplicateTabId);
    } catch (error) {
      console.error("🔄 DuplicateTabCloser: 关闭失败", error);
    }
  },

  /**
   * 记录关闭的 URL
   */
  recordClosedUrl(url) {
    if (!url) return;
    const normalizedUrl = this.normalizeUrl(url);
    this.recentlyClosedUrls.set(normalizedUrl, Date.now());
  },

  /**
   * 检查 URL 是否最近被关闭（1秒保护期）
   */
  isRecentlyClosed(url) {
    if (!url) return false;
    const normalizedUrl = this.normalizeUrl(url);
    const timestamp = this.recentlyClosedUrls.get(normalizedUrl);
    return timestamp && Date.now() - timestamp < 1000;
  },

  /**
   * 标准化 URL
   */
  normalizeUrl(url) {
    try {
      return new URL(url).href;
    } catch {
      return url;
    }
  },

  /**
   * 检查是否为特殊 URL（不需要处理）
   */
  isSpecialUrl(url) {
    if (!url) return true;
    const specialPrefixes = [
      "about:",
      "chrome-extension://",
      "safari-extension://",
      "data:",
      "javascript:",
    ];
    return specialPrefixes.some(prefix => url.startsWith(prefix));
  },

  /**
   * 启动定期清理（每30秒清理过期记录）
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [url, timestamp] of this.recentlyClosedUrls) {
        if (now - timestamp > 5000) {
          this.recentlyClosedUrls.delete(url);
        }
      }
    }, 30000);
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
