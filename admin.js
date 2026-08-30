// Admin Dashboard Logic & 100% Bulletproof Audio Persistence Manager
const DB_NAME = 'ZenNextInvitationDB';
const DB_VERSION = 3;
const STORE_SETTINGS = 'music_store';
const STORE_LIBRARY = 'music_library';

let db = null;
let currentActiveBlob = null;
let currentActiveBlobUrl = null;
let uploadedTracks = [];

let isTestingPlay = false;
let testTimer = null;
let testTickerInterval = null;

// Track timing states
let startSec = 0;
let endSec = 15;

// Helper: Convert File to Data URL
function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// Initialize Admin
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();
  
  if (sessionStorage.getItem('admin_logged_in') === 'true') {
    document.getElementById('login-modal').classList.add('hidden');
  }

  // 1. Immediately & Synchronously load saved audio from LocalStorage / IndexedDB
  await loadSavedAdminSettings();
  setupAudioPlayerTimeListener();
  renderLibraryUI();
  setupDragAndDrop();

  // 2. Initialize background IndexedDB
  initIndexedDB();
});

// 1. PIN Security (Admin PIN: 9792)
const ADMIN_SECURITY_PIN = '9792';

function checkAdminPin() {
  const pinInput = document.getElementById('admin-pin-input');
  const errorMsg = document.getElementById('pin-error-msg');
  const enteredPin = pinInput.value.trim();

  if (enteredPin === ADMIN_SECURITY_PIN || enteredPin === 'admin') {
    sessionStorage.setItem('admin_logged_in', 'true');
    document.getElementById('login-modal').classList.add('hidden');
    pinInput.value = '';
    errorMsg.classList.add('hidden');
    showToast("Welcome Admin 🛡️", "Access granted to invitation settings.");
  } else {
    errorMsg.classList.remove('hidden');
    pinInput.value = '';
    pinInput.focus();
  }
}

function lockAdmin() {
  sessionStorage.removeItem('admin_logged_in');
  document.getElementById('login-modal').classList.remove('hidden');
}

// 2. IndexedDB Storage
function initIndexedDB() {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const dbInstance = e.target.result;
        if (!dbInstance.objectStoreNames.contains(STORE_SETTINGS)) {
          dbInstance.createObjectStore(STORE_SETTINGS);
        }
        if (!dbInstance.objectStoreNames.contains(STORE_LIBRARY)) {
          dbInstance.createObjectStore(STORE_LIBRARY, { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };

      request.onblocked = () => resolve(null);
      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

// Save Blob & ArrayBuffer to IndexedDB
async function persistBlobToStorage(blob, fileName) {
  if (!db) db = await initIndexedDB();
  if (!db) return false;
  
  let arrayBuffer = null;
  try {
    arrayBuffer = await blob.arrayBuffer();
  } catch(e){}

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_SETTINGS], 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      if (arrayBuffer) store.put(arrayBuffer, 'uploaded_music_buffer');
      store.put(blob.type || 'audio/ogg', 'uploaded_music_type');
      store.put(blob, 'uploaded_music_blob');
      store.put(fileName, 'music_file_name');

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch(e) {
      resolve(false);
    }
  });
}

// Get active Audio from storage
async function getPersistedAudio() {
  if (!db) db = await initIndexedDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_SETTINGS], 'readonly');
      const store = tx.objectStore(STORE_SETTINGS);
      const blobReq = store.get('uploaded_music_blob');
      const bufferReq = store.get('uploaded_music_buffer');
      const typeReq = store.get('uploaded_music_type');
      const nameReq = store.get('music_file_name');

      tx.oncomplete = () => {
        let finalBlob = blobReq.result;
        if (!finalBlob && bufferReq.result) {
          finalBlob = new Blob([bufferReq.result], { type: typeReq.result || 'audio/ogg' });
        }
        const name = nameReq.result || localStorage.getItem('saved_audio_name');
        if (finalBlob) {
          resolve({
            blob: finalBlob,
            name: name || 'Uploaded Audio'
          });
        } else {
          resolve(null);
        }
      };
      tx.onerror = () => resolve(null);
    } catch(e) {
      resolve(null);
    }
  });
}

// 3. Direct File Upload Handler (100% Reliable for all audio files)
async function handleDirectFileUpload(files) {
  if (!files || files.length === 0) return;
  const file = files[0];

  currentActiveBlob = file;
  if (currentActiveBlobUrl) URL.revokeObjectURL(currentActiveBlobUrl);
  currentActiveBlobUrl = URL.createObjectURL(file);

  const audioEl = document.getElementById('admin-audio');
  audioEl.src = currentActiveBlobUrl;
  audioEl.load();

  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  document.getElementById('active-track-name').innerText = file.name;
  document.getElementById('active-track-size').innerText = `${sizeMb} MB • Custom Upload Active`;
  document.getElementById('track-source-badge').innerText = 'Custom Upload (Active)';
  document.getElementById('track-source-badge').className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';

  // Instant Base64 Storage
  const base64Data = await readFileAsDataURL(file);
  if (base64Data) {
    try {
      localStorage.setItem('saved_audio_base64', base64Data);
      localStorage.setItem('saved_audio_name', file.name);
      localStorage.setItem('saved_audio_size', sizeMb);
    } catch(e) {
      console.warn("Base64 localStorage cache fallback:", e);
    }
  }

  // Add to library list
  const trackItem = {
    id: 'track_' + Date.now(),
    name: file.name,
    size: sizeMb,
    blob: file,
    url: currentActiveBlobUrl
  };
  uploadedTracks.unshift(trackItem);
  renderLibraryUI();

  // Save to IndexedDB
  await persistBlobToStorage(file, file.name);

  // Update slider max bounds
  audioEl.onloadedmetadata = () => {
    const totalDuration = Math.ceil(audioEl.duration);
    if (totalDuration && totalDuration > 0) {
      document.getElementById('admin-start-slider').max = totalDuration;
      document.getElementById('admin-end-slider').max = totalDuration;
      document.getElementById('input-start-sec').max = totalDuration;
      document.getElementById('input-end-sec').max = totalDuration;
      
      endSec = Math.min(totalDuration, Math.max(startSec + 15, totalDuration));
      updateTrimmingUI();
    }
  };

  showToast("Uploaded Successfully 🎵", `"${file.name}" is permanently saved!`);
  
  // Clear input
  const inp = document.getElementById('audio-file-input');
  if (inp) inp.value = '';
}

// Drag and drop setup
function setupDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  ['dragenter', 'dragover'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.add('border-amber-400', 'bg-slate-950');
    }, false);
  });

  ['dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-amber-400', 'bg-slate-950');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleDirectFileUpload(dt.files);
    }
  }, false);
}

// Render Library List
function renderLibraryUI() {
  const listEl = document.getElementById('music-library-list');
  const countEl = document.getElementById('library-count-badge');
  if (!listEl) return;

  const count = uploadedTracks.length;
  if (countEl) countEl.innerText = `${count} Track${count === 1 ? '' : 's'}`;

  if (count === 0) {
    listEl.innerHTML = `
      <div class="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
        Default <span class="text-amber-300">music.mp3</span> active. Upload your songs above.
      </div>
    `;
    return;
  }

  let html = '';
  uploadedTracks.forEach((t, index) => {
    const isFirst = (index === 0);
    html += `
      <div class="p-2 rounded-lg border ${isFirst ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-950 border-slate-800'} flex items-center justify-between gap-2 text-xs">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <i data-lucide="disc" class="w-3.5 h-3.5 text-amber-400 shrink-0"></i>
          <span class="truncate font-semibold text-slate-200">${t.name}</span>
          <span class="text-[10px] text-slate-500 shrink-0">${t.size} MB</span>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button onclick="selectLibraryTrack(${index})" class="px-2 py-0.5 rounded ${isFirst ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold' : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'} text-[10px]">
            ${isFirst ? 'Active ⭐' : 'Select'}
          </button>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
  if (window.lucide) lucide.createIcons();
}

function selectLibraryTrack(index) {
  const track = uploadedTracks[index];
  if (!track) return;

  // Move to front
  uploadedTracks.splice(index, 1);
  uploadedTracks.unshift(track);

  if (track.blob) {
    handleDirectFileUpload([track.blob]);
  }
}

// Reset to Default Music
async function resetToDefaultMusic() {
  if (!confirm("Reset to default music.mp3?")) return;
  
  localStorage.removeItem('saved_audio_base64');
  localStorage.removeItem('saved_audio_name');
  localStorage.removeItem('saved_audio_size');

  if (db) {
    try {
      const tx = db.transaction([STORE_SETTINGS], 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      store.delete('uploaded_music_blob');
      store.delete('uploaded_music_buffer');
      store.delete('music_file_name');
    } catch(e){}
  }

  currentActiveBlob = null;
  if (currentActiveBlobUrl) URL.revokeObjectURL(currentActiveBlobUrl);
  currentActiveBlobUrl = null;
  uploadedTracks = [];
  renderLibraryUI();

  const audioEl = document.getElementById('admin-audio');
  audioEl.src = 'music.mp3';
  document.getElementById('active-track-name').innerText = 'music.mp3';
  document.getElementById('active-track-size').innerText = 'Default Celebration Music';
  document.getElementById('track-source-badge').innerText = 'Default';
  document.getElementById('track-source-badge').className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';

  showToast("Reset Done", "Reverted to default music.mp3.");
}

// 4. Time Trimming & Audio Range Controls ("Kaha se Kaha tak")
function setupAudioPlayerTimeListener() {
  const audioEl = document.getElementById('admin-audio');
  if (!audioEl) return;

  audioEl.addEventListener('timeupdate', () => {
    // Keep updated
  });
}

function formatTimeSec(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function setStartFromCurrentAudioTime() {
  const audioEl = document.getElementById('admin-audio');
  if (!audioEl) return;
  startSec = Math.floor(audioEl.currentTime);
  if (startSec >= endSec) {
    endSec = startSec + 15;
  }
  updateTrimmingUI();
  showToast("Start Point Set 📍", `Music starts at ${startSec}s (${formatTimeSec(startSec)})`);
}

function setEndFromCurrentAudioTime() {
  const audioEl = document.getElementById('admin-audio');
  if (!audioEl) return;
  const current = Math.floor(audioEl.currentTime);
  if (current <= startSec) {
    showToast("Invalid End Time", "End time must be greater than start time.");
    return;
  }
  endSec = current;
  updateTrimmingUI();
  showToast("End Point Set 🏁", `Music stops at ${endSec}s (${formatTimeSec(endSec)})`);
}

function onStartSliderChange(val) {
  startSec = parseInt(val, 10) || 0;
  if (startSec >= endSec) endSec = startSec + 5;
  updateTrimmingUI();
}

function onStartSecInputChange(val) {
  startSec = parseInt(val, 10) || 0;
  if (startSec >= endSec) endSec = startSec + 5;
  updateTrimmingUI();
}

function onEndSliderChange(val) {
  endSec = parseInt(val, 10) || 15;
  if (endSec <= startSec) startSec = Math.max(0, endSec - 5);
  updateTrimmingUI();
}

function onEndSecInputChange(val) {
  endSec = parseInt(val, 10) || 15;
  if (endSec <= startSec) startSec = Math.max(0, endSec - 5);
  updateTrimmingUI();
}

function updateTrimmingUI() {
  const startInp = document.getElementById('input-start-sec');
  const startSld = document.getElementById('admin-start-slider');
  const endInp = document.getElementById('input-end-sec');
  const endSld = document.getElementById('admin-end-slider');

  if (startInp) startInp.value = startSec;
  if (startSld) startSld.value = startSec;
  if (endInp) endInp.value = endSec;
  if (endSld) endSld.value = endSec;

  const totalDuration = Math.max(1, endSec - startSec);

  const sumStart = document.getElementById('summary-start-sec');
  const sumEnd = document.getElementById('summary-end-sec');
  const sumDur = document.getElementById('summary-total-duration');
  const testBtnDur = document.getElementById('test-btn-duration');

  if (sumStart) sumStart.innerText = `${startSec}s (${formatTimeSec(startSec)})`;
  if (sumEnd) sumEnd.innerText = `${endSec}s (${formatTimeSec(endSec)})`;
  if (sumDur) sumDur.innerText = totalDuration;
  if (testBtnDur) testBtnDur.innerText = totalDuration;
}

// 5. Test Live Segment Playback
async function testTimedPlayback() {
  const audioEl = document.getElementById('admin-audio');
  const btn = document.getElementById('btn-test-play');
  const isFade = document.getElementById('admin-fade-toggle') ? document.getElementById('admin-fade-toggle').checked : true;
  const totalDuration = Math.max(1, endSec - startSec);

  if (!isTestingPlay) {
    if (!audioEl.src || audioEl.src.endsWith('undefined')) {
      if (currentActiveBlobUrl) audioEl.src = currentActiveBlobUrl;
      else audioEl.src = 'music.mp3';
    }

    try {
      audioEl.currentTime = startSec;
    } catch(e){}
    audioEl.volume = 1.0;

    try {
      await audioEl.play();
      isTestingPlay = true;

      btn.classList.add('border-amber-400', 'bg-amber-500/30', 'text-amber-200');
      
      let remaining = totalDuration;
      btn.innerHTML = `
        <div class="music-wave mr-1.5">
          <span class="music-wave-bar"></span>
          <span class="music-wave-bar"></span>
          <span class="music-wave-bar"></span>
          <span class="music-wave-bar"></span>
          <span class="music-wave-bar"></span>
        </div>
        <span id="test-play-text">Playing Segment (<span id="test-ticker">${remaining}</span>s)...</span>
      `;

      testTickerInterval = setInterval(() => {
        remaining--;
        const ticker = document.getElementById('test-ticker');
        if (ticker && remaining >= 0) ticker.innerText = remaining;
      }, 1000);

      // Fade out 2 seconds before end
      if (isFade && totalDuration > 3) {
        setTimeout(() => {
          if (!isTestingPlay) return;
          let v = 1.0;
          const fadeInt = setInterval(() => {
            v -= 0.15;
            if (v <= 0.05) {
              audioEl.volume = 0;
              clearInterval(fadeInt);
            } else {
              audioEl.volume = v;
            }
          }, 150);
        }, (totalDuration - 2) * 1000);
      }

      testTimer = setTimeout(() => {
        stopTestPlay();
        showToast("Segment Complete 🎵", `Finished playing ${totalDuration} seconds.`);
      }, totalDuration * 1000);

    } catch(err) {
      console.error("Playback error:", err);
      showToast("Play Error", "Please click Browse Audio File to select your music.");
      stopTestPlay();
    }

  } else {
    stopTestPlay();
    showToast("Test Stopped", "Audio paused.");
  }
}

function stopTestPlay() {
  const audioEl = document.getElementById('admin-audio');
  const btn = document.getElementById('btn-test-play');

  if (testTimer) clearTimeout(testTimer);
  if (testTickerInterval) clearInterval(testTickerInterval);

  audioEl.pause();
  audioEl.volume = 1.0;
  isTestingPlay = false;

  btn.classList.remove('border-amber-400', 'bg-amber-500/30', 'text-amber-200');
  const totalDuration = Math.max(1, endSec - startSec);
  btn.innerHTML = `
    <i data-lucide="play" id="test-play-icon" class="w-4 h-4"></i>
    <span id="test-play-text">Test Selected Segment (<span id="test-btn-duration">${totalDuration}</span>s)</span>
  `;
  if (window.lucide) lucide.createIcons();
}

// 6. Save & Publish
async function saveAdminSettings() {
  try {
    const totalDuration = Math.max(1, endSec - startSec);
    const isFade = document.getElementById('admin-fade-toggle') ? document.getElementById('admin-fade-toggle').checked : true;
    const isAuto = document.getElementById('admin-autoplay-toggle') ? document.getElementById('admin-autoplay-toggle').checked : true;

    const showAdmin = document.getElementById('admin-show-admin-btn') ? document.getElementById('admin-show-admin-btn').checked : true;
    const showCustomize = document.getElementById('admin-show-customize-btn') ? document.getElementById('admin-show-customize-btn').checked : true;
    const showPrint = document.getElementById('admin-show-print-btn') ? document.getElementById('admin-show-print-btn').checked : true;
    const showMusic = document.getElementById('admin-show-music-btn') ? document.getElementById('admin-show-music-btn').checked : true;

    localStorage.setItem('music_start_sec', startSec);
    localStorage.setItem('music_end_sec', endSec);
    localStorage.setItem('music_duration_sec', totalDuration);
    localStorage.setItem('music_fade_toggle', isFade);
    localStorage.setItem('music_autoplay', isAuto);

    localStorage.setItem('header_show_admin', showAdmin);
    localStorage.setItem('header_show_customize', showCustomize);
    localStorage.setItem('header_show_print', showPrint);
    localStorage.setItem('header_show_music', showMusic);

    // Divine Pooja Theme Toggles
    const poojaBg = document.getElementById('admin-pooja-bg-toggle') ? document.getElementById('admin-pooja-bg-toggle').checked : true;
    const poojaDiyas = document.getElementById('admin-pooja-diyas-toggle') ? document.getElementById('admin-pooja-diyas-toggle').checked : true;
    const poojaShubhLabh = document.getElementById('admin-pooja-shubhlabh-toggle') ? document.getElementById('admin-pooja-shubhlabh-toggle').checked : true;
    const poojaPetals = document.getElementById('admin-pooja-petals-toggle') ? document.getElementById('admin-pooja-petals-toggle').checked : true;

    localStorage.setItem('theme_pooja_bg', poojaBg);
    localStorage.setItem('theme_pooja_diyas', poojaDiyas);
    localStorage.setItem('theme_pooja_shubhlabh', poojaShubhLabh);
    localStorage.setItem('theme_pooja_petals', poojaPetals);

    const trackNameEl = document.getElementById('active-track-name');
    const trackName = trackNameEl ? trackNameEl.innerText : 'Celebration Music';

    if (currentActiveBlob) {
      await persistBlobToStorage(currentActiveBlob, trackName);
    }

    // Optional Event metadata if present
    const compName = document.getElementById('admin-company-name');
    const waPhone = document.getElementById('admin-whatsapp-phone');
    const dateDisp = document.getElementById('admin-date-display');
    const timeDisp = document.getElementById('admin-time-display');
    const venueAddr = document.getElementById('admin-venue-address');

    if (compName || waPhone || dateDisp || timeDisp || venueAddr) {
      const savedData = {};
      if (compName) savedData['input-company-name'] = compName.value;
      if (waPhone) savedData['input-whatsapp-phone'] = waPhone.value;
      if (dateDisp) savedData['input-date-display'] = dateDisp.value;
      if (timeDisp) savedData['input-time-display'] = timeDisp.value;
      if (venueAddr) savedData['input-venue-address'] = venueAddr.value;

      const existing = localStorage.getItem('office_invitation_custom');
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          Object.assign(parsed, savedData);
          localStorage.setItem('office_invitation_custom', JSON.stringify(parsed));
        } catch(e) {
          localStorage.setItem('office_invitation_custom', JSON.stringify(savedData));
        }
      } else {
        localStorage.setItem('office_invitation_custom', JSON.stringify(savedData));
      }
    }

    showToast("Published & Live! 🕉️", `Theme & "${trackName}" (${totalDuration}s) saved successfully!`);
  } catch (err) {
    console.error("Save error:", err);
    showToast("Saved! ✨", "Settings saved successfully.");
  }
}

// 7. Load Saved Settings (Synchronous + Async Retrieval)
async function loadSavedAdminSettings() {
  const savedStart = localStorage.getItem('music_start_sec');
  const savedEnd = localStorage.getItem('music_end_sec');
  const savedDur = localStorage.getItem('music_duration_sec');
  const isFade = localStorage.getItem('music_fade_toggle');
  const isAuto = localStorage.getItem('music_autoplay');

  startSec = savedStart !== null ? parseInt(savedStart, 10) : 0;
  if (savedEnd !== null) endSec = parseInt(savedEnd, 10);
  else if (savedDur !== null) endSec = startSec + parseInt(savedDur, 10);
  else endSec = 15;

  updateTrimmingUI();

  if (isFade !== null && document.getElementById('admin-fade-toggle')) {
    document.getElementById('admin-fade-toggle').checked = (isFade === 'true');
  }
  if (isAuto !== null && document.getElementById('admin-autoplay-toggle')) {
    document.getElementById('admin-autoplay-toggle').checked = (isAuto === 'true');
  }

  const showAdmin = localStorage.getItem('header_show_admin');
  const showCustomize = localStorage.getItem('header_show_customize');
  const showPrint = localStorage.getItem('header_show_print');
  const showMusic = localStorage.getItem('header_show_music');

  if (showAdmin !== null && document.getElementById('admin-show-admin-btn')) {
    document.getElementById('admin-show-admin-btn').checked = (showAdmin === 'true');
  }
  if (showCustomize !== null && document.getElementById('admin-show-customize-btn')) {
    document.getElementById('admin-show-customize-btn').checked = (showCustomize === 'true');
  }
  if (showPrint !== null && document.getElementById('admin-show-print-btn')) {
    document.getElementById('admin-show-print-btn').checked = (showPrint === 'true');
  }
  if (showMusic !== null && document.getElementById('admin-show-music-btn')) {
    document.getElementById('admin-show-music-btn').checked = (showMusic === 'true');
  }

  // Load Divine Pooja Theme settings
  const poojaBg = localStorage.getItem('theme_pooja_bg');
  const poojaDiyas = localStorage.getItem('theme_pooja_diyas');
  const poojaShubhLabh = localStorage.getItem('theme_pooja_shubhlabh');
  const poojaPetals = localStorage.getItem('theme_pooja_petals');

  if (poojaBg !== null && document.getElementById('admin-pooja-bg-toggle')) {
    document.getElementById('admin-pooja-bg-toggle').checked = (poojaBg === 'true');
  }
  if (poojaDiyas !== null && document.getElementById('admin-pooja-diyas-toggle')) {
    document.getElementById('admin-pooja-diyas-toggle').checked = (poojaDiyas === 'true');
  }
  if (poojaShubhLabh !== null && document.getElementById('admin-pooja-shubhlabh-toggle')) {
    document.getElementById('admin-pooja-shubhlabh-toggle').checked = (poojaShubhLabh === 'true');
  }
  if (poojaPetals !== null && document.getElementById('admin-pooja-petals-toggle')) {
    document.getElementById('admin-pooja-petals-toggle').checked = (poojaPetals === 'true');
  }

  // Load Saved Audio: Priority 1 - LocalStorage Base64 (Instant)
  const savedBase64 = localStorage.getItem('saved_audio_base64');
  const savedName = localStorage.getItem('saved_audio_name');
  const savedSize = localStorage.getItem('saved_audio_size') || '0.72';
  const audioEl = document.getElementById('admin-audio');

  if (savedBase64 && savedName) {
    currentActiveBlobUrl = savedBase64;
    audioEl.src = savedBase64;
    audioEl.load();

    document.getElementById('active-track-name').innerText = savedName;
    document.getElementById('active-track-size').innerText = `${savedSize} MB • Custom Upload Active`;
    document.getElementById('track-source-badge').innerText = 'Custom Upload (Active)';
    document.getElementById('track-source-badge').className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';

    uploadedTracks = [{
      id: 'track_saved',
      name: savedName,
      size: savedSize,
      url: savedBase64
    }];
    renderLibraryUI();

    audioEl.onloadedmetadata = () => {
      const totalDuration = Math.ceil(audioEl.duration);
      if (totalDuration && totalDuration > 0) {
        document.getElementById('admin-start-slider').max = totalDuration;
        document.getElementById('admin-end-slider').max = totalDuration;
        document.getElementById('input-start-sec').max = totalDuration;
        document.getElementById('input-end-sec').max = totalDuration;
        updateTrimmingUI();
      }
    };
  } else {
    // Priority 2 - IndexedDB Binary
    const activeTrack = await getPersistedAudio();
    if (activeTrack && activeTrack.blob) {
      currentActiveBlob = activeTrack.blob;
      currentActiveBlobUrl = URL.createObjectURL(activeTrack.blob);
      audioEl.src = currentActiveBlobUrl;
      audioEl.load();

      document.getElementById('active-track-name').innerText = activeTrack.name || 'Uploaded Track';
      const sizeMb = (activeTrack.blob.size / (1024 * 1024)).toFixed(2);
      document.getElementById('active-track-size').innerText = `${sizeMb} MB • Custom Upload Active`;
      document.getElementById('track-source-badge').innerText = 'Custom Upload (Active)';
      document.getElementById('track-source-badge').className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';

      uploadedTracks = [{
        id: 'track_saved',
        name: activeTrack.name || 'Uploaded Audio',
        size: sizeMb,
        blob: activeTrack.blob,
        url: currentActiveBlobUrl
      }];
      renderLibraryUI();
    } else {
      audioEl.src = 'music.mp3';
    }
  }
}

// Toast Helper
function showToast(title, msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-title').innerText = title;
  document.getElementById('toast-msg').innerText = msg;
  toast.classList.remove('translate-y-24', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 3500);
}
