"use strict";

const App = {
	tabs: Object.create(null),
	options: Object.create(null),
	recentlyClosedTabUrl: undefined,

	initialize: function (tabs) {
		tabs.forEach(this.addTab.bind(this));
	},

	initializeOptions: function (data) {
		try {
			this.options = JSON.parse(data.options);
		} catch (e) {
			this.options = {};
		}
	},

	updateOrCloseTab: function (tabId, changeInfo, tab) {
		if (this.tabs[tabId] === undefined) return;

		if (!tab.url || this.tabs[tabId].kicked || tab.url.startsWith('chrome://') || this.tabs[tabId].preventFromClosing) {
			return;
		}

		const pendingUrl = this.tabs[tabId]?.tab?.pendingUrl;

		// Check if the current tab is in an incognito window
		chrome.windows.get(tab.windowId, { populate: false }, (window) => {
			if (window.incognito) {
				// Do nothing for incognito windows
				return;
			}

			const existedTabs = this.getTabsByUrlInSameWindow(pendingUrl || tab.url);
			const anotherTabs = existedTabs.filter(existedTab => existedTab.id !== tab.id);

			if (anotherTabs.length) {
				// Check if the existing tab is in an incognito window
				chrome.windows.get(anotherTabs[0].windowId, { populate: false }, (existingWindow) => {
					if (existingWindow.incognito) {
						// Do nothing if the existing tab is in an incognito window
						return;
					}

					this.tabs[tabId].kicked = true;
					this.recentlyClosedTabUrl = tab.url;
					this.highlightTab(anotherTabs[0].id, {
						kickedUrl: tab.url,
						kickedTabIndex: tab.index,
						kickedTabWindowId: tab.windowId
					});
					this.closeTab(tabId);
				});
			}
		});

		this.tabs[tabId].tab = tab;
	},

	listenReplaceTab: function (newTabId, oldTabId) {
		this.tabs[newTabId] = this.tabs[oldTabId];
		this.removeTabWatching(oldTabId);

		chrome.tabs.get(newTabId, tab => {
			this.tabs[newTabId].tab = tab;
			this.updateOrCloseTab(newTabId, {}, tab);
		});
	},

	addTab: function (tab) {
		this.tabs[tab.id] = {
			tab: tab,
			preventFromClosing: this.urlMatch(tab.url, this.recentlyClosedTabUrl)
		};
	},

	removeTabWatching: function (tabId) {
		delete this.tabs[tabId];
	},

	highlightTab: function (tabId, options) {
		const { kickedUrl, kickedTabIndex, kickedTabWindowId } = options;
		const { replace_hash_for_old_tab, move_tab } = this.options;

		chrome.windows.get(kickedTabWindowId, { populate: false }, (kickedWindow) => {
			chrome.windows.get(this.tabs[tabId].tab.windowId, { populate: false }, (existingWindow) => {
				if (!kickedWindow.incognito && !existingWindow.incognito && move_tab) {
					chrome.tabs.move(tabId, {
						index: kickedTabIndex,
						windowId: kickedTabWindowId
					}).catch(e => console.error("Moving tab Failed: ", e));
				}

				chrome.windows.update(kickedTabWindowId, { focused: true });
				chrome.tabs.update(tabId, { highlighted: true, active: true });

				if (replace_hash_for_old_tab && kickedUrl) {
					const url = new URL(kickedUrl);
					if (url.hash) {
						chrome.tabs.sendMessage(tabId, { action: "setHash", hash: url.hash });
					}
				}
			});
		});
	},

	closeTab: function (tabId) {
		chrome.tabs.remove(tabId).then(() => {
			this.removeTabWatching(tabId);
		}).catch(e => console.error("Closing tab Failed: ", e));
	},

	urlMatch: function (url1, url2) {
		const { ignore_hash } = this.options;

		if (ignore_hash) {
			url1 = url1 && url1.split('#')[0];
			url2 = url2 && url2.split('#')[0];
		}

		return url1 === url2;
	},

	getTabsByUrlInSameWindow: function (url) {
		return Object.values(this.tabs)
			.filter(tab => {
				return this.urlMatch(tab.tab.url, url) && !tab.kicked && !tab.tab.incognito;
			})
			.map(tab => tab.tab);
	}
};

chrome.tabs.query({}, App.initialize.bind(App));
chrome.storage.sync.get('options', App.initializeOptions.bind(App));
chrome.storage.onChanged.addListener(() => {
	chrome.storage.sync.get('options', App.initializeOptions.bind(App));
});

chrome.tabs.onCreated.addListener(App.addTab.bind(App));
chrome.tabs.onUpdated.addListener(App.updateOrCloseTab.bind(App));
chrome.tabs.onRemoved.addListener(App.removeTabWatching.bind(App));
chrome.tabs.onReplaced.addListener(App.listenReplaceTab.bind(App));

// Implement declarativeNetRequest rules here if needed
