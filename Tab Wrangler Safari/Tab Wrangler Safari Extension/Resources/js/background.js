"use strict";

/**
 * Tab Wrangler for Safari
 *
 * 功能模块：
 * - DuplicateTabCloser: 关闭重复标签页
 * - BackToLastTab: 返回上一个标签页
 * - NewTabCloser: 关闭空白标签页
 *
 * 注意：Safari 不支持 chrome.tabs.move API，因此不包含 TabPositionRestorer 模块
 */

// 加载核心模块
try {
  self.importScripts(
    "./tab-manager.js",
    "./modules/duplicate-tab-closer.js",
    "./modules/back-to-last-tab.js",
    "./modules/new-tab-closer.js"
  );
  console.log("✅ Tab Wrangler: 模块加载成功");
} catch (e) {
  console.error("❌ Tab Wrangler: 模块加载失败", e);
}

// 初始化系统
async function initializeSystem() {
  console.log("🚀 Tab Wrangler: 初始化系统");

  try {
    if (!globalThis.TabManager) {
      throw new Error("TabManager 不可用");
    }

    await TabManager.initialize();

    const modules = [
      globalThis.DuplicateTabCloser,
      globalThis.BackToLastTab,
      globalThis.NewTabCloser,
    ];

    for (const module of modules) {
      if (module) {
        module.initialize();
      } else {
        console.error("❌ Tab Wrangler: 模块不可用");
      }
    }

    console.log("✅ Tab Wrangler: 系统初始化完成");
  } catch (e) {
    console.error("❌ Tab Wrangler: 初始化失败", e);
  }
}

chrome.runtime.onInstalled.addListener(initializeSystem);
initializeSystem();

