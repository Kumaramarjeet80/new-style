// Service Worker Registration for Instant Offline Execution
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// 4-Second Notification with Animated Green Progress Bar
function showNotification(msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-msg">${msg}</div>
    <div class="toast-progress"></div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Lightweight IndexedDB Store
const DB_NAME = 'AmarjeetStudioLiteDB';
const DB_VER = 1;
let db;

function initDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('playlists')) {
        d.createObjectStore('playlists', { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains('tracks')) {
        const trk = d.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
        trk.createIndex('playlistId', 'playlistId', { unique: false });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => resolve();
  });
}

const dbOps = {
  async getPlaylists() {
    return new Promise((res) => {
      const tx = db.transaction('playlists', 'readonly');
      tx.objectStore('playlists').getAll().onsuccess = (e) => res(e.target.result || []);
    });
  },
  async savePlaylist(pl) {
    return new Promise((res) => {
      const tx = db.transaction('playlists', 'readwrite');
      tx.objectStore('playlists').put(pl);
      tx.oncomplete = () => res();
    });
  },
  async getTracks(playlistId) {
    return new Promise((res) => {
      const tx = db.transaction('tracks', 'readonly');
      const idx = tx.objectStore('tracks').index('playlistId');
      idx.getAll(playlistId).onsuccess = (e) => res(e.target.result || []);
    });
  },
  async saveTrack(track) {
    return new Promise((res) => {
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').add(track);
      tx.oncomplete = () => res();
    });
  },
  async updateTrack(track) {
    return new Promise((res) => {
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').put(track);
      tx.oncomplete = () => res();
    });
  },
  async deleteTrack(id) {
    return new Promise((res) => {
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').delete(id);
      tx.oncomplete = () => res();
    });
  }
};

// AUDIO DSP ENGINE (Prevents crackling, distortion & farfarahat sound)
const audio = document.getElementById('audio-engine');
let audioCtx, sourceNode, preampGain, masterGainNode, compressor;
const bands = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
const defaultGains = [18.2, 11.8, 3.7, -1.7, -7.8, 2.1, 9.8, 14.1, -3.6, 11.6];
const defaultPreamp = 14.1;
let filters = [];
let currentVol = 0.20; // Default 20% Volume

function ensureAudioNodes() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(audio);

    preampGain = audioCtx.createGain();
    preampGain.gain.value = Math.pow(10, defaultPreamp / 20) * 0.45;

    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = currentVol;

    compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, audioCtx.currentTime);
    compressor.knee.setValueAtTime(12, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(10, audioCtx.currentTime);

    let prev = preampGain;
    bands.forEach((freq, i) => {
      const f = audioCtx.createBiquadFilter();
      f.type = i === 0 ? 'lowshelf' : i === bands.length - 1 ? 'highshelf' : 'peaking';
      if (i !== 0 && i !== bands.length - 1) f.Q.value = 1.4;
      f.frequency.value = freq;
      f.gain.value = defaultGains[i];
      prev.connect(f);
      prev = f;
      filters.push(f);
    });

    sourceNode.connect(preampGain);
    prev.connect(compressor);
    compressor.connect(masterGainNode);
    masterGainNode.connect(audioCtx.destination);
  } catch (err) {
    console.error('Audio setup exception', err);
  }
}

function setVolume(pct) {
  currentVol = pct / 100;
  audio.volume = currentVol;
  if (masterGainNode && audioCtx) {
    masterGainNode.gain.setValueAtTime(currentVol, audioCtx.currentTime);
  }
  document.getElementById('vol-popup-slider').value = pct;
  document.getElementById('vol-popup-label').textContent = `${pct}%`;
}

// State
let activePlaylistId = 'default';
let currentPlaylist = null;
let tracks = [];
let currentIndex = -1;
let newBase64Cover = null;

const DEFAULT_ART = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 24 24' fill='%232ea043'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z'/%3E%3C/svg%3E";

// UI References
const welcomeModal = document.getElementById('welcome-modal');
const playlistTabs = document.getElementById('playlist-tabs');
const songList = document.getElementById('song-list');
const reorderList = document.getElementById('reorder-list');
const viewPlaylistName = document.getElementById('view-playlist-name');
const trackCountLabel = document.getElementById('track-count-label');
const miniCover = document.getElementById('mini-cover');
const miniTitle = document.getElementById('mini-title');
const miniSub = document.getElementById('mini-sub');
const barBtnPlay = document.getElementById('bar-btn-play');

const nowPlayingPanel = document.getElementById('now-playing-panel');
const panelCover = document.getElementById('panel-cover');
const panelTitle = document.getElementById('panel-title');
const panelPlaylist = document.getElementById('panel-playlist');
const seekBar = document.getElementById('seek-bar');
const currTime = document.getElementById('curr-time');
const durTime = document.getElementById('dur-time');

// 1. Welcome Modal Dismissal (Works reliably on mobile & desktop)
document.getElementById('btn-close-welcome').addEventListener('click', () => {
  welcomeModal.style.display = 'none';
  ensureAudioNodes();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  showNotification('Welcome to Amarjeet Studio!');
});

// Load Playlists
async function loadPlaylists() {
  let list = await dbOps.getPlaylists();
  if (!list.length) {
    const def = { id: 'default', name: 'Favorites', cover: DEFAULT_ART };
    await dbOps.savePlaylist(def);
    list = [def];
  }
  playlistTabs.innerHTML = '';
  list.forEach((p) => {
    const chip = document.createElement('div');
    chip.className = `chip ${p.id === activePlaylistId ? 'active' : ''}`;
    chip.innerHTML = `<img src="${p.cover || DEFAULT_ART}" class="chip-img" /><span>${p.name}</span>`;
    chip.onclick = () => {
      activePlaylistId = p.id;
      loadPlaylists();
    };
    playlistTabs.appendChild(chip);
  });

  currentPlaylist = list.find((p) => p.id === activePlaylistId) || list[0];
  activePlaylistId = currentPlaylist.id;
  viewPlaylistName.textContent = currentPlaylist.name;
  miniCover.src = currentPlaylist.cover || DEFAULT_ART;
  panelCover.src = currentPlaylist.cover || DEFAULT_ART;
  loadTracks();
}

// Load Tracks
async function loadTracks() {
  tracks = await dbOps.getTracks(activePlaylistId);
  tracks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  trackCountLabel.textContent = `${tracks.length} track${tracks.length === 1 ? '' : 's'}`;

  songList.innerHTML = '';
  if (!tracks.length) {
    songList.innerHTML = '<li style="color:var(--text-muted);text-align:center;padding:24px 0;">No songs here yet. Tap "➕ Add Songs".</li>';
    return;
  }

  tracks.forEach((trk, idx) => {
    const li = document.createElement('li');
    li.className = `song-row ${idx === currentIndex ? 'active' : ''}`;

    const info = document.createElement('div');
    info.className = 'song-info';
    info.innerHTML = `<span class="song-name"><strong>${idx + 1}.</strong> ${trk.name}</span>`;
    info.onclick = () => playTrack(idx);

    const del = document.createElement('button');
    del.className = 'btn-del';
    del.innerHTML = '🗑';
    del.title = 'Delete Song';
    del.onclick = async (e) => {
      e.stopPropagation();
      await dbOps.deleteTrack(trk.id);
      showNotification(`Removed: ${trk.name}`);
      loadTracks();
    };

    li.append(info, del);
    songList.appendChild(li);
  });
}

// Dynamic Client-side Image Compression (Keeps storage fast and lightweight)
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 180;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 180, 180);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Create Playlist Modal Handlers
const createModal = document.getElementById('playlist-create-modal');
const newPlaylistName = document.getElementById('new-playlist-name');
const newPlaylistImg = document.getElementById('new-playlist-img');
const previewArt = document.getElementById('preview-art-tag');

document.getElementById('btn-open-create-playlist').onclick = () => {
  newPlaylistName.value = '';
  newBase64Cover = DEFAULT_ART;
  previewArt.src = DEFAULT_ART;
  createModal.style.display = 'flex';
};
document.getElementById('btn-cancel-playlist').onclick = () => createModal.style.display = 'none';

newPlaylistImg.onchange = async (e) => {
  if (e.target.files[0]) {
    newBase64Cover = await compressImage(e.target.files[0]);
    previewArt.src = newBase64Cover;
  }
};

document.getElementById('btn-confirm-playlist').onclick = async () => {
  const name = newPlaylistName.value.trim();
  if (!name) return;
  const pl = { id: 'pl_' + Date.now(), name, cover: newBase64Cover || DEFAULT_ART };
  await dbOps.savePlaylist(pl);
  createModal.style.display = 'none';
  activePlaylistId = pl.id;
  await loadPlaylists();
  showNotification(`Playlist created: ${name}`);
};

// Add Songs
document.getElementById('file-picker').onchange = async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  for (let i = 0; i < files.length; i++) {
    await dbOps.saveTrack({
      playlistId: activePlaylistId,
      name: files[i].name,
      blob: files[i],
      order: tracks.length + i
    });
  }
  showNotification(`Added ${files.length} song(s) successfully!`);
  loadTracks();
};

// Play Track Logic
function playTrack(idx) {
  if (idx < 0 || idx >= tracks.length) return;
  ensureAudioNodes();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  currentIndex = idx;
  const trk = tracks[currentIndex];
  audio.src = URL.createObjectURL(trk.blob);
  audio.play();

  miniTitle.textContent = trk.name;
  miniSub.textContent = `Playlist: ${currentPlaylist.name}`;
  panelTitle.textContent = trk.name;
  panelPlaylist.textContent = `Playlist: ${currentPlaylist.name}`;
  barBtnPlay.textContent = '⏸';

  // Lock Screen Notification with Custom Album Art & "Made by & for Amarjeet kumar"
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: trk.name,
      artist: 'Made by & for Amarjeet kumar',
      album: currentPlaylist.name,
      artwork: [{ src: currentPlaylist.cover || DEFAULT_ART, sizes: '192x192', type: 'image/png' }]
    });
    navigator.mediaSession.setActionHandler('play', () => { audio.play(); barBtnPlay.textContent = '⏸'; });
    navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); barBtnPlay.textContent = '▶'; });
    navigator.mediaSession.setActionHandler('nexttrack', () => loopNext());
    navigator.mediaSession.setActionHandler('previoustrack', () => playTrack(currentIndex > 0 ? currentIndex - 1 : tracks.length - 1));
  }

  loadTracks();
}

function togglePlay() {
  ensureAudioNodes();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (!audio.src && tracks.length) return playTrack(0);
  if (audio.paused) {
    audio.play();
    barBtnPlay.textContent = '⏸';
  } else {
    audio.pause();
    barBtnPlay.textContent = '▶';
  }
}

// Automatic Playlist Looping (Last track wraps back to first track)
function loopNext() {
  if (!tracks.length) return;
  let next = currentIndex + 1;
  if (next >= tracks.length) next = 0;
  playTrack(next);
}

barBtnPlay.onclick = (e) => { e.stopPropagation(); togglePlay(); };
audio.onended = loopNext;

// Toggle Upper Artwork Panel (Leaves bottom player bar visible and pinned)
const openPanelTrigger = document.getElementById('open-panel-trigger');
openPanelTrigger.onclick = () => {
  nowPlayingPanel.style.display = nowPlayingPanel.style.display === 'flex' ? 'none' : 'flex';
};
document.getElementById('btn-close-panel').onclick = () => {
  nowPlayingPanel.style.display = 'none';
};

// Floating Volume Popover
const volPopup = document.getElementById('volume-popup');
const btnBarVol = document.getElementById('bar-btn-volume');
btnBarVol.onclick = (e) => {
  e.stopPropagation();
  volPopup.style.display = volPopup.style.display === 'block' ? 'none' : 'block';
};
window.addEventListener('click', (e) => {
  if (!volPopup.contains(e.target) && e.target !== btnBarVol) {
    volPopup.style.display = 'none';
  }
});
document.getElementById('vol-popup-slider').oninput = (e) => setVolume(e.target.value);

// Seek Bar
audio.ontimeupdate = () => {
  if (!audio.duration) return;
  seekBar.value = (audio.currentTime / audio.duration) * 100;
  const cM = Math.floor(audio.currentTime / 60) || 0;
  const cS = Math.floor(audio.currentTime % 60) || 0;
  currTime.textContent = `${cM}:${cS < 10 ? '0' : ''}${cS}`;
  const dM = Math.floor(audio.duration / 60) || 0;
  const dS = Math.floor(audio.duration % 60) || 0;
  durTime.textContent = `${dM}:${dS < 10 ? '0' : ''}${dS}`;
};
seekBar.oninput = () => {
  if (audio.duration) audio.currentTime = (seekBar.value / 100) * audio.duration;
};

// Reorder View (Shift Tracks Up / Down)
const queueModal = document.getElementById('queue-modal');
document.getElementById('bar-btn-playlist').onclick = () => {
  renderReorderList();
  queueModal.style.display = 'flex';
};
document.getElementById('close-queue-btn').onclick = () => queueModal.style.display = 'none';

function renderReorderList() {
  reorderList.innerHTML = '';
  tracks.forEach((trk, idx) => {
    const li = document.createElement('li');
    li.className = 'song-row';
    li.innerHTML = `
      <span class="song-name" style="max-width:68%">${idx + 1}. ${trk.name}</span>
      <div>
        <button class="btn-action" onclick="shiftTrack(${idx}, -1)">▲</button>
        <button class="btn-action" onclick="shiftTrack(${idx}, 1)">▼</button>
      </div>
    `;
    reorderList.appendChild(li);
  });
}

window.shiftTrack = async (from, delta) => {
  const to = from + delta;
  if (to < 0 || to >= tracks.length) return;
  const temp = tracks[from];
  tracks[from] = tracks[to];
  tracks[to] = temp;
  for (let i = 0; i < tracks.length; i++) {
    tracks[i].order = i;
    await dbOps.updateTrack(tracks[i]);
  }
  if (currentIndex === from) currentIndex = to;
  else if (currentIndex === to) currentIndex = from;
  renderReorderList();
  loadTracks();
  showNotification('Playlist order updated');
};

// 10-Band Equalizer Modal Handlers
const eqModal = document.getElementById('eq-modal');
document.getElementById('bar-btn-eq').onclick = () => eqModal.style.display = 'flex';
document.getElementById('close-eq-btn').onclick = () => eqModal.style.display = 'none';

document.querySelectorAll('[data-band]').forEach((s) => {
  s.oninput = (e) => {
    const b = parseInt(e.target.dataset.band, 10);
    const val = parseFloat(e.target.value);
    if (filters[b]) filters[b].gain.value = val;
    document.getElementById(`val-${bands[b]}`).textContent = `${val}dB`;
  };
});
document.getElementById('eq-preamp').oninput = (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById('val-preamp').textContent = `${val}dB`;
  if (preampGain) preampGain.gain.value = Math.pow(10, val / 20) * 0.45;
};
document.getElementById('btn-reset-eq').onclick = () => {
  document.getElementById('eq-preamp').value = 14.1;
  document.getElementById('val-preamp').textContent = '14.1dB';
  if (preampGain) preampGain.gain.value = Math.pow(10, 14.1 / 20) * 0.45;

  defaultGains.forEach((g, i) => {
    const slider = document.querySelector(`[data-band="${i}"]`);
    slider.value = g;
    document.getElementById(`val-${bands[i]}`).textContent = `${g}dB`;
    if (filters[i]) filters[i].gain.value = g;
  });
  showNotification('Equalizer reset to VLC preset');
};

document.getElementById('eq-enable').onchange = (e) => {
  const on = e.target.checked;
  filters.forEach((f, i) => {
    f.gain.value = on ? parseFloat(document.querySelectorAll('[data-band]')[i].value) : 0;
  });
  showNotification(on ? 'Audio DSP Enabled' : 'DSP Bypassed');
};

// Initial App Bootstrapping
initDB().then(() => {
  loadPlaylists();
  setVolume(20); // 20% Initial default
});
