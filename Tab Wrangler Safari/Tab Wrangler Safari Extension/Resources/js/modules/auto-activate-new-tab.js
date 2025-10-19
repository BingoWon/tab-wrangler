"use strict";

/**
 * AutoActivateNewTab - Safari 新标签页自动激活器
 * 当新标签页在后台打开时，自动激活该标签页
 */
const AutoActivateNewTab = {
  /**
   * 初始化模块
   */
  initialize() {
    console.log("🎯 AutoActivateNewTab: 初始化");
    TabManager.registerModule('AutoActivateNewTab', this, 90);
  },

  /**
   * 处理标签页创建事件
   */
  async onTabCreated({ tab }) {
    // 🔍 详细调试日志
    console.log("╔═══════════════════════════════════════════╗");
    console.log("║  🎯 AutoActivateNewTab: onTabCreated     ║");
    console.log("╚═══════════════════════════════════════════╝");
    console.log("📋 接收到的标签页信息:", {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      status: tab.status,
      windowId: tab.windowId,
      index: tab.index,
      openerTabId: tab.openerTabId,
      pendingUrl: tab.pendingUrl,
    });
    console.log("⏰ 时间戳:", new Date().toISOString());

    // 如果标签页已经是激活状态，无需处理
    if (tab.active) {
      console.log("✅ 标签页已经是激活状态，无需处理");
      console.log("╚═══════════════════════════════════════════╝");
      return;
    }

    console.log("⚠️  标签页在后台创建 (active=false)");
    console.log("🔄 决定: 自动激活此标签页");
    console.log(`📤 调用 TabManager.activateTab(${tab.id}, ${tab.windowId})`);

    // 自动激活新创建的标签页
    await TabManager.activateTab(tab.id, tab.windowId);

    console.log("✅ 激活操作完成");
    console.log("╚═══════════════════════════════════════════╝");
  },
};

// 导出模块
globalThis.AutoActivateNewTab = AutoActivateNewTab;

