"use strict";

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🚀 Tab Wrangler for Safari - 启动中...");
console.log("⏰ 启动时间:", new Date().toISOString());
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

/**
 * Tab Wrangler for Safari
 *
 * 功能模块：
 * - DuplicateTabCloser: 关闭重复标签页
 * - AutoActivateNewTab: 自动激活新标签页
 * - BackToLastTab: 返回上一个标签页
 * - NewTabCloser: 关闭空白标签页
 *
 * 注意：Safari 不支持 chrome.tabs.move API，因此不包含 TabPositionRestorer 模块
 */

// 加载核心模块
console.log("📦 开始加载模块...");
try {
  self.importScripts(
    "./tab-manager.js",
    "./modules/duplicate-tab-closer.js",
    // "./modules/auto-activate-new-tab.js",  // 已禁用：会干扰收藏栏的正常行为
    "./modules/back-to-last-tab.js",
    "./modules/new-tab-closer.js"
  );
  console.log("✅ Tab Wrangler: 所有模块加载成功");
  console.log("  ✓ tab-manager.js");
  console.log("  ✓ duplicate-tab-closer.js");
  console.log("  ⏭️  auto-activate-new-tab.js (已禁用)");
  console.log("  ✓ back-to-last-tab.js");
  console.log("  ✓ new-tab-closer.js");
} catch (e) {
  console.error("❌ Tab Wrangler: 模块加载失败");
  console.error("错误详情:", e);
  console.error("错误堆栈:", e.stack);
}

// 初始化系统
async function initializeSystem() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔧 Tab Wrangler: 开始初始化系统");
  console.log("⏰ 初始化时间:", new Date().toISOString());

  try {
    console.log("🔍 检查 TabManager 是否可用...");
    if (!globalThis.TabManager) {
      throw new Error("TabManager 不可用");
    }
    console.log("✅ TabManager 可用");

    console.log("🔧 初始化 TabManager...");
    await TabManager.initialize();
    console.log("✅ TabManager 初始化完成");

    const modules = [
      { name: "DuplicateTabCloser", module: globalThis.DuplicateTabCloser },
      // { name: "AutoActivateNewTab", module: globalThis.AutoActivateNewTab },  // 已禁用
      { name: "BackToLastTab", module: globalThis.BackToLastTab },
      { name: "NewTabCloser", module: globalThis.NewTabCloser },
    ];

    console.log("🔧 初始化功能模块...");
    for (const { name, module } of modules) {
      if (module) {
        console.log(`  🔧 初始化 ${name}...`);
        module.initialize();
        console.log(`  ✅ ${name} 初始化完成`);
      } else {
        console.error(`  ❌ ${name} 不可用`);
      }
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Tab Wrangler: 系统初始化完成");
    console.log("🎉 插件已就绪，开始监听事件");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (e) {
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("❌ Tab Wrangler: 初始化失败");
    console.error("错误详情:", e);
    console.error("错误堆栈:", e.stack);
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }
}

console.log("📡 注册 onInstalled 事件监听器");
chrome.runtime.onInstalled.addListener(() => {
  console.log("🔔 onInstalled 事件触发");
  initializeSystem();
});

console.log("🚀 立即执行初始化");
initializeSystem();

