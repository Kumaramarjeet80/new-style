// ================= CONFIGURATION =================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyoY0AwpSTsOQ7ER8_wY-x_zEEnu41K1TRI6jHV4ylIQGVoWcQ_D8ebCfiuoTv4rPgS/exec";
const CACHE_KEY = "gecm_portal_catalog_cache";

// Global Portal State
let portalData = {
  categories: [],
  subcategories: [],
  cards: [],
  popups: [],
  activeLive: null
};
let currentCategoryId = null;
let currentSubcategoryId = null;
let activeCard = null;

let defaultTemplateHtml = "";

// Multi-Popup Queue Engine State (Latest First)
let activePopupQueue = [];
let currentPopupIndex = 0;
let popupCycleTimer = null;

// Safe Startup Launcher (Handles DOM readyState race conditions)
function startApp() {
  const dynamicWrap = document.getElementById('dynamicPageContent');
  if (dynamicWrap) {
    defaultTemplateHtml = dynamicWrap.innerHTML;
  }

  if (document.body && document.body.classList.contains('user-body')) {
    initUserPortal();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

/* =========================================================
   1. USER PORTAL ROUTING & INSTANT LOCALSTORAGE CACHING
========================================================= */
function initUserPortal() {
  initPdfGeneratorEngine();
  setupBreadcrumbs();
  setupDocViewerControls();
  setupCelebrationToastControls();
  setupLiveViewerControls();
  
  // 1. Instant Cache Hydration or Instant Fallback
  const hasLoadedCache = loadPortalDataFromCache();
  if (!hasLoadedCache) {
    renderFallbackCategories();
  }
  
  // 2. Background Revalidation
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
        updateLiveBannerUI(portalData.activeLive);
        if (portalData.popups && portalData.popups.length > 0) {
          initSequentialPopupQueue(portalData.popups);
        }
        return true;
      }
    }
  } catch (err) {
    console.warn("Local storage cache hydration warning:", err);
  }
  return false;
}

function fetchPortalCatalog(onCompleteCallback) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT")) {
    if (portalData.categories.length === 0) renderFallbackCategories();
    if (typeof onCompleteCallback === "function") onCompleteCallback();
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  fetch(`${APPS_SCRIPT_URL}?action=get_portal_data`, { signal: controller.signal })
    .then(res => res.json())
    .then(data => {
      clearTimeout(timeoutId);
      if (data && data.status === "success" && Array.isArray(data.categories) && data.categories.length > 0) {
        const freshData = {
          categories: data.categories || [],
          subcategories: data.subcategories || [],
          cards: data.cards || [],
          popups: data.popups || (data.popup ? [data.popup] : []),
          activeLive: data.activeLive || null
        };

        const hasChanged = JSON.stringify(freshData) !== JSON.stringify(portalData);
        
        if (hasChanged || portalData.categories.length === 0) {
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

          updateLiveBannerUI(portalData.activeLive);

          if (portalData.popups && portalData.popups.length > 0 && !popupCycleTimer) {
            initSequentialPopupQueue(portalData.popups);
          }
        } else {
          updateLiveBannerUI(portalData.activeLive);
        }
      } else if (portalData.categories.length === 0) {
        renderFallbackCategories();
      }
      if (typeof onCompleteCallback === "function") onCompleteCallback();
    })
    .catch(err => {
      clearTimeout(timeoutId);
      console.warn("Portal Data Fetch Notice:", err.message);
      if (portalData.categories.length === 0) {
        renderFallbackCategories();
      }
      if (typeof onCompleteCallback === "function") onCompleteCallback();
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

  const viewCatalog = document.getElementById('view-catalog');
  const viewGenerator = document.getElementById('view-generator');
  const viewLive = document.getElementById('view-live');
  if (viewCatalog) viewCatalog.style.display = 'block';
  if (viewGenerator) viewGenerator.style.display = 'none';
  if (viewLive) viewLive.style.display = 'none';

  const stageCat = document.getElementById('stageCategories');
  const stageSub = document.getElementById('stageSubcategories');
  const stageCards = document.getElementById('stageCards');
  if (stageCat) stageCat.style.display = 'block';
  if (stageSub) stageSub.style.display = 'none';
  if (stageCards) stageCards.style.display = 'none';

  updateBreadcrumbs();

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
    const timeHtml = cat.createdAt ? `<div class="card-timestamp-badge">🕒 Published: ${cat.createdAt}</div>` : ``;

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

  const stageCat = document.getElementById('stageCategories');
  const stageSub = document.getElementById('stageSubcategories');
  const stageCards = document.getElementById('stageCards');
  if (stageCat) stageCat.style.display = 'none';
  if (stageSub) stageSub.style.display = 'block';
  if (stageCards) stageCards.style.display = 'none';

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
    const timeHtml = sub.createdAt ? `<div class="card-timestamp-badge">🕒 Added: ${sub.createdAt}</div>` : ``;

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

  const stageCat = document.getElementById('stageCategories');
  const stageSub = document.getElementById('stageSubcategories');
  const stageCards = document.getElementById('stageCards');
  if (stageCat) stageCat.style.display = 'none';
  if (stageSub) stageSub.style.display = 'none';
  if (stageCards) stageCards.style.display = 'block';

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
      <div class="card-thumbnail-wrap">${thumbHtml}</div>
      <div class="card-body">
        <div class="card-title">${cardData.title}</div>
        <div class="card-desc">${cardData.description || "Academic resource ready for access."}</div>
        ${timeHtml}
        <button class="card-cta-btn" type="button">${btnLabel}</button>
      </div>
    `;

    const actionBtn = cardEl.querySelector('.card-cta-btn');
    if (actionBtn) {
      actionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        launchCardAction(cardData);
      });
    }

    grid.appendChild(cardEl);
  });
}

// Action Launcher
function launchCardAction(cardData) {
  const hasTarget = Boolean(cardData.targetUrl && String(cardData.targetUrl).trim().length > 5);
  const isDocumentLink = (cardData.actionType === "link" || hasTarget);

  if (isDocumentLink && hasTarget) {
    openDocumentViewer(cardData);
    return;
  }

  activeCard = cardData;
  const viewCatalog = document.getElementById('view-catalog');
  const viewGenerator = document.getElementById('view-generator');
  const viewLive = document.getElementById('view-live');
  const activeCardLabel = document.getElementById('activeCardLabel');

  if (viewCatalog) viewCatalog.style.display = 'none';
  if (viewLive) viewLive.style.display = 'none';
  if (viewGenerator) viewGenerator.style.display = 'block';
  if (activeCardLabel) activeCardLabel.textContent = cardData.title;

  const dynamicWrap = document.getElementById('dynamicPageContent');
  if (dynamicWrap) {
    if (cardData.templateHtml && typeof cardData.templateHtml === 'string' && cardData.templateHtml.trim().length > 20) {
      dynamicWrap.innerHTML = cardData.templateHtml.trim();
    } else {
      dynamicWrap.innerHTML = defaultTemplateHtml;
    }
  }

  rebindEditorFields();
  if (dynamicWrap) buildUniversalDynamicFields(dynamicWrap);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================
   2. UNIVERSAL DYNAMIC FIELDS FOR ANY TEMPLATE
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
  if (!dynamicFieldsWrap || !container) return;
  
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
    if (inputEl) {
      inputEl.addEventListener('input', () => {
        el.textContent = inputEl.value;
      });
    }

    customTemplateDynamicBindings.push({ input: dynamicInputId, output: elId });
  });
}

function syncAllText() {
  bindings.forEach(b => {
    const inEl = document.getElementById(b.input);
    const outEl = document.getElementById(b.output);
    if (inEl && outEl) outEl.textContent = inEl.value;
  });

  customTemplateDynamicBindings.forEach(b => {
    const inEl = document.getElementById(b.input);
    const outEl = document.getElementById(b.output);
    if (inEl && outEl) outEl.textContent = inEl.value;
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

/* =========================================================
   3. UNTOUCHED PDF ENGINE WITH AUTO-DRIVE ARCHIVAL[cite: 1]
========================================================= */
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
    if (inEl) inEl.addEventListener('input', syncAllText);
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
      const page = document.getElementById('pageDocument');
      if (page) page.style.fontFamily = e.target.value;
    });
  }

  const sizeRange = document.getElementById('sizeRange');
  if (sizeRange) {
    sizeRange.addEventListener('input', function(e) {
      const scalePercent = e.target.value;
      const zoomVal = document.getElementById('zoomVal');
      const page = document.getElementById('pageDocument');
      if (zoomVal) zoomVal.textContent = scalePercent + '%';
      if (page) page.style.fontSize = (scalePercent / 100) + 'em';
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
      if (!page) return;
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
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: 'avoid-all' }
      };

      if (typeof html2pdf !== "function") {
        alert("PDF library is still loading. Please try again in a moment.");
        downloadBtn.disabled = false;
        downloadBtn.textContent = "Download PDF Document";
        return;
      }

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
    reg: (regCheckbox && (regCheckbox.checked || !['1st', '3rd'].includes(semSelect?.value)))
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
   4. STABLE WEBRTC VIEWER ENGINE WITH ZERO-DRIFT AUTO-SYNC
========================================================= */
const BROADCAST_HOST_ID = "gecm-live-host";
let viewerPeerInstance = null;
let currentLiveCall = null;
let livePollingInterval = null;
let autoReconnectInterval = null;
let isReconnecting = false;

// Extended STUN configuration from reference file for full NAT traversal
const ICE_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.services.mozilla.com' }
    ]
  }
};

function updateLiveBannerUI(activeLive) {
  const banner = document.getElementById('liveBroadcastBanner');
  if (!banner) return;

  if (activeLive && (activeLive.isLive === true || activeLive.isScheduled === true)) {
    const topicEl = document.getElementById('liveBannerTopic');
    const descEl = document.getElementById('liveBannerDesc');
    const timeEl = document.getElementById('liveBannerTime');
    const logoImg = document.getElementById('liveBannerLogo');
    const placeholder = document.getElementById('liveBannerPlaceholder');
    const pill = document.getElementById('liveStatusPill');
    const pillText = document.getElementById('liveStatusPillText');

    if (topicEl) topicEl.textContent = activeLive.topic || "GEC Munger Live Broadcast";
    if (descEl) descEl.textContent = activeLive.description || "Academic lecture session.";
    if (timeEl) timeEl.textContent = `Started: ${activeLive.startedAt || activeLive.timestamp || 'Today'}`;

    if (pillText) {
      if (activeLive.isLive) {
        pillText.textContent = "LIVE NOW";
        if (pill) pill.className = "live-pulse-badge";
      } else {
        pillText.textContent = "SCHEDULED / STARTING SOON";
        if (pill) pill.className = "live-pulse-badge";
      }
    }

    if (activeLive.thumbnailUrl && activeLive.thumbnailUrl.trim().length > 5) {
      if (logoImg) {
        logoImg.src = activeLive.thumbnailUrl;
        logoImg.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
    } else {
      if (logoImg) logoImg.style.display = 'none';
      if (placeholder) placeholder.style.display = 'block';
    }

    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function updateAudioButtonStates(isMuted) {
  const audioIcon = document.getElementById('liveAudioIcon');
  const audioLabel = document.getElementById('liveAudioLabel');
  const fsIcon = document.getElementById('fsLiveAudioIcon');
  const fsLabel = document.getElementById('fsLiveAudioLabel');

  const iconText = isMuted ? "🔊" : "🔇";
  const labelText = isMuted ? "Unmute Audio" : "Mute Audio";

  if (audioIcon) audioIcon.textContent = iconText;
  if (audioLabel) audioLabel.textContent = labelText;
  if (fsIcon) fsIcon.textContent = iconText;
  if (fsLabel) fsLabel.textContent = labelText;
}

function toggleLiveAudio() {
  const videoEl = document.getElementById('liveViewerVideo');
  if (!videoEl) return;
  videoEl.muted = !videoEl.muted;
  updateAudioButtonStates(videoEl.muted);
}

function setupLiveViewerControls() {
  const btnWatchLive = document.getElementById('btnWatchLive');
  const btnBackFromLive = document.getElementById('btnBackFromLive');
  const btnAudioToggle = document.getElementById('btnLiveAudioToggle');
  const btnFsAudioToggle = document.getElementById('btnFsLiveAudioToggle');
  const btnFullscreen = document.getElementById('btnLiveFullscreen');
  const btnExitFullscreen = document.getElementById('btnLiveExitFullscreen');
  const btnFsExitFullscreen = document.getElementById('btnFsLiveExitFullscreen');
  const btnRefreshLive = document.getElementById('btnRefreshLiveStatus');
  const btnPlayerReconnect = document.getElementById('btnLivePlayerReconnect');
  const btnWaitingReconnect = document.getElementById('btnPlayerWaitingReconnect');
  const videoContainer = document.getElementById('liveVideoContainer');

  if (btnWatchLive) btnWatchLive.addEventListener('click', () => openLiveStreamWatchRoom());

  if (btnRefreshLive) {
    btnRefreshLive.addEventListener('click', () => {
      btnRefreshLive.disabled = true;
      btnRefreshLive.innerHTML = `<span>⏳</span><span>Checking...</span>`;
      fetchPortalCatalog(() => {
        btnRefreshLive.disabled = false;
        btnRefreshLive.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg><span>Refresh</span>`;
      });
    });
  }

  if (btnBackFromLive) btnBackFromLive.addEventListener('click', () => closeLiveStreamWatchRoom());

  if (btnAudioToggle) btnAudioToggle.addEventListener('click', toggleLiveAudio);
  if (btnFsAudioToggle) btnFsAudioToggle.addEventListener('click', toggleLiveAudio);

  if (btnPlayerReconnect) btnPlayerReconnect.addEventListener('click', () => openLiveStreamWatchRoom());
  if (btnWaitingReconnect) btnWaitingReconnect.addEventListener('click', () => openLiveStreamWatchRoom());

  if (btnFullscreen && videoContainer) {
    btnFullscreen.addEventListener('click', () => {
      if (videoContainer.requestFullscreen) {
        videoContainer.requestFullscreen();
      } else if (videoContainer.webkitRequestFullscreen) {
        videoContainer.webkitRequestFullscreen();
      }
    });
  }

  function exitFullscreenHandler() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }

  if (btnExitFullscreen) btnExitFullscreen.addEventListener('click', exitFullscreenHandler);
  if (btnFsExitFullscreen) btnFsExitFullscreen.addEventListener('click', exitFullscreenHandler);

  document.addEventListener('fullscreenchange', () => {
    const isFull = Boolean(document.fullscreenElement);
    if (btnFullscreen) btnFullscreen.style.display = isFull ? 'none' : 'inline-flex';
    if (btnExitFullscreen) btnExitFullscreen.style.display = isFull ? 'inline-flex' : 'none';
  });
}

function openLiveStreamWatchRoom() {
  const activeLive = portalData.activeLive;
  if (!activeLive) {
    alert("No active live stream announcement found.");
    return;
  }

  const viewCatalog = document.getElementById('view-catalog');
  const viewGenerator = document.getElementById('view-generator');
  const viewLive = document.getElementById('view-live');

  if (viewCatalog) viewCatalog.style.display = 'none';
  if (viewGenerator) viewGenerator.style.display = 'none';
  if (viewLive) viewLive.style.display = 'block';

  const topicEl = document.getElementById('liveWatchTopic');
  const descEl = document.getElementById('liveWatchDesc');
  const timeEl = document.getElementById('liveWatchTimestamp');
  const statusPill = document.getElementById('livePlayerStatusPill');

  if (topicEl) topicEl.textContent = activeLive.topic || "GEC Munger Live Broadcast";
  if (descEl) descEl.textContent = activeLive.description || "Official academic lecture session.";
  if (timeEl) timeEl.textContent = `🕒 Stream Started: ${activeLive.startedAt || activeLive.timestamp || 'Today'}`;

  const waitingOverlay = document.getElementById('liveWaitingOverlay');
  const connectingOverlay = document.getElementById('liveConnectingOverlay');

  if (!activeLive.isLive) {
    if (statusPill) statusPill.textContent = "⏳ SESSION SCHEDULED - NOT LIVE YET";
    if (waitingOverlay) waitingOverlay.style.display = 'flex';
    if (connectingOverlay) connectingOverlay.style.display = 'none';
    startLiveWaitingAutoPoller();
  } else {
    if (statusPill) statusPill.textContent = "🔴 BROADCAST IN PROGRESS";
    if (waitingOverlay) waitingOverlay.style.display = 'none';
    if (connectingOverlay) connectingOverlay.style.display = 'flex';
    stopLiveWaitingAutoPoller();
    connectToLiveBroadcast(activeLive.peerId || BROADCAST_HOST_ID);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startLiveWaitingAutoPoller() {
  stopLiveWaitingAutoPoller();
  livePollingInterval = setInterval(() => {
    const viewLive = document.getElementById('view-live');
    if (!viewLive || viewLive.style.display === 'none') {
      stopLiveWaitingAutoPoller();
      return;
    }

    fetch(`${APPS_SCRIPT_URL}?action=get_portal_data`)
      .then(res => res.json())
      .then(data => {
        if (data && data.status === "success" && data.activeLive) {
          portalData.activeLive = data.activeLive;
          if (data.activeLive.isLive) {
            stopLiveWaitingAutoPoller();
            openLiveStreamWatchRoom();
          }
        }
      })
      .catch(() => {});
  }, 4000);
}

function stopLiveWaitingAutoPoller() {
  if (livePollingInterval) {
    clearInterval(livePollingInterval);
    livePollingInterval = null;
  }
}

// Low-Latency PeerJS Handshake & Buffer Purge
function connectToLiveBroadcast(hostPeerId) {
  const connectingOverlay = document.getElementById('liveConnectingOverlay');
  const connectingText = document.getElementById('liveConnectingText');
  const waitingOverlay = document.getElementById('liveWaitingOverlay');
  const videoEl = document.getElementById('liveViewerVideo');

  if (connectingOverlay) connectingOverlay.style.display = 'flex';
  if (connectingText) connectingText.textContent = "Connecting to signaling server...";
  if (waitingOverlay) waitingOverlay.style.display = 'none';

  if (viewerPeerInstance) {
    try { viewerPeerInstance.destroy(); } catch (e) {}
    viewerPeerInstance = null;
  }

  viewerPeerInstance = new Peer(ICE_CONFIG);

  viewerPeerInstance.on('open', (myViewerId) => {
    if (connectingText) connectingText.textContent = "Connecting to broadcaster...";

    // 1. Establish Data Channel connection to the broadcaster
    const conn = viewerPeerInstance.connect(hostPeerId, { reliable: true });

    conn.on('open', () => {
      if (connectingText) connectingText.textContent = "Broadcaster found! Requesting video feed...";
      conn.send('REQUEST_STREAM');
    });

    conn.on('error', () => {
      triggerStreamAutoReconnect("❌ Broadcaster is currently offline. Retrying automatically...");
    });

    // 2. Accept incoming media stream from broadcaster
    viewerPeerInstance.on('call', (call) => {
      currentLiveCall = call;
      call.answer();

      call.on('stream', (remoteStream) => {
        if (autoReconnectInterval) {
          clearInterval(autoReconnectInterval);
          autoReconnectInterval = null;
        }
        isReconnecting = false;

        if (videoEl) {
          videoEl.srcObject = remoteStream;
          videoEl.muted = false;
          videoEl.setAttribute('playsinline', '');
          videoEl.setAttribute('autoplay', '');

          const playPromise = videoEl.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              if (connectingOverlay) connectingOverlay.style.display = 'none';
              updateAudioButtonStates(false);
            }).catch(() => {
              videoEl.muted = true;
              videoEl.play();
              if (connectingOverlay) connectingOverlay.style.display = 'none';
              updateAudioButtonStates(true);
            });
          }

          // Real-Time Drift Killer: Snaps video directly to the live edge if lag > 0.4s
          if (window._liveDriftTimer) clearInterval(window._liveDriftTimer);
          window._liveDriftTimer = setInterval(() => {
            if (videoEl && !videoEl.paused && videoEl.buffered.length > 0) {
              const liveEdge = videoEl.buffered.end(videoEl.buffered.length - 1);
              const drift = liveEdge - videoEl.currentTime;
              if (drift > 0.4) {
                videoEl.currentTime = liveEdge - 0.05;
              }
            }
          }, 1500);
        }
      });

      // Monitor WebRTC ICE connection for drops and auto-reconnect
      if (call.peerConnection) {
        call.peerConnection.oniceconnectionstatechange = () => {
          const state = call.peerConnection.iceConnectionState;
          if (state === 'disconnected' || state === 'failed') {
            console.warn("ICE connection disconnected/failed. Auto-reconnecting...");
            triggerStreamAutoReconnect("Connection lost. Reconnecting live feed...");
          }
        };
      }

      call.on('close', () => {
        triggerStreamAutoReconnect("Live stream ended or temporarily interrupted. Re-checking...");
      });

      call.on('error', (err) => {
        console.error("Peer call error:", err);
        triggerStreamAutoReconnect("Stream network issue. Auto-reconnecting...");
      });
    });

    // Fallback timeout check if broadcaster stream doesn't arrive
    setTimeout(() => {
      if (videoEl && !videoEl.srcObject && connectingOverlay && connectingOverlay.style.display !== 'none') {
        triggerStreamAutoReconnect("Re-establishing connection with broadcaster...");
      }
    }, 7000);
  });

  viewerPeerInstance.on('disconnected', () => {
    try { viewerPeerInstance.reconnect(); } catch (e) {}
  });

  viewerPeerInstance.on('error', (err) => {
    console.error("PeerJS client error:", err);
    triggerStreamAutoReconnect("Signal error. Reconnecting to live studio...");
  });
}

// Auto-Reconnect Routine (Runs seamlessly during live interruptions)
function triggerStreamAutoReconnect(statusMsg) {
  const connectingOverlay = document.getElementById('liveConnectingOverlay');
  const connectingText = document.getElementById('liveConnectingText');
  if (connectingOverlay) connectingOverlay.style.display = 'flex';
  if (connectingText) connectingText.textContent = statusMsg;

  if (isReconnecting) return;
  isReconnecting = true;

  if (autoReconnectInterval) clearInterval(autoReconnectInterval);
  autoReconnectInterval = setInterval(() => {
    const viewLive = document.getElementById('view-live');
    if (!viewLive || viewLive.style.display === 'none') {
      clearInterval(autoReconnectInterval);
      autoReconnectInterval = null;
      isReconnecting = false;
      return;
    }

    console.log("Auto-reconnect ping triggered...");
    fetch(`${APPS_SCRIPT_URL}?action=get_portal_data`)
      .then(res => res.json())
      .then(data => {
        if (data && data.status === "success" && data.activeLive) {
          portalData.activeLive = data.activeLive;
          if (data.activeLive.isLive) {
            connectToLiveBroadcast(data.activeLive.peerId || BROADCAST_HOST_ID);
          }
        }
      })
      .catch(() => {});
  }, 3500);
}

function closeLiveStreamWatchRoom() {
  stopLiveWaitingAutoPoller();
  if (window._liveDriftTimer) {
    clearInterval(window._liveDriftTimer);
    window._liveDriftTimer = null;
  }
  if (autoReconnectInterval) {
    clearInterval(autoReconnectInterval);
    autoReconnectInterval = null;
  }
  isReconnecting = false;

  const videoEl = document.getElementById('liveViewerVideo');
  if (videoEl) {
    videoEl.pause();
    videoEl.srcObject = null;
  }

  if (currentLiveCall) {
    try { currentLiveCall.close(); } catch (e) {}
    currentLiveCall = null;
  }

  if (viewerPeerInstance) {
    try { viewerPeerInstance.destroy(); } catch (e) {}
    viewerPeerInstance = null;
  }

  const viewLive = document.getElementById('view-live');
  const viewCatalog = document.getElementById('view-catalog');

  if (viewLive) viewLive.style.display = 'none';
  if (viewCatalog) viewCatalog.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =========================================================
   5. EMBEDDED DOCUMENT / PDF VIEWER CONTROLS
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

  if (!modal || !iframe || !title || !downloadBtn) return;

  title.textContent = cardData.title || "Academic Document";

  let rawUrl = (cardData.targetUrl || "").trim();
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

  iframe.src = embedUrl;
  downloadBtn.href = downloadUrl;
  modal.style.display = 'flex';
}

function setupBreadcrumbs() {
  const bcHome = document.getElementById('bcHome');
  const bcCat = document.getElementById('bcCat');
  const btnBack = document.getElementById('btnBackToPortal');

  if (bcHome) bcHome.addEventListener('click', renderCategories);
  if (bcCat) {
    bcCat.addEventListener('click', () => {
      if (currentCategoryId) openCategory(currentCategoryId);
    });
  }
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      const viewGen = document.getElementById('view-generator');
      const viewCat = document.getElementById('view-catalog');
      const viewLive = document.getElementById('view-live');
      if (viewGen) viewGen.style.display = 'none';
      if (viewLive) viewLive.style.display = 'none';
      if (viewCat) viewCat.style.display = 'block';
    });
  }
}

function updateBreadcrumbs() {
  const bar = document.getElementById('breadcrumbNav');
  const bcCat = document.getElementById('bcCat');
  const bcSub = document.getElementById('bcSub');
  const sep1 = document.getElementById('bcSep1');
  const sep2 = document.getElementById('bcSep2');

  if (!bar || !bcCat || !bcSub) return;

  if (!currentCategoryId) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  const catObj = portalData.categories.find(c => c.id === currentCategoryId);
  bcCat.textContent = catObj ? catObj.name : "Category";
  bcCat.style.display = 'inline';
  if (sep1) sep1.style.display = 'inline';

  if (currentSubcategoryId) {
    const subObj = portalData.subcategories.find(s => s.id === currentSubcategoryId);
    bcSub.textContent = subObj ? subObj.name : "Subcategory";
    bcSub.style.display = 'inline';
    if (sep2) sep2.style.display = 'inline';
  } else {
    bcSub.style.display = 'none';
    if (sep2) sep2.style.display = 'none';
  }
}

/* =========================================================
   6. SEQUENTIAL MULTI-POPUP QUEUE (LATEST FIRST)
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

  const heroWrap = document.getElementById('adPopupHeroWrap');
  const imgEl = document.getElementById('adPopupImg');
  const videoEl = document.getElementById('adPopupVideo');
  const iframeEl = document.getElementById('adPopupIframe');
  const unmuteBtn = document.getElementById('adPopupUnmuteBtn');

  if (!modal || !modalBox) return;

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
    if (timerBadge) {
      timerBadge.style.display = "inline-block";
      timerBadge.textContent = `Auto-closing in ${seconds}s...`;
    }

    let remaining = seconds;
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

  if (mediaUrl && heroWrap) {
    heroWrap.style.display = "flex";

    if (mediaType === "video") {
      const isDriveOrYt = mediaUrl.includes("google.com") || 
                          mediaUrl.includes("googleusercontent.com") || 
                          mediaUrl.includes("youtube.com") || 
                          mediaUrl.includes("youtu.be");

      if (isDriveOrYt && iframeEl) {
        iframeEl.setAttribute('allow', 'autoplay *; encrypted-media *; picture-in-picture *');
        iframeEl.src = formatVideoEmbedUrl(mediaUrl);
        iframeEl.style.display = "block";
        iframeEl.onload = () => startCloseTimer();
      } else if (videoEl) {
        videoEl.muted = true;
        videoEl.defaultMuted = true;
        videoEl.loop = true;
        videoEl.playsInline = true;
        videoEl.setAttribute('muted', '');
        videoEl.setAttribute('autoplay', '');
        videoEl.setAttribute('playsinline', '');
        videoEl.setAttribute('loop', '');
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
        const playPromise = videoEl.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => startCloseTimer());
        }
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

  modal.style.display = "flex";
}

/* =========================================================
   7. ANIMATED CELEBRATION DOWNLOAD TOAST
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
