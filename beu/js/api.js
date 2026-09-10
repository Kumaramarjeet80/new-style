/**
 * Engineering Munger Portal - Unified API & State Engine
 * Handles data caching, backend synchronization, and URL parameter routing.
 */

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby2caGq5MLuVLivuzc0b68NC_M0Ruy40zbeTwJYzEaJM7x-WckoSQ6R2yFYwcuDoP5h2g/exec";
const CACHE_KEY = "gecm_portal_catalog_cache";

// Default Offline & Fallback Data
const DEFAULT_FALLBACK_DATA = {
  categories: [
    {
      id: "CAT-DEFAULT",
      name: "Assignment Cover Pages",
      description: "Official B.Tech assignment covers and formats",
      icon: "📄",
      createdAt: "Academic Year 2026-27"
    }
  ],
  subcategories: [
    {
      id: "SUB-DEFAULT",
      categoryId: "CAT-DEFAULT",
      name: "Standard Academic Work",
      description: "Regular course assignments",
      createdAt: "Academic Year 2026-27"
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
      createdAt: "Academic Year 2026-27"
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

  // Load state from localStorage with fallback
  loadFromCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.categories) && parsed.categories.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Could not read local cache:", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_FALLBACK_DATA));
  }

  // Save current state to localStorage
  saveToCache(freshData) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(freshData));
    } catch (e) {
      console.warn("Could not save to cache:", e);
    }
  }

  // Register listener callbacks for live data updates
  onUpdate(callback) {
    if (typeof callback === "function") {
      this.listeners.push(callback);
    }
  }

  // Notify registered pages when fresh data arrives
  notifyListeners() {
    this.listeners.forEach(cb => cb(this.data));
  }

  // Background sync with Google Apps Script
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
    } catch (err) {
      console.warn("Background API sync failed, continuing with current state:", err);
    }
    return this.data;
  }

  // Data Selectors
  getCategories() {
    return this.data.categories || [];
  }

  getSubcategories(categoryId) {
    if (!categoryId) return this.data.subcategories || [];
    return (this.data.subcategories || []).filter(sub => sub.categoryId === categoryId);
  }

  getCards(subcategoryId) {
    if (!subcategoryId) return this.data.cards || [];
    return (this.data.cards || []).filter(card => card.subcategoryId === subcategoryId);
  }

  getCardById(cardId) {
    return (this.data.cards || []).find(card => card.id === cardId) || null;
  }

  getCategoryById(catId) {
    return (this.data.categories || []).find(cat => cat.id === catId) || null;
  }

  getSubcategoryById(subId) {
    return (this.data.subcategories || []).find(sub => sub.id === subId) || null;
  }

  getLiveEvent() {
    return this.data.liveEvent || null;
  }

  getPopups() {
    return this.data.popups || [];
  }

  // Live Stream Presence
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

  // URL Query Parameter Helper
  static getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }
}

// Global API Instance
const portalAPI = new PortalAPI();
