const MANIFEST_URL = 'https://raw.githubusercontent.com/ultranetpopilnya/UltraEnergy-SMS-Tool/main/manifest.json';
const DOWNLOAD_URL  = 'https://github.com/ultranetpopilnya/UltraEnergy-SMS-Tool/archive/refs/heads/main.zip';

// ⏱ ЩО МІНЯТИ: інтервал перевірки (зараз 10 хвилин)
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

// Порівняння версій "1.2.3" > "1.1.0" → true
function isNewerVersion(remote, current) {
    const toArr = v => String(v).split('.').map(Number);
    const r = toArr(remote);
    const c = toArr(current);
    for (let i = 0; i < Math.max(r.length, c.length); i++) {
        const ri = r[i] || 0;
        const ci = c[i] || 0;
        if (ri > ci) return true;
        if (ri < ci) return false;
    }
    return false;
}

function showUpdateBanner(newVersion) {
    const block       = document.getElementById('versionBlock');
    const updateInfo  = document.getElementById('updateInfo');
    const versionSpan = document.getElementById('updateBannerVersion');
    const link        = document.getElementById('updateDownloadLink');

    if (!block) return;
    if (versionSpan) versionSpan.textContent = newVersion;
    if (link)        link.href = DOWNLOAD_URL;

    block.classList.add('has-update');
    if (updateInfo) updateInfo.style.display = 'block';

    chrome.storage.local.set({ pendingUpdate: newVersion });
    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: [129, 30, 113, 255] });
}

function hideUpdateBanner() {
    const block      = document.getElementById('versionBlock');
    const updateInfo = document.getElementById('updateInfo');

    if (!block) return;
    block.classList.remove('has-update');
    if (updateInfo) updateInfo.style.display = 'none';

    chrome.storage.local.remove('pendingUpdate');
    chrome.action.setBadgeText({ text: '' });
}

// Запит до GitHub і порівняння версій
async function checkForUpdate(currentVersion) {
    try {
        const res = await fetch(MANIFEST_URL + '?_=' + Date.now());
        if (!res.ok) return;

        const data = await res.json();
        const remoteVersion = data.version;

        if (remoteVersion && isNewerVersion(remoteVersion, currentVersion)) {
            // Є нова версія — показуємо банер
            showUpdateBanner(remoteVersion);
        } else {
            // Нової версії немає — чистимо storage і бейдж
            chrome.storage.local.remove('pendingUpdate');
            chrome.action.setBadgeText({ text: '' });

            const banner = document.getElementById('updateBanner');
            if (banner) hideUpdateBanner();
        }
    } catch (e) {
        console.warn('[UltraEnergy] Перевірка оновлень не вдалась:', e);
    }
}

// Запустити перевірку і встановити інтервал
function startUpdateChecker(currentVersion) {
    checkForUpdate(currentVersion);
    setInterval(() => checkForUpdate(currentVersion), CHECK_INTERVAL_MS);
}

document.addEventListener('DOMContentLoaded', () => {
    const versionElement = document.getElementById('appVersion');
    let currentVersion = '0.0.0';

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
        currentVersion = chrome.runtime.getManifest().version;
        if (versionElement) versionElement.textContent = currentVersion;

        // Відновлюємо бейдж і банер якщо оновлення вже було знайдено раніше
        chrome.storage.local.get('pendingUpdate', (data) => {
            if (data.pendingUpdate && isNewerVersion(data.pendingUpdate, currentVersion)) {
                showUpdateBanner(data.pendingUpdate);
                chrome.action.setBadgeText({ text: '1' });
                chrome.action.setBadgeBackgroundColor({ color: [129, 30, 113, 255] });
            } else {
                // Якщо користувач вже встановив нову версію — чистимо storage і бейдж
                chrome.storage.local.remove('pendingUpdate');
                chrome.action.setBadgeText({ text: '' });
            }
        });

        startUpdateChecker(currentVersion);

    } else {
        // Локальне відкриття (подвійний клік по файлу)
        fetch('manifest.json')
            .then(r => r.json())
            .then(data => {
                currentVersion = data.version;
                if (versionElement) versionElement.textContent = currentVersion;
                startUpdateChecker(currentVersion);
            })
            .catch(err => {
                if (versionElement) versionElement.textContent = 'Помилка завантаження';
                console.error('Не вдалося отримати версію:', err);
            });
    }
});
