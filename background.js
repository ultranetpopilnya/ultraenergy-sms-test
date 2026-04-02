// Скидаємо старе налаштування Chrome, щоб по кліку на іконку знову відкривався Popup
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
  .catch((error) => console.error("Помилка налаштування панелі:", error));

console.log("Background оновлено: бокова панель більше не відкривається примусово.");