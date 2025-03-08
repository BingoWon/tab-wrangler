document.addEventListener('DOMContentLoaded', function() {
	// 获取表单和所有输入元素
	const form = document.getElementById('options-form');
	const inputs = form.querySelectorAll('input[type="checkbox"]');
	
	// 存储选项
	let options = {};
	
	// 功能开关ID到模块名称的映射
	const featureModules = {
		'enable_duplicate_tab_closer': 'DuplicateTabCloser',
		'enable_back_to_last_tab': 'BackToLastTab',
		'enable_new_tab_closer': 'NewTabCloser'
	};
	
	// 初始化选项
	function initOptions(data) {
		try {
			// 解析存储的选项
			options = JSON.parse(data.options || '{}');
			
			// 设置默认值
			if (options.enable_duplicate_tab_closer === undefined) options.enable_duplicate_tab_closer = true;
			if (options.enable_back_to_last_tab === undefined) options.enable_back_to_last_tab = true;
			if (options.enable_new_tab_closer === undefined) options.enable_new_tab_closer = true;
			
			// 更新UI
			updateUI();
			
			// 保存初始化后的选项
			saveOptions();
		} catch (e) {
			console.error('Error initializing options:', e);
			options = {
				enable_duplicate_tab_closer: true,
				enable_back_to_last_tab: true,
				enable_new_tab_closer: true
			};
			updateUI();
			saveOptions();
		}
	}
	
	// 更新UI以匹配当前选项
	function updateUI() {
		// 更新所有复选框
		inputs.forEach(input => {
			const { name } = input;
			if (options[name] !== undefined) {
				input.checked = options[name];
			}
			
			// 处理子选项的显示/隐藏
			handleSubOptions(input);
		});
		
		// 特殊处理：如果ignore_hash被选中，显示replace_hash选项
		const replaceHashContainer = document.getElementById('replace_hash_container');
		if (replaceHashContainer) {
			replaceHashContainer.style.display = options.ignore_hash ? 'flex' : 'none';
		}
	}
	
	// 处理子选项的显示/隐藏
	function handleSubOptions(input) {
		const { name, checked } = input;
		
		// 如果是ignore_hash选项，控制replace_hash选项的显示/隐藏
		if (name === 'ignore_hash') {
			const replaceHashContainer = document.getElementById('replace_hash_container');
			if (replaceHashContainer) {
				replaceHashContainer.style.display = checked ? 'flex' : 'none';
			}
		}
		
		// 如果是功能开关，控制相关选项的启用/禁用
		if (name === 'enable_duplicate_tab_closer') {
			const duplicateOptions = document.querySelectorAll('.feature-options .option-item');
			duplicateOptions.forEach(option => {
				option.style.opacity = checked ? '1' : '0.5';
				const optionInput = option.querySelector('input');
				optionInput.disabled = !checked;
			});
		}
	}
	
	// 保存选项到存储
	function saveOptions() {
		chrome.storage.sync.set({ 'options': JSON.stringify(options) }, function() {
			// 通知后台脚本选项已更改
			notifyBackgroundScript();
		});
	}
	
	// 通知后台脚本选项已更改
	function notifyBackgroundScript() {
		// 遍历所有功能开关
		Object.keys(featureModules).forEach(key => {
			const moduleName = featureModules[key];
			const enabled = options[key] === true;
			
			// 发送消息到后台脚本
			chrome.runtime.sendMessage({
				action: 'toggleFeature',
				module: moduleName,
				enabled: enabled
			});
		});
	}
	
	// 监听输入变化
	inputs.forEach(input => {
		input.addEventListener('change', function(event) {
			const { name, checked } = event.target;
			
			// 更新选项
			options[name] = checked;
			
			// 处理子选项
			handleSubOptions(input);
			
			// 保存选项
			saveOptions();
		});
	});
	
	// 加载存储的选项
	chrome.storage.sync.get('options', initOptions);
});
