/**
 * StealthDOM Popup — Bridge Toggle & Tab Memory Governor UI
 *
 * Persists Tab Governor settings in BOTH `localStorage` (`stealthdom_tab_governor`,
 * for instant 0ms popup rendering) AND `chrome.storage.local` (shared with the
 * background service worker).
 */

const LOCAL_STORAGE_KEY = 'stealthdom_tab_governor';

const DEFAULT_GOVERNOR_CONFIG = {
    enabled: true,
    maxActiveTabs: 3,
    inactivityTimeoutMinutes: 5,
    sleepMinimizedWindows: true,
    protectPinnedTabs: true,
    protectAudioTabs: false,
    autoWakeForAgent: true,
    whitelistDomains: [],
};

// Bridge DOM elements
const toggle = document.getElementById('toggleEnabled');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// Governor DOM elements
const govEnabled = document.getElementById('govEnabled');
const govMaxTabs = document.getElementById('govMaxTabs');
const govTimeoutMin = document.getElementById('govTimeoutMin');
const govSleepMinimized = document.getElementById('govSleepMinimized');
const govProtectPinned = document.getElementById('govProtectPinned');
const govProtectAudio = document.getElementById('govProtectAudio');
const govAutoWakeAgent = document.getElementById('govAutoWakeAgent');
const govWhitelist = document.getElementById('govWhitelist');
const btnSleepNow = document.getElementById('btnSleepNow');
const btnExcludeCurrent = document.getElementById('btnExcludeCurrent');
const statLoaded = document.getElementById('statLoaded');
const statSleeping = document.getElementById('statSleeping');
const statParked = document.getElementById('statParked');
const saveIndicator = document.getElementById('saveIndicator');

let currentActiveDomain = '';

function readLocalCachedConfig() {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_GOVERNOR_CONFIG };
        return { ...DEFAULT_GOVERNOR_CONFIG, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_GOVERNOR_CONFIG };
    }
}

function writeLocalCachedConfig(cfg) {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cfg));
    } catch {
        // Ignore storage quota errors
    }
}

function renderConfigToInputs(cfg) {
    govEnabled.checked = cfg.enabled !== false;
    govMaxTabs.value = String(cfg.maxActiveTabs ?? 3);
    govTimeoutMin.value = String(cfg.inactivityTimeoutMinutes ?? 5);
    govSleepMinimized.checked = cfg.sleepMinimizedWindows !== false;
    govProtectPinned.checked = cfg.protectPinnedTabs !== false;
    govProtectAudio.checked = Boolean(cfg.protectAudioTabs);
    govAutoWakeAgent.checked = cfg.autoWakeForAgent !== false;
    const domains = Array.isArray(cfg.whitelistDomains) ? cfg.whitelistDomains : [];
    govWhitelist.value = domains.join(', ');
    updateExcludeButtonLabel(domains);
}

function collectConfigFromInputs() {
    const rawMax = parseInt(govMaxTabs.value, 10);
    const maxActiveTabs = Number.isFinite(rawMax) && rawMax >= 0 ? Math.min(50, rawMax) : 3;
    const rawTimeout = parseInt(govTimeoutMin.value, 10);
    const inactivityTimeoutMinutes = Number.isFinite(rawTimeout) && rawTimeout >= 0 ? rawTimeout : 5;
    const whitelistDomains = govWhitelist.value
        .split(/[\s,]+/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

    return {
        enabled: govEnabled.checked,
        maxActiveTabs,
        inactivityTimeoutMinutes,
        sleepMinimizedWindows: govSleepMinimized.checked,
        protectPinnedTabs: govProtectPinned.checked,
        protectAudioTabs: govProtectAudio.checked,
        autoWakeForAgent: govAutoWakeAgent.checked,
        whitelistDomains: Array.from(new Set(whitelistDomains)),
    };
}

function renderStats(stats) {
    if (!stats) return;
    statLoaded.textContent = String(stats.loadedCount ?? '-');
    statSleeping.textContent = String(stats.sleepingCount ?? '-');
    if (stats.parkedWindowsCount > 0) {
        statParked.textContent = `${stats.parkedWindowsCount} parked win`;
    } else {
        statParked.textContent = '';
    }
}

function flashSaved() {
    if (!saveIndicator) return;
    saveIndicator.style.opacity = '1';
    setTimeout(() => {
        saveIndicator.style.opacity = '0';
    }, 1000);
}

function saveGovernorConfig() {
    const cfg = collectConfigFromInputs();
    writeLocalCachedConfig(cfg);
    updateExcludeButtonLabel(cfg.whitelistDomains);
    chrome.storage.local.set({ [LOCAL_STORAGE_KEY]: cfg });
    chrome.runtime.sendMessage({ type: 'setGovernorConfig', config: cfg }, (resp) => {
        if (!chrome.runtime.lastError && resp && resp.stats) {
            renderStats(resp.stats);
        }
        flashSaved();
    });
}

function updateExcludeButtonLabel(whitelistDomains) {
    if (!currentActiveDomain) {
        btnExcludeCurrent.textContent = '+ Exclude Current Tab Domain';
        btnExcludeCurrent.disabled = true;
        return;
    }
    btnExcludeCurrent.disabled = false;
    const list = Array.isArray(whitelistDomains) ? whitelistDomains : [];
    if (list.includes(currentActiveDomain)) {
        btnExcludeCurrent.textContent = `✓ Excluded: ${currentActiveDomain} (Click to Remove)`;
    } else {
        btnExcludeCurrent.textContent = `+ Exclude Current Site (${currentActiveDomain})`;
    }
}

// 1. Instant 0ms render from localStorage
renderConfigToInputs(readLocalCachedConfig());

// 2. Detect current active tab's domain for quick whitelist button
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].url) {
        try {
            const u = new URL(tabs[0].url);
            if (u.protocol === 'http:' || u.protocol === 'https:') {
                currentActiveDomain = u.hostname.toLowerCase();
            }
        } catch {
            // Ignore internal URLs
        }
    }
    const cfg = readLocalCachedConfig();
    updateExcludeButtonLabel(cfg.whitelistDomains);
});

// 3. Sync authoritative state from background service worker
chrome.storage.local.get(['stealthdom_enabled', LOCAL_STORAGE_KEY], (result) => {
    const enabled = result.stealthdom_enabled !== false;
    toggle.checked = enabled;
    if (result[LOCAL_STORAGE_KEY]) {
        const merged = { ...DEFAULT_GOVERNOR_CONFIG, ...result[LOCAL_STORAGE_KEY] };
        writeLocalCachedConfig(merged);
        renderConfigToInputs(merged);
    }
    updateStatus();
});

// Bridge toggle handler
toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.runtime.sendMessage({ type: 'setEnabled', enabled }, () => {
        updateStatus();
        if (enabled) {
            setTimeout(updateStatus, 1500);
            setTimeout(updateStatus, 3500);
        }
    });
});

// Governor input listeners
[govEnabled, govMaxTabs, govTimeoutMin, govSleepMinimized, govProtectPinned, govProtectAudio, govAutoWakeAgent].forEach(el => {
    el.addEventListener('change', saveGovernorConfig);
});

let whitelistDebounce = null;
govWhitelist.addEventListener('input', () => {
    clearTimeout(whitelistDebounce);
    whitelistDebounce = setTimeout(saveGovernorConfig, 400);
});
govWhitelist.addEventListener('change', saveGovernorConfig);

// One-click "Sleep All Inactive Tabs Now"
btnSleepNow.addEventListener('click', () => {
    const origText = btnSleepNow.textContent;
    btnSleepNow.textContent = 'Sleeping inactive tabs...';
    btnSleepNow.disabled = true;
    chrome.runtime.sendMessage({ type: 'sleepAllInactiveNow' }, (resp) => {
        btnSleepNow.disabled = false;
        if (!chrome.runtime.lastError && resp) {
            renderStats(resp.stats);
            const count = resp.sleptCount || 0;
            btnSleepNow.textContent = `✓ Put ${count} tab${count === 1 ? '' : 's'} to sleep!`;
        } else {
            btnSleepNow.textContent = origText;
        }
        setTimeout(() => {
            btnSleepNow.textContent = origText;
        }, 2000);
    });
});

// One-click "+ Exclude Current Site"
btnExcludeCurrent.addEventListener('click', () => {
    if (!currentActiveDomain) return;
    const cfg = collectConfigFromInputs();
    const set = new Set(cfg.whitelistDomains);
    if (set.has(currentActiveDomain)) {
        set.delete(currentActiveDomain);
    } else {
        set.add(currentActiveDomain);
    }
    govWhitelist.value = Array.from(set).join(', ');
    saveGovernorConfig();
});

function updateStatus() {
    chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
        if (chrome.runtime.lastError || !response) {
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = 'Background not responding';
            return;
        }

        if (!response.enabled) {
            statusDot.className = 'status-dot disabled';
            statusText.textContent = 'Disabled — not intercepting';
        } else if (response.bridgeConnected) {
            statusDot.className = 'status-dot connected';
            statusText.textContent = 'Connected to bridge';
        } else {
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = 'Enabled — bridge not connected';
        }
    });

    chrome.runtime.sendMessage({ type: 'getGovernorState' }, (resp) => {
        if (!chrome.runtime.lastError && resp && resp.stats) {
            renderStats(resp.stats);
        }
    });
}

// Poll status every 2 seconds while popup is open
setInterval(updateStatus, 2000);
