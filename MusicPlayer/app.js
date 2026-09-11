// Register Service Worker for Offline Access
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }
  
  // IndexedDB Setup for local song persistence
  const DB_NAME = 'AmarjeetMusicDB';
  const STORE_NAME = 'tracks';
  let db;
  
  function initDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_NAME)) {
          d.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => { db = req.result; resolve(); };
      req.onerror = reject;
    });
  }
  
  function dbGetAll() {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
    });
  }
  
  function dbSave(record) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).add(record);
      tx.oncomplete = () => resolve();
    });
  }
  
  function dbDelete(id) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
    });
  }
  
  // Audio Nodes Setup
  const audio = document.getElementById('audio-engine');
  let audioCtx, sourceNode, preampGain;
  const bands = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
  const defaultGains = [18.2, 11.8, 3.7, -1.7, -7.8, 2.1, 9.8, 14.1, -3.6, 11.6];
  const defaultPreamp = 14.1;
  let filters = [];
  
  function setupAudioContext() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(audio);
  
    // Preamp Gain Node
    preampGain = audioCtx.createGain();
    preampGain.gain.value = Math.pow(10, defaultPreamp / 20);
  
    // Create 10-band filters
    let prevNode = preampGain;
    bands.forEach((freq, idx) => {
      const filter = audioCtx.createBiquadFilter();
      filter.type = idx === 0 ? 'lowshelf' : idx === bands.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = freq;
      filter.gain.value = defaultGains[idx];
      prevNode.connect(filter);
      prevNode = filter;
      filters.push(filter);
    });
  
    sourceNode.connect(preampGain);
    prevNode.connect(audioCtx.destination);
  }
  
  // State
  let playlist = [];
  let currentIndex = -1;
  
  // Elements
  const playBtn = document.getElementById('btn-play');
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  const seekBar = document.getElementById('seek-bar');
  const currTime = document.getElementById('curr-time');
  const durTime = document.getElementById('dur-time');
  const volSlider = document.getElementById('vol-slider');
  const volLabel = document.getElementById('vol-label');
  const currentTitle = document.getElementById('current-title');
  const playlistUl = document.getElementById('playlist-ul');
  const filePicker = document.getElementById('file-picker');
  const eqPreamp = document.getElementById('eq-preamp');
  const valPreamp = document.getElementById('val-preamp');
  const eqInputs = document.querySelectorAll('[data-band]');
  const eqEnable = document.getElementById('eq-enable');
  
  // Set Initial Default Volume to 20%
  audio.volume = 0.20;
  
  // Render Playlist UI
  function renderPlaylist() {
    playlistUl.innerHTML = '';
    playlist.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = `playlist-item ${index === currentIndex ? 'active' : ''}`;
  
      const titleSpan = document.createElement('span');
      titleSpan.className = 'item-name';
      titleSpan.textContent = `${index + 1}. ${item.name}`;
      titleSpan.onclick = () => playTrack(index);
  
      const actions = document.createElement('div');
      actions.className = 'item-actions';
  
      // Move Up
      const btnUp = document.createElement('button');
      btnUp.textContent = '▲';
      btnUp.onclick = (e) => { e.stopPropagation(); moveTrack(index, -1); };
  
      // Move Down
      const btnDown = document.createElement('button');
      btnDown.textContent = '▼';
      btnDown.onclick = (e) => { e.stopPropagation(); moveTrack(index, 1); };
  
      // Delete
      const btnDel = document.createElement('button');
      btnDel.textContent = '✖';
      btnDel.onclick = async (e) => {
        e.stopPropagation();
        await dbDelete(item.id);
        playlist.splice(index, 1);
        if (currentIndex === index) {
          audio.pause();
          audio.src = '';
          currentTitle.textContent = 'No Track Selected';
        } else if (currentIndex > index) {
          currentIndex--;
        }
        renderPlaylist();
      };
  
      actions.append(btnUp, btnDown, btnDel);
      li.append(titleSpan, actions);
      playlistUl.appendChild(li);
    });
  }
  
  function moveTrack(from, delta) {
    const to = from + delta;
    if (to < 0 || to >= playlist.length) return;
    const temp = playlist[from];
    playlist[from] = playlist[to];
    playlist[to] = temp;
    if (currentIndex === from) currentIndex = to;
    else if (currentIndex === to) currentIndex = from;
    renderPlaylist();
  }
  
  function playTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    setupAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  
    currentIndex = index;
    const item = playlist[currentIndex];
    audio.src = URL.createObjectURL(item.blob);
    audio.play();
    playBtn.textContent = '⏸';
    currentTitle.textContent = item.name;
  
    // MediaSession (Lock Screen & Background playback notifications)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.name,
        artist: 'Made by & for Amarjeet kumar',
        album: 'Amarjeet Playlist',
        artwork: [{ src: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png', sizes: '512x512', type: 'image/png' }]
      });
  
      navigator.mediaSession.setActionHandler('play', () => { audio.play(); playBtn.textContent = '⏸'; });
      navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); playBtn.textContent = '▶'; });
      navigator.mediaSession.setActionHandler('previoustrack', () => playTrack(currentIndex - 1));
      navigator.mediaSession.setActionHandler('nexttrack', () => playTrack(currentIndex + 1));
    }
  
    renderPlaylist();
  }
  
  // File Picker
  filePicker.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      const record = { name: file.name, blob: file };
      await dbSave(record);
    }
    playlist = await dbGetAll();
    renderPlaylist();
  });
  
  // Controls
  playBtn.onclick = () => {
    setupAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!audio.src && playlist.length > 0) return playTrack(0);
    if (audio.paused) {
      audio.play();
      playBtn.textContent = '⏸';
    } else {
      audio.pause();
      playBtn.textContent = '▶';
    }
  };
  
  prevBtn.onclick = () => playTrack(currentIndex - 1);
  nextBtn.onclick = () => playTrack(currentIndex + 1);
  audio.onended = () => playTrack(currentIndex + 1);
  
  // Volume
  volSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    audio.volume = val / 100;
    volLabel.textContent = `${val}%`;
  });
  
  // Time & Seek Bar
  function formatTime(s) {
    const m = Math.floor(s / 60) || 0;
    const sec = Math.floor(s % 60) || 0;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  }
  
  audio.ontimeupdate = () => {
    if (!audio.duration) return;
    seekBar.value = (audio.currentTime / audio.duration) * 100;
    currTime.textContent = formatTime(audio.currentTime);
    durTime.textContent = formatTime(audio.duration);
  };
  
  seekBar.oninput = () => {
    if (audio.duration) {
      audio.currentTime = (seekBar.value / 100) * audio.duration;
    }
  };
  
  // Equalizer Events
  eqInputs.forEach((slider) => {
    slider.addEventListener('input', (e) => {
      const bandIdx = parseInt(e.target.dataset.band, 10);
      const val = parseFloat(e.target.value);
      if (filters[bandIdx]) filters[bandIdx].gain.value = val;
      document.getElementById(`val-${bands[bandIdx]}`).textContent = `${val}dB`;
    });
  });
  
  eqPreamp.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valPreamp.textContent = `${val}dB`;
    if (preampGain) preampGain.gain.value = Math.pow(10, val / 20);
  });
  
  eqEnable.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    filters.forEach((f, idx) => {
      f.gain.value = isEnabled ? parseFloat(eqInputs[idx].value) : 0;
    });
    if (preampGain) {
      preampGain.gain.value = isEnabled ? Math.pow(10, parseFloat(eqPreamp.value) / 20) : 1;
    }
  });
  
  // Bootstrapping
  initDB().then(async () => {
    playlist = await dbGetAll();
    renderPlaylist();
  });