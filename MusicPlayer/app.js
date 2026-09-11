// Auto-updating Service Worker for offline capability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated' && !navigator.serviceWorker.controller) {
            window.location.reload();
          }
        });
      });
    }).catch(console.error);

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

// Toast Notification System
function showToast(msg) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2900);
}

// IndexedDB Persistence
const DB_NAME = 'AmarjeetAudioStudioDB';
const DB_VER = 1;
let db;

function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('playlists')) {
        d.createObjectStore('playlists', { keyPath: 'id' });
      }
      if (!d.objectStoreNames.contains('tracks')) {
        const trkStore = d.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
        trkStore.createIndex('playlistId', 'playlistId', { unique: false });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = reject;
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
  async updateTrackOrder(track) {
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

// AUDIO DSP & VOLUME ENGINE
const audio = document.getElementById('audio-engine');
let audioCtx, sourceNode, preampGain, masterGainNode, compressor;
const bands = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
const defaultGains = [18.2, 11.8, 3.7, -1.7, -7.8, 2.1, 9.8, 14.1, -3.6, 11.6];
const defaultPreamp = 14.1;
let filters = [];

// System volume set to 20% by default
let currentVolumeFraction = 0.20;

function setupAudioDSP() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioCtx.createMediaElementSource(audio);

  // Preamp Gain
  preampGain = audioCtx.createGain();
  preampGain.gain.value = Math.pow(10, defaultPreamp / 20) * 0.45;

  // Master Gain Node for guaranteed hardware-level volume control
  masterGainNode = audioCtx.createGain();
  masterGainNode.gain.value = currentVolumeFraction;

  // Dynamics Compressor to stop crackle / flutter
  compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, audioCtx.currentTime);
  compressor.knee.setValueAtTime(12, audioCtx.currentTime);
  compressor.ratio.setValueAtTime(10, audioCtx.currentTime);
  compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
  compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

  let prevNode = preampGain;
  bands.forEach((freq, idx) => {
    const f = audioCtx.createBiquadFilter();
    f.type = idx === 0 ? 'lowshelf' : idx === bands.length - 1 ? 'highshelf' : 'peaking';
    if (idx !== 0 && idx !== bands.length - 1) f.Q.value = 1.4;
    f.frequency.value = freq;
    f.gain.value = defaultGains[idx];
    prevNode.connect(f);
    prevNode = f;
    filters.push(f);
  });

  sourceNode.connect(preampGain);
  prevNode.connect(compressor);
  compressor.connect(masterGainNode);
  masterGainNode.connect(audioCtx.destination);
}

// Dedicated Volume Setter (HTML5 audio + Web Audio node)
function applyVolume(percent) {
  currentVolumeFraction = percent / 100;
  audio.volume = currentVolumeFraction;
  if (masterGainNode && audioCtx) {
    masterGainNode.gain.setValueAtTime(currentVolumeFraction, audioCtx.currentTime);
  }
  // Sync all volume inputs & labels
  document.getElementById('vol-slider').value = percent;
  document.getElementById('vol-popup-slider').value = percent;
  document.getElementById('vol-label').textContent = `${percent}%`;
  document.getElementById('vol-popup-label').textContent = `${percent}%`;
}

// State
let activePlaylistId = 'default';
let currentPlaylistMeta = null;
let currentTracks = [];
let currentIndex = -1;
let newPlaylistBase64Art = null;

const DEFAULT_ART = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 24 24' fill='%232ea043'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z'/%3E%3C/svg%3E";

// UI references
const playlistTabs = document.getElementById('playlist-tabs');
const songList = document.getElementById('song-list');
const reorderList = document.getElementById('reorder-list');
const viewPlaylistName = document.getElementById('view-playlist-name');
const trackCountLabel = document.getElementById('track-count-label');
const filePicker = document.getElementById('file-picker');

const miniCover = document.getElementById('mini-cover');
const miniTitle = document.getElementById('mini-title');
const miniSub = document.getElementById('mini-sub');
const barBtnPlay = document.getElementById('bar-btn-play');

const playerModal = document.getElementById('player-modal');
const queueModal = document.getElementById('queue-modal');
const eqModal = document.getElementById('eq-modal');
const volumePopup = document.getElementById('volume-popup');
const fullCover = document.getElementById('full-cover');
const modalSongTitle = document.getElementById('modal-song-title');
const modalPlaylistName = document.getElementById('modal-playlist-name');

const btnPlay = document.getElementById('btn-play');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const seekBar = document.getElementById('seek-bar');
const currTime = document.getElementById('curr-time');
const durTime = document.getElementById('dur-time');

// Welcome Modal
document.getElementById('btn-close-welcome').onclick = () => {
  document.getElementById('welcome-modal').style.display = 'none';
  setupAudioDSP();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  showToast('Welcome to Amarjeet Studio!');
};

// Playlists Loading
async function loadPlaylists() {
  let pls = await dbOps.getPlaylists();
  if (pls.length === 0) {
    const def = { id: 'default', name: 'Favorites', cover: DEFAULT_ART };
    await dbOps.savePlaylist(def);
    pls = [def];
  }
  playlistTabs.innerHTML = '';
  pls.forEach((p) => {
    const chip = document.createElement('div');
    chip.className = `chip ${p.id === activePlaylistId ? 'active' : ''}`;
    chip.innerHTML = `
      <img src="${p.cover || DEFAULT_ART}" class="chip-img" alt="art" />
      <span>${p.name}</span>
    `;
    chip.onclick = () => switchPlaylist(p.id);
    playlistTabs.appendChild(chip);
  });

  currentPlaylistMeta = pls.find((p) => p.id === activePlaylistId) || pls[0];
  activePlaylistId = currentPlaylistMeta.id;
  viewPlaylistName.textContent = currentPlaylistMeta.name;
  updateCovers(currentPlaylistMeta.cover || DEFAULT_ART);
  loadTracks();
}

function updateCovers(url) {
  miniCover.src = url;
  fullCover.src = url;
}

async function switchPlaylist(id) {
  activePlaylistId = id;
  await loadPlaylists();
  showToast(`Switched to: ${currentPlaylistMeta.name}`);
}

// Create Playlist Modal Handlers
const createModal = document.getElementById('playlist-create-modal');
const newPlaylistNameInput = document.getElementById('new-playlist-name');
const newPlaylistImgInput = document.getElementById('new-playlist-img');
const previewArtTag = document.getElementById('preview-art-tag');

document.getElementById('btn-open-create-playlist').onclick = () => {
  newPlaylistNameInput.value = '';
  newPlaylistBase64Art = DEFAULT_ART;
  previewArtTag.src = DEFAULT_ART;
  createModal.style.display = 'flex';
};

document.getElementById('btn-cancel-playlist').onclick = () => {
  createModal.style.display = 'none';
};

newPlaylistImgInput.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    newPlaylistBase64Art = ev.target.result;
    previewArtTag.src = newPlaylistBase64Art;
  };
  reader.readAsDataURL(file);
};

document.getElementById('btn-confirm-playlist').onclick = async () => {
  const name = newPlaylistNameInput.value.trim();
  if (!name) {
    showToast('Please enter a playlist name!');
    return;
  }
  const newPl = {
    id: 'pl_' + Date.now(),
    name,
    cover: newPlaylistBase64Art || DEFAULT_ART
  };
  await dbOps.savePlaylist(newPl);
  createModal.style.display = 'none';
  activePlaylistId = newPl.id;
  await loadPlaylists();
  showToast(`Playlist "${name}" created!`);
};

// Tracks Loading
async function loadTracks() {
  currentTracks = await dbOps.getTracks(activePlaylistId);
  currentTracks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  trackCountLabel.textContent = `${currentTracks.length} song${currentTracks.length === 1 ? '' : 's'}`;
  renderUpperSongs();
  renderReorderView();
}

function renderUpperSongs() {
  songList.innerHTML = '';
  if (currentTracks.length === 0) {
    songList.innerHTML = '<li style="color:var(--text-muted);text-align:center;padding:24px 0;">No songs here yet. Click "➕ Add Songs" above.</li>';
    return;
  }
  currentTracks.forEach((trk, idx) => {
    const li = document.createElement('li');
    li.className = `song-row ${idx === currentIndex ? 'active' : ''}`;

    const info = document.createElement('div');
    info.className = 'song-info';
    info.innerHTML = `<span class="song-name"><strong>${idx + 1}.</strong> ${trk.name}</span>`;
    info.onclick = () => playTrack(idx);

    const btnDel = document.createElement('button');
    btnDel.className = 'btn-del';
    btnDel.innerHTML = '🗑';
    btnDel.title = 'Delete Song';
    btnDel.onclick = async (e) => {
      e.stopPropagation();
      await dbOps.deleteTrack(trk.id);
      showToast(`Removed "${trk.name}"`);
      loadTracks();
    };

    li.append(info, btnDel);
    songList.appendChild(li);
  });
}

function renderReorderView() {
  reorderList.innerHTML = '';
  currentTracks.forEach((trk, idx) => {
    const li = document.createElement('li');
    li.className = 'song-row';
    li.innerHTML = `
      <span class="song-name" style="max-width:68%">${idx + 1}. ${trk.name}</span>
      <div>
        <button class="btn-action" onclick="moveTrack(${idx}, -1)">▲</button>
        <button class="btn-action" onclick="moveTrack(${idx}, 1)">▼</button>
      </div>
    `;
    reorderList.appendChild(li);
  });
}

window.moveTrack = async function(from, delta) {
  const to = from + delta;
  if (to < 0 || to >= currentTracks.length) return;
  const temp = currentTracks[from];
  currentTracks[from] = currentTracks[to];
  currentTracks[to] = temp;

  for (let i = 0; i < currentTracks.length; i++) {
    currentTracks[i].order = i;
    await dbOps.updateTrackOrder(currentTracks[i]);
  }
  if (currentIndex === from) currentIndex = to;
  else if (currentIndex === to) currentIndex = from;

  renderUpperSongs();
  renderReorderView();
  showToast('Playlist track order updated');
};

// Add Songs
filePicker.onchange = async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  for (let i = 0; i < files.length; i++) {
    await dbOps.saveTrack({
      playlistId: activePlaylistId,
      name: files[i].name,
      blob: files[i],
      order: currentTracks.length + i
    });
  }
  showToast(`Added ${files.length} song(s) successfully!`);
  loadTracks();
};

// Play Track
function playTrack(idx) {
  if (idx < 0 || idx >= currentTracks.length) return;
  setupAudioDSP();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  currentIndex = idx;
  const trk = currentTracks[currentIndex];
  audio.src = URL.createObjectURL(trk.blob);
  audio.play();

  miniTitle.textContent = trk.name;
  miniSub.textContent = `Playlist: ${currentPlaylistMeta.name}`;
  modalSongTitle.textContent = trk.name;
  modalPlaylistName.textContent = `Playlist: ${currentPlaylistMeta.name}`;
  btnPlay.textContent = '⏸';
  barBtnPlay.textContent = '⏸';

  updateMediaSession(trk);
  renderUpperSongs();
  showToast(`Playing: ${trk.name}`);
}

// Media Session (Lock screen notification)
function updateMediaSession(trk) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: trk.name,
    artist: 'Made by & for Amarjeet kumar',
    album: currentPlaylistMeta.name,
    artwork: [{ src: currentPlaylistMeta.cover || DEFAULT_ART, sizes: '512x512', type: 'image/png' }]
  });

  navigator.mediaSession.setActionHandler('play', () => { audio.play(); syncButtons(true); });
  navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); syncButtons(false); });
  navigator.mediaSession.setActionHandler('previoustrack', () => playTrack(currentIndex - 1));
  navigator.mediaSession.setActionHandler('nexttrack', () => playNextWithLoop());
}

function syncButtons(isPlaying) {
  btnPlay.textContent = isPlaying ? '⏸' : '▶';
  barBtnPlay.textContent = isPlaying ? '⏸' : '▶';
}

function togglePlay() {
  setupAudioDSP();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (!audio.src && currentTracks.length > 0) return playTrack(0);
  if (audio.paused) {
    audio.play();
    syncButtons(true);
    showToast('Resumed playback');
  } else {
    audio.pause();
    syncButtons(false);
    showToast('Paused');
  }
}

// Infinite Loop: If last song ends, repeat the playlist from index 0
function playNextWithLoop() {
  if (currentTracks.length === 0) return;
  let nextIdx = currentIndex + 1;
  if (nextIdx >= currentTracks.length) {
    nextIdx = 0; // Loop back to the first song
    showToast('Repeating playlist from start');
  }
  playTrack(nextIdx);
}

barBtnPlay.onclick = (e) => { e.stopPropagation(); togglePlay(); };
btnPlay.onclick = togglePlay;
btnPrev.onclick = () => playTrack(currentIndex > 0 ? currentIndex - 1 : currentTracks.length - 1);
btnNext.onclick = playNextWithLoop;
audio.onended = playNextWithLoop;

// Open Modals from Bottom Bar Icons
document.getElementById('open-full-player').onclick = () => { playerModal.style.display = 'flex'; };
document.getElementById('close-modal-btn').onclick = () => { playerModal.style.display = 'none'; };

document.getElementById('bar-btn-playlist').onclick = () => { queueModal.style.display = 'flex'; };
document.getElementById('close-queue-btn').onclick = () => { queueModal.style.display = 'none'; };
document.getElementById('btn-open-queue').onclick = () => { queueModal.style.display = 'flex'; };

document.getElementById('bar-btn-eq').onclick = () => { eqModal.style.display = 'flex'; };
document.getElementById('close-eq-btn').onclick = () => { eqModal.style.display = 'none'; };

// Volume Popup Toggle
const btnBarVolume = document.getElementById('bar-btn-volume');
btnBarVolume.onclick = (e) => {
  e.stopPropagation();
  volumePopup.style.display = volumePopup.style.display === 'none' ? 'block' : 'none';
};
window.addEventListener('click', (e) => {
  if (!volumePopup.contains(e.target) && e.target !== btnBarVolume) {
    volumePopup.style.display = 'none';
  }
});

// Dual Volume Slider Synchronization
document.getElementById('vol-slider').oninput = (e) => applyVolume(e.target.value);
document.getElementById('vol-popup-slider').oninput = (e) => applyVolume(e.target.value);

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

// Equalizer Inputs
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
  showToast('Equalizer reset to default preset');
};

document.getElementById('eq-enable').onchange = (e) => {
  const on = e.target.checked;
  filters.forEach((f, i) => {
    f.gain.value = on ? parseFloat(document.querySelector(`[data-band="${i}"]`).value) : 0;
  });
  showToast(on ? 'Audio DSP Enabled' : 'DSP Bypassed');
};

// Initial Bootstrap
initDB().then(() => {
  loadPlaylists();
  applyVolume(20); // 20% Initial default
});
