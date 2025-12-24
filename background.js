chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'open_inspector') {
        chrome.tabs.create({ url: message.url });
    }
});