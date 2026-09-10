/**
 * GECM Academic Portal - Single-Page A4 PDF Canvas Engine
 * Strictly Preserved Core Rendering and Google Drive Archival
 */

const targetCardId = PortalAPI.getQueryParam('card');
let currentCardData = null;
let defaultTemplateHtml = "";

const standardBindings = [
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

window.addEventListener('DOMContentLoaded', () => {
  const dynamicWrap = document.getElementById('dynamicPageContent');
  if (dynamicWrap) defaultTemplateHtml = dynamicWrap.innerHTML;

  initCanvasControls();
  setupCelebrationToastControls();

  // Load specific card if requested
  if (targetCardId) {
    currentCardData = portalAPI.getCardById(targetCardId);
    if (currentCardData) {
      document.getElementById('activeCardLabel').textContent = currentCardData.title;
      if (currentCardData.templateHtml && currentCardData.templateHtml.trim().length > 20) {
        dynamicWrap.innerHTML = currentCardData.templateHtml.trim();
      }
    }
  }

  rebindEditorFields();
  buildUniversalDynamicFields(dynamicWrap);
});

function syncAllText() {
  standardBindings.forEach(b => {
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

function buildUniversalDynamicFields(container) {
  const dynamicFieldsWrap = document.getElementById('dynamicCustomFieldsWrap');
  if (!dynamicFieldsWrap) return;
  
  dynamicFieldsWrap.innerHTML = "";
  customTemplateDynamicBindings = [];

  const standardOutputIds = standardBindings.map(b => b.output);
  const elementsWithIds = container.querySelectorAll('[id]');

  elementsWithIds.forEach(el => {
    const elId = el.id;
    if (elId === 'topLogoImg' || elId === 'bottomLogoImg' || elId === 'outerBorder' || elId === 'innerBorder' || elId === 'dynamicPageContent') {
      return;
    }

    if (standardOutputIds.includes(elId)) {
      const match = standardBindings.find(b => b.output === elId);
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

function initCanvasControls() {
  const mobileToggleBtn = document.getElementById('btnToggleMobileSidebar');
  const sidebar = document.querySelector('.editor-sidebar');
  if (mobileToggleBtn && sidebar) {
    mobileToggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      mobileToggleBtn.textContent = sidebar.classList.contains('open') ? '✕ Close Controls' : '⚙ Open Controls';
    });
  }

  standardBindings.forEach(b => {
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
  if (regCheckbox) regCheckbox.addEventListener('change', updateRegVisibility);

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
      document.getElementById('pageDocument').style.fontFamily = e.target.value;
    });
  }

  const sizeRange = document.getElementById('sizeRange');
  if (sizeRange) {
    sizeRange.addEventListener('input', function(e) {
      const scalePercent = e.target.value;
      document.getElementById('zoomVal').textContent = scalePercent + '%';
      document.getElementById('pageDocument').style.fontSize = (scalePercent / 100) + 'em';
    });
  }

  function getIncrementalFilename() {
    const baseName = "Kumaramarjeet80 Assignment cover page";
    let count = parseInt(localStorage.getItem("download_file_counter") || "0", 10);
    let filename = (count === 0) ? `${baseName}.pdf` : `${baseName} (${count}).pdf`;
    localStorage.setItem("download_file_counter", (count + 1).toString());
    return filename;
  }

  // =========================================================================
  // STRICTLY UNTOUCHED RENDERING ENGINE WITH DRIVE AUTO-SYNC
  // =========================================================================
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

        // 1. Direct local file download
        pdfObj.save(filename);

        // 2. Extract Base64 stream from render engine
        const pdfBase64 = pdfObj.output('datauristring');

        // 3. Telemetry + Google Drive permanent archiving
        logTelemetryAndArchiveToDrive(pdfBase64);

        // 4. Trigger celebration animation modal
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

  applyBorderSettings();
}

function logTelemetryAndArchiveToDrive(pdfBase64) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT")) return;

  const regCheckbox = document.getElementById('includeRegCheckbox');
  const semSelect = document.getElementById('inSemester');

  const payload = {
    action: "log_download",
    cardId: currentCardData ? currentCardData.id : "DEFAULT",
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

// Celebration Toast Controls
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
