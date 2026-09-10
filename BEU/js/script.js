// ================= CONFIGURATION =================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby2caGq5MLuVLivuzc0b68NC_M0Ruy40zbeTwJYzEaJM7x-WckoSQ6R2yFYwcuDoP5h2g/exec";
const CACHE_KEY = "gecm_portal_catalog_cache";

// Global Portal State
let portalData = {
  categories: [],
  subcategories: [],
  cards: [],
  popups: [],
  liveEvent: null
};[cite: 5]
let currentCategoryId = null;[cite: 5]
let currentSubcategoryId = null;[cite: 5]
let activeCard = null;[cite: 5]

let defaultTemplateHtml = "";[cite: 5]

// Multi-Popup Queue Engine State
let activePopupQueue = [];
let currentPopupIndex = 0;
let popupCycleTimer = null;

// Live Stream State (WebRTC PeerJS)
let viewerPeer = null;
let currentLiveCall = null;
let liveViewerCountInterval = null;

window.addEventListener('DOMContentLoaded', () => {
  const dynamicWrap = document.getElementById('dynamicPageContent');[cite: 5]
  if (dynamicWrap) {
    defaultTemplateHtml = dynamicWrap.innerHTML;[cite: 5]
  }

  if (document.body.classList.contains('user-body')) {
    initUserPortal();[cite: 5]
  }
});[cite: 5]

/* =========================================================
   1. USER PORTAL ROUTING & INSTANT LOCALSTORAGE CACHING
========================================================= */
function initUserPortal() {
  initPdfGeneratorEngine();[cite: 5]
  setupBreadcrumbs();[cite: 5]
  setupDocViewerControls();[cite: 5]
  setupCelebrationToastControls();
  setupLiveStreamViewer();
  
  // 1. Instant Cache Hydration
  loadPortalDataFromCache();
  
  // 2. Background Revalidation
  fetchPortalCatalog();[cite: 5]
}

function loadPortalDataFromCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.categories) && parsed.categories.length > 0) {
        portalData = parsed;
        renderCategories();
        checkAndRenderLiveEventBanner(portalData.liveEvent);
        if (portalData.popups && portalData.popups.length > 0) {
          initSequentialPopupQueue(portalData.popups);
        }
      }
    }
  } catch (err) {
    console.warn("Local storage cache hydration warning:", err);
  }
}

function fetchPortalCatalog() {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT")) {
    renderFallbackCategories();[cite: 5]
    return;[cite: 5]
  }

  fetch(`${APPS_SCRIPT_URL}?action=get_portal_data`)[cite: 5]
    .then(res => res.json())[cite: 5]
    .then(data => {
      if (data.status === "success") {[cite: 5]
        const freshData = {
          categories: data.categories || [],[cite: 5]
          subcategories: data.subcategories || [],[cite: 5]
          cards: data.cards || [],[cite: 5]
          popups: data.popups || (data.popup ? [data.popup] : []),
          liveEvent: data.liveEvent || null
        };

        const hasChanged = JSON.stringify(freshData) !== JSON.stringify(portalData);
        
        if (hasChanged || portalData.categories.length === 0) {
          portalData = freshData;
          localStorage.setItem(CACHE_KEY, JSON.stringify(freshData));
          
          if (!currentCategoryId) {
            renderCategories();
          } else if (currentCategoryId && !currentSubcategoryId) {
            openCategory(currentCategoryId);
          } else if (currentSubcategoryId) {
            openSubcategory(currentSubcategoryId);
          }

          checkAndRenderLiveEventBanner(portalData.liveEvent);

          if (portalData.popups && portalData.popups.length > 0 && !popupCycleTimer) {
            initSequentialPopupQueue(portalData.popups);
          }
        }
      } else if (portalData.categories.length === 0) {
        renderFallbackCategories();[cite: 5]
      }
    })
    .catch(err => {
      console.error("Portal Data Fetch Error:", err);[cite: 5]
      if (portalData.categories.length === 0) {
        renderFallbackCategories();[cite: 5]
      }
    });
}

function renderFallbackCategories() {
  portalData.categories = [
    { id: "CAT-DEFAULT", name: "Assignment Cover Pages", description: "Official B.Tech assignment covers and formats", icon: "📄", createdAt: "Academic Year 2026-27" }[cite: 5]
  ];[cite: 5]
  portalData.subcategories = [
    { id: "SUB-DEFAULT", categoryId: "CAT-DEFAULT", name: "Standard Academic Work", description: "Regular course assignments", createdAt: "Academic Year 2026-27" }[cite: 5]
  ];[cite: 5]
  portalData.cards = [
    { 
      id: "CRD-DEFAULT", 
      subcategoryId: "SUB-DEFAULT", 
      title: "GEC Munger Official Assignment Sheet", 
      description: "Default academic cover page with dual university logo stamps.",[cite: 5]
      thumbnailUrl: "https://lh3.googleusercontent.com/d/1Pg1tZ-1Uodqzi5iciN61hq8jMooT0eo2",[cite: 5]
      buttonText: "Customize Cover Page",[cite: 5]
      templateHtml: "",[cite: 5]
      actionType: "generator",[cite: 5]
      targetUrl: "",[cite: 5]
      createdAt: "Academic Year 2026-27"
    }
  ];[cite: 5]
  renderCategories();[cite: 5]
}

// Stage A: Render Categories
function renderCategories() {
  currentCategoryId = null;[cite: 5]
  currentSubcategoryId = null;[cite: 5]
  activeCard = null;[cite: 5]

  document.getElementById('view-catalog').style.display = 'block';[cite: 5]
  document.getElementById('view-generator').style.display = 'none';[cite: 5]

  document.getElementById('stageCategories').style.display = 'block';[cite: 5]
  document.getElementById('stageSubcategories').style.display = 'none';[cite: 5]
  document.getElementById('stageCards').style.display = 'none';[cite: 5]

  updateBreadcrumbs();[cite: 5]
  checkAndRenderLiveEventBanner(portalData.liveEvent);

  const grid = document.getElementById('categoryGrid');[cite: 5]
  grid.innerHTML = "";[cite: 5]

  if (portalData.categories.length === 0) {[cite: 5]
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px;">No categories published yet.</div>`;[cite: 5]
    return;[cite: 5]
  }

  portalData.categories.forEach(cat => {[cite: 5]
    const card = document.createElement('div');[cite: 5]
    card.className = "category-card";[cite: 5]
    
    const timeHtml = cat.createdAt 
      ? `<div class="card-timestamp-badge">🕒 Published: ${cat.createdAt}</div>`
      : ``;

    card.innerHTML = `
      <div>
        <div class="cat-icon-wrap">${cat.icon || "📁"}</div>
        <div class="cat-name">${cat.name}</div>
        <div class="cat-desc">${cat.description || "Browse resources in this category"}</div>
        ${timeHtml}
      </div>
      <div class="cat-action-indicator">Explore Category →</div>
    `;[cite: 5]
    card.addEventListener('click', () => openCategory(cat.id));[cite: 5]
    grid.appendChild(card);[cite: 5]
  });
}

// Stage B: Open Subcategories
function openCategory(catId) {
  currentCategoryId = catId;[cite: 5]
  const filteredSubs = portalData.subcategories.filter(s => s.categoryId === catId);[cite: 5]

  document.getElementById('stageCategories').style.display = 'none';[cite: 5]
  document.getElementById('stageSubcategories').style.display = 'block';[cite: 5]
  document.getElementById('stageCards').style.display = 'none';[cite: 5]

  updateBreadcrumbs();[cite: 5]

  const grid = document.getElementById('subcategoryGrid');[cite: 5]
  grid.innerHTML = "";[cite: 5]

  if (filteredSubs.length === 0) {[cite: 5]
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px;">
        No subcategories found in this category.
        <br><button class="btn-back-to-catalog" style="margin: 16px auto;" onclick="renderCategories()">← Go Back</button>
      </div>`;[cite: 5]
    return;[cite: 5]
  }

  filteredSubs.forEach(sub => {[cite: 5]
    const card = document.createElement('div');[cite: 5]
    card.className = "category-card";[cite: 5]
    
    const timeHtml = sub.createdAt 
      ? `<div class="card-timestamp-badge">🕒 Added: ${sub.createdAt}</div>`
      : ``;

    card.innerHTML = `
      <div>
        <div class="cat-icon-wrap">📑</div>
        <div class="cat-name">${sub.name}</div>
        <div class="cat-desc">${sub.description || "View templates and materials"}</div>
        ${timeHtml}
      </div>
      <div class="cat-action-indicator">Open Subcategory →</div>
    `;[cite: 5]
    card.addEventListener('click', () => openSubcategory(sub.id));[cite: 5]
    grid.appendChild(card);[cite: 5]
  });
}

// Stage C: Open Resource Cards
function openSubcategory(subId) {
  currentSubcategoryId = subId;[cite: 5]
  const filteredCards = portalData.cards.filter(c => c.subcategoryId === subId);[cite: 5]

  document.getElementById('stageCategories').style.display = 'none';[cite: 5]
  document.getElementById('stageSubcategories').style.display = 'none';[cite: 5]
  document.getElementById('stageCards').style.display = 'block';[cite: 5]

  updateBreadcrumbs();[cite: 5]

  const grid = document.getElementById('cardGrid');[cite: 5]
  grid.innerHTML = "";[cite: 5]

  if (filteredCards.length === 0) {[cite: 5]
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px;">
        No cards published under this section yet.
        <br><button class="btn-back-to-catalog" style="margin: 16px auto;" onclick="openCategory('${currentCategoryId}')">← Go Back</button>
      </div>`;[cite: 5]
    return;[cite: 5]
  }

  filteredCards.forEach(cardData => {[cite: 5]
    const cardEl = document.createElement('div');[cite: 5]
    cardEl.className = "resource-card";[cite: 5]
    
    const thumbHtml = cardData.thumbnailUrl[cite: 5]
      ? `<img src="${cardData.thumbnailUrl}" class="card-thumbnail" alt="${cardData.title}">`[cite: 5]
      : `<div class="card-thumbnail-placeholder">📄</div>`;[cite: 5]

    const hasTarget = Boolean(cardData.targetUrl && String(cardData.targetUrl).trim().length > 5);[cite: 5]
    const isDoc = (cardData.actionType === "link" || hasTarget);[cite: 5]
    const defaultLabel = isDoc ? "View / Read Document" : "Customize Cover Page";[cite: 5]
    const btnLabel = (cardData.buttonText && cardData.buttonText.trim().length > 0) ? cardData.buttonText : defaultLabel;[cite: 5]

    const timeHtml = cardData.createdAt 
      ? `<div class="card-timestamp-badge" style="margin-bottom: 12px;">🕒 Published: ${cardData.createdAt}</div>`
      : ``;

    cardEl.innerHTML = `
      <div class="card-thumbnail-wrap">
        ${thumbHtml}
      </div>
      <div class="card-body">
        <div class="card-title">${cardData.title}</div>
        <div class="card-desc">${cardData.description || "Academic resource ready for access."}</div>
        ${timeHtml}
        <button class="card-cta-btn" type="button">${btnLabel}</button>
      </div>
    `;[cite: 5]

    const actionBtn = cardEl.querySelector('.card-cta-btn');[cite: 5]
    actionBtn.addEventListener('click', (e) => {[cite: 5]
      e.preventDefault();[cite: 5]
      e.stopPropagation();[cite: 5]
      launchCardAction(cardData);[cite: 5]
    });[cite: 5]

    grid.appendChild(cardEl);[cite: 5]
  });
}

// Action Launcher
function launchCardAction(cardData) {
  const hasTarget = Boolean(cardData.targetUrl && String(cardData.targetUrl).trim().length > 5);[cite: 5]
  const isDocumentLink = (cardData.actionType === "link" || hasTarget);[cite: 5]

  if (isDocumentLink && hasTarget) {[cite: 5]
    openDocumentViewer(cardData);[cite: 5]
    return;[cite: 5]
  }

  activeCard = cardData;[cite: 5]
  document.getElementById('view-catalog').style.display = 'none';[cite: 5]
  document.getElementById('view-generator').style.display = 'block';[cite: 5]
  document.getElementById('activeCardLabel').textContent = cardData.title;[cite: 5]

  const dynamicWrap = document.getElementById('dynamicPageContent');[cite: 5]
  if (cardData.templateHtml && typeof cardData.templateHtml === 'string' && cardData.templateHtml.trim().length > 20) {[cite: 5]
    dynamicWrap.innerHTML = cardData.templateHtml.trim();[cite: 5]
  } else {
    dynamicWrap.innerHTML = defaultTemplateHtml;[cite: 5]
  }

  rebindEditorFields();[cite: 5]
  buildUniversalDynamicFields(dynamicWrap);
  window.scrollTo({ top: 0, behavior: 'smooth' });[cite: 5]
}

/* =========================================================
   2. LIVE EVENT BANNER & WEBRTC VIEWER CONTROLS
========================================================= */
function checkAndRenderLiveEventBanner(liveEvent) {
  const banner = document.getElementById('liveEventBanner');
  if (!banner) return;

  if (liveEvent && liveEvent.active && liveEvent.peerId) {
    banner.style.display = 'block';
    document.getElementById('liveEventTitle').textContent = liveEvent.title || "Live Academic Broadcast";
    document.getElementById('liveEventDesc').textContent = liveEvent.description || "Live administrative session underway.";
    document.getElementById('liveEventStartTime').textContent = `Started: ${liveEvent.startTime || "Recently"}`;

    const logoImg = document.getElementById('liveEventLogo');
    const placeholder = document.getElementById('liveEventLogoPlaceholder');
    if (liveEvent.logoUrl && liveEvent.logoUrl.trim().length > 5) {
      logoImg.src = liveEvent.logoUrl;
      logoImg.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      logoImg.style.display = 'none';
      placeholder.style.display = 'block';
    }
  } else {
    banner.style.display = 'none';
  }
}

function setupLiveStreamViewer() {
  const joinBtn = document.getElementById('btnJoinLiveStream');
  const modal = document.getElementById('liveStreamModal');
  const closeBtn = document.getElementById('btnCloseLiveModal');
  const fsBtn = document.getElementById('btnToggleLiveFullscreen');
  const video = document.getElementById('remoteLiveVideo');

  if (joinBtn) {
    joinBtn.addEventListener('click', () => {
      if (!portalData.liveEvent || !portalData.liveEvent.peerId) {
        return alert("Broadcast signal offline. Please refresh.");
      }
      openLiveStreamModal();
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => closeLiveStreamModal());
  }

  if (fsBtn && video) {
    fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        video.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }
}

function openLiveStreamModal() {
  const modal = document.getElementById('liveStreamModal');
  const connecting = document.getElementById('liveConnectingState');
  const video = document.getElementById('remoteLiveVideo');
  const title = document.getElementById('modalLiveTitle');
  const desc = document.getElementById('modalLiveDesc');
  const timeBadge = document.getElementById('modalLiveTimeBadge');

  modal.style.display = 'flex';
  connecting.style.display = 'flex';

  const live = portalData.liveEvent;
  title.textContent = live.title || "Academic Broadcast";
  desc.textContent = live.description || "Live video stream.";
  timeBadge.textContent = `Started: ${live.startTime || "N/A"}`;

  // Log user joined
  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: "user_join_live" })
  }).catch(() => {});

  // Initialize PeerJS Client to receive stream
  const viewerId = "gecm_vwr_" + Math.random().toString(36).substring(2, 8);
  viewerPeer = new Peer(viewerId, { debug: 1 });

  viewerPeer.on('open', () => {
    // Create an empty canvas/dummy audio stream to initiate call
    const dummyCanvas = document.createElement('canvas');
    dummyCanvas.width = 16;
    dummyCanvas.height = 16;
    const dummyStream = dummyCanvas.captureStream(1);

    const call = viewerPeer.call(live.peerId, dummyStream);
    currentLiveCall = call;

    call.on('stream', (remoteStream) => {
      connecting.style.display = 'none';
      video.srcObject = remoteStream;
      video.play().catch(() => {});
    });

    call.on('close', () => {
      alert("The live stream has ended by administrator.");
      closeLiveStreamModal();
    });

    call.on('error', (err) => {
      console.error("Peer call error:", err);
      connecting.innerHTML = `<span style="color:#ef4444;">Unable to connect to live stream. Admin may have stepped away.</span>`;
    });
  });

  viewerPeer.on('error', (err) => {
    console.error("Viewer peer error:", err);
    connecting.innerHTML = `<span style="color:#ef4444;">Signal error. Stream offline.</span>`;
  });
}

function closeLiveStreamModal() {
  const modal = document.getElementById('liveStreamModal');
  const video = document.getElementById('remoteLiveVideo');
  
  modal.style.display = 'none';
  if (video) video.srcObject = null;

  if (currentLiveCall) {
    currentLiveCall.close();
    currentLiveCall = null;
  }
  if (viewerPeer) {
    viewerPeer.destroy();
    viewerPeer = null;
  }

  // Log user leave
  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: "user_leave_live" })
  }).catch(() => {});
}

/* =========================================================
   3. UNIVERSAL DYNAMIC FIELDS FOR ANY TEMPLATE
========================================================= */
const bindings = [
  { input: 'inCollege1', output: 'outCollege1' },[cite: 5]
  { input: 'inCollege2', output: 'outCollege2' },[cite: 5]
  { input: 'inAffiliation', output: 'outAffiliation' },[cite: 5]
  { input: 'inDocTitle', output: 'outDocTitle' },[cite: 5]
  { input: 'inCourseName', output: 'outCourseName' },[cite: 5]
  { input: 'inCourseCode', output: 'outCourseCode' },[cite: 5]
  { input: 'inStudentName', output: 'outStudentName' },[cite: 5]
  { input: 'inRollNo', output: 'outRollNo' },[cite: 5]
  { input: 'inRegNo', output: 'outRegNo' },[cite: 5]
  { input: 'inSemester', output: 'outSemester' },[cite: 5]
  { input: 'inFacultyName', output: 'outFacultyName' },[cite: 5]
  { input: 'inFacultyRole', output: 'outFacultyRole' },[cite: 5]
  { input: 'inFacultyDept', output: 'outFacultyDept' },[cite: 5]
  { input: 'inDegree', output: 'outDegree' },[cite: 5]
  { input: 'inBranch', output: 'outBranch' },[cite: 5]
  { input: 'inSession', output: 'outSession' },[cite: 5]
  { input: 'inFooterCollege', output: 'outFooterCollege' },[cite: 5]
  { input: 'inFooterDept', output: 'outFooterDept' }[cite: 5]
];[cite: 5]

let customTemplateDynamicBindings = [];

function buildUniversalDynamicFields(container) {
  const dynamicFieldsWrap = document.getElementById('dynamicCustomFieldsWrap');
  if (!dynamicFieldsWrap) return;
  
  dynamicFieldsWrap.innerHTML = "";
  customTemplateDynamicBindings = [];

  const standardOutputIds = bindings.map(b => b.output);
  const elementsWithIds = container.querySelectorAll('[id]');

  elementsWithIds.forEach(el => {
    const elId = el.id;
    if (elId === 'topLogoImg' || elId === 'bottomLogoImg' || elId === 'outerBorder' || elId === 'innerBorder' || elId === 'dynamicPageContent') {
      return;
    }

    if (standardOutputIds.includes(elId)) {
      const match = bindings.find(b => b.output === elId);
      const inEl = document.getElementById(match.input);
      if (inEl) el.textContent = inEl.value;
      return;
    }

    const friendlyLabel = elId.replace(/^(out|txt|field)_?/i, '').replace(/([A-Z])/g, ' $1').trim();
    const dynamicInputId = `dyn_${elId}`;
    const initialText = el.textContent.trim();

    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    formGroup.innerHTML = `
      <label for="${dynamicInputId}">${friendlyLabel || elId}</label>
      <input type="text" id="${dynamicInputId}" value="${initialText}">
    `;
    dynamicFieldsWrap.appendChild(formGroup);

    const inputEl = formGroup.querySelector('input');
    inputEl.addEventListener('input', () => {
      el.textContent = inputEl.value;
    });

    customTemplateDynamicBindings.push({ input: dynamicInputId, output: elId });
  });
}

function syncAllText() {
  bindings.forEach(b => {[cite: 5]
    const inEl = document.getElementById(b.input);[cite: 5]
    const outEl = document.getElementById(b.output);[cite: 5]
    if (inEl && outEl) {[cite: 5]
      outEl.textContent = inEl.value;[cite: 5]
    }[cite: 5]
  });[cite: 5]

  customTemplateDynamicBindings.forEach(b => {
    const inEl = document.getElementById(b.input);
    const outEl = document.getElementById(b.output);
    if (inEl && outEl) {
      outEl.textContent = inEl.value;
    }
  });
}

function rebindEditorFields() {
  const driveFileId = "1Pg1tZ-1Uodqzi5iciN61hq8jMooT0eo2";[cite: 5]
  const logoDirectUrl = `https://lh3.googleusercontent.com/d/${driveFileId}`;[cite: 5]

  const topLogo = document.getElementById('topLogoImg');[cite: 5]
  const bottomLogo = document.getElementById('bottomLogoImg');[cite: 5]
  if (topLogo) topLogo.src = logoDirectUrl;[cite: 5]
  if (bottomLogo) bottomLogo.src = logoDirectUrl;[cite: 5]

  syncAllText();[cite: 5]
  updateRegVisibility();[cite: 5]
}

function updateRegVisibility() {
  const semSelect = document.getElementById('inSemester');[cite: 5]
  const regToggleWrapper = document.getElementById('regToggleWrapper');[cite: 5]
  const regCheckbox = document.getElementById('includeRegCheckbox');[cite: 5]
  const regFieldGroup = document.getElementById('regInputFieldGroup');[cite: 5]
  const outRegLine = document.getElementById('outRegNoLine');[cite: 5]

  if (!semSelect || !regToggleWrapper || !regCheckbox) return;[cite: 5]

  const sem = semSelect.value;[cite: 5]
  const isFirstOrThird = (sem === '1st' || sem === '3rd');[cite: 5]

  if (isFirstOrThird) {[cite: 5]
    regToggleWrapper.style.display = 'flex';[cite: 5]
    if (regCheckbox.checked) {[cite: 5]
      if (regFieldGroup) regFieldGroup.style.display = 'block';[cite: 5]
      if (outRegLine) outRegLine.style.display = 'block';[cite: 5]
    } else {[cite: 5]
      if (regFieldGroup) regFieldGroup.style.display = 'none';[cite: 5]
      if (outRegLine) outRegLine.style.display = 'none';[cite: 5]
    }[cite: 5]
  } else {[cite: 5]
    regToggleWrapper.style.display = 'none';[cite: 5]
    if (regFieldGroup) regFieldGroup.style.display = 'block';[cite: 5]
    if (outRegLine) outRegLine.style.display = 'block';[cite: 5]
  }[cite: 5]
}

/* =========================================================
   4. UNTOUCHED PDF ENGINE WITH AUTO-DRIVE ARCHIVAL
========================================================= */
function initPdfGeneratorEngine() {
  const mobileToggleBtn = document.getElementById('btnToggleMobileSidebar');[cite: 5]
  const sidebar = document.querySelector('.editor-sidebar');[cite: 5]
  if (mobileToggleBtn && sidebar) {[cite: 5]
    mobileToggleBtn.addEventListener('click', () => {[cite: 5]
      sidebar.classList.toggle('open');[cite: 5]
      mobileToggleBtn.textContent = sidebar.classList.contains('open') ? '✕ Close Controls' : '⚙ Open Controls';[cite: 5]
    });[cite: 5]
  }[cite: 5]

  bindings.forEach(b => {[cite: 5]
    const inEl = document.getElementById(b.input);[cite: 5]
    if (inEl) {[cite: 5]
      inEl.addEventListener('input', syncAllText);[cite: 5]
    }[cite: 5]
  });[cite: 5]

  const semSelect = document.getElementById('inSemester');[cite: 5]
  const regCheckbox = document.getElementById('includeRegCheckbox');[cite: 5]
  if (semSelect) {[cite: 5]
    semSelect.addEventListener('change', () => {[cite: 5]
      syncAllText();[cite: 5]
      updateRegVisibility();[cite: 5]
    });[cite: 5]
  }[cite: 5]
  if (regCheckbox) {[cite: 5]
    regCheckbox.addEventListener('change', updateRegVisibility);[cite: 5]
  }[cite: 5]

  const outerBorder = document.getElementById('outerBorder');[cite: 5]
  const innerBorder = document.getElementById('innerBorder');[cite: 5]
  const colorPicker = document.getElementById('borderColorPicker');[cite: 5]
  const styleSelect = document.getElementById('borderStyleSelect');[cite: 5]

  function applyBorderSettings() {
    if (!outerBorder || !innerBorder || !colorPicker || !styleSelect) return;[cite: 5]
    const color = colorPicker.value;[cite: 5]
    const style = styleSelect.value;[cite: 5]

    if (style === 'double') {[cite: 5]
      outerBorder.style.border = `3.5px solid ${color}`;[cite: 5]
      outerBorder.style.padding = '3.5px';[cite: 5]
      innerBorder.style.border = `1.2px solid ${color}`;[cite: 5]
    } else if (style === 'single') {[cite: 5]
      outerBorder.style.border = `2.5px solid ${color}`;[cite: 5]
      outerBorder.style.padding = '0';[cite: 5]
      innerBorder.style.border = 'none';[cite: 5]
    } else if (style === 'thick-thin') {[cite: 5]
      outerBorder.style.border = `4.5px solid ${color}`;[cite: 5]
      outerBorder.style.padding = '4px';[cite: 5]
      innerBorder.style.border = `1px solid ${color}`;[cite: 5]
    } else {[cite: 5]
      outerBorder.style.border = 'none';[cite: 5]
      outerBorder.style.padding = '0';[cite: 5]
      innerBorder.style.border = 'none';[cite: 5]
    }[cite: 5]
  }[cite: 5]

  if (styleSelect) styleSelect.addEventListener('change', applyBorderSettings);[cite: 5]
  if (colorPicker) colorPicker.addEventListener('input', applyBorderSettings);[cite: 5]

  const fontSelect = document.getElementById('fontSelect');[cite: 5]
  if (fontSelect) {[cite: 5]
    fontSelect.addEventListener('change', function(e) {[cite: 5]
      document.getElementById('pageDocument').style.fontFamily = e.target.value;[cite: 5]
    });[cite: 5]
  }[cite: 5]

  const sizeRange = document.getElementById('sizeRange');[cite: 5]
  if (sizeRange) {[cite: 5]
    sizeRange.addEventListener('input', function(e) {[cite: 5]
      const scalePercent = e.target.value;[cite: 5]
      document.getElementById('zoomVal').textContent = scalePercent + '%';[cite: 5]
      document.getElementById('pageDocument').style.fontSize = (scalePercent / 100) + 'em';[cite: 5]
    });[cite: 5]
  }[cite: 5]

  function getIncrementalFilename() {
    const baseName = "Kumaramarjeet80 Assignment cover page";[cite: 5]
    let count = parseInt(localStorage.getItem("download_file_counter") || "0", 10);[cite: 5]
    let filename = (count === 0) ? `${baseName}.pdf` : `${baseName} (${count}).pdf`;[cite: 5]
    localStorage.setItem("download_file_counter", (count + 1).toString());[cite: 5]
    return filename;[cite: 5]
  }

  const downloadBtn = document.getElementById('btnDirectDownload');[cite: 5]
  if (downloadBtn) {[cite: 5]
    downloadBtn.addEventListener('click', function() {[cite: 5]
      const page = document.getElementById('pageDocument');[cite: 5]
      const filename = getIncrementalFilename();[cite: 5]

      downloadBtn.disabled = true;[cite: 5]
      downloadBtn.textContent = "Rendering PDF...";[cite: 5]

      const originalTransform = page.style.transform;[cite: 5]
      const originalTransformOrigin = page.style.transformOrigin;[cite: 5]
      const originalMargin = page.style.margin;[cite: 5]
      const originalPosition = page.style.position;[cite: 5]
      const originalBoxShadow = page.style.boxShadow;[cite: 5]

      page.style.transform = 'none';[cite: 5]
      page.style.transformOrigin = 'top left';[cite: 5]
      page.style.margin = '0';[cite: 5]
      page.style.boxShadow = 'none';[cite: 5]
      page.style.position = 'relative';[cite: 5]

      applyBorderSettings();[cite: 5]
      window.scrollTo(0, 0);[cite: 5]

      const opt = {
        margin: 0,[cite: 5]
        filename: filename,[cite: 5]
        image: { type: 'jpeg', quality: 1.0 },[cite: 5]
        html2canvas: {
          scale: 2,[cite: 5]
          useCORS: true,[cite: 5]
          allowTaint: true,[cite: 5]
          logging: false,[cite: 5]
          scrollX: 0,[cite: 5]
          scrollY: 0[cite: 5]
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },[cite: 5]
        pagebreak: { mode: 'avoid-all' }[cite: 5]
      };

      html2pdf().set(opt).from(page).toPdf().get('pdf').then(function(pdfObj) {[cite: 5]
        const totalPages = pdfObj.internal.getNumberOfPages();[cite: 5]
        if (totalPages > 1) {[cite: 5]
          for (let p = totalPages; p > 1; p--) {[cite: 5]
            pdfObj.deletePage(p);[cite: 5]
          }[cite: 5]
        }[cite: 5]

        page.style.transform = originalTransform;[cite: 5]
        page.style.transformOrigin = originalTransformOrigin;[cite: 5]
        page.style.margin = originalMargin;[cite: 5]
        page.style.position = originalPosition;[cite: 5]
        page.style.boxShadow = originalBoxShadow;[cite: 5]

        // 1. Direct local file download[cite: 5]
        pdfObj.save(filename);[cite: 5]

        // 2. Extract Base64 stream from render engine
        const pdfBase64 = pdfObj.output('datauristring');

        // 3. Telemetry + Google Drive permanent archiving
        logTelemetryAndArchiveToDrive(pdfBase64);

        // 4. Trigger celebration modal
        showCelebrationToast();

        downloadBtn.disabled = false;[cite: 5]
        downloadBtn.textContent = "Download PDF Document";[cite: 5]
      }).catch(err => {
        page.style.transform = originalTransform;[cite: 5]
        page.style.transformOrigin = originalTransformOrigin;[cite: 5]
        page.style.margin = originalMargin;[cite: 5]
        page.style.position = originalPosition;[cite: 5]
        page.style.boxShadow = originalBoxShadow;[cite: 5]

        console.error("PDF Engine Error:", err);[cite: 5]
        downloadBtn.disabled = false;[cite: 5]
        downloadBtn.textContent = "Download PDF Document";[cite: 5]
      });
    });[cite: 5]
  }[cite: 5]

  rebindEditorFields();[cite: 5]
  applyBorderSettings();[cite: 5]
}

function logTelemetryAndArchiveToDrive(pdfBase64) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT")) return;[cite: 5]

  const regCheckbox = document.getElementById('includeRegCheckbox');[cite: 5]
  const semSelect = document.getElementById('inSemester');[cite: 5]

  const payload = {
    action: "log_download",[cite: 5]
    cardId: activeCard ? activeCard.id : "DEFAULT",[cite: 5]
    name: document.getElementById('inStudentName')?.value || 'N/A',[cite: 5]
    roll: document.getElementById('inRollNo')?.value || 'N/A',[cite: 5]
    reg: (regCheckbox && (regCheckbox.checked || !['1st', '3rd'].includes(semSelect.value)))[cite: 5]
         ? (document.getElementById('inRegNo')?.value || 'N/A') : 'N/A',[cite: 5]
    course: document.getElementById('inCourseName')?.value || 'N/A',
    subject: document.getElementById('inCourseName')?.value || 'N/A',[cite: 5]
    courseCode: document.getElementById('inCourseCode')?.value || 'N/A',
    subjectCode: document.getElementById('inCourseCode')?.value || 'N/A',[cite: 5]
    faculty: document.getElementById('inFacultyName')?.value || 'N/A',[cite: 5]
    semester: document.getElementById('inSemester')?.value || 'N/A',[cite: 5]
    branch: document.getElementById('inBranch')?.value || 'N/A',[cite: 5]
    college: (document.getElementById('inCollege1')?.value || '') + ' ' + (document.getElementById('inCollege2')?.value || ''),[cite: 5]
    pdfBase64: pdfBase64
  };

  fetch(APPS_SCRIPT_URL, {[cite: 5]
    method: 'POST',[cite: 5]
    headers: { 'Content-Type': 'text/plain' },[cite: 5]
    body: JSON.stringify(payload)[cite: 5]
  }).catch(() => {});[cite: 5]
}

/* =========================================================
   5. EMBEDDED DOCUMENT VIEWER CONTROLS
========================================================= */
function setupDocViewerControls() {
  const closeBtn = document.getElementById('docViewerCloseBtn');[cite: 5]
  const modal = document.getElementById('docViewerModal');[cite: 5]
  const iframe = document.getElementById('docViewerIframe');[cite: 5]

  if (closeBtn && modal) {[cite: 5]
    closeBtn.addEventListener('click', () => {[cite: 5]
      modal.style.display = 'none';[cite: 5]
      if (iframe) iframe.src = "";[cite: 5]
    });[cite: 5]
  }[cite: 5]

  const downloadBtn = document.getElementById('docViewerDownloadBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      showCelebrationToast();
    });
  }
}

function openDocumentViewer(cardData) {
  const modal = document.getElementById('docViewerModal');[cite: 5]
  const iframe = document.getElementById('docViewerIframe');[cite: 5]
  const title = document.getElementById('docViewerHeading');[cite: 5]
  const downloadBtn = document.getElementById('docViewerDownloadBtn');[cite: 5]

  title.textContent = cardData.title || "Academic Document";[cite: 5]

  let rawUrl = cardData.targetUrl.trim();[cite: 5]
  let embedUrl = rawUrl;[cite: 5]
  let downloadUrl = rawUrl;[cite: 5]

  if (rawUrl.includes("drive.google.com")) {[cite: 5]
    const fileIdMatch = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);[cite: 5]
    if (fileIdMatch && fileIdMatch[1]) {[cite: 5]
      const id = fileIdMatch[1];[cite: 5]
      embedUrl = `https://drive.google.com/file/d/${id}/preview`;[cite: 5]
      downloadUrl = `https://drive.google.com/uc?export=download&id=${id}`;[cite: 5]
    }[cite: 5]
  }[cite: 5]

  iframe.src = embedUrl;[cite: 5]
  downloadBtn.href = downloadUrl;[cite: 5]
  modal.style.display = 'flex';[cite: 5]
}

function setupBreadcrumbs() {
  document.getElementById('bcHome').addEventListener('click', renderCategories);[cite: 5]
  document.getElementById('bcCat').addEventListener('click', () => {[cite: 5]
    if (currentCategoryId) openCategory(currentCategoryId);[cite: 5]
  });[cite: 5]
  document.getElementById('btnBackToPortal').addEventListener('click', () => {[cite: 5]
    document.getElementById('view-generator').style.display = 'none';[cite: 5]
    document.getElementById('view-catalog').style.display = 'block';[cite: 5]
  });[cite: 5]
}

function updateBreadcrumbs() {
  const bar = document.getElementById('breadcrumbNav');[cite: 5]
  const bcCat = document.getElementById('bcCat');[cite: 5]
  const bcSub = document.getElementById('bcSub');[cite: 5]
  const sep1 = document.getElementById('bcSep1');[cite: 5]
  const sep2 = document.getElementById('bcSep2');[cite: 5]

  if (!currentCategoryId) {[cite: 5]
    bar.style.display = 'none';[cite: 5]
    return;[cite: 5]
  }[cite: 5]

  bar.style.display = 'flex';[cite: 5]
  const catObj = portalData.categories.find(c => c.id === currentCategoryId);[cite: 5]
  bcCat.textContent = catObj ? catObj.name : "Category";[cite: 5]
  bcCat.style.display = 'inline';[cite: 5]
  sep1.style.display = 'inline';[cite: 5]

  if (currentSubcategoryId) {[cite: 5]
    const subObj = portalData.subcategories.find(s => s.id === currentSubcategoryId);[cite: 5]
    bcSub.textContent = subObj ? subObj.name : "Subcategory";[cite: 5]
    bcSub.style.display = 'inline';[cite: 5]
    sep2.style.display = 'inline';[cite: 5]
  } else {[cite: 5]
    bcSub.style.display = 'none';[cite: 5]
    sep2.style.display = 'none';[cite: 5]
  }[cite: 5]
}

/* =========================================================
   6. SEQUENTIAL MULTI-POPUP QUEUE (LATEST FIRST)
========================================================= */
function formatVideoEmbedUrl(url) {
  if (!url) return "";[cite: 5]
  if (url.includes("drive.google.com") || url.includes("googleusercontent.com")) {[cite: 5]
    const driveMatch = url.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]+)/);[cite: 5]
    if (driveMatch && driveMatch[1]) {[cite: 5]
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;[cite: 5]
    }[cite: 5]
  }[cite: 5]
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);[cite: 5]
  if (ytMatch && ytMatch[1]) {[cite: 5]
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&loop=1&playlist=${ytMatch[1]}&playsinline=1&enablejsapi=1`;[cite: 5]
  }[cite: 5]
  return url;[cite: 5]
}

function initSequentialPopupQueue(popups) {
  if (!popups || popups.length === 0) return;
  activePopupQueue = popups;
  currentPopupIndex = 0;
  displayNextSequentialPopup();
}

function displayNextSequentialPopup() {
  if (popupCycleTimer) clearTimeout(popupCycleTimer);
  if (!activePopupQueue || activePopupQueue.length === 0) return;

  const currentPopup = activePopupQueue[currentPopupIndex];
  showUserPopup(currentPopup, () => {
    scheduleNextPopupInQueue(currentPopup);
  });
}

function scheduleNextPopupInQueue(justClosedPopup) {
  currentPopupIndex = (currentPopupIndex + 1) % activePopupQueue.length;
  const nextPopup = activePopupQueue[currentPopupIndex];

  const delayMinutes = Math.max(0.1, Number(justClosedPopup.intervalMinutes) || 1);
  const delayMs = delayMinutes * 60 * 1000;

  popupCycleTimer = setTimeout(() => {
    const modal = document.getElementById('adminBroadcastModal');[cite: 5]
    if (modal && modal.style.display !== 'flex') {[cite: 5]
      displayNextSequentialPopup();
    } else {
      scheduleNextPopupInQueue(nextPopup);
    }
  }, delayMs);
}

function showUserPopup(p, onClosedCallback) {
  const modal = document.getElementById('adminBroadcastModal');[cite: 5]
  const modalBox = document.getElementById('adminModalBox');[cite: 5]
  const closeBtn = document.getElementById('adPopupCloseBtn');[cite: 5]
  const timerWrap = document.getElementById('popupTimerWrap');[cite: 5]
  const timerBar = document.getElementById('popupTimerBar');[cite: 5]
  const timerBadge = document.getElementById('popupTimerBadge');[cite: 5]

  const heroWrap = document.getElementById('adPopupHeroWrap');[cite: 5]
  const imgEl = document.getElementById('adPopupImg');[cite: 5]
  const videoEl = document.getElementById('adPopupVideo');[cite: 5]
  const iframeEl = document.getElementById('adPopupIframe');[cite: 5]
  const unmuteBtn = document.getElementById('adPopupUnmuteBtn');[cite: 5]

  const mediaType = p.mediaType || "image";[cite: 5]
  const mediaUrl = p.mediaUrl || "";[cite: 5]

  imgEl.style.display = "none";[cite: 5]
  videoEl.style.display = "none";[cite: 5]
  iframeEl.style.display = "none";[cite: 5]
  if (unmuteBtn) unmuteBtn.style.display = "none";[cite: 5]

  videoEl.pause();[cite: 5]
  videoEl.removeAttribute('src');[cite: 5]
  videoEl.load();[cite: 5]
  iframeEl.src = "";[cite: 5]

  timerWrap.style.display = "none";[cite: 5]
  timerBadge.style.display = "none";[cite: 5]
  timerBar.style.transition = "none";[cite: 5]
  timerBar.style.transform = "scaleX(1)";[cite: 5]

  let countdownInterval = null;[cite: 5]
  let hasClosed = false;

  function hideModal() {
    if (hasClosed) return;
    hasClosed = true;
    modal.style.display = "none";[cite: 5]
    videoEl.pause();[cite: 5]
    iframeEl.src = "";[cite: 5]
    if (countdownInterval) clearInterval(countdownInterval);[cite: 5]
    if (typeof onClosedCallback === "function") {
      onClosedCallback();
    }
  }

  function startCloseTimer() {
    if (countdownInterval) return;[cite: 5]
    const mode = p.closeMode || "both";[cite: 5]
    if (mode !== "timer" && mode !== "both") return;[cite: 5]

    const seconds = Math.max(1, Number(p.timerSeconds) || 5);[cite: 5]
    timerWrap.style.display = "block";[cite: 5]
    timerBadge.style.display = "inline-block";[cite: 5]

    let remaining = seconds;[cite: 5]
    timerBadge.textContent = `Auto-closing in ${remaining}s...`;[cite: 5]

    setTimeout(() => {[cite: 5]
      timerBar.style.transition = `transform ${seconds}s linear`;[cite: 5]
      timerBar.style.transform = "scaleX(0)";[cite: 5]
    }, 50);[cite: 5]

    countdownInterval = setInterval(() => {[cite: 5]
      remaining -= 1;[cite: 5]
      if (remaining > 0) {[cite: 5]
        timerBadge.textContent = `Auto-closing in ${remaining}s...`;[cite: 5]
      } else {
        clearInterval(countdownInterval);[cite: 5]
        hideModal();[cite: 5]
      }
    }, 1000);[cite: 5]
  }

  const mode = p.closeMode || "both";[cite: 5]
  closeBtn.style.display = (mode === "timer") ? "none" : "flex";[cite: 5]
  closeBtn.onclick = (e) => {[cite: 5]
    e.stopPropagation();[cite: 5]
    hideModal();[cite: 5]
  };[cite: 5]

  if (mediaUrl) {[cite: 5]
    heroWrap.style.display = "flex";[cite: 5]

    if (mediaType === "video") {[cite: 5]
      const isDriveOrYt = mediaUrl.includes("google.com") ||[cite: 5]
                          mediaUrl.includes("googleusercontent.com") ||[cite: 5]
                          mediaUrl.includes("youtube.com") ||[cite: 5]
                          mediaUrl.includes("youtu.be");[cite: 5]

      if (isDriveOrYt) {[cite: 5]
        iframeEl.setAttribute('allow', 'autoplay *; encrypted-media *; picture-in-picture *');[cite: 5]
        iframeEl.src = formatVideoEmbedUrl(mediaUrl);[cite: 5]
        iframeEl.style.display = "block";[cite: 5]
        iframeEl.onload = () => startCloseTimer();[cite: 5]
      } else {
        videoEl.muted = true;[cite: 5]
        videoEl.defaultMuted = true;[cite: 5]
        videoEl.loop = true;[cite: 5]
        videoEl.playsInline = true;[cite: 5]
        videoEl.src = mediaUrl;[cite: 5]
        videoEl.style.display = "block";[cite: 5]

        if (unmuteBtn) {[cite: 5]
          unmuteBtn.style.display = "block";[cite: 5]
          unmuteBtn.textContent = "🔊 Tap to Unmute";[cite: 5]
          unmuteBtn.onclick = (e) => {[cite: 5]
            e.stopPropagation();[cite: 5]
            videoEl.muted = !videoEl.muted;[cite: 5]
            unmuteBtn.textContent = videoEl.muted ? "🔊 Tap to Unmute" : "🔇 Mute";[cite: 5]
          };[cite: 5]
        }[cite: 5]

        videoEl.onplaying = () => startCloseTimer();[cite: 5]
        videoEl.play().catch(() => startCloseTimer());[cite: 5]
      }
    } else {
      imgEl.src = mediaUrl;[cite: 5]
      imgEl.style.display = "block";[cite: 5]
      imgEl.onload = () => startCloseTimer();[cite: 5]
      if (imgEl.complete) startCloseTimer();[cite: 5]
    }
  } else {
    heroWrap.style.display = "none";[cite: 5]
    startCloseTimer();[cite: 5]
  }

  document.getElementById('adPopupTitle').textContent = p.title || "Announcement";[cite: 5]
  document.getElementById('adPopupBody').textContent = p.body || "";[cite: 5]
  
  const actionBtn = document.getElementById('adPopupBtn');[cite: 5]
  actionBtn.textContent = p.buttonText || "Open Link";[cite: 5]
  actionBtn.href = p.buttonLink || "#";[cite: 5]

  if (p.clickMode === "card" && p.buttonLink) {[cite: 5]
    modalBox.classList.add('clickable-card');[cite: 5]
    modalBox.onclick = (e) => {[cite: 5]
      if (e.target.closest('#adPopupCloseBtn') || e.target.closest('#adPopupUnmuteBtn')) return;[cite: 5]
      window.open(p.buttonLink, '_blank', 'noopener,noreferrer');[cite: 5]
    };[cite: 5]
  } else {
    modalBox.classList.remove('clickable-card');[cite: 5]
    modalBox.onclick = null;[cite: 5]
  }

  modal.style.display = "flex";[cite: 5]
}

/* =========================================================
   7. CELEBRATION DOWNLOAD TOAST
========================================================= */
let toastDismissTimer = null;

function setupCelebrationToastControls() {
  const closeBtn = document.getElementById('celebrationToastCloseBtn');
  const toast = document.getElementById('celebrationToast');
  if (closeBtn && toast) {
    closeBtn.addEventListener('click', () => {
      toast.classList.remove('show');
      if (toastDismissTimer) clearTimeout(toastDismissTimer);
    });
  }
}

function showCelebrationToast() {
  const toast = document.getElementById('celebrationToast');
  const progressBar = document.getElementById('toastProgressBar');
  if (!toast) return;

  if (toastDismissTimer) clearTimeout(toastDismissTimer);
  toast.classList.add('show');
  
  if (progressBar) {
    progressBar.style.transition = 'none';
    progressBar.style.transform = 'scaleX(1)';
    setTimeout(() => {
      progressBar.style.transition = 'transform 4.5s linear';
      progressBar.style.transform = 'scaleX(0)';
    }, 50);
  }

  toastDismissTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 4500);
}
