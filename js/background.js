"use strict";

/**
 * Tab Wrangler - 主background脚本
 * 加载并初始化所有功能模块
 */

// 功能模块状态
const moduleStatus = {
    DuplicateTabCloser: true,
    BackToLastTab: true,
    NewTabCloser: true
};

// 加载功能模块
try {
    self.importScripts(
        './modules/duplicate-tab-closer.js',
        './modules/back-to-last-tab.js',
        './modules/new-tab-closer.js'
    );
    console.log("Tab Wrangler: 所有模块加载成功");
} catch (e) {
    console.error("Tab Wrangler: 加载模块时出错", e);
}

// 初始化所有模块的函数
function initializeAllModules() {
    console.log("Tab Wrangler: 初始化所有模块");
    
    try {
        // 从存储中获取功能开关状态
        chrome.storage.sync.get('options', function(data) {
            try {
                const options = JSON.parse(data.options || '{}');
                
                // 更新模块状态
                moduleStatus.DuplicateTabCloser = options.enable_duplicate_tab_closer !== false;
                moduleStatus.BackToLastTab = options.enable_back_to_last_tab !== false;
                moduleStatus.NewTabCloser = options.enable_new_tab_closer !== false;
                
                // 初始化启用的模块
                initializeEnabledModules();
            } catch (e) {
                console.error("Tab Wrangler: 解析选项时出错", e);
                // 默认初始化所有模块
                initializeEnabledModules();
            }
        });
    } catch (e) {
        console.error("Tab Wrangler: 初始化模块时出错", e);
    }
}

// 初始化启用的模块
function initializeEnabledModules() {
    // 初始化DuplicateTabCloser模块
    if (moduleStatus.DuplicateTabCloser && globalThis.DuplicateTabCloser) {
        DuplicateTabCloser.initialize();
    } else if (globalThis.DuplicateTabCloser) {
        console.log("Tab Wrangler: DuplicateTabCloser模块已禁用");
    } else {
        console.error("Tab Wrangler: DuplicateTabCloser模块不可用");
    }
    
    // 初始化BackToLastTab模块
    if (moduleStatus.BackToLastTab && globalThis.BackToLastTab) {
        BackToLastTab.initialize();
    } else if (globalThis.BackToLastTab) {
        console.log("Tab Wrangler: BackToLastTab模块已禁用");
    } else {
        console.error("Tab Wrangler: BackToLastTab模块不可用");
    }
    
    // 初始化NewTabCloser模块
    if (moduleStatus.NewTabCloser && globalThis.NewTabCloser) {
        NewTabCloser.initialize();
    } else if (globalThis.NewTabCloser) {
        console.log("Tab Wrangler: NewTabCloser模块已禁用");
    } else {
        console.error("Tab Wrangler: NewTabCloser模块不可用");
    }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'toggleFeature') {
        const { module, enabled } = message;
        
        // 更新模块状态
        if (moduleStatus.hasOwnProperty(module)) {
            moduleStatus[module] = enabled;
            
            // 如果启用了模块，初始化它
            if (enabled && globalThis[module]) {
                globalThis[module].initialize();
                console.log(`Tab Wrangler: ${module}模块已启用`);
            } else {
                console.log(`Tab Wrangler: ${module}模块已禁用`);
            }
        }
    }
});

// 在扩展安装或更新时初始化所有模块
chrome.runtime.onInstalled.addListener(initializeAllModules);

// 在service worker启动时也初始化所有模块
initializeAllModules(); 