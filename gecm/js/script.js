// ================= CONFIGURATION =================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwhT3ciWfe0Yst0lwhekIs1wAzuXeX7GclWKkrHAV3eU7-PMrPGt6NZ0ubKuMrgFaGGTg/exec";

window.addEventListener('DOMContentLoaded', () => {
  if (document.body.classList.contains('user-body')) {
    initUserPage();
  } else if (document.body.classList.contains('admin-body')) {
    initAdminPage();
  }
});

/* =========================================================
   1. USER FRONTEND RUNTIME
========================================================= */
function initUserPage() {
  // Mobile drawer toggle
  const mobileToggleBtn = document.getElementById('btnToggleMobileSidebar');
  const sidebar = document.querySelector('.editor-sidebar');
  if (mobileToggleBtn && sidebar) {
    mobileToggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      mobileToggleBtn.textContent = sidebar.classList.contains('open') ? '✕ Close Editor' : '⚙ Open Controls';
    });
  }

  // Drive direct stream URL for file ID 1Pg1tZ-1Uodqzi5iciN61hq8jMooT0eo2
  const driveFileId = "1Pg1tZ-1Uodqzi5iciN61hq8jMooT0eo2";
  const logoDirectUrl = `https://lh3.googleusercontent.com/d/${driveFileId}`;

  const topLogo = document.getElementById('topLogoImg');
  const bottomLogo = document.getElementById('bottomLogoImg');

  topLogo.src = logoDirectUrl;
  bottomLogo.src = logoDirectUrl;

  // Field bindings
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

  function syncText() {
    bindings.forEach(b => {
      document.getElementById(b.output).textContent = document.getElementById(b.input).value;
    });
  }

  bindings.forEach(b => {
    document.getElementById(b.input).addEventListener('input', syncText);
  });

  // Semester and Registration Number Visibility Logic
  const semSelect = document.getElementById('inSemester');
  const regToggleWrapper = document.getElementById('regToggleWrapper');
  const regCheckbox = document.getElementById('includeRegCheckbox');
  const regFieldGroup = document.getElementById('regInputFieldGroup');
  const outRegLine = document.getElementById('outRegNoLine');

  function updateRegVisibility() {
    const sem = semSelect.value;
    const isFirstOrThird = (sem === '1st' || sem === '3rd');

    if (isFirstOrThird) {
      regToggleWrapper.style.display = 'flex';
      if (regCheckbox.checked) {
        regFieldGroup.style.display = 'block';
        outRegLine.style.display = 'block';
      } else {
        regFieldGroup.style.display = 'none';
        outRegLine.style.display = 'none';
      }
    } else {
      regToggleWrapper.style.display = 'none';
      regFieldGroup.style.display = 'block';
      outRegLine.style.display = 'block';
    }
  }

  semSelect.addEventListener('change', () => {
    syncText();
    updateRegVisibility();
  });
  regCheckbox.addEventListener('change', updateRegVisibility);

  // Border Settings
  const outerBorder = document.getElementById('outerBorder');
  const innerBorder = document.getElementById('innerBorder');
  const colorPicker = document.getElementById('borderColorPicker');
  const styleSelect = document.getElementById('borderStyleSelect');

  function applyBorderSettings() {
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

  styleSelect.addEventListener('change', applyBorderSettings);
  colorPicker.addEventListener('input', applyBorderSettings);

  // Font Family Selector
  document.getElementById('fontSelect').addEventListener('change', function(e) {
    document.getElementById('pageDocument').style.fontFamily = e.target.value;
  });

  // Font Size Scaling
  document.getElementById('sizeRange').addEventListener('input', function(e) {
    const scalePercent = e.target.value;
    document.getElementById('zoomVal').textContent = scalePercent + '%';
    document.getElementById('pageDocument').style.fontSize = (scalePercent / 100) + 'em';
  });

  // Fetch Live Popup with Recurrence Engine
  if (APPS_SCRIPT_URL && !APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT")) {
    fetch(`${APPS_SCRIPT_URL}?action=get_popup`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "success" && data.popup && data.popup.active) {
          setupPopupRecurrence(data.popup);
        }
      })
      .catch(() => {});
  }

  // ================= PDF GENERATION (IDENTICAL - ZERO MODIFICATIONS) =================
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

  document.getElementById('btnDirectDownload').addEventListener('click', function() {
    // 1. Silent Background Telemetry
    if (APPS_SCRIPT_URL && !APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT")) {
      const payload = {
        name: document.getElementById('inStudentName')?.value || 'N/A',
        roll: document.getElementById('inRollNo')?.value || 'N/A',
        reg: (regCheckbox.checked || !['1st', '3rd'].includes(semSelect.value)) ? document.getElementById('inRegNo')?.value : 'N/A',
        semester: document.getElementById('inSemester')?.value || 'N/A',
        branch: document.getElementById('inBranch')?.value || 'N/A',
        college: (document.getElementById('inCollege1')?.value || '') + ' ' + (document.getElementById('inCollege2')?.value || ''),
        course: document.getElementById('inCourseName')?.value || 'N/A',
        faculty: document.getElementById('inFacultyName')?.value || 'N/A'
      };

      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    }

    // 2. Exact PDF Execution (Untouched)
    const element = document.getElementById('pageDocument');
    const filename = getIncrementalFilename();
    const btn = document.getElementById('btnDirectDownload');

    btn.disabled = true;
    btn.textContent = "Downloading PDF...";

    const opt = {
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      btn.disabled = false;
      btn.textContent = "Download PDF Document";
      document.getElementById('thankYouModal').style.display = 'flex';
    }).catch(err => {
      console.error(err);
      btn.disabled = false;
      btn.textContent = "Download PDF Document";
    });
  });

  // Initial setup
  syncText();
  applyBorderSettings();
  updateRegVisibility();
}

function setupPopupRecurrence(p) {
  showUserPopup(p);

  const intervalMinutes = Math.max(0.5, Number(p.intervalMinutes) || 1);
  const intervalMs = intervalMinutes * 60 * 1000;

  setInterval(() => {
    const modal = document.getElementById('adminBroadcastModal');
    if (modal && modal.style.display !== 'flex') {
      showUserPopup(p);
    }
  }, intervalMs);
}

// Convert Drive links, YouTube URLs, and video sources into safe embed links
function formatVideoEmbedUrl(url) {
  if (!url) return "";

  // 1. Google Drive Links (lh3, uc?id=, or /file/d/ links) converted to /preview embed
  if (url.includes("drive.google.com") || url.includes("googleusercontent.com")) {
    const driveMatch = url.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    }
  }

  // 2. YouTube Links converted to embed format
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&playsinline=1`;
  }

  return url;
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

  // Handle Photo vs. Video Media Rendering
  const mediaType = p.mediaType || "image";
  const mediaUrl = p.mediaUrl || "";

  imgEl.style.display = "none";
  videoEl.style.display = "none";
  iframeEl.style.display = "none";
  videoEl.pause();
  iframeEl.src = "";

  if (mediaUrl) {
    heroWrap.style.display = "flex";
    if (mediaType === "video") {
      const isDirectRawFile = mediaUrl.endsWith(".mp4") || mediaUrl.endsWith(".webm");
      const isDriveOrYt = mediaUrl.includes("google.com") || 
                          mediaUrl.includes("googleusercontent.com") || 
                          mediaUrl.includes("youtube.com") || 
                          mediaUrl.includes("youtu.be");

      if (isDriveOrYt || !isDirectRawFile) {
        // Drive uploads and YouTube must use iframe preview
        iframeEl.src = formatVideoEmbedUrl(mediaUrl);
        iframeEl.style.display = "block";
      } else {
        // Direct standalone external .mp4 files use native HTML5 video
        videoEl.src = mediaUrl;
        videoEl.style.display = "block";
        videoEl.play().catch(() => {});
      }
    } else {
      imgEl.src = mediaUrl;
      imgEl.style.display = "block";
    }
  } else {
    heroWrap.style.display = "none";
  }

  // Text content
  document.getElementById('adPopupTitle').textContent = p.title || "Announcement";
  document.getElementById('adPopupBody').textContent = p.body || "";
  
  const actionBtn = document.getElementById('adPopupBtn');
  actionBtn.textContent = p.buttonText || "Open Link";
  actionBtn.href = p.buttonLink || "#";

  // Handle Entire Card Clickable vs. Button Only
  const clickMode = p.clickMode || "button";
  if (clickMode === "card" && p.buttonLink) {
    modalBox.classList.add('clickable-card');
    modalBox.onclick = (e) => {
      // Do not trigger if user clicks close button
      if (e.target.closest('#adPopupCloseBtn')) return;
      window.open(p.buttonLink, '_blank');
    };
  } else {
    modalBox.classList.remove('clickable-card');
    modalBox.onclick = null;
  }

  // Closing Mode Configuration
  const mode = p.closeMode || "both";
  const seconds = Math.max(1, Number(p.timerSeconds) || 5);

  if (mode === "timer") {
    closeBtn.style.display = "none";
  } else {
    closeBtn.style.display = "flex";
  }

  function hideModal() {
    modal.style.display = "none";
    videoEl.pause();
    iframeEl.src = "";
  }

  if (mode === "timer" || mode === "both") {
    timerWrap.style.display = "block";
    timerBadge.style.display = "inline-block";
    let remaining = seconds;
    timerBadge.textContent = `Closing automatically in ${remaining}s...`;

    timerBar.style.transition = `transform ${seconds}s linear`;
    timerBar.style.transform = "scaleX(1)";
    setTimeout(() => { timerBar.style.transform = "scaleX(0)"; }, 50);

    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        timerBadge.textContent = `Closing automatically in ${remaining}s...`;
      } else {
        clearInterval(interval);
        hideModal();
      }
    }, 1000);

    closeBtn.onclick = (e) => {
      e.stopPropagation();
      clearInterval(interval);
      hideModal();
    };
  } else {
    timerWrap.style.display = "none";
    timerBadge.style.display = "none";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      hideModal();
    };
  }

  modal.style.display = "flex";
}

/* =========================================================
   2. ADMIN MANAGEMENT RUNTIME
========================================================= */
let authPass = "";
let userRecords = [];
let pendingMediaFile = null;

function initAdminPage() {
  const loginBtn = document.getElementById('btnLogin');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const pass = document.getElementById('adminPassword').value;
      const err = document.getElementById('loginError');

      loginBtn.disabled = true;
      loginBtn.textContent = "Verifying...";
      err.classList.add('hidden');

      try {
        const res = await fetch(`${APPS_SCRIPT_URL}?key=${encodeURIComponent(pass)}`);
        const data = await res.json();

        if (data.status === "unauthorized") {
          err.textContent = "Invalid admin password.";
          err.classList.remove('hidden');
        } else if (data.status === "success") {
          authPass = pass;
          document.getElementById('loginView').classList.add('hidden');
          document.getElementById('dashboardView').classList.remove('hidden');
          document.getElementById('authStatusBadge').textContent = "Authenticated";
          document.getElementById('authStatusBadge').className = "text-xs text-emerald-400 font-semibold";

          userRecords = data.users;
          document.getElementById('totalCount').textContent = data.count;
          renderUsers(userRecords);

          if (data.popup) {
            populateAdminPopupForm(data.popup);
          }
        }
      } catch (e) {
        err.textContent = "Failed to connect to backend.";
        err.classList.remove('hidden');
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Login & Load Studio";
      }
    });
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      renderUsers(userRecords.filter(u =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.roll && u.roll.toLowerCase().includes(q)) ||
        (u.reg && u.reg.toLowerCase().includes(q)) ||
        (u.college && u.college.toLowerCase().includes(q))
      ));
    });
  }

  // Handle direct file upload (photo or video)
  const fileInput = document.getElementById('popupFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          pendingMediaFile = {
            base64: evt.target.result,
            name: file.name
          };
          updateMediaPreviewLocal(evt.target.result, file.type.startsWith("video") ? "video" : "image");
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Media Type Change Listener
  const mediaTypeSelect = document.getElementById('popupMediaType');
  if (mediaTypeSelect) {
    mediaTypeSelect.addEventListener('change', () => {
      const isVideo = mediaTypeSelect.value === 'video';
      document.getElementById('videoUrlInputWrap').style.display = isVideo ? 'block' : 'none';
      updatePopupPreview();
    });
  }

  // Input Listeners for Real-time Preview
  [
    'popupTitle', 'popupBody', 'popupButtonText', 
    'popupButtonLink', 'popupMediaUrl', 'popupClickMode',
    'popupCloseMode', 'popupTimerSeconds', 'popupIntervalMinutes'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updatePopupPreview);
  });

  const modeSelect = document.getElementById('popupCloseMode');
  if (modeSelect) {
    modeSelect.addEventListener('change', () => {
      const timerGroup = document.getElementById('timerInputGroup');
      if (modeSelect.value === 'manual') {
        timerGroup.style.opacity = '0.4';
        document.getElementById('popupTimerSeconds').disabled = true;
      } else {
        timerGroup.style.opacity = '1';
        document.getElementById('popupTimerSeconds').disabled = false;
      }
      updatePopupPreview();
    });
  }

  // Deactivate & Clear Popup
  const clearBtn = document.getElementById('btnDeletePopup');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (!confirm('Deactivate and delete this popup from all user screens?')) return;

      document.getElementById('popupActive').checked = false;
      document.getElementById('popupMediaType').value = "image";
      document.getElementById('popupMediaUrl').value = "";
      document.getElementById('popupTitle').value = "";
      document.getElementById('popupBody').value = "";
      document.getElementById('popupButtonText').value = "";
      document.getElementById('popupButtonLink').value = "";
      document.getElementById('popupClickMode').value = "button";
      document.getElementById('popupCloseMode').value = "both";
      document.getElementById('popupTimerSeconds').value = "5";
      document.getElementById('popupIntervalMinutes').value = "1";
      document.getElementById('popupFileInput').value = "";
      document.getElementById('videoUrlInputWrap').style.display = "none";
      pendingMediaFile = null;

      hideAllPreviewMedia();
      updatePopupPreview();
      savePopupToServer();
    });
  }

  const saveBtn = document.getElementById('btnSavePopup');
  if (saveBtn) {
    saveBtn.addEventListener('click', savePopupToServer);
  }
}

function hideAllPreviewMedia() {
  const pImg = document.getElementById('previewImg');
  const pVideo = document.getElementById('previewVideo');
  const pIframe = document.getElementById('previewIframe');
  pImg.classList.add('hidden');
  pVideo.classList.add('hidden');
  pIframe.classList.add('hidden');
  pVideo.pause();
  pIframe.src = "";
}

function updateMediaPreviewLocal(src, type) {
  hideAllPreviewMedia();
  if (type === "video") {
    const pVideo = document.getElementById('previewVideo');
    pVideo.src = src;
    pVideo.classList.remove('hidden');
    pVideo.play().catch(() => {});
  } else {
    const pImg = document.getElementById('previewImg');
    pImg.src = src;
    pImg.classList.remove('hidden');
  }
}

function populateAdminPopupForm(p) {
  document.getElementById('popupActive').checked = p.active;
  document.getElementById('popupMediaType').value = p.mediaType || "image";
  document.getElementById('popupMediaUrl').value = p.mediaUrl || "";
  document.getElementById('popupTitle').value = p.title || "";
  document.getElementById('popupBody').value = p.body || "";
  document.getElementById('popupButtonText').value = p.buttonText || "";
  document.getElementById('popupButtonLink').value = p.buttonLink || "";
  document.getElementById('popupClickMode').value = p.clickMode || "button";
  document.getElementById('popupCloseMode').value = p.closeMode || "both";
  document.getElementById('popupTimerSeconds').value = p.timerSeconds || 5;
  document.getElementById('popupIntervalMinutes').value = p.intervalMinutes || 1;

  const isVideo = p.mediaType === "video";
  document.getElementById('videoUrlInputWrap').style.display = isVideo ? "block" : "none";

  hideAllPreviewMedia();

  if (p.mediaUrl) {
    if (isVideo) {
      const isDirectRawFile = p.mediaUrl.endsWith(".mp4") || p.mediaUrl.endsWith(".webm");
      const isDriveOrYt = p.mediaUrl.includes("google.com") || 
                          p.mediaUrl.includes("googleusercontent.com") || 
                          p.mediaUrl.includes("youtube.com") || 
                          p.mediaUrl.includes("youtu.be");

      if (isDriveOrYt || !isDirectRawFile) {
        const pIframe = document.getElementById('previewIframe');
        pIframe.src = formatVideoEmbedUrl(p.mediaUrl);
        pIframe.classList.remove('hidden');
      } else {
        const pVideo = document.getElementById('previewVideo');
        pVideo.src = p.mediaUrl;
        pVideo.classList.remove('hidden');
      }
    } else {
      const pImg = document.getElementById('previewImg');
      pImg.src = p.mediaUrl;
      pImg.classList.remove('hidden');
    }
  }

  const timerGroup = document.getElementById('timerInputGroup');
  if (p.closeMode === 'manual') {
    timerGroup.style.opacity = '0.4';
    document.getElementById('popupTimerSeconds').disabled = true;
  } else {
    timerGroup.style.opacity = '1';
    document.getElementById('popupTimerSeconds').disabled = false;
  }

  updatePopupPreview();
}

async function savePopupToServer() {
  const saveBtn = document.getElementById('btnSavePopup');
  saveBtn.disabled = true;
  saveBtn.textContent = "Uploading & Saving...";

  const mediaType = document.getElementById('popupMediaType').value;
  const manualUrl = document.getElementById('popupMediaUrl').value;

  const payload = {
    action: "save_popup",
    key: authPass,
    popup: {
      active: document.getElementById('popupActive').checked,
      mediaType: mediaType,
      mediaFile: pendingMediaFile,
      mediaUrl: pendingMediaFile ? "" : manualUrl,
      title: document.getElementById('popupTitle').value,
      body: document.getElementById('popupBody').value,
      buttonText: document.getElementById('popupButtonText').value,
      buttonLink: document.getElementById('popupButtonLink').value,
      clickMode: document.getElementById('popupClickMode').value,
      closeMode: document.getElementById('popupCloseMode').value,
      timerSeconds: Number(document.getElementById('popupTimerSeconds').value) || 5,
      intervalMinutes: Number(document.getElementById('popupIntervalMinutes').value) || 1
    }
  };

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === "success") {
      alert('Popup published successfully! All changes applied.');
      pendingMediaFile = null;
    } else {
      alert('Failed: ' + data.message);
    }
  } catch (err) {
    alert('Update sent to server.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Publish Changes";
  }
}

function renderUsers(list) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-400">No downloads logged yet.</td></tr>';
    return;
  }
  list.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 text-slate-500 whitespace-nowrap">${u.timestamp}</td>
      <td class="p-3 font-semibold text-slate-900 whitespace-nowrap">${u.name}</td>
      <td class="p-3 whitespace-nowrap">${u.roll}</td>
      <td class="p-3 whitespace-nowrap">${u.reg}</td>
      <td class="p-3 whitespace-nowrap">${u.semester}</td>
      <td class="p-3 whitespace-nowrap">${u.branch}</td>
      <td class="p-3 whitespace-nowrap">${u.college}</td>
      <td class="p-3 text-slate-600 whitespace-nowrap">${u.course}</td>
    `;
    tbody.appendChild(tr);
  });
}

function updatePopupPreview() {
  const title = document.getElementById('popupTitle')?.value;
  const body = document.getElementById('popupBody')?.value;
  const btnText = document.getElementById('popupButtonText')?.value;
  const clickMode = document.getElementById('popupClickMode')?.value;
  const mode = document.getElementById('popupCloseMode')?.value;
  const seconds = document.getElementById('popupTimerSeconds')?.value;
  const interval = document.getElementById('popupIntervalMinutes')?.value;

  const pTitle = document.getElementById('previewTitle');
  if (pTitle) pTitle.textContent = title || "Announcement Title";

  const pBody = document.getElementById('previewBody');
  if (pBody) pBody.textContent = body || "Your body text description will be previewed here in real-time.";

  const pBtn = document.getElementById('previewBtn');
  if (pBtn) pBtn.textContent = btnText || "Visit Link";

  const pClose = document.getElementById('previewCloseIcon');
  if (pClose) {
    pClose.style.display = (mode === "timer") ? "none" : "flex";
  }

  const pBadge = document.getElementById('previewTimingBadge');
  if (pBadge) {
    let modeText = "";
    if (mode === "manual") modeText = "Manual close only";
    else if (mode === "timer") modeText = `Auto-closes in ${seconds}s`;
    else modeText = `Closes via × or after ${seconds}s`;

    const clickText = clickMode === "card" ? "Whole Card Clickable" : "Button Only Clickable";
    pBadge.textContent = `${clickText} • ${modeText} • Re-triggers every ${interval} min`;
  }
}
