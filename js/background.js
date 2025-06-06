"use strict";

/**
 * Tab Wrangler - 现代化统一管理系统
 * 使用中央事件分发和状态管理
 */

// 加载统一管理系统和功能模块
try {
  self.importScripts(
    "./tab-manager.js",
    "./modules/duplicate-tab-closer.js",
    "./modules/back-to-last-tab.js",
    "./modules/new-tab-closer.js"
  );
  console.log("Tab Wrangler: 所有模块加载成功");
} catch (e) {
  console.error("Tab Wrangler: 加载模块时出错", e);
}

// 初始化系统
async function initializeSystem() {
  console.log("Tab Wrangler: 初始化现代化管理系统");

  try {
    // 初始化统一管理器
    if (globalThis.TabManager) {
      await TabManager.initialize();
      console.log("Tab Wrangler: TabManager 初始化完成");
    } else {
      throw new Error("TabManager 不可用");
    }

    // 初始化功能模块
    const modules = [
      { name: "DuplicateTabCloser", instance: globalThis.DuplicateTabCloser },
      { name: "BackToLastTab", instance: globalThis.BackToLastTab },
      { name: "NewTabCloser", instance: globalThis.NewTabCloser },
    ];

    for (const { name, instance } of modules) {
      if (instance) {
        instance.initialize();
        console.log(`Tab Wrangler: ${name} 模块已启用`);
      } else {
        console.error(`Tab Wrangler: ${name} 模块不可用`);
      }
    }

    console.log("Tab Wrangler: 系统初始化完成");
  } catch (e) {
    console.error("Tab Wrangler: 初始化系统时出错", e);
  }
}

// 在扩展安装或更新时初始化系统
chrome.runtime.onInstalled.addListener(initializeSystem);

// 在service worker启动时也初始化系统
initializeSystem();