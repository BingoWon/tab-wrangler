"use strict";

/**
 * NewTabCloser - 关闭未使用的空白标签页
 * 当有标签页被激活时，关闭同一窗口中所有其他的空白"New Tab"页面
 */
const NewTabCloser = {
    // 空白标签页的URL模式
    NEW_TAB_URL_PATTERNS: [
        "edge://newtab/",
        "chrome://newtab/",
        "edge://newtab",
        "chrome://newtab",
        "about:newtab",
        "about:blank",
        "chrome-search://local-ntp/local-ntp.html"
    ],
    
    // 上一个激活的标签页ID（按窗口）
    lastActiveTabs: {},
    
    // 正在处理的标签页ID，用于防止重复处理
    processingTabs: new Set(),
    
    /**
     * 初始化模块
     */
    initialize: function() {
        console.log("NewTabCloser: 初始化");
        
        // 初始化lastActiveTabs
        try {
            chrome.windows.getAll({ populate: true }, (windows) => {
                if (chrome.runtime.lastError) {
                    console.error("NewTabCloser: 获取窗口时出错", chrome.runtime.lastError.message);
                    return;
                }
                
                windows.forEach(window => {
                    const activeTab = window.tabs.find(tab => tab.active);
                    if (activeTab) {
                        this.lastActiveTabs[window.id] = activeTab.id;
                    }
                });
            });
        } catch (e) {
            console.error("NewTabCloser: 初始化时出错", e);
        }
        
        // 设置事件监听器
        this.setupEventListeners();
    },
    
    /**
     * 设置事件监听器
     */
    setupEventListeners: function() {
        // 监听标签页激活事件
        chrome.tabs.onActivated.addListener(this.onTabActivated.bind(this));
        
        // 监听窗口关闭事件
        chrome.windows.onRemoved.addListener(this.onWindowRemoved.bind(this));
    },
    
    /**
     * 处理标签页激活事件
     * @param {object} activeInfo - 激活的标签页信息
     */
    onTabActivated: function(activeInfo) {
        try {
            const { tabId, windowId } = activeInfo;
            
            // 获取上一个激活的标签页ID
            const lastActiveTabId = this.lastActiveTabs[windowId];
            
            // 更新lastActiveTabs
            this.lastActiveTabs[windowId] = tabId;
            
            // 如果存在上一个激活的标签页，且不是当前激活的标签页，且不在处理中
            if (lastActiveTabId && lastActiveTabId !== tabId && !this.processingTabs.has(lastActiveTabId)) {
                // 标记为正在处理
                this.processingTabs.add(lastActiveTabId);
                
                // 延迟一小段时间再检查，避免与其他操作冲突
                setTimeout(() => {
                    this.checkAndCloseTabIfEmpty(lastActiveTabId, windowId);
                }, 100);
            }
        } catch (e) {
            console.error("NewTabCloser: 处理标签页激活事件时出错", e);
        }
    },
    
    /**
     * 处理窗口关闭事件
     * @param {number} windowId - 关闭的窗口ID
     */
    onWindowRemoved: function(windowId) {
        try {
            // 清理该窗口的记录
            delete this.lastActiveTabs[windowId];
        } catch (e) {
            console.error("NewTabCloser: 处理窗口关闭事件时出错", e);
        }
    },
    
    /**
     * 检查标签页是否为空白标签页，如果是则关闭它
     * @param {number} tabId - 要检查的标签页ID
     * @param {number} windowId - 窗口ID
     */
    checkAndCloseTabIfEmpty: function(tabId, windowId) {
        try {
            chrome.tabs.get(tabId, (tab) => {
                // 完成处理，从处理集合中移除
                this.processingTabs.delete(tabId);
                
                // 如果获取标签页时出错，可能是标签页已经被关闭
                if (chrome.runtime.lastError) {
                    return;
                }
                
                // 如果标签页存在且是空白标签页，关闭它
                if (tab && this.isNewTabPage(tab.url)) {
                    this.closeTab(tabId);
                }
            });
        } catch (e) {
            // 确保在出错时也从处理集合中移除
            this.processingTabs.delete(tabId);
            console.error("NewTabCloser: 检查标签页时出错", e);
        }
    },
    
    /**
     * 关闭指定的标签页
     * @param {number} tabId - 要关闭的标签页ID
     */
    closeTab: function(tabId) {
        try {
            chrome.tabs.remove(tabId, () => {
                if (chrome.runtime.lastError) {
                    // 如果是"标签页正在被拖动"的错误，稍后重试
                    if (chrome.runtime.lastError.message.includes("dragging")) {
                        setTimeout(() => this.closeTab(tabId), 500);
                    } else {
                        console.error("NewTabCloser: 关闭标签页时出错", chrome.runtime.lastError.message);
                    }
                }
            });
        } catch (e) {
            console.error("NewTabCloser: 关闭标签页时出错", e);
        }
    },
    
    /**
     * 检查URL是否是空白标签页
     * @param {string} url - 要检查的URL
     * @returns {boolean} - 如果是空白标签页则返回true
     */
    isNewTabPage: function(url) {
        try {
            if (!url) return false;
            
            return this.NEW_TAB_URL_PATTERNS.some(pattern => url.startsWith(pattern));
        } catch (e) {
            console.error("NewTabCloser: 检查URL时出错", e);
            return false;
        }
    }
};

// 导出模块
globalThis.NewTabCloser = NewTabCloser;
