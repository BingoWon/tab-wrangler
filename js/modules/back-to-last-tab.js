"use strict";

/**
 * BackToLastTab - 在关闭当前标签页时返回到之前浏览的标签页
 * 维护每个窗口的标签页访问历史，当关闭当前标签页时，激活上一个访问的标签页
 */
const BackToLastTab = {
    // 存储每个窗口最近访问的标签页顺序
    tabHistory: {},
    
    // 存储最后一个活动的标签页
    lastActiveTab: {},
    
    /**
     * 初始化模块
     */
    initialize: function() {
        console.log("BackToLastTab: 初始化");
        
        // 获取所有窗口和标签页
        chrome.windows.getAll({ populate: true }, (windows) => {
            windows.forEach(window => {
                this.tabHistory[window.id] = [];
                
                // 找到活动标签页
                const activeTab = window.tabs.find(tab => tab.active);
                if (activeTab) {
                    this.lastActiveTab[window.id] = activeTab.id;
                }
                
                // 初始化历史记录
                window.tabs.forEach(tab => {
                    this.tabHistory[window.id].push(tab.id);
                });
            });
        });
        
        // 设置事件监听器
        this.setupEventListeners();
    },
    
    /**
     * 设置事件监听器
     */
    setupEventListeners: function() {
        // 当标签页激活时
        chrome.tabs.onActivated.addListener(this.onTabActivated.bind(this));
        
        // 当标签页关闭前
        chrome.tabs.onRemoved.addListener(this.onTabRemoved.bind(this));
        
        // 当标签页创建时
        chrome.tabs.onCreated.addListener(this.onTabCreated.bind(this));
        
        // 当窗口关闭时
        chrome.windows.onRemoved.addListener(this.onWindowRemoved.bind(this));
        
        // 当窗口创建时
        chrome.windows.onCreated.addListener(this.onWindowCreated.bind(this));
        
        // 当标签页移动到另一个窗口时
        chrome.tabs.onAttached.addListener(this.onTabAttached.bind(this));
        chrome.tabs.onDetached.addListener(this.onTabDetached.bind(this));
    },
    
    /**
     * 标签页激活时
     */
    onTabActivated: function(activeInfo) {
        const { tabId, windowId } = activeInfo;
        
        // 更新该窗口的最后一个活动标签页
        const previousActiveTab = this.lastActiveTab[windowId];
        this.lastActiveTab[windowId] = tabId;
        
        // 确保tabHistory存在
        if (!this.tabHistory[windowId]) {
            this.tabHistory[windowId] = [];
        }
        
        // 将当前标签页移到历史的最前面
        this.tabHistory[windowId] = this.tabHistory[windowId].filter(id => id !== tabId);
        this.tabHistory[windowId].unshift(tabId);
        
        // 如果previousActiveTab存在且不是当前标签页，将其放在第二位
        if (previousActiveTab && previousActiveTab !== tabId) {
            this.tabHistory[windowId] = this.tabHistory[windowId].filter(id => id !== previousActiveTab);
            this.tabHistory[windowId].splice(1, 0, previousActiveTab);
        }
    },
    
    /**
     * 标签页关闭时
     */
    onTabRemoved: function(tabId, removeInfo) {
        const { windowId, isWindowClosing } = removeInfo;
        
        // 如果窗口正在关闭，不处理
        if (isWindowClosing) return;
        
        // 确保tabHistory存在
        if (!this.tabHistory[windowId]) {
            this.tabHistory[windowId] = [];
        }
        
        // 检查关闭的是否是当前活动标签页
        if (this.lastActiveTab[windowId] === tabId) {
            // 从历史中找到下一个要激活的标签页
            const nextTabIndex = this.tabHistory[windowId].findIndex(id => id !== tabId);
            const nextTabId = nextTabIndex > -1 ? this.tabHistory[windowId][nextTabIndex] : null;
            
            // 从历史中移除关闭的标签页
            this.tabHistory[windowId] = this.tabHistory[windowId].filter(id => id !== tabId);
            
            // 如果找到了下一个标签页，激活它
            if (nextTabId) {
                // 使用延迟，确保在浏览器默认行为之后执行
                setTimeout(() => {
                    chrome.tabs.update(nextTabId, { active: true }, () => {
                        if (chrome.runtime.lastError) {
                            // 如果标签页不存在，从历史中移除
                            this.tabHistory[windowId] = this.tabHistory[windowId].filter(id => id !== nextTabId);
                        }
                    });
                }, 150);
            }
        } else {
            // 如果关闭的不是活动标签页，只从历史中移除
            this.tabHistory[windowId] = this.tabHistory[windowId].filter(id => id !== tabId);
        }
    },
    
    /**
     * 标签页创建时
     */
    onTabCreated: function(tab) {
        const { id, windowId, active } = tab;
        
        // 确保窗口历史存在
        if (!this.tabHistory[windowId]) {
            this.tabHistory[windowId] = [];
        }
        
        // 如果标签页是活动的，将其添加到历史最前面
        if (active) {
            // 更新该窗口的最后一个活动标签页
            const previousActiveTab = this.lastActiveTab[windowId];
            this.lastActiveTab[windowId] = id;
            
            // 从历史中移除该标签页（如果存在）
            this.tabHistory[windowId] = this.tabHistory[windowId].filter(tabId => tabId !== id);
            
            // 将该标签页添加到历史最前面
            this.tabHistory[windowId].unshift(id);
            
            // 如果previousActiveTab存在且不是当前标签页，将其放在第二位
            if (previousActiveTab && previousActiveTab !== id) {
                this.tabHistory[windowId] = this.tabHistory[windowId].filter(tabId => tabId !== previousActiveTab);
                this.tabHistory[windowId].splice(1, 0, previousActiveTab);
            }
        } else {
            // 如果标签页不是活动的，将其添加到历史末尾（如果不存在）
            if (!this.tabHistory[windowId].includes(id)) {
                this.tabHistory[windowId].push(id);
            }
        }
    },
    
    /**
     * 窗口关闭时
     */
    onWindowRemoved: function(windowId) {
        // 删除该窗口的历史记录
        delete this.tabHistory[windowId];
        delete this.lastActiveTab[windowId];
    },
    
    /**
     * 窗口创建时
     */
    onWindowCreated: function(window) {
        // 为新窗口创建历史记录
        this.tabHistory[window.id] = [];
        
        // 如果窗口已经有标签页，初始化历史记录
        if (window.tabs) {
            const activeTab = window.tabs.find(tab => tab.active);
            if (activeTab) {
                this.lastActiveTab[window.id] = activeTab.id;
                this.tabHistory[window.id].unshift(activeTab.id);
            }
            
            const inactiveTabs = window.tabs.filter(tab => !tab.active).map(tab => tab.id);
            this.tabHistory[window.id].push(...inactiveTabs);
        }
    },
    
    /**
     * 标签页附加到窗口时
     */
    onTabAttached: function(tabId, attachInfo) {
        const { newWindowId } = attachInfo;
        
        // 确保新窗口历史存在
        if (!this.tabHistory[newWindowId]) {
            this.tabHistory[newWindowId] = [];
        }
        
        // 将标签页添加到新窗口历史
        if (!this.tabHistory[newWindowId].includes(tabId)) {
            this.tabHistory[newWindowId].push(tabId);
        }
    },
    
    /**
     * 标签页从窗口分离时
     */
    onTabDetached: function(tabId, detachInfo) {
        const { oldWindowId } = detachInfo;
        
        // 确保旧窗口历史存在
        if (!this.tabHistory[oldWindowId]) return;
        
        // 从旧窗口历史中移除标签页
        this.tabHistory[oldWindowId] = this.tabHistory[oldWindowId].filter(id => id !== tabId);
        
        // 如果是最后一个活动的标签页，更新lastActiveTab
        if (this.lastActiveTab[oldWindowId] === tabId) {
            const nextTabId = this.tabHistory[oldWindowId][0];
            if (nextTabId) {
                this.lastActiveTab[oldWindowId] = nextTabId;
            } else {
                delete this.lastActiveTab[oldWindowId];
            }
        }
    }
};

// 导出模块
globalThis.BackToLastTab = BackToLastTab;
