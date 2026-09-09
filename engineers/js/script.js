// ================= CONFIGURATION =================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwqimz0gi8E6LFEG7VhUjnVr0qZ2QUlIpTUQmMwOQxDmVAiW59eyVBsQOQRnnANRBiX/exec"; //[cite: 1]
const CACHE_KEY = "gecm_portal_catalog_cache";

// Global Portal State
let portalData = {
  categories: [],
  subcategories: [],
  cards: [],
  popups: []
}; //[cite: 1]
let currentCategoryId = null; //[cite: 1]
let currentSubcategoryId = null; //[cite: 1]
let activeCard = null; //[cite: 1]

let defaultTemplateHtml = ""; //[cite: 1]

// Multi-Popup Queue Engine State (Latest First)
let activePopupQueue = [];
let currentPopupIndex = 0;
let popupCycleTimer = null;

window.addEventListener('DOMContentLoaded', () => {
  const dynamicWrap = document.getElementById('dynamicPageContent'); //[cite: 1]
  if (dynamicWrap) {
    defaultTemplateHtml = dynamicWrap.innerHTML; //[cite: 1]
  }

  if (document.body.classList.contains('user-body')) {
    initUserPortal(); //[cite: 1]
  }
}); //[cite: 1]

/* =========================================================
   1. USER PORTAL ROUTING & INSTANT LOCALSTORAGE CACHING
========================================================= */
function initUserPortal() {
  initPdfGeneratorEngine(); //[cite: 1]
  setupBreadcrumbs(); //[cite: 1]
  setupDocViewerControls(); //[cite: 1]
  setupCelebrationToastControls();
  
  // 1. Instant Cache Hydration
  loadPortalDataFromCache();
  
  // 2. Background Revalidation
  fetchPortalCatalog(); //[cite: 1]
}

function loadPortalDataFromCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.categories) && parsed.categories.length > 0) {
        portalData = parsed;
        renderCategories();
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
    renderFallbackCategories(); //[cite: 1]
    return; //[cite: 1]
  }

  fetch(`${APPS_SCRIPT_URL}?action=get_portal_data`) //[cite: 1]
    .then(res => res.json()) //[cite: 1]
    .then(data => {
      if (data.status === "success") { //[cite: 1]
        const freshData = {
          categories: data.categories || [], //[cite: 1]
          subcategories: data.subcategories || [], //[cite: 1]
          cards: data.cards || [], //[cite: 1]
          popups: data.popups || (data.popup ? [data.popup] : [])
        };

        const hasChanged = JSON.stringify(freshData) !== JSON.stringify(portalData);
        
        if (hasChanged || portalData.categories.length === 0) {
          portalData = freshData;
          localStorage.setItem(CACHE_KEY, JSON.stringify(freshData));
          
          // Re-render only if current stage allows or on first load
          if (!currentCategoryId) {
            renderCategories();
          } else if (currentCategoryId && !currentSubcategoryId) {
            openCategory(currentCategoryId);
          } else if (currentSubcategoryId) {
            openSubcategory(currentSubcategoryId);
          }

          if (portalData.popups && portalData.popups.length > 0 && !popupCycleTimer) {
            initSequentialPopupQueue(portalData.popups);
          }
        }
      } else if (portalData.categories.length === 0) {
        renderFallbackCategories(); //[cite: 1]
      }
    })
    .catch(err => {
      console.error("Portal Data Fetch Error:", err); //[cite: 1]
      if (portalData.categories.length === 0) {
        renderFallbackCategories(); //[cite: 1]
      }
    });
}

function renderFallbackCategories() {
  portalData.categories = [
    { id: "CAT-DEFAULT", name: "Assignment Cover Pages", description: "Official B.Tech assignment covers and formats", icon: "📄", createdAt: "Academic Year 2026-27" } //[cite: 1]
  ]; //[cite: 1]
  portalData.subcategories = [
    { id: "SUB-DEFAULT", categoryId: "CAT-DEFAULT", name: "Standard Academic Work", description: "Regular course assignments", createdAt: "Academic Year 2026-27" } //[cite: 1]
  ]; //[cite: 1]
  portalData.cards = [
    { 
      id: "CRD-DEFAULT", 
      subcategoryId: "SUB-DEFAULT", 
      title: "GEC Munger Official Assignment Sheet", 
      description: "Default academic cover page with dual university logo stamps.", //[cite: 1]
      thumbnailUrl: "https://lh3.googleusercontent.com/d/1Pg1tZ-1Uodqzi5iciN61hq8jMooT0eo2", //[cite: 1]
      buttonText: "Customize Cover Page", //[cite: 1]
      templateHtml: "", //[cite: 1]
      actionType: "generator", //[cite: 1]
      targetUrl: "", //[cite: 1]
      createdAt: "Academic Year 2026-27"
    }
  ]; //[cite: 1]
  renderCategories(); //[cite: 1]
}

// Stage A: Render Categories with Timestamps
function renderCategories() {
  currentCategoryId = null; //[cite: 1]
  currentSubcategoryId = null; //[cite: 1]
  activeCard = null; //[cite: 1]

  document.getElementById('view-catalog').style.display = 'block'; //[cite: 1]
  document.getElementById('view-generator').style.display = 'none'; //[cite: 1]

  document.getElementById('stageCategories').style.display = 'block'; //[cite: 1]
  document.getElementById('stageSubcategories').style.display = 'none'; //[cite: 1]
  document.getElementById('stageCards').style.display = 'none'; //[cite: 1]

  updateBreadcrumbs(); //[cite: 1]

  const grid = document.getElementById('categoryGrid'); //[cite: 1]
  grid.innerHTML = ""; //[cite: 1]

  if (portalData.categories.length === 0) { //[cite: 1]
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px;">No categories published yet.</div>`; //[cite: 1]
    return; //[cite: 1]
  }

  portalData.categories.forEach(cat => { //[cite: 1]
    const card = document.createElement('div'); //[cite: 1]
    card.className = "category-card"; //[cite: 1]
    
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
    `; //[cite: 1]
    card.addEventListener('click', () => openCategory(cat.id)); //[cite: 1]
    grid.appendChild(card); //[cite: 1]
  });
}

// Stage B: Open Subcategories with Timestamps
function openCategory(catId) {
  currentCategoryId = catId; //[cite: 1]
  const filteredSubs = portalData.subcategories.filter(s => s.categoryId === catId); //[cite: 1]

  document.getElementById('stageCategories').style.display = 'none'; //[cite: 1]
  document.getElementById('stageSubcategories').style.display = 'block'; //[cite: 1]
  document.getElementById('stageCards').style.display = 'none'; //[cite: 1]

  updateBreadcrumbs(); //[cite: 1]

  const grid = document.getElementById('subcategoryGrid'); //[cite: 1]
  grid.innerHTML = ""; //[cite: 1]

  if (filteredSubs.length === 0) { //[cite: 1]
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px;">
        No subcategories found in this category.
        <br><button class="btn-back-to-catalog" style="margin: 16px auto;" onclick="renderCategories()">← Go Back</button>
      </div>`; //[cite: 1]
    return; //[cite: 1]
  }

  filteredSubs.forEach(sub => { //[cite: 1]
    const card = document.createElement('div'); //[cite: 1]
    card.className = "category-card"; //[cite: 1]
    
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
    `; //[cite: 1]
    card.addEventListener('click', () => openSubcategory(sub.id)); //[cite: 1]
    grid.appendChild(card); //[cite: 1]
  });
}

// Stage C: Open Resource Cards with Timestamps
function openSubcategory(subId) {
  currentSubcategoryId = subId; //[cite: 1]
  const filteredCards = portalData.cards.filter(c => c.subcategoryId === subId); //[cite: 1]

  document.getElementById('stageCategories').style.display = 'none'; //[cite: 1]
  document.getElementById('stageSubcategories').style.display = 'none'; //[cite: 1]
  document.getElementById('stageCards').style.display = 'block'; //[cite: 1]

  updateBreadcrumbs(); //[cite: 1]

  const grid = document.getElementById('cardGrid'); //[cite: 1]
  grid.innerHTML = ""; //[cite: 1]

  if (filteredCards.length === 0) { //[cite: 1]
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px;">
        No cards published under this section yet.
        <br><button class="btn-back-to-catalog" style="margin: 16px auto;" onclick="openCategory('${currentCategoryId}')">← Go Back</button>
      </div>`; //[cite: 1]
    return; //[cite: 1]
  }

  filteredCards.forEach(cardData => { //[cite: 1]
    const cardEl = document.createElement('div'); //[cite: 1]
    cardEl.className = "resource-card"; //[cite: 1]
    
    const thumbHtml = cardData.thumbnailUrl //[cite: 1]
      ? `<img src="${cardData.thumbnailUrl}" class="card-thumbnail" alt="${cardData.title}">` //[cite: 1]
      : `<div class="card-thumbnail-placeholder">📄</div>`; //[cite: 1]

    const hasTarget = Boolean(cardData.targetUrl && String(cardData.targetUrl).trim().length > 5); //[cite: 1]
    const isDoc = (cardData.actionType === "link" || hasTarget); //[cite: 1]
    const defaultLabel = isDoc ? "View / Read Document" : "Customize Cover Page"; //[cite: 1]
    const btnLabel = (cardData.buttonText && cardData.buttonText.trim().length > 0) ? cardData.buttonText : defaultLabel; //[cite: 1]

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
    `; //[cite: 1]

    const actionBtn = cardEl.querySelector('.card-cta-btn'); //[cite: 1]
    actionBtn.addEventListener('click', (e) => { //[cite: 1]
      e.preventDefault(); //[cite: 1]
      e.stopPropagation(); //[cite: 1]
      launchCardAction(cardData); //[cite: 1]
    }); //[cite: 1]

    grid.appendChild(cardEl); //[cite: 1]
  });
}

// Action Launcher
function launchCardAction(cardData) {
  const hasTarget = Boolean(cardData.targetUrl && String(cardData.targetUrl).trim().length > 5); //[cite: 1]
  const isDocumentLink = (cardData.actionType === "link" || hasTarget); //[cite: 1]

  if (isDocumentLink && hasTarget) { //[cite: 1]
    openDocumentViewer(cardData); //[cite: 1]
    return; //[cite: 1]
  }

  activeCard = cardData; //[cite: 1]
  document.getElementById('view-catalog').style.display = 'none'; //[cite: 1]
  document.getElementById('view-generator').style.display = 'block'; //[cite: 1]
  document.getElementById('activeCardLabel').textContent = cardData.title; //[cite: 1]

  const dynamicWrap = document.getElementById('dynamicPageContent'); //[cite: 1]
  if (cardData.templateHtml && typeof cardData.templateHtml === 'string' && cardData.templateHtml.trim().length > 20) { //[cite: 1]
    dynamicWrap.innerHTML = cardData.templateHtml.trim(); //[cite: 1]
  } else {
    dynamicWrap.innerHTML = defaultTemplateHtml; //[cite: 1]
  }

  rebindEditorFields(); //[cite: 1]
  buildUniversalDynamicFields(dynamicWrap);
  window.scrollTo({ top: 0, behavior: 'smooth' }); //[cite: 1]
}

/* =========================================================
   2. UNIVERSAL DYNAMIC FIELDS FOR ANY TEMPLATE
========================================================= */
const bindings = [
  { input: 'inCollege1', output: 'outCollege1' }, //[cite: 1]
  { input: 'inCollege2', output: 'outCollege2' }, //[cite: 1]
  { input: 'inAffiliation', output: 'outAffiliation' }, //[cite: 1]
  { input: 'inDocTitle', output: 'outDocTitle' }, //[cite: 1]
  { input: 'inCourseName', output: 'outCourseName' }, //[cite: 1]
  { input: 'inCourseCode', output: 'outCourseCode' }, //[cite: 1]
  { input: 'inStudentName', output: 'outStudentName' }, //[cite: 1]
  { input: 'inRollNo', output: 'outRollNo' }, //[cite: 1]
  { input: 'inRegNo', output: 'outRegNo' }, //[cite: 1]
  { input: 'inSemester', output: 'outSemester' }, //[cite: 1]
  { input: 'inFacultyName', output: 'outFacultyName' }, //[cite: 1]
  { input: 'inFacultyRole', output: 'outFacultyRole' }, //[cite: 1]
  { input: 'inFacultyDept', output: 'outFacultyDept' }, //[cite: 1]
  { input: 'inDegree', output: 'outDegree' }, //[cite: 1]
  { input: 'inBranch', output: 'outBranch' }, //[cite: 1]
  { input: 'inSession', output: 'outSession' }, //[cite: 1]
  { input: 'inFooterCollege', output: 'outFooterCollege' }, //[cite: 1]
  { input: 'inFooterDept', output: 'outFooterDept' } //[cite: 1]
]; //[cite: 1]

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
    // Skip framework elements
    if (elId === 'topLogoImg' || elId === 'bottomLogoImg' || elId === 'outerBorder' || elId === 'innerBorder' || elId === 'dynamicPageContent') {
      return;
    }

    // If it's already mapped to a standard field, sync value
    if (standardOutputIds.includes(elId)) {
      const match = bindings.find(b => b.output === elId);
      const inEl = document.getElementById(match.input);
      if (inEl) el.textContent = inEl.value;
      return;
    }

    // Discovered custom template placeholder: render interactive input
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
  bindings.forEach(b => { //[cite: 1]
    const inEl = document.getElementById(b.input); //[cite: 1]
    const outEl = document.getElementById(b.output); //[cite: 1]
    if (inEl && outEl) { //[cite: 1]
      outEl.textContent = inEl.value; //[cite: 1]
    } //[cite: 1]
  }); //[cite: 1]

  customTemplateDynamicBindings.forEach(b => {
    const inEl = document.getElementById(b.input);
    const outEl = document.getElementById(b.output);
    if (inEl && outEl) {
      outEl.textContent = inEl.value;
    }
  });
}

function rebindEditorFields() {
  const driveFileId = "1Pg1tZ-1Uodqzi5iciN61hq8jMooT0eo2"; //[cite: 1]
  const logoDirectUrl = `https://lh3.googleusercontent.com/d/${driveFileId}`; //[cite: 1]

  const topLogo = document.getElementById('topLogoImg'); //[cite: 1]
  const bottomLogo = document.getElementById('bottomLogoImg'); //[cite: 1]
  if (topLogo) topLogo.src = logoDirectUrl; //[cite: 1]
  if (bottomLogo) bottomLogo.src = logoDirectUrl; //[cite: 1]

  syncAllText(); //[cite: 1]
  updateRegVisibility(); //[cite: 1]
}

function updateRegVisibility() {
  const semSelect = document.getElementById('inSemester'); //[cite: 1]
  const regToggleWrapper = document.getElementById('regToggleWrapper'); //[cite: 1]
  const regCheckbox = document.getElementById('includeRegCheckbox'); //[cite: 1]
  const regFieldGroup = document.getElementById('regInputFieldGroup'); //[cite: 1]
  const outRegLine = document.getElementById('outRegNoLine'); //[cite: 1]

  if (!semSelect || !regToggleWrapper || !regCheckbox) return; //[cite: 1]

  const sem = semSelect.value; //[cite: 1]
  const isFirstOrThird = (sem === '1st' || sem === '3rd'); //[cite: 1]

  if (isFirstOrThird) { //[cite: 1]
    regToggleWrapper.style.display = 'flex'; //[cite: 1]
    if (regCheckbox.checked) { //[cite: 1]
      if (regFieldGroup) regFieldGroup.style.display = 'block'; //[cite: 1]
      if (outRegLine) outRegLine.style.display = 'block'; //[cite: 1]
    } else { //[cite: 1]
      if (regFieldGroup) regFieldGroup.style.display = 'none'; //[cite: 1]
      if (outRegLine) outRegLine.style.display = 'none'; //[cite: 1]
    } //[cite: 1]
  } else { //[cite: 1]
    regToggleWrapper.style.display = 'none'; //[cite: 1]
    if (regFieldGroup) regFieldGroup.style.display = 'block'; //[cite: 1]
    if (outRegLine) outRegLine.style.display = 'block'; //[cite: 1]
  } //[cite: 1]
}

/* =========================================================
   3. UNTOUCHED PDF ENGINE WITH AUTO-DRIVE ARCHIVAL
========================================================= */
function initPdfGeneratorEngine() {
  const mobileToggleBtn = document.getElementById('btnToggleMobileSidebar'); //[cite: 1]
  const sidebar = document.querySelector('.editor-sidebar'); //[cite: 1]
  if (mobileToggleBtn && sidebar) { //[cite: 1]
    mobileToggleBtn.addEventListener('click', () => { //[cite: 1]
      sidebar.classList.toggle('open'); //[cite: 1]
      mobileToggleBtn.textContent = sidebar.classList.contains('open') ? '✕ Close Controls' : '⚙ Open Controls'; //[cite: 1]
    }); //[cite: 1]
  } //[cite: 1]

  bindings.forEach(b => { //[cite: 1]
    const inEl = document.getElementById(b.input); //[cite: 1]
    if (inEl) { //[cite: 1]
      inEl.addEventListener('input', syncAllText); //[cite: 1]
    } //[cite: 1]
  }); //[cite: 1]

  const semSelect = document.getElementById('inSemester'); //[cite: 1]
  const regCheckbox = document.getElementById('includeRegCheckbox'); //[cite: 1]
  if (semSelect) { //[cite: 1]
    semSelect.addEventListener('change', () => { //[cite: 1]
      syncAllText(); //[cite: 1]
      updateRegVisibility(); //[cite: 1]
    }); //[cite: 1]
  } //[cite: 1]
  if (regCheckbox) { //[cite: 1]
    regCheckbox.addEventListener('change', updateRegVisibility); //[cite: 1]
  } //[cite: 1]

  const outerBorder = document.getElementById('outerBorder'); //[cite: 1]
  const innerBorder = document.getElementById('innerBorder'); //[cite: 1]
  const colorPicker = document.getElementById('borderColorPicker'); //[cite: 1]
  const styleSelect = document.getElementById('borderStyleSelect'); //[cite: 1]

  function applyBorderSettings() {
    if (!outerBorder || !innerBorder || !colorPicker || !styleSelect) return; //[cite: 1]
    const color = colorPicker.value; //[cite: 1]
    const style = styleSelect.value; //[cite: 1]

    if (style === 'double') { //[cite: 1]
      outerBorder.style.border = `3.5px solid ${color}`; //[cite: 1]
      outerBorder.style.padding = '3.5px'; //[cite: 1]
      innerBorder.style.border = `1.2px solid ${color}`; //[cite: 1]
    } else if (style === 'single') { //[cite: 1]
      outerBorder.style.border = `2.5px solid ${color}`; //[cite: 1]
      outerBorder.style.padding = '0'; //[cite: 1]
      innerBorder.style.border = 'none'; //[cite: 1]
    } else if (style === 'thick-thin') { //[cite: 1]
      outerBorder.style.border = `4.5px solid ${color}`; //[cite: 1]
      outerBorder.style.padding = '4px'; //[cite: 1]
      innerBorder.style.border = `1px solid ${color}`; //[cite: 1]
    } else { //[cite: 1]
      outerBorder.style.border = 'none'; //[cite: 1]
      outerBorder.style.padding = '0'; //[cite: 1]
      innerBorder.style.border = 'none'; //[cite: 1]
    } //[cite: 1]
  } //[cite: 1]

  if (styleSelect) styleSelect.addEventListener('change', applyBorderSettings); //[cite: 1]
  if (colorPicker) colorPicker.addEventListener('input', applyBorderSettings); //[cite: 1]

  const fontSelect = document.getElementById('fontSelect'); //[cite: 1]
  if (fontSelect) { //[cite: 1]
    fontSelect.addEventListener('change', function(e) { //[cite: 1]
      document.getElementById('pageDocument').style.fontFamily = e.target.value; //[cite: 1]
    }); //[cite: 1]
  } //[cite: 1]

  const sizeRange = document.getElementById('sizeRange'); //[cite: 1]
  if (sizeRange) { //[cite: 1]
    sizeRange.addEventListener('input', function(e) { //[cite: 1]
      const scalePercent = e.target.value; //[cite: 1]
      document.getElementById('zoomVal').textContent = scalePercent + '%'; //[cite: 1]
      document.getElementById('pageDocument').style.fontSize = (scalePercent / 100) + 'em'; //[cite: 1]
    }); //[cite: 1]
  } //[cite: 1]

  function getIncrementalFilename() {
    const baseName = "Kumaramarjeet80 Assignment cover page"; //[cite: 1]
    let count = parseInt(localStorage.getItem("download_file_counter") || "0", 10); //[cite: 1]
    let filename = (count === 0) ? `${baseName}.pdf` : `${baseName} (${count}).pdf`; //[cite: 1]
    localStorage.setItem("download_file_counter", (count + 1).toString()); //[cite: 1]
    return filename; //[cite: 1]
  }

  // =========================================================================
  // STRICTLY UNTOUCHED RENDERING ENGINE WITH DRIVE AUTO-SYNC[cite: 1]
  // =========================================================================
  const downloadBtn = document.getElementById('btnDirectDownload'); //[cite: 1]
  if (downloadBtn) { //[cite: 1]
    downloadBtn.addEventListener('click', function() { //[cite: 1]
      const page = document.getElementById('pageDocument'); //[cite: 1]
      const filename = getIncrementalFilename(); //[cite: 1]

      downloadBtn.disabled = true; //[cite: 1]
      downloadBtn.textContent = "Rendering PDF..."; //[cite: 1]

      const originalTransform = page.style.transform; //[cite: 1]
      const originalTransformOrigin = page.style.transformOrigin; //[cite: 1]
      const originalMargin = page.style.margin; //[cite: 1]
      const originalPosition = page.style.position; //[cite: 1]
      const originalBoxShadow = page.style.boxShadow; //[cite: 1]

      page.style.transform = 'none'; //[cite: 1]
      page.style.transformOrigin = 'top left'; //[cite: 1]
      page.style.margin = '0'; //[cite: 1]
      page.style.boxShadow = 'none'; //[cite: 1]
      page.style.position = 'relative'; //[cite: 1]

      applyBorderSettings(); //[cite: 1]
      window.scrollTo(0, 0); //[cite: 1]

      const opt = {
        margin: 0, //[cite: 1]
        filename: filename, //[cite: 1]
        image: { type: 'jpeg', quality: 1.0 }, //[cite: 1]
        html2canvas: {
          scale: 2, //[cite: 1]
          useCORS: true, //[cite: 1]
          allowTaint: true, //[cite: 1]
          logging: false, //[cite: 1]
          scrollX: 0, //[cite: 1]
          scrollY: 0 //[cite: 1]
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, //[cite: 1]
        pagebreak: { mode: 'avoid-all' } //[cite: 1]
      };

      html2pdf().set(opt).from(page).toPdf().get('pdf').then(function(pdfObj) { //[cite: 1]
        const totalPages = pdfObj.internal.getNumberOfPages(); //[cite: 1]
        if (totalPages > 1) { //[cite: 1]
          for (let p = totalPages; p > 1; p--) { //[cite: 1]
            pdfObj.deletePage(p); //[cite: 1]
          } //[cite: 1]
        } //[cite: 1]

        page.style.transform = originalTransform; //[cite: 1]
        page.style.transformOrigin = originalTransformOrigin; //[cite: 1]
        page.style.margin = originalMargin; //[cite: 1]
        page.style.position = originalPosition; //[cite: 1]
        page.style.boxShadow = originalBoxShadow; //[cite: 1]

        // 1. Direct local file download[cite: 1]
        pdfObj.save(filename); //[cite: 1]

        // 2. Extract Base64 stream from render engine
        const pdfBase64 = pdfObj.output('datauristring');

        // 3. Telemetry + Google Drive permanent archiving
        logTelemetryAndArchiveToDrive(pdfBase64);

        // 4. Trigger celebration animation modal
        showCelebrationToast();

        downloadBtn.disabled = false; //[cite: 1]
        downloadBtn.textContent = "Download PDF Document"; //[cite: 1]
      }).catch(err => {
        page.style.transform = originalTransform; //[cite: 1]
        page.style.transformOrigin = originalTransformOrigin; //[cite: 1]
        page.style.margin = originalMargin; //[cite: 1]
        page.style.position = originalPosition; //[cite: 1]
        page.style.boxShadow = originalBoxShadow; //[cite: 1]

        console.error("PDF Engine Error:", err); //[cite: 1]
        downloadBtn.disabled = false; //[cite: 1]
        downloadBtn.textContent = "Download PDF Document"; //[cite: 1]
      });
    }); //[cite: 1]
  } //[cite: 1]

  rebindEditorFields(); //[cite: 1]
  applyBorderSettings(); //[cite: 1]
}

function logTelemetryAndArchiveToDrive(pdfBase64) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT")) return; //[cite: 1]

  const regCheckbox = document.getElementById('includeRegCheckbox'); //[cite: 1]
  const semSelect = document.getElementById('inSemester'); //[cite: 1]

  const payload = {
    action: "log_download", //[cite: 1]
    cardId: activeCard ? activeCard.id : "DEFAULT", //[cite: 1]
    name: document.getElementById('inStudentName')?.value || 'N/A', //[cite: 1]
    roll: document.getElementById('inRollNo')?.value || 'N/A', //[cite: 1]
    reg: (regCheckbox && (regCheckbox.checked || !['1st', '3rd'].includes(semSelect.value)))  //[cite: 1]
         ? (document.getElementById('inRegNo')?.value || 'N/A') : 'N/A', //[cite: 1]
    course: document.getElementById('inCourseName')?.value || 'N/A',
    subject: document.getElementById('inCourseName')?.value || 'N/A', //[cite: 1]
    courseCode: document.getElementById('inCourseCode')?.value || 'N/A',
    subjectCode: document.getElementById('inCourseCode')?.value || 'N/A', //[cite: 1]
    faculty: document.getElementById('inFacultyName')?.value || 'N/A', //[cite: 1]
    semester: document.getElementById('inSemester')?.value || 'N/A', //[cite: 1]
    branch: document.getElementById('inBranch')?.value || 'N/A', //[cite: 1]
    college: (document.getElementById('inCollege1')?.value || '') + ' ' + (document.getElementById('inCollege2')?.value || ''), //[cite: 1]
    pdfBase64: pdfBase64
  };

  fetch(APPS_SCRIPT_URL, { //[cite: 1]
    method: 'POST', //[cite: 1]
    headers: { 'Content-Type': 'text/plain' }, //[cite: 1]
    body: JSON.stringify(payload) //[cite: 1]
  }).catch(() => {}); //[cite: 1]
}

/* =========================================================
   4. EMBEDDED DOCUMENT / PDF VIEWER CONTROLS
========================================================= */
function setupDocViewerControls() {
  const closeBtn = document.getElementById('docViewerCloseBtn'); //[cite: 1]
  const modal = document.getElementById('docViewerModal'); //[cite: 1]
  const iframe = document.getElementById('docViewerIframe'); //[cite: 1]

  if (closeBtn && modal) { //[cite: 1]
    closeBtn.addEventListener('click', () => { //[cite: 1]
      modal.style.display = 'none'; //[cite: 1]
      if (iframe) iframe.src = ""; //[cite: 1]
    }); //[cite: 1]
  } //[cite: 1]

  const downloadBtn = document.getElementById('docViewerDownloadBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      showCelebrationToast();
    });
  }
}

function openDocumentViewer(cardData) {
  const modal = document.getElementById('docViewerModal'); //[cite: 1]
  const iframe = document.getElementById('docViewerIframe'); //[cite: 1]
  const title = document.getElementById('docViewerHeading'); //[cite: 1]
  const downloadBtn = document.getElementById('docViewerDownloadBtn'); //[cite: 1]

  title.textContent = cardData.title || "Academic Document"; //[cite: 1]

  let rawUrl = cardData.targetUrl.trim(); //[cite: 1]
  let embedUrl = rawUrl; //[cite: 1]
  let downloadUrl = rawUrl; //[cite: 1]

  if (rawUrl.includes("drive.google.com")) { //[cite: 1]
    const fileIdMatch = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/); //[cite: 1]
    if (fileIdMatch && fileIdMatch[1]) { //[cite: 1]
      const id = fileIdMatch[1]; //[cite: 1]
      embedUrl = `https://drive.google.com/file/d/${id}/preview`; //[cite: 1]
      downloadUrl = `https://drive.google.com/uc?export=download&id=${id}`; //[cite: 1]
    } //[cite: 1]
  } //[cite: 1]

  iframe.src = embedUrl; //[cite: 1]
  downloadBtn.href = downloadUrl; //[cite: 1]
  modal.style.display = 'flex'; //[cite: 1]
}

function setupBreadcrumbs() {
  document.getElementById('bcHome').addEventListener('click', renderCategories); //[cite: 1]
  document.getElementById('bcCat').addEventListener('click', () => { //[cite: 1]
    if (currentCategoryId) openCategory(currentCategoryId); //[cite: 1]
  }); //[cite: 1]
  document.getElementById('btnBackToPortal').addEventListener('click', () => { //[cite: 1]
    document.getElementById('view-generator').style.display = 'none'; //[cite: 1]
    document.getElementById('view-catalog').style.display = 'block'; //[cite: 1]
  }); //[cite: 1]
}

function updateBreadcrumbs() {
  const bar = document.getElementById('breadcrumbNav'); //[cite: 1]
  const bcCat = document.getElementById('bcCat'); //[cite: 1]
  const bcSub = document.getElementById('bcSub'); //[cite: 1]
  const sep1 = document.getElementById('bcSep1'); //[cite: 1]
  const sep2 = document.getElementById('bcSep2'); //[cite: 1]

  if (!currentCategoryId) { //[cite: 1]
    bar.style.display = 'none'; //[cite: 1]
    return; //[cite: 1]
  } //[cite: 1]

  bar.style.display = 'flex'; //[cite: 1]
  const catObj = portalData.categories.find(c => c.id === currentCategoryId); //[cite: 1]
  bcCat.textContent = catObj ? catObj.name : "Category"; //[cite: 1]
  bcCat.style.display = 'inline'; //[cite: 1]
  sep1.style.display = 'inline'; //[cite: 1]

  if (currentSubcategoryId) { //[cite: 1]
    const subObj = portalData.subcategories.find(s => s.id === currentSubcategoryId); //[cite: 1]
    bcSub.textContent = subObj ? subObj.name : "Subcategory"; //[cite: 1]
    bcSub.style.display = 'inline'; //[cite: 1]
    sep2.style.display = 'inline'; //[cite: 1]
  } else { //[cite: 1]
    bcSub.style.display = 'none'; //[cite: 1]
    sep2.style.display = 'none'; //[cite: 1]
  } //[cite: 1]
}

/* =========================================================
   5. SEQUENTIAL MULTI-POPUP QUEUE (LATEST FIRST)
========================================================= */
function formatVideoEmbedUrl(url) {
  if (!url) return ""; //[cite: 1]
  
  if (url.includes("drive.google.com") || url.includes("googleusercontent.com")) { //[cite: 1]
    const driveMatch = url.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]+)/); //[cite: 1]
    if (driveMatch && driveMatch[1]) { //[cite: 1]
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`; //[cite: 1]
    } //[cite: 1]
  } //[cite: 1]
  
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/); //[cite: 1]
  if (ytMatch && ytMatch[1]) { //[cite: 1]
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&loop=1&playlist=${ytMatch[1]}&playsinline=1&enablejsapi=1`; //[cite: 1]
  } //[cite: 1]
  return url; //[cite: 1]
}

function initSequentialPopupQueue(popups) {
  if (!popups || popups.length === 0) return;
  activePopupQueue = popups;
  currentPopupIndex = 0; // Latest added popup first

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
    const modal = document.getElementById('adminBroadcastModal'); //[cite: 1]
    if (modal && modal.style.display !== 'flex') { //[cite: 1]
      displayNextSequentialPopup();
    } else {
      scheduleNextPopupInQueue(nextPopup);
    }
  }, delayMs);
}

function showUserPopup(p, onClosedCallback) {
  const modal = document.getElementById('adminBroadcastModal'); //[cite: 1]
  const modalBox = document.getElementById('adminModalBox'); //[cite: 1]
  const closeBtn = document.getElementById('adPopupCloseBtn'); //[cite: 1]
  const timerWrap = document.getElementById('popupTimerWrap'); //[cite: 1]
  const timerBar = document.getElementById('popupTimerBar'); //[cite: 1]
  const timerBadge = document.getElementById('popupTimerBadge'); //[cite: 1]

  const heroWrap = document.getElementById('adPopupHeroWrap'); //[cite: 1]
  const imgEl = document.getElementById('adPopupImg'); //[cite: 1]
  const videoEl = document.getElementById('adPopupVideo'); //[cite: 1]
  const iframeEl = document.getElementById('adPopupIframe'); //[cite: 1]
  const unmuteBtn = document.getElementById('adPopupUnmuteBtn'); //[cite: 1]

  const mediaType = p.mediaType || "image"; //[cite: 1]
  const mediaUrl = p.mediaUrl || ""; //[cite: 1]

  imgEl.style.display = "none"; //[cite: 1]
  videoEl.style.display = "none"; //[cite: 1]
  iframeEl.style.display = "none"; //[cite: 1]
  if (unmuteBtn) unmuteBtn.style.display = "none"; //[cite: 1]

  videoEl.pause(); //[cite: 1]
  videoEl.removeAttribute('src'); //[cite: 1]
  videoEl.load(); //[cite: 1]
  iframeEl.src = ""; //[cite: 1]

  timerWrap.style.display = "none"; //[cite: 1]
  timerBadge.style.display = "none"; //[cite: 1]
  timerBar.style.transition = "none"; //[cite: 1]
  timerBar.style.transform = "scaleX(1)"; //[cite: 1]

  let countdownInterval = null; //[cite: 1]
  let hasClosed = false;

  function hideModal() {
    if (hasClosed) return;
    hasClosed = true;
    modal.style.display = "none"; //[cite: 1]
    videoEl.pause(); //[cite: 1]
    iframeEl.src = ""; //[cite: 1]
    if (countdownInterval) clearInterval(countdownInterval); //[cite: 1]
    if (typeof onClosedCallback === "function") {
      onClosedCallback();
    }
  }

  function startCloseTimer() {
    if (countdownInterval) return; //[cite: 1]

    const mode = p.closeMode || "both"; //[cite: 1]
    if (mode !== "timer" && mode !== "both") return; //[cite: 1]

    const seconds = Math.max(1, Number(p.timerSeconds) || 5); //[cite: 1]
    timerWrap.style.display = "block"; //[cite: 1]
    timerBadge.style.display = "inline-block"; //[cite: 1]

    let remaining = seconds; //[cite: 1]
    timerBadge.textContent = `Auto-closing in ${remaining}s...`; //[cite: 1]

    setTimeout(() => { //[cite: 1]
      timerBar.style.transition = `transform ${seconds}s linear`; //[cite: 1]
      timerBar.style.transform = "scaleX(0)"; //[cite: 1]
    }, 50); //[cite: 1]

    countdownInterval = setInterval(() => { //[cite: 1]
      remaining -= 1; //[cite: 1]
      if (remaining > 0) { //[cite: 1]
        timerBadge.textContent = `Auto-closing in ${remaining}s...`; //[cite: 1]
      } else {
        clearInterval(countdownInterval); //[cite: 1]
        hideModal(); //[cite: 1]
      }
    }, 1000); //[cite: 1]
  }

  const mode = p.closeMode || "both"; //[cite: 1]
  closeBtn.style.display = (mode === "timer") ? "none" : "flex"; //[cite: 1]
  closeBtn.onclick = (e) => { //[cite: 1]
    e.stopPropagation(); //[cite: 1]
    hideModal(); //[cite: 1]
  }; //[cite: 1]

  if (mediaUrl) { //[cite: 1]
    heroWrap.style.display = "flex"; //[cite: 1]

    if (mediaType === "video") { //[cite: 1]
      const isDriveOrYt = mediaUrl.includes("google.com") ||  //[cite: 1]
                          mediaUrl.includes("googleusercontent.com") ||  //[cite: 1]
                          mediaUrl.includes("youtube.com") ||  //[cite: 1]
                          mediaUrl.includes("youtu.be"); //[cite: 1]

      if (isDriveOrYt) { //[cite: 1]
        iframeEl.setAttribute('allow', 'autoplay *; encrypted-media *; picture-in-picture *'); //[cite: 1]
        iframeEl.src = formatVideoEmbedUrl(mediaUrl); //[cite: 1]
        iframeEl.style.display = "block"; //[cite: 1]
        iframeEl.onload = () => startCloseTimer(); //[cite: 1]
      } else {
        videoEl.muted = true; //[cite: 1]
        videoEl.defaultMuted = true; //[cite: 1]
        videoEl.loop = true; //[cite: 1]
        videoEl.playsInline = true; //[cite: 1]
        videoEl.setAttribute('muted', ''); //[cite: 1]
        videoEl.setAttribute('autoplay', ''); //[cite: 1]
        videoEl.setAttribute('playsinline', ''); //[cite: 1]
        videoEl.setAttribute('loop', ''); //[cite: 1]
        videoEl.src = mediaUrl; //[cite: 1]
        videoEl.style.display = "block"; //[cite: 1]

        if (unmuteBtn) { //[cite: 1]
          unmuteBtn.style.display = "block"; //[cite: 1]
          unmuteBtn.textContent = "🔊 Tap to Unmute"; //[cite: 1]
          unmuteBtn.onclick = (e) => { //[cite: 1]
            e.stopPropagation(); //[cite: 1]
            if (videoEl.muted) { //[cite: 1]
              videoEl.muted = false; //[cite: 1]
              unmuteBtn.textContent = "🔇 Mute"; //[cite: 1]
            } else {
              videoEl.muted = true; //[cite: 1]
              unmuteBtn.textContent = "🔊 Tap to Unmute"; //[cite: 1]
            }
          }; //[cite: 1]
        } //[cite: 1]

        videoEl.onplaying = () => startCloseTimer(); //[cite: 1]

        const attemptPlay = () => { //[cite: 1]
          videoEl.muted = true; //[cite: 1]
          const playPromise = videoEl.play(); //[cite: 1]
          if (playPromise !== undefined) { //[cite: 1]
            playPromise.then(() => startCloseTimer()) //[cite: 1]
              .catch(() => { //[cite: 1]
                videoEl.muted = true; //[cite: 1]
                videoEl.play().catch(() => startCloseTimer()); //[cite: 1]
              }); //[cite: 1]
          }
        }; //[cite: 1]

        if (videoEl.readyState >= 3) { //[cite: 1]
          attemptPlay(); //[cite: 1]
        } else {
          videoEl.oncanplay = () => attemptPlay(); //[cite: 1]
        }
      }
    } else {
      imgEl.src = mediaUrl; //[cite: 1]
      imgEl.style.display = "block"; //[cite: 1]
      imgEl.onload = () => startCloseTimer(); //[cite: 1]
      if (imgEl.complete) startCloseTimer(); //[cite: 1]
    }
  } else {
    heroWrap.style.display = "none"; //[cite: 1]
    startCloseTimer(); //[cite: 1]
  }

  document.getElementById('adPopupTitle').textContent = p.title || "Announcement"; //[cite: 1]
  document.getElementById('adPopupBody').textContent = p.body || ""; //[cite: 1]
  
  const actionBtn = document.getElementById('adPopupBtn'); //[cite: 1]
  actionBtn.textContent = p.buttonText || "Open Link"; //[cite: 1]
  actionBtn.href = p.buttonLink || "#"; //[cite: 1]

  if (p.clickMode === "card" && p.buttonLink) { //[cite: 1]
    modalBox.classList.add('clickable-card'); //[cite: 1]
    modalBox.onclick = (e) => { //[cite: 1]
      if (e.target.closest('#adPopupCloseBtn') || e.target.closest('#adPopupUnmuteBtn')) return; //[cite: 1]
      window.open(p.buttonLink, '_blank', 'noopener,noreferrer'); //[cite: 1]
    }; //[cite: 1]
  } else {
    modalBox.classList.remove('clickable-card'); //[cite: 1]
    modalBox.onclick = null; //[cite: 1]
  }

  modal.style.display = "flex"; //[cite: 1]
}

/* =========================================================
   6. ANIMATED CELEBRATION DOWNLOAD TOAST
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
