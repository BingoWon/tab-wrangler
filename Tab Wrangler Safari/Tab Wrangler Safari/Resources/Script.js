function show(enabled, useSettingsInsteadOfPreferences) {
    const settingsName = useSettingsInsteadOfPreferences ? "Settings" : "Preferences";

    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName("open-settings")[0].innerText = "Quit and Open Safari Settings...";
    }

    document.getElementsByClassName("state-on")[0].innerText = `Tab Deduper is currently on. You can turn it off in the Extensions section of Safari ${settingsName}.`;
    document.getElementsByClassName("state-off")[0].innerText = `Tab Deduper is currently off. You can turn it on in the Extensions section of Safari ${settingsName}.`;
    document.getElementsByClassName("state-unknown")[0].innerText = `You can turn on Tab Deduper in the Extensions section of Safari ${settingsName}.`;

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openSettings() {
    webkit.messageHandlers.controller.postMessage("open-settings");
}

document.querySelector("button.open-settings").addEventListener("click", openSettings);
