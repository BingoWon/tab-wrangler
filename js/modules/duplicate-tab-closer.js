"use strict";

/**
 * DuplicateTabCloser - 检测和关闭重复的标签页
 * 当用户打开一个已经存在的URL的标签页时，关闭新打开的标签页并聚焦到已存在的标签页
 */
const DuplicateTabCloser = {
    // 存储所有标签页的信息
    tabs: Object.create(null),
    
    // 存储选项
    options: Object.create(null),
    
    // 最近关闭的标签页URL
    recentlyClosedTabUrl: undefined,
    
    /**
     * 初始化模块
     */
    initialize: function() {
        console.log("DuplicateTabCloser: 初始化");
        
        // 获取所有标签页
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(this.addTab.bind(this));
        });
        
        // 获取选项
        chrome.storage.sync.get('options', this.initializeOptions.bind(this));
        
        // 监听选项变化
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.options) {
                chrome.storage.sync.get('options', this.initializeOptions.bind(this));
            }
        });
        
        // 设置事件监听器
        this.setupEventListeners();
    },
    
    /**
     * 初始化选项
     */
    initializeOptions: function(data) {
        try {
            this.options = JSON.parse(data.options || '{}');
        } catch (e) {
            console.error("DuplicateTabCloser: 解析选项时出错", e);
            this.options = {};
        }
    },
    
    /**
     * 设置事件监听器
     */
    setupEventListeners: function() {
        // 监听标签页创建事件
        chrome.tabs.onCreated.addListener(this.addTab.bind(this));
        
        // 监听标签页更新事件
        chrome.tabs.onUpdated.addListener(this.updateOrCloseTab.bind(this));
        
        // 监听标签页关闭事件
        chrome.tabs.onRemoved.addListener(this.removeTabWatching.bind(this));
        
        // 监听标签页替换事件
        chrome.tabs.onReplaced.addListener(this.listenReplaceTab.bind(this));
    },
    
    /**
     * 更新或关闭标签页
     */
    updateOrCloseTab: function(tabId, changeInfo, tab) {
        // 安全检查：确保标签页存在于我们的记录中
        if (!this.tabs[tabId]) return;
        
        // 安全检查：确保标签页有URL且未被标记为kicked
        if (!tab.url || 
            this.tabs[tabId].kicked || 
            tab.url.startsWith('chrome://') || 
            this.tabs[tabId].preventFromClosing) {
            return;
        }
        
        try {
            const pendingUrl = this.tabs[tabId]?.tab?.pendingUrl;
            
            // 获取同一窗口中相同URL的标签页
            const existedTabsInSameWindow = this.getTabsByUrlInSameWindow(pendingUrl || tab.url, tab.windowId);
            const anotherTabs = existedTabsInSameWindow.filter(existedTab => existedTab.id !== tab.id);
            
            if (anotherTabs.length) {
                this.tabs[tabId].kicked = true;
                this.recentlyClosedTabUrl = tab.url;
                
                // 尝试高亮已存在的标签页
                try {
                    this.highlightTab(anotherTabs[0].id, {
                        kickedUrl: tab.url,
                        kickedTabIndex: tab.index,
                        kickedTabWindowId: tab.windowId
                    });
                } catch (e) {
                    console.error("DuplicateTabCloser: 高亮标签页时出错", e);
                }
                
                // 尝试关闭当前标签页
                this.closeTab(tabId);
            }
            
            // 更新标签页信息
            if (this.tabs[tabId]) {
                this.tabs[tabId].tab = tab;
            }
        } catch (e) {
            console.error("DuplicateTabCloser: 更新或关闭标签页时出错", e);
        }
    },
    
    /**
     * 监听标签页替换事件
     */
    listenReplaceTab: function(newTabId, oldTabId) {
        try {
            // 安全检查：确保旧标签页存在于我们的记录中
            if (!this.tabs[oldTabId]) return;
            
            this.tabs[newTabId] = this.tabs[oldTabId];
            this.removeTabWatching(oldTabId);
            
            chrome.tabs.get(newTabId, tab => {
                if (chrome.runtime.lastError) {
                    console.error("DuplicateTabCloser: 获取标签页时出错", chrome.runtime.lastError.message);
                    return;
                }
                
                if (this.tabs[newTabId]) {
                    this.tabs[newTabId].tab = tab;
                    this.updateOrCloseTab(newTabId, {}, tab);
                }
            });
        } catch (e) {
            console.error("DuplicateTabCloser: 处理标签页替换事件时出错", e);
        }
    },
    
    /**
     * 添加标签页
     */
    addTab: function(tab) {
        try {
            this.tabs[tab.id] = {
                tab: tab,
                preventFromClosing: this.urlMatch(tab.url, this.recentlyClosedTabUrl)
            };
        } catch (e) {
            console.error("DuplicateTabCloser: 添加标签页时出错", e);
        }
    },
    
    /**
     * 移除标签页监视
     */
    removeTabWatching: function(tabId) {
        try {
            delete this.tabs[tabId];
        } catch (e) {
            console.error("DuplicateTabCloser: 移除标签页监视时出错", e);
        }
    },
    
    /**
     * 高亮标签页
     */
    highlightTab: function(tabId, options) {
        try {
            const { kickedUrl, kickedTabIndex, kickedTabWindowId } = options;
            const { replace_hash_for_old_tab, move_tab } = this.options;
            
            // 如果启用了移动标签页选项，则将已存在的标签页移动到新关闭的标签页的位置
            if (move_tab) {
                chrome.tabs.move(tabId, {
                    index: kickedTabIndex,
                    windowId: kickedTabWindowId
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("DuplicateTabCloser: 移动标签页失败", chrome.runtime.lastError.message);
                    }
                });
            }
            
            // 聚焦到已存在的标签页
            chrome.windows.update(kickedTabWindowId, { focused: true }, () => {
                if (chrome.runtime.lastError) {
                    console.error("DuplicateTabCloser: 聚焦窗口失败", chrome.runtime.lastError.message);
                }
            });
            
            chrome.tabs.update(tabId, { highlighted: true, active: true }, () => {
                if (chrome.runtime.lastError) {
                    console.error("DuplicateTabCloser: 激活标签页失败", chrome.runtime.lastError.message);
                }
            });
            
            // 如果启用了替换哈希选项，则将新标签页的哈希应用到已存在的标签页
            if (replace_hash_for_old_tab && kickedUrl) {
                try {
                    const url = new URL(kickedUrl);
                    if (url.hash) {
                        chrome.tabs.sendMessage(tabId, { action: "setHash", hash: url.hash }, () => {
                            if (chrome.runtime.lastError) {
                                // 忽略错误，因为这个功能不是必需的
                            }
                        });
                    }
                } catch (e) {
                    console.error("DuplicateTabCloser: 解析URL失败", e);
                }
            }
        } catch (e) {
            console.error("DuplicateTabCloser: 高亮标签页时出错", e);
        }
    },
    
    /**
     * 关闭标签页
     */
    closeTab: function(tabId) {
        try {
            chrome.tabs.remove(tabId, () => {
                if (chrome.runtime.lastError) {
                    console.error("DuplicateTabCloser: 关闭标签页失败", chrome.runtime.lastError.message);
                } else {
                    this.removeTabWatching(tabId);
                }
            });
        } catch (e) {
            console.error("DuplicateTabCloser: 关闭标签页时出错", e);
        }
    },
    
    /**
     * URL匹配
     */
    urlMatch: function(url1, url2) {
        try {
            if (!url1 || !url2) return false;
            
            const { ignore_hash } = this.options;
            
            if (ignore_hash) {
                url1 = url1.split('#')[0];
                url2 = url2.split('#')[0];
            }
            
            return url1 === url2;
        } catch (e) {
            console.error("DuplicateTabCloser: URL匹配时出错", e);
            return false;
        }
    },
    
    /**
     * 获取同一窗口中相同URL的标签页
     */
    getTabsByUrlInSameWindow: function(url, windowId) {
        try {
            if (!url || !windowId) return [];
            
            return Object.values(this.tabs)
                .filter(tabInfo => {
                    return tabInfo && tabInfo.tab && 
                           this.urlMatch(tabInfo.tab.url, url) && 
                           !tabInfo.kicked && 
                           tabInfo.tab.windowId === windowId;
                })
                .map(tabInfo => tabInfo.tab);
        } catch (e) {
            console.error("DuplicateTabCloser: 获取同窗口标签页时出错", e);
            return [];
        }
    }
};

// 导出模块
globalThis.DuplicateTabCloser = DuplicateTabCloser;
