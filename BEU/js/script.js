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
};
let currentCategoryId = null;
let currentSubcategoryId = null;
let activeCard = null;

let defaultTemplateHtml = "";

// Multi-Popup Queue Engine State
let activePopupQueue = [];
let currentPopupIndex = 0;
let popupCycleTimer = null;

// Live Stream State (WebRTC PeerJS)
let viewerPeer = null;
let currentLiveCall = null;

window.addEventListener('DOMContentLoaded', () => {
  const dynamicWrap = document.getElementById('dynamicPageContent');
  if (dynamicWrap) {
    defaultTemplateHtml = dynamicWrap.innerHTML;
  }

  initUserPortal();
});

/* =========================================================
   1. USER PORTAL ROUTING & FAILSAFE DATA LOADER
========================================================= */
function initUserPortal() {
  initPdfGeneratorEngine();
  setupBreadcrumbs();
  setupDocViewerControls();
  setupCelebrationToastControls();
  setupLiveStreamViewer();
  
  // 1. Instant Cache Hydration
  loadPortalDataFromCache();
  
  // 2. Network Fetch with automatic 4-second safety release
  fetchPortalCatalog();
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
    console.warn("Cache read error:", err);
  }
}

function fetchPortalCatalog() {
  let hasResolved = false;

  // Safety timer: If Apps Script takes more than 4s, clear spinner and show content
  const fallbackTimer = setTimeout(() => {
    if (!hasResolved && (!portalData.categories || portalData.categories.length === 0)) {
      console.warn("Apps Script network delay; deploying fallback categories.");
      renderFallbackCategories();
    }
  }, 4000);

  fetch(`${APPS_SCRIPT_URL}?action=get_portal_data`)
    .then(res => res.json())
    .then(data => {
      hasResolved = true;
      clearTimeout(fallbackTimer);

      if (data && data.status === "success") {
        const freshData = {
          categories: data.categories || [],
          subcategories: data.subcategories || [],
          cards: data.cards || [],
          popups: data.popups || (data.popup ? [data.popup] : []),
          liveEvent: data.liveEvent || null
        };

        portalData = freshData;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(freshData));
        } catch (e) {}

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
      } else if (!portalData.categories || portalData.categories.length === 0) {
        renderFallbackCategories();
      }
    })
    .catch(err => {
      hasResolved = true;
      clearTimeout(fallbackTimer);
      console.error("Portal fetch error:", err);
      if (!portalData.categories || portalData.categories.length === 0) {
        renderFallbackCategories();
      }
    });
}

function renderFallbackCategories() {
  portalData.categories = [
    { id: "CAT-DEFAULT", name: "Assignment Cover Pages", description: "Official B.Tech assignment covers and formats", icon: "📄", createdAt: "Academic Year 2026-27" }
  ];
  portalData.subcategories = [
    { id: "SUB-DEFAULT", categoryId: "CAT-DEFAULT", name: "Standard Academic Work", description: "Regular course assignments", createdAt: "Academic Year 2026-27" }
  ];
  portalData.cards = [
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
  ];
  renderCategories();
}

// Stage A: Render Categories
function renderCategories() {
  currentCategoryId = null;
  currentSubcategoryId = null;
  activeCard = null;

  const viewCat = document.getElementById('view-catalog');
  const viewGen = document.getElementById('view-generator');
  if (viewCat) viewCat.style.display = 'block';
  if (viewGen) viewGen.style.display = 'none';

  const stCat = document.getElementById('stageCategories');
  const stSub = document.getElementById('stageSubcategories');
  const stCrd = document.getElementById('stageCards');
  if (stCat) stCat.style.display = 'block';
  if (stSub) stSub.style.display = 'none';
  if (stCrd) stCrd.style.display = 'none';

  updateBreadcrumbs();
  checkAndRenderLiveEventBanner(portalData.liveEvent);

  const grid = document.getElementById('categoryGrid');
  if (!grid) return;
  grid.innerHTML = "";

  if (!portalData.categories || portalData.categories.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px;">No categories published yet.</div>`;
    return;
  }

  portalData.categories.forEach(cat => {
    const card = document.createElement('div');
    card.className = "category-card";
    
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
    `;
    card.addEventListener('click', () => openCategory(cat.id));
    grid.appendChild(card);
  });
}

// Stage B: Open Subcategories
function openCategory(catId) {
  currentCategoryId = catId;
  const filteredSubs = portalData.subcategories.filter(s => s.categoryId === catId);

  document.getElementById('stageCategories').style.display = 'none';
  document.getElementById('stageSubcategories').style.display = 'block';
  document.getElementById('stageCards').style.display = 'none';

  updateBreadcrumbs();

  const grid = document.getElementById('subcategoryGrid');
  if (!grid) return;
  grid.innerHTML = "";

  if (filteredSubs.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px;">
        No subcategories found in this category.
        <br><button class="btn-back-to-catalog" style="margin: 16px auto;" onclick="renderCategories()">← Go Back</button>
      </div>`;
    return;
  }

  filteredSubs.forEach(sub => {
    const card = document.createElement('div');
    card.className = "category-card";
    
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
    `;
    card.addEventListener('click', () => openSubcategory(sub.id));
    grid.appendChild(card);
  });
}

// Stage C: Open Resource Cards
function openSubcategory(subId) {
  currentSubcategoryId = subId;
  const filteredCards = portalData.cards.filter(c => c.subcategoryId === subId);

  document.getElementById('stageCategories').style.display = 'none';
  document.getElementById('stageSubcategories').style.display = 'none';
  document.getElementById('stageCards').style.display = 'block';

  updateBreadcrumbs();

  const grid = document.getElementById('cardGrid');
  if (!grid) return;
  grid.innerHTML = "";

  if (filteredCards.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px;">
        No cards published under this section yet.
        <br><button class="btn-back-to-catalog" style="margin: 16px auto;" onclick="openCategory('${currentCategoryId}')">← Go Back</button>
      </div>`;
    return;
  }

  filteredCards.forEach(cardData => {
    const cardEl = document.createElement('div');
    cardEl.className = "resource-card";
    
    const thumbHtml = cardData.thumbnailUrl
      ? `<img src="${cardData.thumbnailUrl}" class="card-thumbnail" alt="${cardData.title}">`
      : `<div class="card-thumbnail-placeholder">📄</div>`;

    const hasTarget = Boolean(cardData.targetUrl && String(cardData.targetUrl).trim().length > 5);
    const isDoc = (cardData.actionType === "link" || hasTarget);
    const defaultLabel = isDoc ? "View / Read Document" : "Customize Cover Page";
    const btnLabel = (cardData.buttonText && cardData.buttonText.trim().length > 0) ? cardData.buttonText : defaultLabel;

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
    `;

    const actionBtn = cardEl.querySelector('.card-cta-btn');
    actionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      launchCardAction(cardData);
    });

    grid.appendChild(cardEl);
  });
}

function launchCardAction(cardData) {
  const hasTarget = Boolean(cardData.targetUrl && String(cardData.targetUrl).trim().length > 5);
  const isDocumentLink = (cardData.actionType === "link" || hasTarget);

  if (isDocumentLink && hasTarget) {
    openDocumentViewer(cardData);
    return;
  }

  activeCard = cardData;
  document.getElementById('view-catalog').style.display = 'none';
  document.getElementById('view-generator').style.display = 'block';
  document.getElementById('activeCardLabel').textContent = cardData.title;

  const dynamicWrap = document.getElementById('dynamicPageContent');
  if (cardData.templateHtml && typeof cardData.templateHtml === 'string' && cardData.templateHtml.trim().length > 20) {
    dynamicWrap.innerHTML = cardData.templateHtml.trim();
  } else {
    dynamicWrap.innerHTML = defaultTemplateHtml;
  }

  rebindEditorFields();
  buildUniversalDynamicFields(dynamicWrap);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================
   2. LIVE EVENT BANNER & WEBRTC VIEWER CONTROLS
========================================================= */
function checkAndRenderLiveEventBanner(liveEvent) {
  const banner = document.getElementById('liveEventBanner');
  if (!banner) return;

  if (liveEvent && liveEvent.active && liveEvent.peerId) {
    banner.style.display = 'block';
    const titleEl = document.getElementById('liveEventTitle');
    const descEl = document.getElementById('liveEventDesc');
    const startEl = document.getElementById('liveEventStartTime');
    if (titleEl) titleEl.textContent = liveEvent.title || "Live Academic Broadcast";
    if (descEl) descEl.textContent = liveEvent.description || "Live administrative session underway.";
    if (startEl) startEl.textContent = `Started: ${liveEvent.startTime || "Recently"}`;

    const logoImg = document.getElementById('liveEventLogo');
    const placeholder = document.getElementById('liveEventLogoPlaceholder');
    if (logoImg && placeholder) {
      if (liveEvent.logoUrl && liveEvent.logoUrl.trim().length > 5) {
        logoImg.src = liveEvent.logoUrl;
        logoImg.style.display = 'block';
        placeholder.style.display = 'none';
      } else {
        logoImg.style.display = 'none';
        placeholder.style.display = 'block';
      }
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

  if (modal) modal.style.display = 'flex';
  if (connecting) connecting.style.display = 'flex';

  const live = portalData.liveEvent;
  if (title && live) title.textContent = live.title || "Academic Broadcast";
  if (desc && live) desc.textContent = live.description || "Live video stream.";
  if (timeBadge && live) timeBadge.textContent = `Started: ${live.startTime || "N/A"}`;

  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: "user_join_live" })
  }).catch(() => {});

  if (typeof Peer === 'undefined') {
    if (connecting) connecting.innerHTML = `<span style="color:#ef4444;">PeerJS library not loaded. Check connection.</span>`;
    return;
  }

  const viewerId = "gecm_vwr_" + Math.random().toString(36).substring(2, 8);
  viewerPeer = new Peer(viewerId, { debug: 1 });

  viewerPeer.on('open', () => {
    const dummyCanvas = document.createElement('canvas');
    dummyCanvas.width = 16;
    dummyCanvas.height = 16;
    const dummyStream = dummyCanvas.captureStream(1);

    const call = viewerPeer.call(live.peerId, dummyStream);
    currentLiveCall = call;

    call.on('stream', (remoteStream) => {
      if (connecting) connecting.style.display = 'none';
      if (video) {
        video.srcObject = remoteStream;
        video.play().catch(() => {});
      }
    });

    call.on('close', () => {
      alert("The live broadcast has ended.");
      closeLiveStreamModal();
    });

    call.on('error', (err) => {
      console.error("Call error:", err);
      if (connecting) connecting.innerHTML = `<span style="color:#ef4444;">Could not connect to host.</span>`;
    });
  });

  viewerPeer.on('error', (err) => {
    console.error("Viewer peer error:", err);
    if (connecting) connecting.innerHTML = `<span style="color:#ef4444;">Connection error. Stream offline.</span>`;
  });
}

function closeLiveStreamModal() {
  const modal = document.getElementById('liveStreamModal');
  const video = document.getElementById('remoteLiveVideo');
  
  if (modal) modal.style.display = 'none';
  if (video) video.srcObject = null;

  if (currentLiveCall) {
    currentLiveCall.close();
    currentLiveCall = null;
  }
  if (viewerPeer) {
    viewerPeer.destroy();
    viewerPeer = null;
  }

  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: "user_leave_live" })
  }).catch(() => {});
}

/* =========================================================
   3. UNIVERSAL DYNAMIC FIELDS & A4 ENGINE
========================================================= */
const bindings = [
  { input: 'inCollege1', output: 'outCollege1' },
  { input: 'inCollege2', output: 'outCollege2' },
  { input: 'inAffiliation', output: 'outAffiliation' },
  { input: 'inDocTitle', output: 'outDocTitle' },
  { input: 'inCourseName', output: 'outCourseName' },
  { input: 'inCourseCode', output: 'outCourseCode' },
  { input: 'inStudentName', output: 'outStudentName' },
  { input: 'inRollNo', output: 'outRollNo' },
  { input: 'inRegNo', output: 'outRegNo' },
  { input: 'inSemester', output: 'outSemester' },
  { input: 'inFacultyName', output: 'outFacultyName' },
  { input: 'inFacultyRole', output: 'outFacultyRole' },
  { input: 'inFacultyDept', output: 'outFacultyDept' },
  { input: 'inDegree', output: 'outDegree' },
  { input: 'inBranch', output: 'outBranch' },
  { input: 'inSession', output: 'outSession' },
  { input: 'inFooterCollege', output: 'outFooterCollege' },
  { input: 'inFooterDept', output: 'outFooterDept' }
];

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
  bindings.forEach(b => {
    const inEl = document.getElementById(b.input);
    const outEl = document.getElementById(b.output);
    if (inEl && outEl) {
      outEl.textContent = inEl.value;
    }
  });

  customTemplateDynamicBindings.forEach(b => {
    const inEl = document.getElementById(b.input);
    const outEl = document.getElementById(b.output);
    if (inEl && outEl) {
      outEl.textContent = inEl.value;
    }
  });
}

function rebindEditorFields() {
  const driveFileId = "1Pg1tZ-1Uodqzi5iciN61hq8jMooT0eo2";
  const logoDirectUrl = `https://lh3.googleusercontent.com/d/${driveFileId}`;

  const topLogo = document.getElementById('topLogoImg');
  const bottomLogo = document.getElementById('bottomLogoImg');
  if (topLogo) topLogo.src = logoDirectUrl;
  if (bottomLogo) bottomLogo.src = logoDirectUrl;

  syncAllText();
  updateRegVisibility();
}

function updateRegVisibility() {
  const semSelect = document.getElementById('inSemester');
  const regToggleWrapper = document.getElementById('regToggleWrapper');
  const regCheckbox = document.getElementById('includeRegCheckbox');
  const regFieldGroup = document.getElementById('regInputFieldGroup');
  const outRegLine = document.getElementById('outRegNoLine');

  if (!semSelect || !regToggleWrapper || !regCheckbox) return;

  const sem = semSelect.value;
  const isFirstOrThird = (sem === '1st' || sem === '3rd');

  if (isFirstOrThird) {
    regToggleWrapper.style.display = 'flex';
    if (regCheckbox.checked) {
      if (regFieldGroup) regFieldGroup.style.display = 'block';
      if (outRegLine) outRegLine.style.display = 'block';
    } else {
      if (regFieldGroup) regFieldGroup.style.display = 'none';
      if (outRegLine) outRegLine.style.display = 'none';
    }
  } else {
    regToggleWrapper.style.display = 'none';
    if (regFieldGroup) regFieldGroup.style.display = 'block';
    if (outRegLine) outRegLine.style.display = 'block';
  }
}

function initPdfGeneratorEngine() {
  const mobileToggleBtn = document.getElementById('btnToggleMobileSidebar');
  const sidebar = document.querySelector('.editor-sidebar');
  if (mobileToggleBtn && sidebar) {
    mobileToggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      mobileToggleBtn.textContent = sidebar.classList.contains('open') ? '✕ Close Controls' : '⚙ Open Controls';
    });
  }

  bindings.forEach(b => {
    const inEl = document.getElementById(b.input);
    if (inEl) {
      inEl.addEventListener('input', syncAllText);
    }
  });

  const semSelect = document.getElementById('inSemester');
  const regCheckbox = document.getElementById('includeRegCheckbox');
  if (semSelect) {
    semSelect.addEventListener('change', () => {
      syncAllText();
      updateRegVisibility();
    });
  }
  if (regCheckbox) {
    regCheckbox.addEventListener('change', updateRegVisibility);
  }

  const outerBorder = document.getElementById('outerBorder');
  const innerBorder = document.getElementById('innerBorder');
  const colorPicker = document.getElementById('borderColorPicker');
  const styleSelect = document.getElementById('borderStyleSelect');

  function applyBorderSettings() {
    if (!outerBorder || !innerBorder || !colorPicker || !styleSelect) return;
    const color = colorPicker.value;
    const style = styleSelect.value;

    if (style === 'double') {
      outerBorder.style.border = `3.5px solid ${color}`;
      outerBorder.style.padding = '3.5px';
      innerBorder.style.border = `1.2px solid ${color}`;
    } else if (style === 'single') {
      outerBorder.style.border = `2.5px solid ${color}`;
      outerBorder.style.padding = '0';
      innerBorder.style.border = 'none';
    } else if (style === 'thick-thin') {
      outerBorder.style.border = `4.5px solid ${color}`;
      outerBorder.style.padding = '4px';
      innerBorder.style.border = `1px solid ${color}`;
    } else {
      outerBorder.style.border = 'none';
      outerBorder.style.padding = '0';
      innerBorder.style.border = 'none';
    }
  }

  if (styleSelect) styleSelect.addEventListener('change', applyBorderSettings);
  if (colorPicker) colorPicker.addEventListener('input', applyBorderSettings);

  const fontSelect = document.getElementById('fontSelect');
  if (fontSelect) {
    fontSelect.addEventListener('change', function(e) {
      const doc = document.getElementById('pageDocument');
      if (doc) doc.style.fontFamily = e.target.value;
    });
  }

  const sizeRange = document.getElementById('sizeRange');
  if (sizeRange) {
    sizeRange.addEventListener('input', function(e) {
      const scalePercent = e.target.value;
      const zoom = document.getElementById('zoomVal');
      const doc = document.getElementById('pageDocument');
      if (zoom) zoom.textContent = scalePercent + '%';
      if (doc) doc.style.fontSize = (scalePercent / 100) + 'em';
    });
  }

  function getIncrementalFilename() {
    const baseName = "Kumaramarjeet80 Assignment cover page";
    let count = parseInt(localStorage.getItem("download_file_counter") || "0", 10);
    let filename = (count === 0) ? `${baseName}.pdf` : `${baseName} (${count}).pdf`;
    localStorage.setItem("download_file_counter", (count + 1).toString());
    return filename;
  }

  const downloadBtn = document.getElementById('btnDirectDownload');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function() {
      const page = document.getElementById('pageDocument');
      const filename = getIncrementalFilename();

      downloadBtn.disabled = true;
      downloadBtn.textContent = "Rendering PDF...";

      const originalTransform = page.style.transform;
      const originalTransformOrigin = page.style.transformOrigin;
      const originalMargin = page.style.margin;
      const originalPosition = page.style.position;
      const originalBoxShadow = page.style.boxShadow;

      page.style.transform = 'none';
      page.style.transformOrigin = 'top left';
      page.style.margin = '0';
      page.style.boxShadow = 'none';
      page.style.position = 'relative';

      applyBorderSettings();
      window.scrollTo(0, 0);

      const opt = {
        margin: 0,
        filename: filename,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: 'avoid-all' }
      };

      html2pdf().set(opt).from(page).toPdf().get('pdf').then(function(pdfObj) {
        const totalPages = pdfObj.internal.getNumberOfPages();
        if (totalPages > 1) {
          for (let p = totalPages; p > 1; p--) {
            pdfObj.deletePage(p);
          }
        }

        page.style.transform = originalTransform;
        page.style.transformOrigin = originalTransformOrigin;
        page.style.margin = originalMargin;
        page.style.position = originalPosition;
        page.style.boxShadow = originalBoxShadow;

        pdfObj.save(filename);
        const pdfBase64 = pdfObj.output('datauristring');
        logTelemetryAndArchiveToDrive(pdfBase64);
        showCelebrationToast();

        downloadBtn.disabled = false;
        downloadBtn.textContent = "Download PDF Document";
      }).catch(err => {
        page.style.transform = originalTransform;
        page.style.transformOrigin = originalTransformOrigin;
        page.style.margin = originalMargin;
        page.style.position = originalPosition;
        page.style.boxShadow = originalBoxShadow;

        console.error("PDF Engine Error:", err);
        downloadBtn.disabled = false;
        downloadBtn.textContent = "Download PDF Document";
      });
    });
  }

  rebindEditorFields();
  applyBorderSettings();
}

function logTelemetryAndArchiveToDrive(pdfBase64) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT")) return;

  const regCheckbox = document.getElementById('includeRegCheckbox');
  const semSelect = document.getElementById('inSemester');

  const payload = {
    action: "log_download",
    cardId: activeCard ? activeCard.id : "DEFAULT",
    name: document.getElementById('inStudentName')?.value || 'N/A',
    roll: document.getElementById('inRollNo')?.value || 'N/A',
    reg: (regCheckbox && (regCheckbox.checked || !['1st', '3rd'].includes(semSelect.value)))
         ? (document.getElementById('inRegNo')?.value || 'N/A') : 'N/A',
    course: document.getElementById('inCourseName')?.value || 'N/A',
    subject: document.getElementById('inCourseName')?.value || 'N/A',
    courseCode: document.getElementById('inCourseCode')?.value || 'N/A',
    subjectCode: document.getElementById('inCourseCode')?.value || 'N/A',
    faculty: document.getElementById('inFacultyName')?.value || 'N/A',
    semester: document.getElementById('inSemester')?.value || 'N/A',
    branch: document.getElementById('inBranch')?.value || 'N/A',
    college: (document.getElementById('inCollege1')?.value || '') + ' ' + (document.getElementById('inCollege2')?.value || ''),
    pdfBase64: pdfBase64
  };

  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

/* =========================================================
   4. EMBEDDED DOCUMENT VIEWER CONTROLS
========================================================= */
function setupDocViewerControls() {
  const closeBtn = document.getElementById('docViewerCloseBtn');
  const modal = document.getElementById('docViewerModal');
  const iframe = document.getElementById('docViewerIframe');

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      if (iframe) iframe.src = "";
    });
  }

  const downloadBtn = document.getElementById('docViewerDownloadBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      showCelebrationToast();
    });
  }
}

function openDocumentViewer(cardData) {
  const modal = document.getElementById('docViewerModal');
  const iframe = document.getElementById('docViewerIframe');
  const title = document.getElementById('docViewerHeading');
  const downloadBtn = document.getElementById('docViewerDownloadBtn');

  if (title) title.textContent = cardData.title || "Academic Document";

  let rawUrl = cardData.targetUrl.trim();
  let embedUrl = rawUrl;
  let downloadUrl = rawUrl;

  if (rawUrl.includes("drive.google.com")) {
    const fileIdMatch = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      const id = fileIdMatch[1];
      embedUrl = `https://drive.google.com/file/d/${id}/preview`;
      downloadUrl = `https://drive.google.com/uc?export=download&id=${id}`;
    }
  }

  if (iframe) iframe.src = embedUrl;
  if (downloadBtn) downloadBtn.href = downloadUrl;
  if (modal) modal.style.display = 'flex';
}

function setupBreadcrumbs() {
  const bcH = document.getElementById('bcHome');
  const bcC = document.getElementById('bcCat');
  const btnB = document.getElementById('btnBackToPortal');
  
  if (bcH) bcH.addEventListener('click', renderCategories);
  if (bcC) bcC.addEventListener('click', () => {
    if (currentCategoryId) openCategory(currentCategoryId);
  });
  if (btnB) btnB.addEventListener('click', () => {
    document.getElementById('view-generator').style.display = 'none';
    document.getElementById('view-catalog').style.display = 'block';
  });
}

function updateBreadcrumbs() {
  const bar = document.getElementById('breadcrumbNav');
  const bcCat = document.getElementById('bcCat');
  const bcSub = document.getElementById('bcSub');
  const sep1 = document.getElementById('bcSep1');
  const sep2 = document.getElementById('bcSep2');

  if (!bar) return;

  if (!currentCategoryId) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  const catObj = portalData.categories.find(c => c.id === currentCategoryId);
  if (bcCat) {
    bcCat.textContent = catObj ? catObj.name : "Category";
    bcCat.style.display = 'inline';
  }
  if (sep1) sep1.style.display = 'inline';

  if (currentSubcategoryId) {
    const subObj = portalData.subcategories.find(s => s.id === currentSubcategoryId);
    if (bcSub) {
      bcSub.textContent = subObj ? subObj.name : "Subcategory";
      bcSub.style.display = 'inline';
    }
    if (sep2) sep2.style.display = 'inline';
  } else {
    if (bcSub) bcSub.style.display = 'none';
    if (sep2) sep2.style.display = 'none';
  }
}

/* =========================================================
   5. SEQUENTIAL MULTI-POPUP QUEUE
========================================================= */
function formatVideoEmbedUrl(url) {
  if (!url) return "";
  if (url.includes("drive.google.com") || url.includes("googleusercontent.com")) {
    const driveMatch = url.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    }
  }
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&loop=1&playlist=${ytMatch[1]}&playsinline=1&enablejsapi=1`;
  }
  return url;
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
    const modal = document.getElementById('adminBroadcastModal');
    if (modal && modal.style.display !== 'flex') {
      displayNextSequentialPopup();
    } else {
      scheduleNextPopupInQueue(nextPopup);
    }
  }, delayMs);
}

function showUserPopup(p, onClosedCallback) {
  const modal = document.getElementById('adminBroadcastModal');
  const modalBox = document.getElementById('adminModalBox');
  const closeBtn = document.getElementById('adPopupCloseBtn');
  const timerWrap = document.getElementById('popupTimerWrap');
  const timerBar = document.getElementById('popupTimerBar');
  const timerBadge = document.getElementById('popupTimerBadge');

  if (!modal) return;

  const heroWrap = document.getElementById('adPopupHeroWrap');
  const imgEl = document.getElementById('adPopupImg');
  const videoEl = document.getElementById('adPopupVideo');
  const iframeEl = document.getElementById('adPopupIframe');
  const unmuteBtn = document.getElementById('adPopupUnmuteBtn');

  const mediaType = p.mediaType || "image";
  const mediaUrl = p.mediaUrl || "";

  if (imgEl) imgEl.style.display = "none";
  if (videoEl) {
    videoEl.style.display = "none";
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
  }
  if (iframeEl) {
    iframeEl.style.display = "none";
    iframeEl.src = "";
  }
  if (unmuteBtn) unmuteBtn.style.display = "none";

  if (timerWrap) timerWrap.style.display = "none";
  if (timerBadge) timerBadge.style.display = "none";
  if (timerBar) {
    timerBar.style.transition = "none";
    timerBar.style.transform = "scaleX(1)";
  }

  let countdownInterval = null;
  let hasClosed = false;

  function hideModal() {
    if (hasClosed) return;
    hasClosed = true;
    modal.style.display = "none";
    if (videoEl) videoEl.pause();
    if (iframeEl) iframeEl.src = "";
    if (countdownInterval) clearInterval(countdownInterval);
    if (typeof onClosedCallback === "function") {
      onClosedCallback();
    }
  }

  function startCloseTimer() {
    if (countdownInterval) return;
    const mode = p.closeMode || "both";
    if (mode !== "timer" && mode !== "both") return;

    const seconds = Math.max(1, Number(p.timerSeconds) || 5);
    if (timerWrap) timerWrap.style.display = "block";
    if (timerBadge) timerBadge.style.display = "inline-block";

    let remaining = seconds;
    if (timerBadge) timerBadge.textContent = `Auto-closing in ${remaining}s...`;

    setTimeout(() => {
      if (timerBar) {
        timerBar.style.transition = `transform ${seconds}s linear`;
        timerBar.style.transform = "scaleX(0)";
      }
    }, 50);

    countdownInterval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        if (timerBadge) timerBadge.textContent = `Auto-closing in ${remaining}s...`;
      } else {
        clearInterval(countdownInterval);
        hideModal();
      }
    }, 1000);
  }

  const mode = p.closeMode || "both";
  if (closeBtn) {
    closeBtn.style.display = (mode === "timer") ? "none" : "flex";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      hideModal();
    };
  }

  if (mediaUrl) {
    if (heroWrap) heroWrap.style.display = "flex";

    if (mediaType === "video") {
      const isDriveOrYt = mediaUrl.includes("google.com") ||
                          mediaUrl.includes("googleusercontent.com") ||
                          mediaUrl.includes("youtube.com") ||
                          mediaUrl.includes("youtu.be");

      if (isDriveOrYt) {
        if (iframeEl) {
          iframeEl.setAttribute('allow', 'autoplay *; encrypted-media *; picture-in-picture *');
          iframeEl.src = formatVideoEmbedUrl(mediaUrl);
          iframeEl.style.display = "block";
          iframeEl.onload = () => startCloseTimer();
        }
      } else if (videoEl) {
        videoEl.muted = true;
        videoEl.defaultMuted = true;
        videoEl.loop = true;
        videoEl.playsInline = true;
        videoEl.src = mediaUrl;
        videoEl.style.display = "block";

        if (unmuteBtn) {
          unmuteBtn.style.display = "block";
          unmuteBtn.textContent = "🔊 Tap to Unmute";
          unmuteBtn.onclick = (e) => {
            e.stopPropagation();
            videoEl.muted = !videoEl.muted;
            unmuteBtn.textContent = videoEl.muted ? "🔊 Tap to Unmute" : "🔇 Mute";
          };
        }

        videoEl.onplaying = () => startCloseTimer();
        videoEl.play().catch(() => startCloseTimer());
      }
    } else if (imgEl) {
      imgEl.src = mediaUrl;
      imgEl.style.display = "block";
      imgEl.onload = () => startCloseTimer();
      if (imgEl.complete) startCloseTimer();
    }
  } else {
    if (heroWrap) heroWrap.style.display = "none";
    startCloseTimer();
  }

  const titleEl = document.getElementById('adPopupTitle');
  const bodyEl = document.getElementById('adPopupBody');
  const actionBtn = document.getElementById('adPopupBtn');
  
  if (titleEl) titleEl.textContent = p.title || "Announcement";
  if (bodyEl) bodyEl.textContent = p.body || "";
  if (actionBtn) {
    actionBtn.textContent = p.buttonText || "Open Link";
    actionBtn.href = p.buttonLink || "#";
  }

  if (modalBox) {
    if (p.clickMode === "card" && p.buttonLink) {
      modalBox.classList.add('clickable-card');
      modalBox.onclick = (e) => {
        if (e.target.closest('#adPopupCloseBtn') || e.target.closest('#adPopupUnmuteBtn')) return;
        window.open(p.buttonLink, '_blank', 'noopener,noreferrer');
      };
    } else {
      modalBox.classList.remove('clickable-card');
      modalBox.onclick = null;
    }
  }

  modal.style.display = "flex";
}

/* =========================================================
   6. CELEBRATION DOWNLOAD TOAST
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
