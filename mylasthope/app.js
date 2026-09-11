// Instant Service Worker Registration with relative scope for GitHub Pages subfolders
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
}

// 4-Second Notification with Animated Progress Bar
function showNotification(msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-msg">${msg}</div>
    <div class="toast-progress"></div>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// "Thanks!" Feedback Modal
function showThanksPopup(msg) {
  const modal = document.getElementById('thanks-modal');
  document.getElementById('thanks-msg').textContent = msg;
  modal.style.display = 'flex';
}
document.getElementById('btn-close-thanks').onclick = () => {
  document.getElementById('thanks-modal').style.display = 'none';
};

// IndexedDB Persistence
const DB_NAME = 'AmarjeetAudioStudioDB_v5';
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
      if (!d.objectStoreNames.contains('favorites')) {
        d.createObjectStore('favorites', { keyPath: 'songKey' });
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
  async getAllTracks() {
    return new Promise((res) => {
      const tx = db.transaction('tracks', 'readonly');
      tx.objectStore('tracks').getAll().onsuccess = (e) => res(e.target.result || []);
    });
  },
  async getTracks(playlistId) {
    if (playlistId === 'all') {
      return this.getAllTracks();
    }
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
  },
  async isFavorite(songKey) {
    return new Promise((res) => {
      const tx = db.transaction('favorites', 'readonly');
      const req = tx.objectStore('favorites').get(songKey);
      req.onsuccess = () => res(!!req.result);
    });
  },
  async setFavorite(songKey, trackData) {
    return new Promise((res) => {
      const tx = db.transaction('favorites', 'readwrite');
      tx.objectStore('favorites').put({ songKey, trackData });
      tx.oncomplete = () => res();
    });
  },
  async removeFavorite(songKey) {
    return new Promise((res) => {
      const tx = db.transaction('favorites', 'readwrite');
      tx.objectStore('favorites').delete(songKey);
      tx.oncomplete = () => res();
    });
  }
};

// PURE AUDIO ENGINE
const audio = document.getElementById('audio-engine');
let audioCtx, sourceNode, preampGain, masterGainNode;
const bands = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
const defaultGains = [18.2, 11.8, 3.7, -1.7, -7.8, 2.1, 9.8, 14.1, -3.6, 11.6];
const defaultPreamp = 14.1;
let filters = [];
let eqEnabled = true;
let currentVol = 0.20; // Default 20%

function setupAudioNodes() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(audio);

    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = currentVol;

    preampGain = audioCtx.createGain();
    preampGain.gain.value = Math.pow(10, defaultPreamp / 20) * 0.35;

    let prev = preampGain;
    bands.forEach((freq, i) => {
      const f = audioCtx.createBiquadFilter();
      f.type = i === 0 ? 'lowshelf' : i === bands.length - 1 ? 'highshelf' : 'peaking';
      if (i !== 0 && i !== bands.length - 1) f.Q.value = 1.0;
      f.frequency.value = freq;
      f.gain.value = defaultGains[i];
      prev.connect(f);
      prev = f;
      filters.push(f);
    });

    sourceNode.connect(preampGain);
    prev.connect(masterGainNode);
    masterGainNode.connect(audioCtx.destination);
  } catch (err) {
    console.error('Audio init err:', err);
  }
}

function setVolume(pct) {
  currentVol = pct / 100;
  audio.volume = currentVol;
  if (masterGainNode && audioCtx) {
    masterGainNode.gain.setValueAtTime(currentVol, audioCtx.currentTime);
  }
  document.getElementById('card-vol-slider').value = pct;
  document.getElementById('card-vol-label').textContent = `${pct}%`;
}

// State
let activePlaylistId = 'all';
let currentPlaylist = { id: 'all', name: 'All Songs', cover: '' };
let tracks = [];
let currentIndex = -1;
let newBase64Cover = null;

const DEFAULT_ART = "https://cdn-icons-png.flaticon.com/512/3844/3844724.png";

// UI references
const playlistTabs = document.getElementById('playlist-tabs');
const songList = document.getElementById('song-list');
const cardReorderList = document.getElementById('card-reorder-list');
const viewPlaylistName = document.getElementById('view-playlist-name');
const trackCountLabel = document.getElementById('track-count-label');

const miniCover = document.getElementById('mini-cover');
const miniTitle = document.getElementById('mini-title');
const miniSub = document.getElementById('mini-sub');
const barBtnPlay = document.getElementById('bar-btn-play');
const barBtnLike = document.getElementById('bar-btn-like');

const playerBoxModal = document.getElementById('player-box-modal');
const boxCover = document.getElementById('box-cover');
const boxTitle = document.getElementById('box-title');
const boxPlaylist = document.getElementById('box-playlist');
const boxBtnPrev = document.getElementById('box-btn-prev');
const boxBtnPlay = document.getElementById('box-btn-play');
const boxBtnNext = document.getElementById('box-btn-next');
const modalBtnLike = document.getElementById('modal-btn-like');

const seekBar = document.getElementById('seek-bar');
const currTime = document.getElementById('curr-time');
const durTime = document.getElementById('dur-time');

// Welcome Modal Dismissal
document.getElementById('btn-close-welcome').onclick = () => {
  document.getElementById('welcome-modal').style.display = 'none';
  setupAudioNodes();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  showNotification('Welcome to Amarjeet Studio!');
};

// Load Playlists
async function loadPlaylists() {
  let list = await dbOps.getPlaylists();
  if (!list.length) {
    const def = { id: 'favorites', name: 'Favorites', cover: DEFAULT_ART };
    await dbOps.savePlaylist(def);
    list = [def];
  }

  const allCategory = { id: 'all', name: 'All', cover: DEFAULT_ART };
  const combined = [allCategory, ...list];

  playlistTabs.innerHTML = '';
  combined.forEach((p) => {
    const chip = document.createElement('div');
    chip.className = `chip ${p.id === activePlaylistId ? 'active' : ''}`;
    chip.innerHTML = `<img src="${p.cover || DEFAULT_ART}" class="chip-img" /><span>${p.name}</span>`;
    chip.onclick = () => {
      activePlaylistId = p.id;
      loadPlaylists();
    };
    playlistTabs.appendChild(chip);
  });

  currentPlaylist = combined.find((p) => p.id === activePlaylistId) || allCategory;
  viewPlaylistName.textContent = currentPlaylist.name;
  miniCover.src = currentPlaylist.cover || DEFAULT_ART;
  boxCover.src = currentPlaylist.cover || DEFAULT_ART;
  loadTracks();
}

// Tracks Loading
async function loadTracks() {
  tracks = await dbOps.getTracks(activePlaylistId);
  tracks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  trackCountLabel.textContent = `${tracks.length} track${tracks.length === 1 ? '' : 's'}`;

  songList.innerHTML = '';
  if (!tracks.length) {
    songList.innerHTML = '<li style="color:var(--text-muted);text-align:center;padding:24px 0;">No songs here yet. Tap "➕ Add Songs".</li>';
    return;
  }

  for (let idx = 0; idx < tracks.length; idx++) {
    const trk = tracks[idx];
    const isFav = await dbOps.isFavorite(trk.name);

    const li = document.createElement('li');
    li.className = `song-row ${idx === currentIndex ? 'active' : ''}`;

    const info = document.createElement('div');
    info.className = 'song-info';
    info.innerHTML = `<span class="song-name"><strong>${idx + 1}.</strong> ${trk.name}</span>`;
    info.onclick = () => playTrack(idx);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const btnLikeRow = document.createElement('button');
    btnLikeRow.className = 'btn-icon-sm';
    btnLikeRow.innerHTML = isFav ? '❤️' : '💛';
    btnLikeRow.title = isFav ? 'Remove from Favorites' : 'Add to Favorites';
    btnLikeRow.onclick = async (e) => {
      e.stopPropagation();
      await toggleFavorite(trk);
    };

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

    actions.append(btnLikeRow, del);
    li.append(info, actions);
    songList.appendChild(li);
  }
}

// Toggle Favorite Logic
async function toggleFavorite(trk) {
  const songKey = trk.name;
  const isFav = await dbOps.isFavorite(songKey);

  let pls = await dbOps.getPlaylists();
  let favPlaylist = pls.find((p) => p.name.toLowerCase() === 'favorites') || pls[0];

  if (isFav) {
    await dbOps.removeFavorite(songKey);
    const favTracks = await dbOps.getTracks(favPlaylist.id);
    const existing = favTracks.find((t) => t.name === trk.name);
    if (existing) {
      await dbOps.deleteTrack(existing.id);
    }
    showNotification(`Removed "${trk.name}" from Favorites 💛`);
  } else {
    await dbOps.setFavorite(songKey, true);
    await dbOps.saveTrack({
      playlistId: favPlaylist.id,
      name: trk.name,
      blob: trk.blob,
      order: Date.now()
    });
    showThanksPopup(`"${trk.name}" added to Favorites ❤️!`);
  }

  if (currentIndex !== -1 && tracks[currentIndex] && tracks[currentIndex].name === trk.name) {
    const updatedFavState = await dbOps.isFavorite(songKey);
    updateLikeButtonsUI(updatedFavState);
  }

  loadTracks();
}

function updateLikeButtonsUI(isLiked) {
  const heart = isLiked ? '❤️' : '💛';
  barBtnLike.textContent = heart;
  modalBtnLike.textContent = heart;
}

// Image Compression
function compressImageSafe(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(DEFAULT_ART);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 240;
          let w = img.width;
          let h = img.height;
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch {
          resolve(e.target.result || DEFAULT_ART);
        }
      };
      img.onerror = () => resolve(DEFAULT_ART);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(DEFAULT_ART);
    reader.readAsDataURL(file);
  });
}

// Edit Cover
const editCoverInput = document.getElementById('edit-cover-input');
document.getElementById('btn-edit-art').onclick = () => editCoverInput.click();

editCoverInput.onchange = async (e) => {
  if (e.target.files && e.target.files[0]) {
    const newArt = await compressImageSafe(e.target.files[0]);
    miniCover.src = newArt;
    boxCover.src = newArt;

    if (currentPlaylist && currentPlaylist.id !== 'all') {
      currentPlaylist.cover = newArt;
      await dbOps.savePlaylist(currentPlaylist);
    }
    showNotification('Album cover image updated!');
    updateMediaSession();
  }
};

// Create Playlist Handlers
const createModal = document.getElementById('playlist-create-modal');
const newPlaylistName = document.getElementById('new-playlist-name');
const newPlaylistImg = document.getElementById('new-playlist-img');
const previewArt = document.getElementById('preview-art-tag');
const previewStatus = document.getElementById('preview-status-text');
const btnConfirmPlaylist = document.getElementById('btn-confirm-playlist');

document.getElementById('btn-open-create-playlist').onclick = () => {
  newPlaylistName.value = '';
  newPlaylistImg.value = '';
  newBase64Cover = DEFAULT_ART;
  previewArt.src = DEFAULT_ART;
  previewStatus.textContent = 'Default art selected';
  createModal.style.display = 'flex';
};

document.getElementById('btn-cancel-playlist').onclick = () => {
  createModal.style.display = 'none';
};

newPlaylistImg.onchange = async (e) => {
  if (e.target.files && e.target.files[0]) {
    previewStatus.textContent = 'Processing image...';
    newBase64Cover = await compressImageSafe(e.target.files[0]);
    previewArt.src = newBase64Cover;
    previewStatus.textContent = 'Image ready';
  }
};

btnConfirmPlaylist.addEventListener('click', async (e) => {
  e.preventDefault();
  const name = newPlaylistName.value.trim();
  if (!name) {
    showNotification('Please enter a playlist name!');
    newPlaylistName.focus();
    return;
  }

  btnConfirmPlaylist.disabled = true;
  btnConfirmPlaylist.textContent = 'Saving...';

  try {
    const pl = {
      id: 'pl_' + Date.now(),
      name,
      cover: newBase64Cover || DEFAULT_ART
    };
    await dbOps.savePlaylist(pl);
    createModal.style.display = 'none';
    activePlaylistId = pl.id;
    await loadPlaylists();
    showThanksPopup(`Playlist "${name}" created successfully!`);
  } catch (err) {
    console.error('Playlist create err:', err);
    showNotification('Could not save playlist. Try again.');
  } finally {
    btnConfirmPlaylist.disabled = false;
    btnConfirmPlaylist.textContent = 'Create';
  }
});

// Multiple Songs Added at Once
document.getElementById('file-picker').onchange = async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const targetPlaylistId = activePlaylistId === 'all' ? 'favorites' : activePlaylistId;

  for (let i = 0; i < files.length; i++) {
    await dbOps.saveTrack({
      playlistId: targetPlaylistId,
      name: files[i].name,
      blob: files[i],
      order: tracks.length + i
    });
  }

  showThanksPopup(`Successfully added ${files.length} song(s)!`);
  loadTracks();
};

// Play Track (Continuous background & lock screen support)
async function playTrack(idx) {
  if (idx < 0 || idx >= tracks.length) return;
  setupAudioNodes();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

  // If clicking the current track: do not restart
  if (currentIndex === idx && audio.src) {
    if (audio.paused) {
      audio.play();
      syncButtons(true);
    }
    return;
  }

  currentIndex = idx;
  const trk = tracks[currentIndex];
  audio.src = URL.createObjectURL(trk.blob);
  audio.play();

  miniTitle.textContent = trk.name;
  miniSub.textContent = `Playlist: ${currentPlaylist.name}`;
  boxTitle.textContent = trk.name;
  boxPlaylist.textContent = `Playlist: ${currentPlaylist.name}`;
  syncButtons(true);

  const isFav = await dbOps.isFavorite(trk.name);
  updateLikeButtonsUI(isFav);

  updateMediaSession();
  loadTracks();
}

// MediaSession: Continuous Background & Lock-Screen Notifications
function updateMediaSession() {
  if (!('mediaSession' in navigator) || currentIndex === -1) return;
  const trk = tracks[currentIndex];
  if (!trk) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: trk.name,
    artist: `Playlist: ${currentPlaylist.name} • Made by & for Amarjeet kumar`,
    album: `Playlist: ${currentPlaylist.name}`,
    artwork: [
      { src: currentPlaylist.cover || DEFAULT_ART, sizes: '96x96', type: 'image/png' },
      { src: currentPlaylist.cover || DEFAULT_ART, sizes: '192x192', type: 'image/png' },
      { src: currentPlaylist.cover || DEFAULT_ART, sizes: '512x512', type: 'image/png' }
    ]
  });

  navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';

  navigator.mediaSession.setActionHandler('play', () => { 
    audio.play(); 
    syncButtons(true); 
    navigator.mediaSession.playbackState = 'playing';
  });
  navigator.mediaSession.setActionHandler('pause', () => { 
    audio.pause(); 
    syncButtons(false); 
    navigator.mediaSession.playbackState = 'paused';
  });
  navigator.mediaSession.setActionHandler('nexttrack', () => loopNext());
  navigator.mediaSession.setActionHandler('previoustrack', () => playTrack(currentIndex > 0 ? currentIndex - 1 : tracks.length - 1));
}

function syncButtons(isPlaying) {
  barBtnPlay.textContent = isPlaying ? '⏸' : '▶';
  boxBtnPlay.textContent = isPlaying ? '⏸' : '▶';
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }
}

function togglePlay() {
  setupAudioNodes();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (!audio.src && tracks.length) return playTrack(0);
  if (audio.paused) {
    audio.play();
    syncButtons(true);
  } else {
    audio.pause();
    syncButtons(false);
  }
}

function loopNext() {
  if (!tracks.length) return;
  let next = currentIndex + 1;
  if (next >= tracks.length) next = 0;
  playTrack(next);
}

barBtnPlay.onclick = (e) => { e.stopPropagation(); togglePlay(); };
boxBtnPlay.onclick = togglePlay;
boxBtnPrev.onclick = () => playTrack(currentIndex > 0 ? currentIndex - 1 : tracks.length - 1);
boxBtnNext.onclick = loopNext;
audio.onended = loopNext;

barBtnLike.onclick = (e) => {
  e.stopPropagation();
  if (currentIndex !== -1 && tracks[currentIndex]) toggleFavorite(tracks[currentIndex]);
};
modalBtnLike.onclick = () => {
  if (currentIndex !== -1 && tracks[currentIndex]) toggleFavorite(tracks[currentIndex]);
};

// Fullscreen Player Card
document.getElementById('open-box-trigger').onclick = () => {
  playerBoxModal.style.display = 'flex';
};
document.getElementById('btn-close-box').onclick = () => {
  playerBoxModal.style.display = 'none';
};

// Embedded Panels
const cardVolPanel = document.getElementById('card-volume-panel');
const cardEqPanel = document.getElementById('card-eq-panel');
const cardPlaylistPanel = document.getElementById('card-playlist-panel');

const btnToggleVol = document.getElementById('card-toggle-volume');
const btnToggleEq = document.getElementById('card-toggle-eq');
const btnTogglePlaylist = document.getElementById('card-toggle-playlist');

btnToggleVol.onclick = () => {
  const isHidden = cardVolPanel.style.display === 'none';
  cardVolPanel.style.display = isHidden ? 'block' : 'none';
  btnToggleVol.classList.toggle('active', isHidden);
};

btnToggleEq.onclick = () => {
  const isHidden = cardEqPanel.style.display === 'none';
  cardEqPanel.style.display = isHidden ? 'block' : 'none';
  btnToggleEq.classList.toggle('active', isHidden);
};

btnTogglePlaylist.onclick = () => {
  const isHidden = cardPlaylistPanel.style.display === 'none';
  cardPlaylistPanel.style.display = isHidden ? 'block' : 'none';
  btnTogglePlaylist.classList.toggle('active', isHidden);
  if (isHidden) renderCardReorderList();
};

document.getElementById('card-vol-slider').oninput = (e) => setVolume(e.target.value);

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

// Reorder View
function renderCardReorderList() {
  cardReorderList.innerHTML = '';
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
    cardReorderList.appendChild(li);
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
  renderCardReorderList();
  loadTracks();
  showNotification('Playlist order updated');
};

// Equalizer
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
  if (preampGain) preampGain.gain.value = Math.pow(10, val / 20) * 0.35;
};

document.getElementById('card-eq-enable').onchange = (e) => {
  eqEnabled = e.target.checked;
  filters.forEach((f, i) => {
    f.gain.value = eqEnabled ? parseFloat(document.querySelectorAll('[data-band]')[i].value) : 0;
  });
  if (preampGain) {
    preampGain.gain.value = eqEnabled ? Math.pow(10, parseFloat(document.getElementById('eq-preamp').value) / 20) * 0.35 : 1;
  }
  showNotification(eqEnabled ? 'Equalizer active' : 'Direct hardware bypass (Zero distortion)');
};

document.getElementById('btn-reset-eq-card').onclick = () => {
  document.getElementById('eq-preamp').value = 14.1;
  document.getElementById('val-preamp').textContent = '14.1dB';
  if (preampGain) preampGain.gain.value = Math.pow(10, 14.1 / 20) * 0.35;
  defaultGains.forEach((g, i) => {
    const slider = document.querySelector(`[data-band="${i}"]`);
    slider.value = g;
    document.getElementById(`val-${bands[i]}`).textContent = `${g}dB`;
    if (filters[i]) filters[i].gain.value = g;
  });
  showNotification('Equalizer reset to VLC preset');
};

// Initial Boot
initDB().then(() => {
  loadPlaylists();
  setVolume(20);
});
