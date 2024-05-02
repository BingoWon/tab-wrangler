const form = document.querySelector('form');
const sections = document.querySelectorAll('section');
const inputs = document.querySelectorAll('input');


document.querySelector('#header-url-matching').innerHTML = chrome.i18n.getMessage("option_header_matching");
document.querySelector('label[for="option_ignore_hash"]').innerHTML = chrome.i18n.getMessage("option_option_ignore_hash");
document.querySelector('label[for="option_replace_hash"]').innerHTML = chrome.i18n.getMessage("option_option_replace_hash");


document.querySelector('#header-tab').innerHTML = chrome.i18n.getMessage("option_header_tab");
document.querySelector('label[for="option_move_tab"]').innerHTML = chrome.i18n.getMessage("option_option_move_tab");

let options;

function triggerSection(key, value) {
	const input = document.querySelector(`input[name=${key}]`);
	const section = input.parentNode;
	const directChildSections = section.querySelectorAll(':scope > section');
	
	directChildSections.forEach((section) => { section.style.display = !!value ? 'block' : 'none' });
}

function setValue(key, value, save) {
	options[key] = value;
	if (save) {
		chrome.storage.sync.set({'options': JSON.stringify(options)});
	}
}

function initOptions(data) {
	try {
		options = JSON.parse(data.options);
	} catch(e) {
		options = {};
	}

	Object.keys(options).forEach((key) => {
		const input = document.querySelector(`input[name=${key}]`);
		if (input) {
			input.checked = options[key];
			triggerSection(key, options[key]);
		}
	});
}

inputs.forEach(input => {
	input.addEventListener('change', (event) => {
		const { name, checked } = event.target;
 		setValue(name, checked, true);
 		triggerSection(name, checked);
	})
});

chrome.storage.sync.get('options', function(data) {
    initOptions(data);
});
