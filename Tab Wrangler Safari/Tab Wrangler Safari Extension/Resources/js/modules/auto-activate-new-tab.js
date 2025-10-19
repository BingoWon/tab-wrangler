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
    // 如果标签页已经是激活状态，无需处理
    if (tab.active) {
      return;
    }

    // 自动激活新创建的标签页
    console.log(`🎯 AutoActivateNewTab: 激活新标签页 ${tab.id}`);
    await TabManager.activateTab(tab.id, tab.windowId);
  },
};

// 导出模块
globalThis.AutoActivateNewTab = AutoActivateNewTab;

