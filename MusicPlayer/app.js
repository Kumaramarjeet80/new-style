// Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(console.error);
}

// IndexedDB Initialization
const DB_NAME = 'AmarjeetStudioDB';
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

// Database Helpers
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
      const store = tx.objectStore('tracks');
      const idx = store.index('playlistId');
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

// AUDIO DSP ENGINE (Prevents Clipping, Distortion & Flutter)
const audio = document.getElementById('audio-engine');
let audioCtx, sourceNode, preampGain, compressor, limiter;
const bands = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
const defaultGains = [18.2, 11.8, 3.7, -1.7, -7.8, 2.1, 9.8, 14.1, -3.6, 11.6];
const defaultPreamp = 14.1;
let filters = [];

function setupAudioDSP() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioCtx.createMediaElementSource(audio);

  // Preamp Gain Node
  preampGain = audioCtx.createGain();
  // Safe scale to allow high boost without driving input directly into clipping
  preampGain.gain.value = Math.pow(10, defaultPreamp / 20) * 0.45;

  // Dynamics Compressor (Emulates hardware VLC limiter to suppress noise / crackling)
  compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, audioCtx.currentTime);
  compressor.knee.setValueAtTime(12, audioCtx.currentTime);
  compressor.ratio.setValueAtTime(10, audioCtx.currentTime);
  compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
  compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

  let prevNode = preampGain;
  bands.forEach((freq, i) => {
    const f = audioCtx.createBiquadFilter();
    if (i === 0) {
      f.type = 'lowshelf';
    } else if (i === bands.length - 1) {
      f.type = 'highshelf';
    } else {
      f.type = 'peaking';
      f.Q.value = 1.4; // Controlled bandwidth prevents harsh phase ringing
    }
    f.frequency.value = freq;
    f.gain.value = defaultGains[i];
    prevNode.connect(f);
    prevNode = f;
    filters.push(f);
  });

  sourceNode.connect(preampGain);
  prevNode.connect(compressor);
  compressor.connect(audioCtx.destination);
}

// Application State
let activePlaylistId = 'default';
let currentPlaylistMeta = null;
let currentTracks = [];
let currentIndex = -1;

const DEFAULT_ART = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 24 24' fill='%232ea043'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z'/%3E%3C/svg%3E";

// Default Initial Volume: 20%
audio.volume = 0.20;

// UI References
const playlistTabs = document.getElementById('playlist-tabs');
const songList = document.getElementById('song-list');
const reorderList = document.getElementById('reorder-list');
const viewPlaylistName = document.getElementById('view-playlist-name');
const filePicker = document.getElementById('file-picker');
const coverPicker = document.getElementById('cover-picker');

const miniPlayer = document.getElementById('mini-player');
const miniTitle = document.getElementById('mini-title');
const miniSub = document.getElementById('mini-sub');
const miniCover = document.getElementById('mini-cover');
const btnMiniPlay = document.getElementById('btn-mini-play');

const playerModal = document.getElementById('player-modal');
const queueModal = document.getElementById('queue-modal');
const modalSongTitle = document.getElementById('modal-song-title');
const modalPlaylistName = document.getElementById('modal-playlist-name');
const fullCover = document.getElementById('full-cover');

const btnPlay = document.getElementById('btn-play');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const seekBar = document.getElementById('seek-bar');
const currTime = document.getElementById('curr-time');
const durTime = document.getElementById('dur-time');
const volSlider = document.getElementById('vol-slider');
const volLabel = document.getElementById('vol-label');

// Render Playlists
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
    chip.textContent = p.name;
    chip.onclick = () => switchPlaylist(p.id);
    playlistTabs.appendChild(chip);
  });

  currentPlaylistMeta = pls.find((p) => p.id === activePlaylistId) || pls[0];
  activePlaylistId = currentPlaylistMeta.id;
  viewPlaylistName.textContent = currentPlaylistMeta.name;
  updateCoverDisplays(currentPlaylistMeta.cover || DEFAULT_ART);
  loadTracks();
}

function updateCoverDisplays(url) {
  miniCover.src = url;
  fullCover.src = url;
}

// Switch Active Playlist
async function switchPlaylist(id) {
  activePlaylistId = id;
  await loadPlaylists();
}

// Create New Playlist
document.getElementById('btn-new-playlist').onclick = async () => {
  const name = prompt('Enter Playlist Name:');
  if (!name) return;
  const newPl = { id: 'pl_' + Date.now(), name, cover: DEFAULT_ART };
  await dbOps.savePlaylist(newPl);
  activePlaylistId = newPl.id;
  loadPlaylists();
};

// Upload Custom Cover Art for Active Playlist
coverPicker.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    const b64 = evt.target.result;
    currentPlaylistMeta.cover = b64;
    await dbOps.savePlaylist(currentPlaylistMeta);
    updateCoverDisplays(b64);
    updateMediaSession();
  };
  reader.readAsDataURL(file);
};

// Load Tracks
async function loadTracks() {
  currentTracks = await dbOps.getTracks(activePlaylistId);
  currentTracks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  renderUpperSongList();
  renderReorderList();
}

// Render Upper Songs
function renderUpperSongList() {
  songList.innerHTML = '';
  currentTracks.forEach((trk, idx) => {
    const li = document.createElement('li');
    li.className = `song-row ${idx === currentIndex ? 'active' : ''}`;

    const info = document.createElement('div');
    info.className = 'song-info';
    info.innerHTML = `<strong class="song-name">${idx + 1}. ${trk.name}</strong>`;
    info.onclick = () => playTrack(idx);

    const btnDel = document.createElement('button');
    btnDel.className = 'btn-del';
    btnDel.textContent = '✖';
    btnDel.onclick = async (e) => {
      e.stopPropagation();
      await dbOps.deleteTrack(trk.id);
      loadTracks();
    };

    li.append(info, btnDel);
    songList.appendChild(li);
  });
}

// Render Reorder Modal
function renderReorderList() {
  reorderList.innerHTML = '';
  currentTracks.forEach((trk, idx) => {
    const li = document.createElement('li');
    li.className = 'song-row';
    li.innerHTML = `
      <span class="song-name" style="width:70%">${idx + 1}. ${trk.name}</span>
      <div>
        <button class="btn-sm" onclick="moveTrack(${idx}, -1)">▲</button>
        <button class="btn-sm" onclick="moveTrack(${idx}, 1)">▼</button>
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

  renderUpperSongList();
  renderReorderList();
};

// Add Audio Files
filePicker.onchange = async (e) => {
  const files = Array.from(e.target.files);
  for (let i = 0; i < files.length; i++) {
    await dbOps.saveTrack({
      playlistId: activePlaylistId,
      name: files[i].name,
      blob: files[i],
      order: currentTracks.length + i
    });
  }
  loadTracks();
};

// Playback Logic
function playTrack(idx) {
  if (idx < 0 || idx >= currentTracks.length) return;
  setupAudioDSP();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  currentIndex = idx;
  const track = currentTracks[currentIndex];
  audio.src = URL.createObjectURL(track.blob);
  audio.play();

  updatePlaybackUI();
  updateMediaSession();
  renderUpperSongList();
}

function updatePlaybackUI() {
  const track = currentTracks[currentIndex];
  if (!track) return;
  miniTitle.textContent = track.name;
  miniSub.textContent = `Playlist: ${currentPlaylistMeta.name}`;
  modalSongTitle.textContent = track.name;
  modalPlaylistName.textContent = `Playlist: ${currentPlaylistMeta.name}`;
  btnPlay.textContent = '⏸';
  btnMiniPlay.textContent = '⏸';
}

// Media Session with Custom Art, Name, and Attribution
function updateMediaSession() {
  if (!('mediaSession' in navigator) || currentIndex === -1) return;
  const track = currentTracks[currentIndex];
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.name,
    artist: 'Made by & for Amarjeet kumar',
    album: currentPlaylistMeta.name,
    artwork: [{ src: currentPlaylistMeta.cover || DEFAULT_ART, sizes: '512x512', type: 'image/png' }]
  });

  navigator.mediaSession.setActionHandler('play', () => { audio.play(); syncPlayBtns(true); });
  navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); syncPlayBtns(false); });
  navigator.mediaSession.setActionHandler('previoustrack', () => playTrack(currentIndex - 1));
  navigator.mediaSession.setActionHandler('nexttrack', () => playTrack(currentIndex + 1));
}

function syncPlayBtns(isPlaying) {
  btnPlay.textContent = isPlaying ? '⏸' : '▶';
  btnMiniPlay.textContent = isPlaying ? '⏸' : '▶';
}

// Play / Pause Click Handlers
function togglePlay() {
  setupAudioDSP();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!audio.src && currentTracks.length > 0) return playTrack(0);
  if (audio.paused) {
    audio.play();
    syncPlayBtns(true);
  } else {
    audio.pause();
    syncPlayBtns(false);
  }
}

btnPlay.onclick = togglePlay;
btnMiniPlay.onclick = (e) => { e.stopPropagation(); togglePlay(); };
btnPrev.onclick = () => playTrack(currentIndex - 1);
btnNext.onclick = () => playTrack(currentIndex + 1);
audio.onended = () => playTrack(currentIndex + 1);

// Volume Handler (Default is 20%)
volSlider.oninput = (e) => {
  const val = e.target.value;
  audio.volume = val / 100;
  volLabel.textContent = `${val}%`;
};

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

// Modals UI Toggle
document.getElementById('open-full-btn').onclick = () => { playerModal.style.display = 'flex'; };
document.getElementById('close-modal-btn').onclick = () => { playerModal.style.display = 'none'; };
document.getElementById('btn-open-queue').onclick = () => { queueModal.style.display = 'flex'; };
document.getElementById('close-queue-btn').onclick = () => { queueModal.style.display = 'none'; };

// Equalizer Sliders
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

document.getElementById('eq-enable').onchange = (e) => {
  const on = e.target.checked;
  filters.forEach((f, i) => {
    f.gain.value = on ? parseFloat(document.querySelectorAll('[data-band]')[i].value) : 0;
  });
};

// Bootstrap
initDB().then(() => loadPlaylists());
