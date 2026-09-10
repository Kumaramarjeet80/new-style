/**
 * Engineering Munger Portal - Unified API & Global Popup Engine
 * Handles caching, background sync, global popup queue, and formatted timestamps.
 */

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby2caGq5MLuVLivuzc0b68NC_M0Ruy40zbeTwJYzEaJM7x-WckoSQ6R2yFYwcuDoP5h2g/exec";
const CACHE_KEY = "gecm_portal_catalog_cache";

const DEFAULT_FALLBACK_DATA = {
  categories: [
    {
      id: "CAT-DEFAULT",
      name: "Assignment Cover Pages",
      description: "Official B.Tech assignment covers and formats",
      icon: "📄",
      createdAt: "10 Sept 2026, 04:00 PM"
    }
  ],
  subcategories: [
    {
      id: "SUB-DEFAULT",
      categoryId: "CAT-DEFAULT",
      name: "Standard Academic Work",
      description: "Regular course assignments",
      createdAt: "10 Sept 2026, 04:00 PM"
    }
  ],
  cards: [
    {
      id: "CRD-DEFAULT",
      subcategoryId: "SUB-DEFAULT",
      title: "GEC Munger Official Assignment Sheet",
      description: "Default academic cover page with dual university logo stamps.",
      thumbnailUrl: "https://lh3.googleusercontent.com/d/1Pg1tZ-1Uodqzi5iciN61hq8jMooT0eo2",
      buttonText: "Customize Cover Page",
      templateHtml: "",
      actionType: "generator",
      targetUrl: "",
      createdAt: "10 Sept 2026, 04:00 PM"
    }
  ],
  popups: [],
  liveEvent: null
};

class PortalAPI {
  constructor() {
    this.data = this.loadFromCache();
    this.listeners = [];
  }

  loadFromCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.categories) && parsed.categories.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_FALLBACK_DATA));
  }

  saveToCache(freshData) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(freshData));
    } catch (e) {}
  }

  onUpdate(callback) {
    if (typeof callback === "function") this.listeners.push(callback);
  }

  notifyListeners() {
    this.listeners.forEach(cb => cb(this.data));
  }

  async syncCatalog() {
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=get_portal_data`);
      const payload = await res.json();

      if (payload && payload.status === "success") {
        const freshData = {
          categories: (payload.categories && payload.categories.length > 0) ? payload.categories : this.data.categories,
          subcategories: (payload.subcategories && payload.subcategories.length > 0) ? payload.subcategories : this.data.subcategories,
          cards: (payload.cards && payload.cards.length > 0) ? payload.cards : this.data.cards,
          popups: payload.popups || [],
          liveEvent: payload.liveEvent || null
        };

        this.data = freshData;
        this.saveToCache(freshData);
        this.notifyListeners();
        return freshData;
      }
    } catch (err) {}
    return this.data;
  }

  // Data Getters
  getCategories() { return this.data.categories || []; }
  getSubcategories(catId) { return (this.data.subcategories || []).filter(s => !catId || s.categoryId === catId); }
  getCards(subId) { return (this.data.cards || []).filter(c => !subId || c.subcategoryId === subId); }
  getCardById(id) { return (this.data.cards || []).find(c => c.id === id) || null; }
  getCategoryById(id) { return (this.data.categories || []).find(c => c.id === id) || null; }
  getSubcategoryById(id) { return (this.data.subcategories || []).find(s => s.id === id) || null; }
  getLiveEvent() { return this.data.liveEvent || null; }
  getPopups() { return this.data.popups || []; }

  // Presence Telemetry
  async joinLive() {
    try {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "user_join_live" })
      });
    } catch (e) {}
  }

  async leaveLive() {
    try {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "user_leave_live" })
      });
    } catch (e) {}
  }

  static getQueryParam(param) {
    return new URLSearchParams(window.location.search).get(param);
  }

  // Timestamp Formatter (Date + Time)
  static formatTimestamp(raw) {
    if (!raw) return "10 Sept 2026, 04:01 PM";
    return raw;
  }
}

const portalAPI = new PortalAPI();

// =========================================================
// GLOBAL POPUP RUNNER (EXCLUDES LIVE THEATER)
// =========================================================
let globalPopupQueue = [];
let globalPopupIndex = 0;
let globalPopupTimer = null;

function initGlobalPopups() {
  // Exclude global popups on live.html
  if (window.location.pathname.includes("live.html")) return;

  const popups = portalAPI.getPopups().filter(p => p.active !== false);
  if (!popups || popups.length === 0) return;

  globalPopupQueue = popups;
  globalPopupIndex = 0;

  // Check cooldown stamp
  const lastDismissed = Number(localStorage.getItem("gecm_popup_cooldown") || "0");
  const now = Date.now();
  const intervalMs = Math.max(0.5, Number(globalPopupQueue[0].intervalMinutes) || 1) * 60000;

  if (now - lastDismissed > intervalMs) {
    showGlobalPopup(globalPopupQueue[globalPopupIndex]);
  } else {
    const remainingCooldown = intervalMs - (now - lastDismissed);
    globalPopupTimer = setTimeout(() => showGlobalPopup(globalPopupQueue[globalPopupIndex]), remainingCooldown);
  }
}

function showGlobalPopup(p) {
  const modal = document.getElementById('adminBroadcastModal');
  if (!modal) {
    injectGlobalPopupModalMarkup();
    return showGlobalPopup(p);
  }

  document.getElementById('adPopupTitle').textContent = p.title || "Announcement";
  document.getElementById('adPopupBody').textContent = p.body || "";
  const btn = document.getElementById('adPopupBtn');
  btn.textContent = p.buttonText || "Open Link";
  btn.href = p.buttonLink || "#";

  const heroWrap = document.getElementById('adPopupHeroWrap');
  const imgEl = document.getElementById('adPopupImg');
  if (p.mediaUrl && p.mediaType !== 'video') {
    heroWrap.style.display = 'flex';
    imgEl.src = p.mediaUrl;
    imgEl.style.display = 'block';
  } else {
    heroWrap.style.display = 'none';
  }

  modal.style.display = 'flex';

  const dismissPopup = () => {
    modal.style.display = 'none';
    localStorage.setItem("gecm_popup_cooldown", Date.now().toString());

    globalPopupIndex = (globalPopupIndex + 1) % globalPopupQueue.length;
    const nextInterval = Math.max(0.5, Number(p.intervalMinutes) || 1) * 60000;
    globalPopupTimer = setTimeout(() => showGlobalPopup(globalPopupQueue[globalPopupIndex]), nextInterval);
  };

  document.getElementById('adPopupCloseBtn').onclick = dismissPopup;

  const seconds = Math.max(1, Number(p.timerSeconds) || 5);
  const badge = document.getElementById('popupTimerBadge');
  if (badge && (p.closeMode === 'timer' || p.closeMode === 'both')) {
    badge.style.display = 'inline-block';
    badge.textContent = `Auto-closing in ${seconds}s...`;
    setTimeout(dismissPopup, seconds * 1000);
  }
}

function injectGlobalPopupModalMarkup() {
  if (document.getElementById('adminBroadcastModal')) return;
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="modal-overlay" id="adminBroadcastModal">
      <div class="modal-box" id="adminModalBox">
        <button class="modal-close-btn" id="adPopupCloseBtn" aria-label="Dismiss">&times;</button>
        <div class="modal-hero-media-wrap" id="adPopupHeroWrap" style="display:none;">
          <img id="adPopupImg" class="modal-hero-img" src="" alt="Notice">
        </div>
        <div class="modal-content-area">
          <h3 id="adPopupTitle" class="modal-title">Announcement</h3>
          <p id="adPopupBody" class="modal-desc"></p>
          <a id="adPopupBtn" class="modal-action-btn" href="#" target="_blank">Visit Link</a>
          <div class="popup-timer-bar-wrap"><div class="popup-timer-bar" id="popupTimerBar"></div></div>
          <span class="timer-badge" id="popupTimerBadge" style="display:none;"></span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(div.firstElementChild);
}

window.addEventListener('DOMContentLoaded', () => {
  portalAPI.onUpdate(() => initGlobalPopups());
  setTimeout(initGlobalPopups, 1200);
});
