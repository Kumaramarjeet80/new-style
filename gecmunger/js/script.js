// ================= CONFIGURATION =================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxGQCgVBBlHN9jtciWD1utfdOH2OIUw1vzQ9MZRksw5Zc9_KYL1YLjbq8fLkQiF4DuWSw/exec";

// Global Portal State
let portalData = {
  categories: [],
  subcategories: [],
  cards: [],
  popup: null
};
let currentCategoryId = null;
let currentSubcategoryId = null;
let activeCard = null;

// Backup default template HTML for assignment cover pages
let defaultTemplateHtml = "";

// Popup recurrence timer handle
let popupRecurrenceTimer = null;

window.addEventListener('DOMContentLoaded', () => {
  const dynamicWrap = document.getElementById('dynamicPageContent');
  if (dynamicWrap) {
    defaultTemplateHtml = dynamicWrap.innerHTML;
  }

  if (document.body.classList.contains('user-body')) {
    initUserPortal();
  }
});

/* =========================================================
   1. USER PORTAL ROUTING & CATALOG (WHOLESALE/RETAIL UI)
========================================================= */
function initUserPortal() {
  initPdfGeneratorEngine();
  setupBreadcrumbs();
  fetchPortalCatalog();
}

function fetchPortalCatalog() {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT")) {
    renderFallbackCategories();
    return;
  }

  fetch(`${APPS_SCRIPT_URL}?action=get_portal_data`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        portalData.categories = data.categories || [];
        portalData.subcategories = data.subcategories || [];
        portalData.cards = data.cards || [];
        portalData.popup = data.popup || null;

        renderCategories();

        if (portalData.popup && portalData.popup.active) {
          setupPopupRecurrence(portalData.popup);
        }
      } else {
        renderFallbackCategories();
      }
    })
    .catch(err => {
      console.error("Portal Data Fetch Error:", err);
      renderFallbackCategories();
    });
}

function renderFallbackCategories() {
  portalData.categories = [
    { id: "CAT-DEFAULT", name: "Assignment Cover Pages", description: "Official B.Tech assignment covers and formats", icon: "📄" }
  ];
  portalData.subcategories = [
    { id: "SUB-DEFAULT", categoryId: "CAT-DEFAULT", name: "Standard Academic Work", description: "Regular course assignments" }
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
      actionType: "generator"
    }
  ];
  renderCategories();
}

// Stage A: Render Categories
function renderCategories() {
  currentCategoryId = null;
  currentSubcategoryId = null;
  activeCard = null;

  document.getElementById('view-catalog').style.display = 'block';
  document.getElementById('view-generator').style.display = 'none';

  document.getElementById('stageCategories').style.display = 'block';
  document.getElementById('stageSubcategories').style.display = 'none';
  document.getElementById('stageCards').style.display = 'none';

  updateBreadcrumbs();

  const grid = document.getElementById('categoryGrid');
  grid.innerHTML = "";

  if (portalData.categories.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 40px;">No categories published yet.</div>`;
    return;
  }

  portalData.categories.forEach(cat => {
    const card = document.createElement('div');
    card.className = "category-card";
    card.innerHTML = `
      <div>
        <div class="cat-icon-wrap">${cat.icon || "📁"}</div>
        <div class="cat-name">${cat.name}</div>
        <div class="cat-desc">${cat.description || "Browse resources in this category"}</div>
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
    card.innerHTML = `
      <div>
        <div class="cat-icon-wrap">📑</div>
        <div class="cat-name">${sub.name}</div>
        <div class="cat-desc">${sub.description || "View templates and materials"}</div>
      </div>
      <div class="cat-action-indicator">Open Subcategory →</div>
    `;
    card.addEventListener('click', () => openSubcategory(sub.id));
    grid.appendChild(card);
  });
}

// Stage C: Open Resource/Template Cards
function openSubcategory(subId) {
  currentSubcategoryId = subId;
  const filteredCards = portalData.cards.filter(c => c.subcategoryId === subId);

  document.getElementById('stageCategories').style.display = 'none';
  document.getElementById('stageSubcategories').style.display = 'none';
  document.getElementById('stageCards').style.display = 'block';

  updateBreadcrumbs();

  const grid = document.getElementById('cardGrid');
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

    cardEl.innerHTML = `
      <div class="card-thumbnail-wrap">
        ${thumbHtml}
      </div>
      <div class="card-body">
        <div class="card-title">${cardData.title}</div>
        <div class="card-desc">${cardData.description || "Standard academic format ready for customization and download."}</div>
        <button class="card-cta-btn">${cardData.buttonText || "Customize Cover Page"}</button>
      </div>
    `;

    cardEl.querySelector('.card-cta-btn').addEventListener('click', () => {
      launchCardAction(cardData);
    });

    grid.appendChild(cardEl);
  });
}

// Launch Action: Link or PDF Generator Canvas
function launchCardAction(cardData) {
  if (cardData.actionType === "link" && cardData.targetUrl) {
    window.open(cardData.targetUrl, '_blank');
    return;
  }

  activeCard = cardData;
  document.getElementById('view-catalog').style.display = 'none';
  document.getElementById('view-generator').style.display = 'block';
  document.getElementById('activeCardLabel').textContent = cardData.title;

  const dynamicWrap = document.getElementById('dynamicPageContent');
  if (cardData.templateHtml && cardData.templateHtml.trim().length > 0) {
    dynamicWrap.innerHTML = cardData.templateHtml;
  } else {
    dynamicWrap.innerHTML = defaultTemplateHtml;
  }

  rebindEditorFields();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Breadcrumb Navigation Handling
function setupBreadcrumbs() {
  document.getElementById('bcHome').addEventListener('click', renderCategories);
  document.getElementById('bcCat').addEventListener('click', () => {
    if (currentCategoryId) openCategory(currentCategoryId);
  });
  document.getElementById('btnBackToPortal').addEventListener('click', () => {
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

  if (!currentCategoryId) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  const catObj = portalData.categories.find(c => c.id === currentCategoryId);
  bcCat.textContent = catObj ? catObj.name : "Category";
  bcCat.style.display = 'inline';
  sep1.style.display = 'inline';

  if (currentSubcategoryId) {
    const subObj = portalData.subcategories.find(s => s.id === currentSubcategoryId);
    bcSub.textContent = subObj ? subObj.name : "Subcategory";
    bcSub.style.display = 'inline';
    sep2.style.display = 'inline';
  } else {
    bcSub.style.display = 'none';
    sep2.style.display = 'none';
  }
}

/* =========================================================
   2. GENERATOR ENGINE (ISOLATED ZERO-OFFSET IFRAME ENGINE)
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

function syncAllText() {
  bindings.forEach(b => {
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
  // Mobile drawer
  const mobileToggleBtn = document.getElementById('btnToggleMobileSidebar');
  const sidebar = document.querySelector('.editor-sidebar');
  if (mobileToggleBtn && sidebar) {
    mobileToggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      mobileToggleBtn.textContent = sidebar.classList.contains('open') ? '✕ Close Controls' : '⚙ Open Controls';
    });
  }

  // Field listeners
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

  // Border Settings
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

  // Font family
  const fontSelect = document.getElementById('fontSelect');
  if (fontSelect) {
    fontSelect.addEventListener('change', function(e) {
      document.getElementById('pageDocument').style.fontFamily = e.target.value;
    });
  }

  // Font scaling
  const sizeRange = document.getElementById('sizeRange');
  if (sizeRange) {
    sizeRange.addEventListener('input', function(e) {
      const scalePercent = e.target.value;
      document.getElementById('zoomVal').textContent = scalePercent + '%';
      document.getElementById('pageDocument').style.fontSize = (scalePercent / 100) + 'em';
    });
  }

  // Incremental local filename
  function getIncrementalFilename() {
    const baseName = "Kumaramarjeet80 Assignment cover page";
    let count = parseInt(localStorage.getItem("download_file_counter") || "0", 10);
    let filename = "";

    if (count === 0) {
      filename = `${baseName}.pdf`;
    } else {
      filename = `${baseName} (${count}).pdf`;
    }

    localStorage.setItem("download_file_counter", (count + 1).toString());
    return filename;
  }

  // Direct PDF Download & Isolated Zero-Offset Iframe Sandbox
  const downloadBtn = document.getElementById('btnDirectDownload');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function() {
      const originalElement = document.getElementById('pageDocument');
      const filename = getIncrementalFilename();

      downloadBtn.disabled = true;
      downloadBtn.textContent = "Rendering PDF...";

      // Create a clean offscreen iframe sandbox to fully isolate rendering from parent transforms
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '0';
      iframe.style.top = '0';
      iframe.style.width = '794px';
      iframe.style.height = '1123px';
      iframe.style.border = 'none';
      iframe.style.zIndex = '-99999';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;800&family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300&family=Montserrat:wght@400;600;700&family=Playfair+Display:ital,wght@0,500;0,700;1,400&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
          <link rel="stylesheet" href="css/style.css">
          <style>
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              width: 794px !important;
              height: 1123px !important;
              overflow: hidden !important;
            }
            .page {
              margin: 0 !important;
              transform: none !important;
              box-shadow: none !important;
              width: 794px !important;
              height: 1123px !important;
              box-sizing: border-box !important;
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
            }
          </style>
        </head>
        <body>
          ${originalElement.outerHTML}
        </body>
        </html>
      `);
      iframeDoc.close();

      setTimeout(() => {
        const renderElement = iframeDoc.getElementById('pageDocument');

        const opt = {
          margin: 0,
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            width: 794,
            height: 1123,
            x: 0,
            y: 0,
            scrollX: 0,
            scrollY: 0,
            windowWidth: 794,
            windowHeight: 1123
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(renderElement).toPdf().get('pdf').then(function(pdfObj) {
          pdfObj.save(filename);

          const pdfBase64 = pdfObj.output('datauristring');
          transmitTelemetryAndArchive(pdfBase64);

          if (iframe.parentNode) document.body.removeChild(iframe);

          downloadBtn.disabled = false;
          downloadBtn.textContent = "Download PDF Document";
        }).catch(err => {
          if (iframe.parentNode) document.body.removeChild(iframe);
          console.error("PDF Engine Error:", err);
          downloadBtn.disabled = false;
          downloadBtn.textContent = "Download PDF Document";
        });
      }, 350);
    });
  }

  rebindEditorFields();
  applyBorderSettings();
}

function transmitTelemetryAndArchive(pdfBase64Data) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT")) {
    document.getElementById('modalOrderIdDisplay').textContent = "Tracking ID: ORD-LOCAL-DEMO";
    document.getElementById('thankYouModal').style.display = 'flex';
    return;
  }

  const regCheckbox = document.getElementById('includeRegCheckbox');
  const semSelect = document.getElementById('inSemester');

  const payload = {
    action: "log_download",
    cardId: activeCard ? activeCard.id : "DEFAULT",
    name: document.getElementById('inStudentName')?.value || 'N/A',
    roll: document.getElementById('inRollNo')?.value || 'N/A',
    reg: (regCheckbox && (regCheckbox.checked || !['1st', '3rd'].includes(semSelect.value))) 
         ? (document.getElementById('inRegNo')?.value || 'N/A') : 'N/A',
    subject: document.getElementById('inCourseName')?.value || 'N/A',
    subjectCode: document.getElementById('inCourseCode')?.value || 'N/A',
    faculty: document.getElementById('inFacultyName')?.value || 'N/A',
    semester: document.getElementById('inSemester')?.value || 'N/A',
    branch: document.getElementById('inBranch')?.value || 'N/A',
    college: (document.getElementById('inCollege1')?.value || '') + ' ' + (document.getElementById('inCollege2')?.value || ''),
    pdfBase64: pdfBase64Data
  };

  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    const orderId = data.orderId || "ORD-SAVED";
    document.getElementById('modalOrderIdDisplay').textContent = `Tracking ID: ${orderId}`;
    document.getElementById('thankYouModal').style.display = 'flex';
  })
  .catch(() => {
    document.getElementById('modalOrderIdDisplay').textContent = "Tracking ID: ORD-SAVED-OFFLINE";
    document.getElementById('thankYouModal').style.display = 'flex';
  });
}

/* =========================================================
   3. MODAL POPUP ENGINE (CHROMELESS AUTOPLAY & SYNCED TIMING)
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
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&loop=1&playlist=${ytMatch[1]}&playsinline=1`;
  }
  return url;
}

function setupPopupRecurrence(p) {
  if (popupRecurrenceTimer) clearInterval(popupRecurrenceTimer);

  showUserPopup(p);

  const minutes = Math.max(0.2, Number(p.intervalMinutes) || 1);
  popupRecurrenceTimer = setInterval(() => {
    const modal = document.getElementById('adminBroadcastModal');
    if (modal && modal.style.display !== 'flex') {
      showUserPopup(p);
    }
  }, minutes * 60 * 1000);
}

function showUserPopup(p) {
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

  const mediaType = p.mediaType || "image";
  const mediaUrl = p.mediaUrl || "";

  imgEl.style.display = "none";
  videoEl.style.display = "none";
  iframeEl.style.display = "none";
  videoEl.pause();
  iframeEl.src = "";

  // Strip all standard media controls & force unmuted browser compliance
  videoEl.removeAttribute('controls');
  videoEl.muted = true;
  videoEl.defaultMuted = true;
  videoEl.loop = true;
  videoEl.playsInline = true;

  timerWrap.style.display = "none";
  timerBadge.style.display = "none";
  timerBar.style.transition = "none";
  timerBar.style.transform = "scaleX(1)";

  let countdownInterval = null;

  function hideModal() {
    modal.style.display = "none";
    videoEl.pause();
    iframeEl.src = "";
    if (countdownInterval) clearInterval(countdownInterval);
  }

  function startCloseTimer() {
    if (countdownInterval) return;

    const mode = p.closeMode || "both";
    if (mode !== "timer" && mode !== "both") return;

    const seconds = Math.max(1, Number(p.timerSeconds) || 5);
    timerWrap.style.display = "block";
    timerBadge.style.display = "inline-block";

    let remaining = seconds;
    timerBadge.textContent = `Auto-closing in ${remaining}s...`;

    setTimeout(() => {
      timerBar.style.transition = `transform ${seconds}s linear`;
      timerBar.style.transform = "scaleX(0)";
    }, 50);

    countdownInterval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        timerBadge.textContent = `Auto-closing in ${remaining}s...`;
      } else {
        clearInterval(countdownInterval);
        hideModal();
      }
    }, 1000);
  }

  const mode = p.closeMode || "both";
  closeBtn.style.display = (mode === "timer") ? "none" : "flex";
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    hideModal();
  };

  if (mediaUrl) {
    heroWrap.style.display = "flex";

    if (mediaType === "video") {
      const isDirectRawFile = mediaUrl.endsWith(".mp4") || mediaUrl.endsWith(".webm");
      const isDriveOrYt = mediaUrl.includes("google.com") || 
                          mediaUrl.includes("googleusercontent.com") || 
                          mediaUrl.includes("youtube.com") || 
                          mediaUrl.includes("youtu.be");

      if (isDriveOrYt || !isDirectRawFile) {
        iframeEl.src = formatVideoEmbedUrl(mediaUrl);
        iframeEl.style.display = "block";
        iframeEl.onload = () => startCloseTimer();
      } else {
        videoEl.src = mediaUrl;
        videoEl.style.display = "block";
        videoEl.onplaying = () => startCloseTimer();
        videoEl.play().catch(() => startCloseTimer());
      }
    } else {
      imgEl.src = mediaUrl;
      imgEl.style.display = "block";
      imgEl.onload = () => startCloseTimer();
      if (imgEl.complete) startCloseTimer();
    }
  } else {
    heroWrap.style.display = "none";
    startCloseTimer();
  }

  document.getElementById('adPopupTitle').textContent = p.title || "Announcement";
  document.getElementById('adPopupBody').textContent = p.body || "";
  
  const actionBtn = document.getElementById('adPopupBtn');
  actionBtn.textContent = p.buttonText || "Open Link";
  actionBtn.href = p.buttonLink || "#";

  if (p.clickMode === "card" && p.buttonLink) {
    modalBox.classList.add('clickable-card');
    modalBox.onclick = (e) => {
      if (e.target.closest('#adPopupCloseBtn')) return;
      window.open(p.buttonLink, '_blank');
    };
  } else {
    modalBox.classList.remove('clickable-card');
    modalBox.onclick = null;
  }

  modal.style.display = "flex";
}
