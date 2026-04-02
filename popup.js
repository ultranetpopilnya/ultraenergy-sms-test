const SECRET_HASH = "f190a3d0c04e5b2b3f4ee16d2df26597720b8d1c09179d2a0dad7e4605776875";

// === ФУНКЦІЯ МАЛЮВАННЯ СПИСКУ НОМЕРІВ ===
function renderPhoneSelector(phones) {
    let wrapper = document.getElementById('multiPhoneWrapper');
    let selector = document.getElementById('phoneSelector');

    // Якщо номерів 0 або 1 - ховаємо цей допоміжний блок
    if (!phones || phones.length <= 1) {
        if (wrapper) wrapper.style.display = 'none';
        return;
    }

    // Якщо номерів багато - показуємо блок
    if (wrapper) wrapper.style.display = 'block';
    
    // Очищаємо список і додаємо перший пункт-підказку
    selector.innerHTML = '<option value="" disabled selected>⬇ Оберіть один номер зі списку...</option>';

    phones.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p;
        opt.text = '+ ' + p;
        selector.appendChild(opt);
    });

    // При виборі зі списку - переносимо номер у головне поле
    selector.onchange = (e) => {
        if (e.target.value) {
            document.getElementById('phone').value = e.target.value;
            saveStateToCache();
            // Повертаємо селект на початкову позицію (щоб можна було клікнути ще раз, якщо треба)
            selector.value = ""; 
        }
    };
}

// === ФУНКЦІЯ: СТАТУСИ ПРЯМО НА КНОПЦІ ===
function showButtonStatus(btnId, message, type) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    if (!btn.dataset.originalText) {
        btn.dataset.originalText = btn.innerText;
    }

    btn.classList.remove('btn-success', 'btn-error', 'btn-loading');

    let icon = '';
    if (type === 'success') {
        btn.classList.add('btn-success');
        icon = '✅';
        btn.disabled = true; 
    } else if (type === 'error') {
        btn.classList.add('btn-error');
        icon = '❌';
        btn.disabled = false; 
    } else if (type === 'loading') {
        btn.classList.add('btn-loading');
        icon = '⏳';
        btn.disabled = true; 
    }

    btn.innerHTML = `<span class="emoji-icon">${icon}</span> <span>${message}</span>`;
    
    if (type !== 'loading') {
        setTimeout(() => {
            if (btn.innerText.includes(message)) {
                resetButton(btnId);
            }
        }, 4000); 
    }
}

function resetButton(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.classList.remove('btn-success', 'btn-error', 'btn-loading');
    if (btn.dataset.originalText) {
        btn.innerText = btn.dataset.originalText;
    }
    btn.disabled = false;
}
// ===========================================

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

let creds = { ultra: { token: '', sender: 'UltraNet' }, energy: { token: '', sender: 'ISP Energy' } };
let currentNetwork = null; 
let loadedTemplates = []; 
let extractedData = { contract: '11500xxxxx', password: 'xxxxx', phones: [], credit: '' };
let autoCloseEnabled = true;
let savedSmsPrice = 1.29;
const isSidePanel = window.location.search.includes('panel=1');

async function scrapeAbillsData() {
    let result = { contract: '11500xxxxx', password: 'xxxxx', phones: [], credit: '' };

    // Функція пошуку суми кредиту
    const getAmount = (doc) => {
        let input = doc.getElementById('CREDIT') || doc.querySelector('input[name="CREDIT"]');
        if (input) {
            let rawValue = input.value || input.getAttribute('placeholder') || '';
            let cleanValue = rawValue.replace(/,/g, '.').replace(/[^\d.]/g, '');
            let val = parseFloat(cleanValue);
            if (!isNaN(val) && val > 0) return val.toString(); 
        }
        return '';
    };

    // Швидка функція пошуку пароля/договору
    const extractCredentials = (docToSearch) => {
        let creds = { contract: null, password: null };
        
        let copyElements = docToSearch.querySelectorAll('[onclick*="copyToBuffer"]');
        for (let btn of copyElements) {
            let onclick = btn.getAttribute('onclick');
            let match = onclick.match(/copyToBuffer\(['"]([^'"]+)['"]\)/);
            if (match && match[1]) {
                let extractedValue = match[1];
                let btnText = (btn.innerText || btn.title || '').toLowerCase();
                
                if (btnText.includes('контракт') || btnText.includes('договір') || btnText.includes('договор') || btnText.includes('contract')) {
                    creds.contract = extractedValue;
                } else if (btnText.includes('пароль') || btnText.includes('password') || btnText.includes('pass')) {
                    creds.password = extractedValue;
                }
            }
        }

        if (!creds.contract) {
            let contractInput = docToSearch.querySelector('input[name="CONTRACT"], input[id="CONTRACT"], .contract_template_value');
            if (contractInput && contractInput.value) creds.contract = contractInput.value;
        }
        if (!creds.password) {
            let passInput = docToSearch.querySelector('input[name="PASSWORD"], input[id="PASSWORD"], input[name="PASS"]');
            if (passInput && passInput.value) creds.password = passInput.value;
        }
        
        return creds;
    };

    try {
        result.credit = getAmount(document);

        // === ПОКРАЩЕНА СТРОГА ФУНКЦІЯ ПОШУКУ ТЕЛЕФОНІВ ===
        const extractPhones = (docToSearch) => {
            let localPhoneSet = new Set();
            
            // Регулярка шукає блоки, що схожі на номери (дозволяє дужки, пробіли, дефіси)
            let phoneRegex = /(?:\+?38)?[\s\-\(]*0\d[\s\-\(\)]*(?:\d[\s\-\(\)]*){7,8}\d/g;

            // Допоміжна функція: очищає і строго валідує номер
            const processAndAddPhone = (rawStr) => {
                if (!rawStr) return;
                let clean = rawStr.replace(/\D/g, ''); // Залишаємо тільки цифри
                
                // Приводимо до стандарту 380...
                let normalized = "";
                if (clean.length === 10 && clean.startsWith('0')) {
                    normalized = '38' + clean;
                } else if (clean.length === 12 && clean.startsWith('380')) {
                    normalized = clean;
                }

                // СТРОГА ПЕРЕВІРКА: Валідація українських кодів операторів
                // (Київстар, Vodafone, Lifecell, Інтертелеком, Тримоб)
                let validUaPhoneRegex = /^380(39|50|63|66|67|68|73|75|77|89|91|92|93|94|95|96|97|98|99)\d{7}$/;

                if (normalized && validUaPhoneRegex.test(normalized)) {
                    localPhoneSet.add(normalized);
                }
            };

            // Допоміжна функція: "витягує" всі номери з довгого тексту
            const extractFromText = (text) => {
                if (!text || typeof text !== 'string') return;
                let matches = text.match(phoneRegex);
                if (matches) {
                    matches.forEach(m => processAndAddPhone(m));
                }
                // ПРИБРАНО БЛОК ELSE: тепер ми не намагаємося "видушити" цифри з усього тексту сторінки, 
                // якщо там немає послідовності, схожої на номер телефону.
            };

            // ТАРГЕТ 1: Усі поля вводу (input) ТА ВЕЛИКІ ТЕКСТОВІ ПОЛЯ (textarea)
            let inputsAndTextareas = docToSearch.querySelectorAll('input:not([type="hidden"]), textarea');
            inputsAndTextareas.forEach(el => {
                extractFromText(el.value);
                if (el.placeholder) extractFromText(el.placeholder);
            });

            // ТАРГЕТ 2: Коментарі абонента (блоки timeline-item)
            let timelineItems = docToSearch.querySelectorAll('.timeline-item');
            timelineItems.forEach(item => extractFromText(item.innerText));

            // ТАРГЕТ 3: Глобальний текст всієї сторінки
            let bodyText = docToSearch.body ? docToSearch.body.innerText : '';
            extractFromText(bodyText);

            return Array.from(localPhoneSet);
        };

        // Запускаємо пошук телефонів по поточній сторінці
        result.phones = extractPhones(document);

        // СПРОБА ЗНАЙТИ ДОГОВІР ТА ПАРОЛЬ НА ПОТОЧНІЙ СТОРІНЦІ
        let currentDocCreds = extractCredentials(document);
        if (currentDocCreds.contract) result.contract = currentDocCreds.contract;
        if (currentDocCreds.password) result.password = currentDocCreds.password;

        // РОБИМО ФОНОВИЙ ЗАПИТ ТІЛЬКИ ЯКЩО ЧОГОСЬ НЕ ВИСТАЧАЄ
        let needFetch = (result.contract === '11500xxxxx' || result.password === 'xxxxx' || !result.credit || result.phones.length === 0);

        if (needFetch) {
            let uid = null;
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('UID')) uid = urlParams.get('UID');
            if (!uid) {
                let uidInput = document.querySelector('input[name="UID"], input[name="uid"], input[id="UID"]');
                if (uidInput) uid = uidInput.value;
            }

            if (uid) {
                let fetchUrl = `/admin/index.cgi?qindex=15&header=2&UID=${uid}&SHOW_PASSWORD=1&IN_MODAL=1`;
                let response = await fetch(fetchUrl);
                let htmlText = await response.text();

                let parser = new DOMParser();
                let doc = parser.parseFromString(htmlText, 'text/html');

                if (!result.credit) result.credit = getAmount(doc);

                let fetchedCreds = extractCredentials(doc);
                if (result.contract === '11500xxxxx' && fetchedCreds.contract) result.contract = fetchedCreds.contract;
                if (result.password === 'xxxxx' && fetchedCreds.password) result.password = fetchedCreds.password;
                
                // Збираємо номери з фонової сторінки і додаємо до існуючих (без дублікатів)
                let backgroundPhones = extractPhones(doc);
                if (backgroundPhones.length > 0) {
                    result.phones = [...new Set([...result.phones, ...backgroundPhones])];
                }
            }
        }
    } catch (e) { console.error("Помилка парсингу:", e); }

    return result;
}

// === ФУНКЦІЯ ПІДРАХУНКУ СИМВОЛІВ ТА ЧАСТИН SMS (ЛОГІКА TURBOSMS) ===
function updateSmsCounter() {
    const textEl = document.getElementById('message');
    if (!textEl) return;
    
    const text = textEl.value || '';
    
    // 1. Проста і надійна перевірка на кирилицю (будь-який символ, якого немає в англійській розкладці)
    const isUnicode = /[^\x00-\x7F]/.test(text);

    // 2. Підрахунок "ваги" символів
    let calcLength = 0;
    if (isUnicode) {
        // У кирилиці кожен символ важить рівно 1
        calcLength = text.length;
    } else {
        // У латиниці ці 8 символів рахуються за ДВА
        for (let i = 0; i < text.length; i++) {
            if ("~^[]{}\\|".indexOf(text[i]) !== -1) {
                calcLength += 2;
            } else {
                calcLength += 1;
            }
        }
    }

    // 3. Таблиці лімітів від TurboSMS
    const latinLimits = [160, 305, 457, 609, 761, 913, 1065, 1217, 1369, 1521];
    const uniLimits = [70, 133, 199, 265, 331, 397, 463, 529, 595, 661];

    let limits = isUnicode ? uniLimits : latinLimits;
    
    // ЗМІНЕНО: Стартуємо з 0 СМС (замість 1)
    let parts = 0; 
    let maxCharsInCurrentPart = limits[0]; // 160 або 70

    if (calcLength > 0) {
        let foundLimit = false;
        for (let i = 0; i < limits.length; i++) {
            if (calcLength <= limits[i]) {
                parts = i + 1;
                maxCharsInCurrentPart = limits[i];
                foundLimit = true;
                break;
            }
        }
        
        // Якщо раптом текст гігантський (більше 10 частин)
        if (!foundLimit) {
            if (isUnicode) {
                parts = Math.ceil((calcLength - 67) / 66) + 1;
                maxCharsInCurrentPart = 67 + 66 * (parts - 1);
            } else {
                parts = Math.ceil((calcLength - 153) / 152) + 1;
                maxCharsInCurrentPart = 153 + 152 * (parts - 1);
            }
        }
    }

    // Рахуємо, скільки залишилось до наступної межі
    const left = maxCharsInCurrentPart - calcLength;

    // 4. Оновлюємо лівий бік (Символи)
    let charCountEl = document.getElementById('charCount');
    let charLeftEl = document.getElementById('charLeft');
    if (charCountEl) charCountEl.innerText = calcLength;
    if (charLeftEl) charLeftEl.innerText = left;

    // 5. Підрахунок вартості
    let price = 1.29; 
    if (typeof savedSmsPrice !== 'undefined' && !isNaN(savedSmsPrice)) {
        price = parseFloat(savedSmsPrice);
    }
    
    let totalCost = (parts * price).toFixed(2); 
    
    // 6. Оновлюємо правий бік
    let wrapper = document.getElementById('smsStatusWrapper');
    if (wrapper) {
        let colorClass = parts >= 3 ? 'sms-warning' : 'energy-color';
        let partsClass = parts >= 3 ? 'sms-warning' : '';
        
        // Якщо 0 смс, ціна сіра, а не яскраво-зелена
        if (parts === 0) {
            colorClass = '';
        }

        wrapper.innerHTML = `
            <span class="emoji-icon">📱</span> СМС: <strong class="${partsClass}">${parts}</strong> шт
            <span style="margin-left: 5px;">≈ <strong class="${colorClass}">${totalCost}</strong> ₴</span>
        `;
    }
}

function updatePreview() {
    if (!loadedTemplates || loadedTemplates.length === 0) return;
    
    let templateSelect = document.getElementById('template');
    let selectedIndex = templateSelect ? templateSelect.value : null;
    
    if (selectedIndex === null || selectedIndex === "" || !loadedTemplates[selectedIndex]) {
        document.getElementById('message').value = 'Шаблон не знайдено';
        updateSmsCounter(); // <--- ДОДАТИ ЦЕ
        return;
    }

    let text = loadedTemplates[selectedIndex].text;  
    let amount = document.getElementById('amount').value;
    if (!amount) amount = 'xxxx';
    
    text = text.replace(/{amount}/g, amount);
    text = text.replace(/{contract}/g, extractedData.contract);
    text = text.replace(/{password}/g, extractedData.password);
    
    document.getElementById('message').value = text;
    
    updateSmsCounter(); // <--- ДОДАТИ ЦЕ (оновлює лічильник при виборі шаблону)
}

function loadSettings() {
    chrome.storage.local.get(['ultraToken', 'energyToken', 'autoClose', 'smsPrice'], (data) => {
        if (data.ultraToken) creds.ultra.token = data.ultraToken;
        if (data.energyToken) creds.energy.token = data.energyToken;
        
        // Якщо ціна збережена - беремо її. Якщо ні (перший запуск) - лишаємо 1.29
        savedSmsPrice = data.smsPrice !== undefined ? parseFloat(data.smsPrice) : 1.29;
        
        autoCloseEnabled = data.autoClose !== undefined ? data.autoClose : true;
        
        let toggle = document.getElementById('autoCloseToggle');
        if (toggle) toggle.checked = autoCloseEnabled;
        
        updateSmsCounter(); // ДОДАНО: відмальовує ціну і "1 шт" при старті розширення
    });
}

async function loadTemplatesFromFile(network) {
    let fileName = network === 'ultra' ? 'templates_ultra.json' : 'templates_energy.json';
    try {
        let url = chrome.runtime.getURL(fileName);
        let response = await fetch(url);
        loadedTemplates = await response.json();

        let select = document.getElementById('template');
        select.innerHTML = ''; 
        
        loadedTemplates.forEach((tpl, index) => {
            let opt = document.createElement('option');
            opt.value = index; 
            opt.text = tpl.title;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error("Не вдалося завантажити файл шаблонів: ", e);
        document.getElementById('template').innerHTML = '<option value="">Помилка завантаження шаблонів</option>';
    }
}

// === КЕШУВАННЯ ДО 10 АБОНЕНТІВ (LRU CACHE) ===
let currentPageMarker = null;

function saveStateToCache() {
    if (!currentPageMarker) return;

    let state = {
        extractedData: extractedData,
        amount: document.getElementById('amount').value,
        phone: document.getElementById('phone').value,
        templateIndex: document.getElementById('template').value,
        message: document.getElementById('message').value,
        timestamp: Date.now() // Ставимо час, щоб знати, хто найновіший
    };

    // Використовуємо пам'ять СЕСІЇ (очиститься при закритті браузера)
    chrome.storage.session.get(['subscribersCache'], (storage) => {
        let cache = storage.subscribersCache || {};
        
        // Зберігаємо або оновлюємо поточного абонента
        cache[currentPageMarker] = state;

        // Контроль ліміту: якщо більше 10 записів - видаляємо найстаріший
        let keys = Object.keys(cache);
        if (keys.length > 10) {
            let oldestKey = keys.reduce((oldest, current) => {
                return cache[current].timestamp < cache[oldest].timestamp ? current : oldest;
            });
            delete cache[oldestKey];
        }

        chrome.storage.session.set({ subscribersCache: cache });
    });
}

function restoreStateFromCache(cachedState) {
    extractedData = cachedState.extractedData;
    
    // ОСЬ ТУТ ПРОСТО ВИКЛИКАЄМО НОВУ ФУНКЦІЮ:
    renderPhoneSelector(extractedData.phones);

    document.getElementById('phone').value = cachedState.phone || '';
    document.getElementById('amount').value = cachedState.amount || '';
    document.getElementById('template').value = cachedState.templateIndex || '0';
    document.getElementById('message').value = cachedState.message || '';
    
    // ДОДАНО: Примусово запускаємо підрахунок після відновлення тексту!
    updateSmsCounter();
    
    saveStateToCache(); 
}

// ГОЛОВНА ФУНКЦІЯ ПАРСИНГУ
function runAutoParse() {
    resetButton('sendBtn'); 

    let queryOptions = isSidePanel ? { active: true, lastFocusedWindow: true } : { active: true, currentWindow: true };
    
    chrome.tabs.query(queryOptions, (tabs) => {
        if (!tabs || tabs.length === 0) return;
        
        let currentTab = tabs[0];
        let subTitle = document.getElementById('subTitle');
        
        // 1. ВИЗНАЧАЄМО МЕРЕЖУ ЛИШЕ ПО ДОМЕНУ
        if (currentTab.url.includes('bill.ultranetgroup.com.ua')) {
            currentNetwork = 'ultra';
        } else if (currentTab.url.includes('bill.ispenergy.com.ua')) {
            currentNetwork = 'energy';
        } else {
    currentNetwork = null;
    // ✅ ЗАМІНИТИ subTitle.style.display = 'none'; НА:
    subTitle.innerText = 'Перевіряйте дані абонента перед відправкою смс!';
    subTitle.className = 'warning-text';
    subTitle.style.display = 'block';
    showButtonStatus('sendBtn', 'Відкрийте сторінку білінгу!', 'error');
    return;
}

        // 2. ПЕРЕВІРЯЄМО, ЧИ ЦЕ САМЕ КАРТКА АБОНЕНТА (Орієнтуємося на вміст сторінки, а не на URL)
        chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: () => {
                // 1. Чи є UID в адресному рядку (прямий перехід)
                let hasUidInUrl = window.location.search.includes('UID=') || window.location.search.includes('uid=');
                
                // 2. Чи є UID всередині сторінки (відкриття через пошук)
                let hasContextUid = false;
                let uidInputs = document.querySelectorAll('input[name="UID"], input[name="uid"], input[id="UID"]');
                for (let input of uidInputs) {
                    // Якщо поле існує і в ньому є текст (ігноруємо пусті поля пошуку)
                    if (input.value && input.value.trim() !== '') {
                        hasContextUid = true;
                        break;
                    }
                }

                // 3. Чи є на екрані елементи, які бувають ТІЛЬКИ в картці абонента
                // (Поля "Кредит", "Договір", "Депозит" або кнопки копіювання пароля)
                let profileIndicators = document.querySelectorAll('input[name="CREDIT"], input[name="DEPOSIT"], input[name="CONTRACT"], [onclick*="copyToBuffer"]');
                let hasProfileElements = profileIndicators.length > 0;

                // КАРТКА ВІДКРИТА: Якщо ми маємо ідентифікатор абонента І бачимо його поля
                let isSubscriberCard = (hasUidInUrl || hasContextUid) && hasProfileElements;

                let isReloaded = !window.__sms_ext_marker;
                if (isReloaded) {
                    window.__sms_ext_marker = 'marker_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
                }
                
                return { 
                    isReloaded: isReloaded, 
                    marker: window.__sms_ext_marker,
                    isSubscriberCard: isSubscriberCard 
                };
            }
        }, async (markerResults) => {
            if (!markerResults || !markerResults[0]) return;
            
            let pageInfo = markerResults[0].result;

            // ЯКЩО ЦЕ НЕ КАРТКА АБОНЕНТА (головна сторінка, звіти тощо) - ЗУПИНЯЄМОСЬ
            if (!pageInfo.isSubscriberCard) {
    subTitle.innerText = 'Перевіряйте дані перед відправкою смс!';
    subTitle.className = 'subtitle-text';
    subTitle.style.display = 'block';
    showButtonStatus('sendBtn', 'Відкрийте картку абонента!', 'error');
                
                // Очищаємо поля, щоб не "висіли" дані попереднього абонента
                document.getElementById('phone').value = '';
                document.getElementById('amount').value = '';
                document.getElementById('message').value = '';
                let wrapper = document.getElementById('multiPhoneWrapper');
                if (wrapper) wrapper.style.display = 'none';
                
                updateSmsCounter(); // ДОДАНО: оновлює лічильник, коли поля очистилися
                return; // Зупиняємо виконання функції
            }

            // === ЯКЩО МИ ТУТ - ЗНАЧИТЬ ВІДКРИТА КАРТКА АБОНЕНТА ===

            // Малюємо відповідні заголовки
            subTitle.style.display = 'none';
            subTitle.className = '';
            subTitle.innerText = '';
            
            if (currentNetwork === 'ultra') {
                subTitle.innerText = 'Відправити SMS Ultranet';
                subTitle.className = 'ultra-color subtitle-text'; 
                subTitle.style.display = 'block';
            } else if (currentNetwork === 'energy') {
                subTitle.innerText = 'Відправити SMS ISP Energy';
                subTitle.className = 'energy-color subtitle-text'; 
                subTitle.style.display = 'block';
            }

            // Завантажуємо шаблони для обраної мережі
            await loadTemplatesFromFile(currentNetwork);

            currentPageMarker = pageInfo.marker;

            // Шукаємо цього абонента в пам'яті (Кеш)
            chrome.storage.session.get(['subscribersCache'], (storage) => {
                let cache = storage.subscribersCache || {};
                let cachedState = cache[currentPageMarker];

                // Якщо сторінка НЕ оновлювалась і дані є в кеші
                if (!pageInfo.isReloaded && cachedState) {
                    restoreStateFromCache(cachedState);
                    return; 
                }

                // === ПАРСИНГ НОВОГО АБОНЕНТА ===
                extractedData = { contract: '11500xxxxx', password: 'xxxxx', phones: [], credit: '' };
                document.getElementById('phone').value = '';
                document.getElementById('amount').value = '';
                document.getElementById('message').value = ''; 

                chrome.scripting.executeScript({
                    target: { tabId: currentTab.id, allFrames: true },
                    func: scrapeAbillsData
                }, (results) => {
                    if (results) {
                        for (let frame of results) {
                            let data = frame.result;
                            if (!data) continue;
                            
                            if (data.contract !== '11500xxxxx') extractedData.contract = data.contract;
                            if (data.password !== 'xxxxx') extractedData.password = data.password;
                            if (data.credit) extractedData.credit = data.credit; 
                            
                            if (data.phones && data.phones.length > 0) {
                                extractedData.phones = [...new Set([...extractedData.phones, ...data.phones])];
                            }
                        }

                        if (extractedData.credit) document.getElementById('amount').value = extractedData.credit;

                        let phoneInput = document.getElementById('phone');
                        if (extractedData.phones.length > 0) phoneInput.value = extractedData.phones[0];

                        // МАЛЮЄМО КНОПКИ ВИБОРУ НОМЕРІВ
                        renderPhoneSelector(extractedData.phones);

                        updatePreview();
                        saveStateToCache(); // Зберігаємо в кеш
                    }
                });
            });
        });
    });
}

function checkAuthAndParse() {
    chrome.storage.local.get(['isAuthorized'], (data) => {
        if (data.isAuthorized) runAutoParse();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const manifestData = chrome.runtime.getManifest();
    const vBtn = document.getElementById('versionBtn');
    if (vBtn) {
        vBtn.title = "Поточна версія: " + manifestData.version;
        // Забороняємо клік, якщо немає класу 'has-update'
        vBtn.addEventListener('click', (e) => {
            if (!vBtn.classList.contains('has-update')) {
                e.preventDefault(); 
            }
        });
    }

    // ДІСТАЄМО СТАТУС І ТЕМУ ОДНОЧАСНО
    chrome.storage.local.get(['isAuthorized', 'theme'], (data) => {
        
        // 1. ЗАСТОСОВУЄМО ТЕМУ
        let savedTheme = data.theme || 'light';
        document.body.setAttribute('data-theme', savedTheme);
        let themeSelector = document.getElementById('themeSelector');
        if (themeSelector) themeSelector.value = savedTheme;

        // 2. ПОКАЗУЄМО ІНТЕРФЕЙС (ПРИБИРАЄМО ПРОЗОРІСТЬ)
        document.body.classList.add('theme-loaded');

        // 3. РОЗПОДІЛЯЄМО ЕКРАНИ
        if (data.isAuthorized) {
            document.getElementById('loginView').style.display = 'none';
            document.getElementById('onboardingView').style.display = 'none';
            document.getElementById('mainView').style.display = 'block';
            loadSettings();
            runAutoParse();
        } else {
            document.getElementById('loginView').style.display = 'block';
            document.getElementById('onboardingView').style.display = 'none';
            document.getElementById('mainView').style.display = 'none';
        }
    });

    // Далі йдуть твої слухачі кнопок (loginBtn і т.д.)...

    document.getElementById('loginBtn').addEventListener('click', async () => {
        let inputPass = document.getElementById('accessKey').value;
        let hashedInput = await sha256(inputPass);

        if (hashedInput === SECRET_HASH) {
            chrome.storage.local.set({ isAuthorized: true }, () => {
                document.getElementById('loginView').style.display = 'none';
                document.getElementById('onboardingView').style.display = 'block';
            });
        } else {
            showButtonStatus('loginBtn', 'Невірний ключ!', 'error');
        }
    });

    document.getElementById('accessKey').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });

    document.getElementById('onboardSaveBtn').addEventListener('click', () => {
        let uT = document.getElementById('onboardUltraToken').value.trim();
        let eT = document.getElementById('onboardEnergyToken').value.trim();

        showButtonStatus('onboardSaveBtn', 'Зберігаємо...', 'loading');

        chrome.storage.local.set({ ultraToken: uT, energyToken: eT }, () => {
            creds.ultra.token = uT; 
            creds.energy.token = eT; 
            setTimeout(() => {
                document.getElementById('onboardingView').style.display = 'none';
                document.getElementById('mainView').style.display = 'block';
                updateSmsCounter(); // <--- ДОДАНО ОДИН РЯДОК
                runAutoParse();
            }, 500);
        });
    });

    const pinBtn = document.getElementById('pinBtn');
    if (isSidePanel) {
        pinBtn.innerText = '✖️'; // Змінив іконку закриття панелі на красиву
        pinBtn.title = 'Закрити панель';
        pinBtn.classList.add('icon-btn-danger');
    } else {
        pinBtn.innerText = '📌';
        pinBtn.title = 'Закріпити в боковій панелі';
    }

    pinBtn.addEventListener('click', () => {
        if (!isSidePanel) {
            chrome.windows.getCurrent({ populate: false }, (win) => {
                chrome.sidePanel.open({ windowId: win.id }).then(() => {
                    window.close(); 
                }).catch(e => console.error("Помилка відкриття:", e));
            });
        } else {
            window.close();
        }
    });

    document.getElementById('openSettingsBtn').addEventListener('click', () => {
        document.getElementById('mainView').style.display = 'none';
        document.getElementById('settingsView').className = 'anim-slide-right';
        document.getElementById('settingsView').style.display = 'block';
        document.getElementById('ultraToken').value = creds.ultra.token;
        document.getElementById('energyToken').value = creds.energy.token;
        document.getElementById('smsPriceInput').value = savedSmsPrice; // <--- ДОДАТИ ЦЕ
        resetButton('saveSettingsBtn'); 
    });

    // === ДИНАМІЧНА ЗМІНА ТЕМИ (ПОПЕРЕДНІЙ ПЕРЕГЛЯД) ===
    document.getElementById('themeSelector').addEventListener('change', (e) => {
        document.body.setAttribute('data-theme', e.target.value);
    });

    // === НОВА КНОПКА ЗАКРИТТЯ НАЛАШТУВАНЬ (ІКОНКА ХРЕСТИК) ===
    document.getElementById('closeSettingsIconBtn').addEventListener('click', () => {
        document.getElementById('settingsView').style.display = 'none';
        document.getElementById('mainView').className = 'anim-slide-left';
        document.getElementById('mainView').style.display = 'block';
    });

    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
        let uT = document.getElementById('ultraToken').value.trim();
        let eT = document.getElementById('energyToken').value.trim();
        let aC = document.getElementById('autoCloseToggle').checked; 
        let selectedTheme = document.getElementById('themeSelector').value; 
        
        // Читаємо ціну, якщо поле пусте - страхуємось і ставимо 1.29
        let priceVal = parseFloat(document.getElementById('smsPriceInput').value);
        let sPrice = isNaN(priceVal) ? 1.29 : priceVal; 

        showButtonStatus('saveSettingsBtn', 'Зберігаємо...', 'loading');

        // Зберігаємо smsPrice в пам'ять браузера
        chrome.storage.local.set({ ultraToken: uT, energyToken: eT, autoClose: aC, theme: selectedTheme, smsPrice: sPrice }, () => {
            creds.ultra.token = uT; 
            creds.energy.token = eT; 
            autoCloseEnabled = aC; 
            savedSmsPrice = sPrice; // Оновлюємо змінну
            
            document.body.setAttribute('data-theme', selectedTheme);
            
            showButtonStatus('saveSettingsBtn', 'Збережено!', 'success');
            setTimeout(() => {
                document.getElementById('closeSettingsIconBtn').click(); 
                resetButton('saveSettingsBtn');
                updateSmsCounter(); // Відразу оновлюємо ціну на екрані
            }, 1000); 
        });
    });

    // === АВТОЗБЕРЕЖЕННЯ ЗМІН КОРИСТУВАЧА ===
    document.getElementById('template').addEventListener('change', () => {
        updatePreview();
        saveStateToCache();
    });
    document.getElementById('amount').addEventListener('input', () => {
        updatePreview();
        saveStateToCache();
    });
    // Зберігаємо зміни номера і тексту на льоту
    document.getElementById('phone').addEventListener('input', saveStateToCache);
    document.getElementById('message').addEventListener('input', () => {
        saveStateToCache();
        updateSmsCounter(); // Оновлює лічильник, коли друкуєте руками
    });

    document.getElementById('sendBtn').addEventListener('click', () => {
    let rawPhoneInput = document.getElementById('phone').value.trim().toLowerCase();
    let text = document.getElementById('message').value;

    // === ТЕСТ: Успішна відправка ===
    if (rawPhoneInput === 'test') {
        showButtonStatus('sendBtn', 'Тестова відправка...', 'loading');
        setTimeout(() => {
            showButtonStatus('sendBtn', 'Тест успішний!', 'success');
            if (autoCloseEnabled) setTimeout(() => window.close(), 1200);
        }, 800);
        return; 
    }

    // === ТЕСТ: Поява вікна оновлення (команда "up") ===
    if (rawPhoneInput === 'up') {
        showButtonStatus('sendBtn', 'Перевірка версії...', 'loading');
        
        setTimeout(() => {
            const btn = document.getElementById('sendBtn');
            btn.className = 'btn';
            btn.textContent = 'Відправити SMS';
            btn.disabled = false;

            const vBtn = document.getElementById('versionBtn');
            const updateText = document.getElementById('updateText');
            const bannerVersion = document.getElementById('updateBannerVersion');

            if (vBtn && updateText && bannerVersion) {
                bannerVersion.textContent = "9.9.9"; // Номер версії
                updateText.style.display = 'flex';   // Показуємо іконку
                vBtn.classList.add('has-update');    // Розширюємо кнопку (неон)
                vBtn.title = "Завантажити оновлення!";
                vBtn.href = "https://github.com/ultranetpopilnya/UltraEnergy-SMS-Tool/archive/refs/heads/main.zip"; // ПОСИЛАННЯ
                vBtn.target = "_blank";              // ДОДАНО: Тепер завантаження піде в новій вкладці
            }
        }, 600);
        return;
    }

    // === ОСНОВНА ЛОГІКА ВІДПРАВКИ SMS ===
    if (!currentNetwork) {
        showButtonStatus('sendBtn', 'Відкрийте сторінку білінгу!', 'error');
        return;
    }

    let currentToken = creds[currentNetwork].token;
    let currentSender = creds[currentNetwork].sender;

    if (!currentToken) {
        showButtonStatus('sendBtn', 'Вкажіть токен у налаштуваннях!', 'error');
        return;
    }

    let phone = rawPhoneInput.replace(/\D/g, '');

    if (!phone) {
        showButtonStatus('sendBtn', 'Введіть номер телефону!', 'error');
        return;
    }
    if (!text || text.trim() === '') {
        showButtonStatus('sendBtn', 'Повідомлення порожнє!', 'error');
        return;
    }
    if (phone.length === 10) phone = '38' + phone;
    if (phone.length !== 12 || !phone.startsWith('380')) {
        showButtonStatus('sendBtn', 'Некоректний формат номера!', 'error');
        return;
    }

    showButtonStatus('sendBtn', 'Відправляємо SMS...', 'loading');

    fetch('https://api.turbosms.ua/message/send.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
        body: JSON.stringify({ "recipients": [phone], "sms": { "sender": currentSender, "text": text } })
    })
    .then(response => {
        // Перевіряємо, чи це взагалі JSON, перед тим як парсити
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return response.json();
        } else {
            throw new Error("Сервер повернув не JSON (можливо помилка 502)");
        }
    })
    .then(data => {
        if (data.response_code === 800 || data.response_code === 801) { 
            showButtonStatus('sendBtn', 'Успішно надіслано!', 'success');
            if (autoCloseEnabled) setTimeout(() => window.close(), 1200);
        } else {
            showButtonStatus('sendBtn', data.response_status || 'Невідома помилка', 'error');
        }
    })
    .catch(error => {
        console.error("Помилка відправки SMS:", error); // В консоль для дебагу
        showButtonStatus('sendBtn', 'Помилка з\'єднання з API!', 'error');
    });
});

    // ТИМЧАСОВА КНОПКА ДЛЯ РОЗРОБНИКА
    let reloadBtn = document.getElementById('devReloadBtn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            chrome.runtime.reload(); // Ця команда повністю перезапускає розширення!
        });
    }
});

chrome.tabs.onActivated.addListener(() => {
    if (isSidePanel) checkAuthAndParse();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active && isSidePanel) {
        checkAuthAndParse();
    }
});