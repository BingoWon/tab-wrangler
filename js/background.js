"use strict";

var App = {

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
		// console.log("tab:", tab);
		// Bin: Sometimes the tab is already closed.
		if (this.tabs[tabId] === undefined) return;

		if (!tab.url || this.tabs[tabId].kicked || tab.url.indexOf('chrome://') === 0 || this.tabs[tabId].preventFromClosing) {
			return;
		}

		// pendingUrl available only from Chrome v79
		// Bin: I want pendingUrl but I have to make sure everything before it exist.
		let pendingUrl = this.tabs[tabId] && this.tabs[tabId].tab && this.tabs[tabId].tab.pendingUrl;
		// Bin: We don't care if they are in the same window or not. windowId won't be used.
		var existedTabs = this.getTabsByUrlInSameWindow(pendingUrl || tab.url, tab.windowId);

		var anotherTabs = existedTabs.filter(function (existedTab) {
			return existedTab.id !== tab.id;
		});

		if (anotherTabs.length) {
			this.tabs[tabId].kicked = true;
			// chrome.scripting.executeScript({
			// 	target: { tabId: tabId },
			// 	func: () => {
			// 		window.stop();
			// 	},
			// 	world: "MAIN"
			// })
			this.recentlyClosedTabUrl = tab.url;
			this.highlightTab(anotherTabs[0].id, {
				kickedUrl: tab.url,
				kickedTabIndex: tab.index,
				kickedTabWindowId: tab.windowId
			});
			this.closeTab(tabId);
		}
		// if (anotherTabs.length) {
		// 	this.tabs[tabId].kicked = true;
		// 	// The line below prevents the tab from invoking the same update event the second time.
		// 	// `chrome.scripting.executeScript` returns a promise.
		// 	chrome.scripting.executeScript({
		// 		target: { tabId: tabId },
		// 		func: () => {
		// 			window.stop();
		// 		},
		// 		world: "MAIN"
		// 	}).then(() => {
		// 		this.recentlyClosedTabUrl = tab.url;
		// 		this.highlightTab(anotherTabs[0].id, {
		// 			kickedUrl: tab.url,
		// 			kickedTabIndex: tab.index,
		// 			kickedTabWindowId: tab.windowId
		// 		});
		// 		this.closeTab(tabId);
		// 	});
		// }

		this.tabs[tabId].tab = tab;
	},

	listenReplaceTab: function (newTabId, oldTabId) {
		this.tabs[newTabId] = this.tabs[oldTabId];
		this.removeTabWatching(oldTabId);

		chrome.tabs.get(newTabId, function (tab) {
			this.tabs[newTabId].tab = tab;
			this.updateOrCloseTab(newTabId, {}, tab);
		}.bind(this));
	},

	listenBeforeRequest: function (details) {
		if (details.tabId && details.tabId > 0 && this.tabs[details.tabId] && this.tabs[details.tabId].kicked) {
			return {
				cancel: true
			};
		}

		return {};
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

		// Bin: bring the kept duplicate tab to the closed duplicate tab (where the new tab is opened).
		// In Edge, there can be more than one "profile" which is different user space.
		// Tabs can only be moved between windows in the same profile.
		// But I can find any properties related to `profile` in tab object.
		// It will always throw an error if the tabs are not in the same profile.
		try {
			if (move_tab) {
				chrome.tabs.move(tabId, {
					index: kickedTabIndex,
					windowId: kickedTabWindowId
				});
			}
		} catch (e) {
			console.error("Moving tab Failed: ", e);
		}
		// bring the window where the new tab is opened to the front.
		chrome.windows.update(kickedTabWindowId, {
			focused: true
		});

		// bring the kept duplicate tab to the front.
		chrome.tabs.update(tabId, {
			highlighted: true,
			active: true
		});


		// if (replace_hash_for_old_tab && kickedUrl) {
		// 	const url = new URL(kickedUrl);
		// 	if (url.hash) {
		// 		chrome.scripting.executeScript({
		// 			target: { tabId: tabId },
		// 			func: setHash,
		// 			args: [url.hash]
		// 		});
		// 	}
		// }

		// function setHash(hash) {
		// 	location.hash = hash;
		// }
	},

	closeTab: function (tabId) {
		chrome.tabs.remove(tabId, function () {
			this.removeTabWatching(tabId);
		}.bind(this));
	},

	urlMatch(url1, url2) {
		const { ignore_hash } = this.options;

		if (ignore_hash) {
			url1 = url1 && url1.split('#')[0];
			url2 = url2 && url2.split('#')[0];
		}

		return url1 === url2;
	},

	getTabsByUrlInSameWindow: function (url, windowId) {
		var result = [];
		for (var tabId in this.tabs) {
			var tab = this.tabs[tabId];

			// Bin: We don't care if they are in the same window or not.
			// if (this.urlMatch(tab.tab.url, url) && !tab.kicked && tab.tab.windowId === windowId) {
			if (this.urlMatch(tab.tab.url, url) && !tab.kicked) {
				result.push(this.tabs[tabId].tab);
			}
		}
		return result;
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

// chrome.webRequest.onBeforeRequest.addListener(App.listenBeforeRequest.bind(App),
// 	{
// 		urls: ["http://*/*", "https://*/*"],
// 		types: ["sub_frame", "stylesheet", "script", "image", "object", "xmlhttprequest", "other"]
// 	},
// 	["blocking"]
// );

// const rule = {
// 	id: tabId,
// 	priority: 1,
// 	action: { type: "block" },
// 	condition: {
// 		// tabIds: [tabId],
// 		urlFilter: "",	// placeholder for now
// 		resourceTypes: ["sub_frame", "stylesheet", "script", "image", "object", "xmlhttprequest", "other"]
// 	}
// };

// async function getAllSessionRuleIds() {
// 	const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
// 	const oldRuleIds = oldRules.map(rule => rule.id);
// 	return oldRuleIds
// }

// // Use the arrays to update the dynamic rules
// await chrome.declarativeNetRequest.updateSessionRules({
// 	removeRuleIds: oldRuleIds,
// 	addRules: newRules
// });
