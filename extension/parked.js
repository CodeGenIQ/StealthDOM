/**
 * StealthDOM Parked Minimized Window Placeholder (`parked.js`)
 *
 * Holds focus inside a minimized window so Chromium allows `chrome.tabs.discard()`
 * on the window's heavy active tab while preserving the window's title in the
 * Windows Taskbar (`💤 <Original Title>`).
 *
 * Automatically restores the original tab and closes itself the instant the
 * window is un-minimized or focused by the user.
 */
(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reloadExtension') === '1' && chrome.runtime && chrome.runtime.reload) {
        chrome.runtime.reload();
        return;
    }
    const origTitle = params.get('title') || 'Sleeping Window';
    const windowId = Number(params.get('windowId')) || null;
    const parkedTabId = Number(params.get('tabId')) || null;

    document.title = `💤 ${origTitle}`;
    const titleEl = document.getElementById('parkedTitle');
    if (titleEl) titleEl.textContent = origTitle;

    let restoring = false;
    const autoRestoreReadyAt = Date.now() + 1500;

    function triggerRestore(force = false) {
        if (!force && Date.now() < autoRestoreReadyAt) return;
        if (restoring) return;
        restoring = true;
        chrome.runtime.sendMessage(
            {
                type: 'restoreParkedWindow',
                windowId,
                parkedTabId,
            },
            () => {
                // Fallback self-close if background didn't already remove this tab
                if (chrome.runtime.lastError) {
                    window.close();
                }
            }
        );
    }

    // As soon as the user un-minimizes the window, visibilityState becomes 'visible'
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            triggerRestore(false);
        }
    });

    window.addEventListener('focus', () => {
        if (document.visibilityState === 'visible') {
            triggerRestore(false);
        }
    });

    const restoreBtn = document.getElementById('restoreBtn');
    if (restoreBtn) {
        restoreBtn.addEventListener('click', () => triggerRestore(true));
    }

    // Also poll window state once per second in case Windows restores the window
    // without immediately firing focus
    if (windowId && chrome.windows) {
        const pollId = setInterval(() => {
            if (Date.now() < autoRestoreReadyAt) return;
            chrome.windows.get(windowId, (win) => {
                if (chrome.runtime.lastError || !win) {
                    clearInterval(pollId);
                    return;
                }
                if (win.state !== 'minimized') {
                    clearInterval(pollId);
                    triggerRestore(true);
                }
            });
        }, 800);
    }
})();
