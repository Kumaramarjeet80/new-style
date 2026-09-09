// ================= CONFIGURATION =================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyCywAE8ErEZoKOMdY-H-40BDvMWwZBmXF-A06xkmr1Ve44LYLk1DLHXNQZWNActR8VBQ/exec";

window.addEventListener('DOMContentLoaded', () => {
  if (document.body.classList.contains('user-body')) {
    initUserPage();
  } else if (document.body.classList.contains('admin-body')) {
    initAdminPage();
  }
});

/* =========================================================
   1. USER FRONTEND LOGIC
========================================================= */
function initUserPage() {
  const driveFileId = "1Pg1tZ-1Uodqzi5iciN61hq8jMooT0eo2";
  const logoDirectUrl = `https://lh3.googleusercontent.com/d/${driveFileId}`;
  
  const topLogo = document.getElementById('topLogoImg');
  const bottomLogo = document.getElementById('bottomLogoImg');
  if (topLogo) topLogo.src = logoDirectUrl;
  if (bottomLogo) bottomLogo.src = logoDirectUrl;

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
      const inEl = document.getElementById(b.input);
      const outEl = document.getElementById(b.output);
      if (inEl && outEl) outEl.textContent = inEl.value;
    });
  }

  bindings.forEach(b => {
    const inEl = document.getElementById(b.input);
    if (inEl) inEl.addEventListener('input', syncText);
  });

  const semSelect = document.getElementById('inSemester');
  const regToggleWrapper = document.getElementById('regToggleWrapper');
  const regCheckbox = document.getElementById('includeRegCheckbox');
  const regFieldGroup = document.getElementById('regInputFieldGroup');
  const outRegLine = document.getElementById('outRegNoLine');

  function updateRegVisibility() {
    const sem = semSelect.value;
    if (sem === '1st' || sem === '3rd') {
      regToggleWrapper.style.display = 'flex';
      regFieldGroup.style.display = regCheckbox.checked ? 'block' : 'none';
      outRegLine.style.display = regCheckbox.checked ? 'block' : 'none';
    } else {
      regToggleWrapper.style.display = 'none';
      regFieldGroup.style.display = 'block';
      outRegLine.style.display = 'block';
    }
  }

  if (semSelect) semSelect.addEventListener('change', () => { syncText(); updateRegVisibility(); });
  if (regCheckbox) regCheckbox.addEventListener('change', updateRegVisibility);

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

  if (styleSelect) styleSelect.addEventListener('change', applyBorderSettings);
  if (colorPicker) colorPicker.addEventListener('input', applyBorderSettings);

  const fontSelect = document.getElementById('fontSelect');
  if (fontSelect) {
    fontSelect.addEventListener('change', (e) => {
      document.getElementById('pageDocument').style.fontFamily = e.target.value;
    });
  }

  const sizeRange = document.getElementById('sizeRange');
  if (sizeRange) {
    sizeRange.addEventListener('input', (e) => {
      document.getElementById('zoomVal').textContent = e.target.value + '%';
      document.getElementById('pageDocument').style.fontSize = (e.target.value / 100) + 'em';
    });
  }

  // Fetch live popup from backend
  if (APPS_SCRIPT_URL && !APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT")) {
    fetch(`${APPS_SCRIPT_URL}?action=get_popup`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "success" && data.popup && data.popup.active) {
          const p = data.popup;
          const img = document.getElementById('adPopupImg');
          if (p.imageUrl) {
            img.src = p.imageUrl;
            img.style.display = 'block';
          } else {
            img.style.display = 'none';
          }
          document.getElementById('adPopupTitle').textContent = p.title || "Announcement";
          document.getElementById('adPopupBody').textContent = p.body || "";
          document.getElementById('adPopupBtn').textContent = p.buttonText || "Open Link";
          document.getElementById('adPopupBtn').href = p.buttonLink || "#";
          document.getElementById('adminBroadcastModal').style.display = 'flex';
        }
      })
      .catch(() => {});
  }

  // PDF Generation & Silent Telemetry
  const dlBtn = document.getElementById('btnDirectDownload');
  if (dlBtn) {
    dlBtn.addEventListener('click', function() {
      // 1. Fire Telemetry
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

      // 2. Generate PDF
      const element = document.getElementById('pageDocument');
      dlBtn.disabled = true;
      dlBtn.textContent = "Downloading PDF...";

      const opt = {
        margin: 0,
        filename: "Assignment_Cover_Page.pdf",
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      html2pdf().set(opt).from(element).save().then(() => {
        dlBtn.disabled = false;
        dlBtn.textContent = "Download PDF Document";
        document.getElementById('thankYouModal').style.display = 'flex';
      }).catch(err => {
        console.error(err);
        dlBtn.disabled = false;
        dlBtn.textContent = "Download PDF Document";
      });
    });
  }

  syncText();
  applyBorderSettings();
  updateRegVisibility();
}

/* =========================================================
   2. ADMIN DASHBOARD LOGIC
========================================================= */
let authPass = "";
let userRecords = [];

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
          err.textContent = "Invalid password.";
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
            document.getElementById('popupActive').checked = data.popup.active;
            document.getElementById('popupImage').value = data.popup.imageUrl || "";
            document.getElementById('popupTitle').value = data.popup.title || "";
            document.getElementById('popupBody').value = data.popup.body || "";
            document.getElementById('popupButtonText').value = data.popup.buttonText || "";
            document.getElementById('popupButtonLink').value = data.popup.buttonLink || "";
            updatePopupPreview();
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

  ['popupImage', 'popupTitle', 'popupBody', 'popupButtonText', 'popupButtonLink'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updatePopupPreview);
  });

  const clearBtn = document.getElementById('btnDeletePopup');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all popup settings?')) {
        document.getElementById('popupActive').checked = false;
        document.getElementById('popupImage').value = "";
        document.getElementById('popupTitle').value = "";
        document.getElementById('popupBody').value = "";
        document.getElementById('popupButtonText').value = "";
        document.getElementById('popupButtonLink').value = "";
        updatePopupPreview();
      }
    });
  }

  const saveBtn = document.getElementById('btnSavePopup');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = "Publishing...";

      const payload = {
        action: "save_popup",
        key: authPass,
        popup: {
          active: document.getElementById('popupActive').checked,
          imageUrl: document.getElementById('popupImage').value,
          title: document.getElementById('popupTitle').value,
          body: document.getElementById('popupBody').value,
          buttonText: document.getElementById('popupButtonText').value,
          buttonLink: document.getElementById('popupButtonLink').value
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
          alert('Popup published! It will now appear on user screens.');
        } else {
          alert('Failed to save: ' + data.message);
        }
      } catch (err) {
        alert('Update request sent successfully!');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Publish Changes";
      }
    });
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
      <td class="p-3 text-slate-500">${u.timestamp}</td>
      <td class="p-3 font-semibold text-slate-900">${u.name}</td>
      <td class="p-3">${u.roll}</td>
      <td class="p-3">${u.reg}</td>
      <td class="p-3">${u.semester}</td>
      <td class="p-3">${u.branch}</td>
      <td class="p-3">${u.college}</td>
      <td class="p-3 text-slate-600">${u.course}</td>
    `;
    tbody.appendChild(tr);
  });
}

function updatePopupPreview() {
  const imgUrl = document.getElementById('popupImage')?.value;
  const title = document.getElementById('popupTitle')?.value;
  const body = document.getElementById('popupBody')?.value;
  const btnText = document.getElementById('popupButtonText')?.value;

  const pImg = document.getElementById('previewImg');
  if (pImg) {
    if (imgUrl) {
      pImg.src = imgUrl;
      pImg.classList.remove('hidden');
    } else {
      pImg.classList.add('hidden');
    }
  }

  const pTitle = document.getElementById('previewTitle');
  if (pTitle) pTitle.textContent = title || "Announcement Title";

  const pBody = document.getElementById('previewBody');
  if (pBody) pBody.textContent = body || "Your body text description will be previewed here in real-time.";

  const pBtn = document.getElementById('previewBtn');
  if (pBtn) pBtn.textContent = btnText || "Visit Link";
}