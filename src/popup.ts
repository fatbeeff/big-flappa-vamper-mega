const version = document.querySelector<HTMLElement>("#extension-version");
if (version) version.textContent = chrome.runtime.getManifest().version;
