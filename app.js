// =========================================================================
// 🎵 MUSIC & DURATION CONFIGURATION (Yahan se settings change kar sakte hain)
// =========================================================================
const MUSIC_CONFIG = {
  audioFile: "music.mp3",       // File name ya audio link (e.g. "music.mp3", "song.mp3")
  playDurationSec: 15,          // ⏱️ Kitne SECOND tak chalana hai (e.g. 10, 15, 20, 30, 60)
  startOffsetSec: 0,            // ⏩ Song ko kitne second se shuru karna hai (e.g. 0)
  autoPlayOnOpen: true,         // ✉️ Envelope open hote hi play kare ya nahi (true / false)
  fadeOutSec: 2                 // 🔈 Stop hone se pehle smooth fade-out kitne second ka hoga
};

// Global Music State
let isPlayingAudio = false;
let musicTimer = null;
let musicCountdownInterval = null;
let fadeOutInterval = null;
let uploadedAudioBlobUrl = null;
let webAudioCtx = null;
let synthOscillators = [];
let synthGain = null;
let isAudioUnlocked = false;

// 🍎 iOS Safari & Mobile Audio Unlock Engine
function unlockAudioSession() {
  if (isAudioUnlocked) return;

  // 1. Prime Web Audio API AudioContext
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      if (!webAudioCtx) {
        webAudioCtx = new AudioCtx();
      }
      if (webAudioCtx.state === 'suspended') {
        webAudioCtx.resume();
      }
      // Play a microscopic silent buffer to awaken iOS CoreAudio hardware
      const buffer = webAudioCtx.createBuffer(1, 1, 22050);
      const source = webAudioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(webAudioCtx.destination);
      source.start(0);
    }
  } catch (e) {
    console.log("WebAudio unlock session:", e);
  }

  // 2. Prime HTML5 <audio> element
  const bgAudio = document.getElementById('bg-audio');
  if (bgAudio) {
    if (!bgAudio.src || bgAudio.src === window.location.href || bgAudio.src.endsWith('undefined')) {
      bgAudio.src = uploadedAudioBlobUrl || localStorage.getItem('saved_audio_base64') || MUSIC_CONFIG.audioFile;
    }
  }

  isAudioUnlocked = true;
}

// Global user touch/click listeners to pre-warm audio context
['touchstart', 'touchend', 'pointerdown', 'mousedown', 'keydown'].forEach(evtType => {
  window.addEventListener(evtType, unlockAudioSession, { passive: true, once: false });
});

// Initialize Lucide Icons & App
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) {
    lucide.createIcons();
  }
  startCountdown();
  loadSavedCustomizations();
  
  // Fast synchronous audio setup from LocalStorage
  const savedBase64 = localStorage.getItem('saved_audio_base64');
  const bgAudio = document.getElementById('bg-audio');
  if (savedBase64 && bgAudio) {
    uploadedAudioBlobUrl = savedBase64;
    bgAudio.src = savedBase64;
  } else if (bgAudio) {
    bgAudio.src = MUSIC_CONFIG.audioFile;
  }

  // Background IndexedDB Check
  await loadAdminUploadedAudioFromDB();
  applyHeaderButtonVisibility();
  applyDivinePoojaTheme();
  syncMusicConfigUI();
  setupSecretAdminShortcut();

  // Mobile Envelope Touch Listener for Instant iOS Reaction
  const envelopeBtn = document.getElementById('envelope-card-btn');
  if (envelopeBtn) {
    envelopeBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      openEnvelope(e);
    }, { passive: false });
  }

  // Error listener on bgAudio to automatically fall back to Web Audio Synth
  if (bgAudio) {
    bgAudio.addEventListener('error', () => {
      console.warn("Audio element error, will use Web Audio Synth fallback.");
      if (isPlayingAudio) {
        stopMusic();
        playAuspiciousSynthMelody(MUSIC_CONFIG.playDurationSec);
      }
    });
  }
});

// 🕉️ Divine Pooja Background Theme Controller
function applyDivinePoojaTheme() {
  const poojaBg = localStorage.getItem('theme_pooja_bg');
  const poojaDiyas = localStorage.getItem('theme_pooja_diyas');
  const poojaShubhLabh = localStorage.getItem('theme_pooja_shubhlabh');
  const poojaPetals = localStorage.getItem('theme_pooja_petals');

  const bgLayer = document.getElementById('pooja-background-layer');
  const diyasLayer = document.getElementById('pooja-diyas-layer');
  const shubhLabhLayer = document.getElementById('pooja-shubhlabh-layer');
  const petalsLayer = document.getElementById('pooja-petals-layer');

  const isPoojaActive = (poojaBg === null || poojaBg === 'true');

  if (bgLayer) {
    bgLayer.classList.toggle('active', isPoojaActive);
    bgLayer.classList.toggle('hidden', !isPoojaActive);
  }

  if (diyasLayer && poojaDiyas !== null) {
    diyasLayer.classList.toggle('hidden', poojaDiyas === 'false');
  }

  if (shubhLabhLayer && poojaShubhLabh !== null) {
    shubhLabhLayer.classList.toggle('hidden', poojaShubhLabh === 'false');
  }

  if (petalsLayer && poojaPetals !== null) {
    petalsLayer.classList.toggle('hidden', poojaPetals === 'false');
  }
}

// Dynamic Header Buttons Visibility (Admin Control)
function applyHeaderButtonVisibility() {
  const showAdmin = localStorage.getItem('header_show_admin');
  const showCustomize = localStorage.getItem('header_show_customize');
  const showPrint = localStorage.getItem('header_show_print');
  const showMusic = localStorage.getItem('header_show_music');

  const adminBtn = document.getElementById('btn-header-admin');
  const customBtn = document.getElementById('btn-header-customize');
  const printBtn = document.getElementById('btn-header-print');
  const musicBtn = document.getElementById('btn-sound-toggle');

  if (adminBtn) {
    if (showAdmin === 'false') adminBtn.style.display = 'none';
    else adminBtn.style.display = '';
  }
  if (customBtn) {
    if (showCustomize === 'false') customBtn.style.display = 'none';
    else customBtn.style.display = '';
  }
  if (printBtn) {
    if (showPrint === 'false') printBtn.style.display = 'none';
    else printBtn.style.display = '';
  }
  if (musicBtn) {
    if (showMusic === 'false') musicBtn.style.display = 'none';
    else musicBtn.style.display = '';
  }
}

// Secret shortcut to open admin if button is hidden (Double click logo or press Ctrl+Shift+A)
function setupSecretAdminShortcut() {
  const logo = document.querySelector('header img');
  if (logo) {
    logo.style.cursor = 'pointer';
    logo.title = 'Double click to open Admin Portal';
    logo.addEventListener('dblclick', () => {
      window.location.href = 'admin.html';
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      window.location.href = 'admin.html';
    }
  });
}

// Load persistent audio uploaded from Admin Portal (LocalStorage Base64 + IndexedDB)
function loadAdminUploadedAudioFromDB() {
  return new Promise((resolve) => {
    // Priority 1: Instant LocalStorage Base64 Cache
    const savedBase64 = localStorage.getItem('saved_audio_base64');
    const savedName = localStorage.getItem('saved_audio_name');
    if (savedBase64) {
      uploadedAudioBlobUrl = savedBase64;
      const bgAudio = document.getElementById('bg-audio');
      if (bgAudio) {
        bgAudio.src = savedBase64;
      }
      const uploadLabel = document.getElementById('uploaded-file-label');
      if (uploadLabel) {
        uploadLabel.innerHTML = `Admin Active: <span class="text-emerald-400 font-semibold">${savedName || 'Custom Track'}</span>`;
      }
      return resolve(savedBase64);
    }

    // Priority 2: IndexedDB (Safe iOS MIME Types)
    try {
      const request = indexedDB.open('ZenNextInvitationDB', 3);
      request.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('music_store')) return resolve(null);
        const transaction = db.transaction(['music_store'], 'readonly');
        const store = transaction.objectStore('music_store');
        const blobReq = store.get('uploaded_music_blob');
        const bufferReq = store.get('uploaded_music_buffer');
        const typeReq = store.get('uploaded_music_type');
        const nameReq = store.get('music_file_name');

        transaction.oncomplete = () => {
          let finalBlob = blobReq.result;
          if (!finalBlob && bufferReq.result) {
            finalBlob = new Blob([bufferReq.result], { type: typeReq.result || 'audio/mpeg' });
          }

          if (finalBlob) {
            if (uploadedAudioBlobUrl && !uploadedAudioBlobUrl.startsWith('data:')) URL.revokeObjectURL(uploadedAudioBlobUrl);
            uploadedAudioBlobUrl = URL.createObjectURL(finalBlob);
            const bgAudio = document.getElementById('bg-audio');
            if (bgAudio) {
              bgAudio.src = uploadedAudioBlobUrl;
            }
            const uploadLabel = document.getElementById('uploaded-file-label');
            if (uploadLabel) {
              uploadLabel.innerHTML = `Admin Active: <span class="text-emerald-400 font-semibold">${nameReq.result || 'Custom Track'}</span>`;
            }
            resolve(uploadedAudioBlobUrl);
          } else {
            resolve(null);
          }
        };
        transaction.onerror = () => resolve(null);
      };
      request.onerror = () => resolve(null);
    } catch (err) {
      console.log("IndexedDB loading error", err);
      resolve(null);
    }
  });
}

// Update UI badges with configured seconds
function syncMusicConfigUI() {
  const badge = document.getElementById('sound-duration-badge');
  if (badge) badge.innerText = MUSIC_CONFIG.playDurationSec;
  const durInput = document.getElementById('input-music-duration');
  if (durInput) durInput.value = MUSIC_CONFIG.playDurationSec;
  const startInput = document.getElementById('input-music-start');
  if (startInput) startInput.value = MUSIC_CONFIG.startOffsetSec;
  const autoCheckbox = document.getElementById('input-music-autoplay');
  if (autoCheckbox) autoCheckbox.checked = MUSIC_CONFIG.autoPlayOnOpen;
}

// User File Upload Handler (Live Audio Picker)
function handleMusicUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (uploadedAudioBlobUrl && !uploadedAudioBlobUrl.startsWith('data:')) {
    URL.revokeObjectURL(uploadedAudioBlobUrl);
  }
  uploadedAudioBlobUrl = URL.createObjectURL(file);
  
  const bgAudio = document.getElementById('bg-audio');
  if (bgAudio) {
    bgAudio.src = uploadedAudioBlobUrl;
  }

  document.getElementById('uploaded-file-label').innerHTML = `Selected: <span class="text-amber-300 font-semibold">${file.name}</span>`;
  showToast("Audio Selected 🎵", `${file.name} ready to play for ${MUSIC_CONFIG.playDurationSec}s!`);
}

// Toggle Audio Play / Pause
function toggleAudio() {
  unlockAudioSession();
  if (!isPlayingAudio) {
    playConfiguredMusic();
  } else {
    stopMusic();
    showToast("Music Paused", "Audio playback stopped.");
  }
}

// Play Music for exact configured seconds (100% iOS Safari & All Devices Bulletproof)
function playConfiguredMusic() {
  unlockAudioSession();
  const bgAudio = document.getElementById('bg-audio');
  if (!bgAudio) return;

  // Clear previous timers
  stopMusicTimers();

  // Ensure valid source
  if (!bgAudio.src || bgAudio.src === window.location.href || bgAudio.src.endsWith('undefined')) {
    bgAudio.src = uploadedAudioBlobUrl || localStorage.getItem('saved_audio_base64') || MUSIC_CONFIG.audioFile;
  }

  // Safe currentTime setting for iOS WebKit
  const startOffset = MUSIC_CONFIG.startOffsetSec || 0;
  if (startOffset > 0) {
    if (bgAudio.readyState >= 1) {
      try { bgAudio.currentTime = startOffset; } catch(e){}
    } else {
      bgAudio.addEventListener('loadedmetadata', function onMeta() {
        try { bgAudio.currentTime = startOffset; } catch(e){}
      }, { once: true });
    }
  }

  bgAudio.volume = 1.0;

  // SYNCHRONOUS play() execution in direct user gesture context for iPhone / iPad
  const playPromise = bgAudio.play();

  if (playPromise !== undefined) {
    playPromise.then(() => {
      isPlayingAudio = true;
      startMusicPlaybackUI(MUSIC_CONFIG.playDurationSec);
    }).catch(err => {
      console.warn("HTML5 audio playback blocked/errored on this device:", err);
      // Seamlessly fall back to Web Audio Chime Synth so iPhone ALWAYS has sound
      playAuspiciousSynthMelody(MUSIC_CONFIG.playDurationSec);
    });
  } else {
    isPlayingAudio = true;
    startMusicPlaybackUI(MUSIC_CONFIG.playDurationSec);
  }
}

// Start visual equalizer and countdown ticker
function startMusicPlaybackUI(durationSec) {
  const btn = document.getElementById('btn-sound-toggle');
  if (btn) btn.classList.add('border-amber-400', 'bg-amber-500/30', 'ring-2', 'ring-amber-400/40');
  
  let remainingSec = durationSec;
  
  if (btn) {
    btn.innerHTML = `
      <div class="music-wave mr-1">
        <span class="music-wave-bar"></span>
        <span class="music-wave-bar"></span>
        <span class="music-wave-bar"></span>
        <span class="music-wave-bar"></span>
        <span class="music-wave-bar"></span>
      </div>
      <span id="sound-btn-text" class="font-semibold">Playing (<span id="sound-live-sec">${remainingSec}</span>s)</span>
    `;
  }

  const mobTicker = document.getElementById('mobile-sound-live-sec');
  const mobBtn = document.getElementById('mobile-sound-text');
  if (mobTicker) mobTicker.innerText = remainingSec;
  if (mobBtn) mobBtn.innerText = 'Pause';

  musicCountdownInterval = setInterval(() => {
    remainingSec--;
    const liveSecEl = document.getElementById('sound-live-sec');
    const liveMobSecEl = document.getElementById('mobile-sound-live-sec');
    if (liveSecEl && remainingSec >= 0) liveSecEl.innerText = remainingSec;
    if (liveMobSecEl && remainingSec >= 0) liveMobSecEl.innerText = remainingSec;
  }, 1000);

  // Smooth Fade-Out trigger
  const bgAudio = document.getElementById('bg-audio');
  const fadeStartTime = Math.max(0, (durationSec - MUSIC_CONFIG.fadeOutSec) * 1000);
  setTimeout(() => {
    if (!isPlayingAudio) return;
    let currentVol = 1.0;
    fadeOutInterval = setInterval(() => {
      currentVol -= 0.1;
      if (currentVol <= 0.05) {
        if (bgAudio) bgAudio.volume = 0;
        if (synthGain && webAudioCtx) {
          try { synthGain.gain.setTargetAtTime(0, webAudioCtx.currentTime, 0.2); } catch(e){}
        }
        clearInterval(fadeOutInterval);
      } else {
        if (bgAudio) bgAudio.volume = currentVol;
      }
    }, 150);
  }, fadeStartTime);

  // Exact Auto-Stop Timer
  musicTimer = setTimeout(() => {
    stopMusic();
  }, durationSec * 1000);
}

// Auspicious Festive Web Audio Synth Fallback (Ensures iPhone never stays silent)
function playAuspiciousSynthMelody(durationSec) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!webAudioCtx) webAudioCtx = new AudioCtx();
    if (webAudioCtx.state === 'suspended') webAudioCtx.resume();

    stopSynthMelody();

    synthGain = webAudioCtx.createGain();
    synthGain.gain.setValueAtTime(0.18, webAudioCtx.currentTime);
    synthGain.connect(webAudioCtx.destination);

    // Sacred celebration notes: Sa Re Ga Pa Dha Sa' (Bhoopali Raga / Auspicious Bell Harmony)
    const notes = [
      { f: 261.63, t: 0.0, d: 0.6 },  // Sa
      { f: 293.66, t: 0.45, d: 0.6 }, // Re
      { f: 329.63, t: 0.9, d: 0.7 },  // Ga
      { f: 392.00, t: 1.45, d: 0.8 }, // Pa
      { f: 440.00, t: 2.1, d: 0.9 },  // Dha
      { f: 523.25, t: 2.8, d: 1.5 },  // Sa' (High)
      { f: 440.00, t: 4.0, d: 0.6 },
      { f: 392.00, t: 4.5, d: 0.7 },
      { f: 329.63, t: 5.1, d: 0.8 },
      { f: 293.66, t: 5.8, d: 0.8 },
      { f: 261.63, t: 6.5, d: 1.8 },
      { f: 329.63, t: 8.0, d: 0.7 },
      { f: 392.00, t: 8.6, d: 0.7 },
      { f: 523.25, t: 9.3, d: 2.2 },
      { f: 659.25, t: 11.2, d: 2.8 }
    ];

    const now = webAudioCtx.currentTime;
    notes.forEach(n => {
      if (n.t >= durationSec) return;
      const osc = webAudioCtx.createOscillator();
      const noteGain = webAudioCtx.createGain();

      osc.type = 'triangle'; // Warm festive chime tone
      osc.frequency.setValueAtTime(n.f, now + n.t);

      noteGain.gain.setValueAtTime(0.0001, now + n.t);
      noteGain.gain.exponentialRampToValueAtTime(0.35, now + n.t + 0.05);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);

      osc.connect(noteGain);
      noteGain.connect(synthGain);

      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.1);
      synthOscillators.push(osc);
    });

    isPlayingAudio = true;
    startMusicPlaybackUI(durationSec);

  } catch(e) {
    console.warn("Synth melody fallback:", e);
  }
}

function stopSynthMelody() {
  if (synthOscillators.length > 0) {
    synthOscillators.forEach(osc => {
      try { osc.stop(); osc.disconnect(); } catch(e){}
    });
    synthOscillators = [];
  }
  if (synthGain && webAudioCtx) {
    try {
      synthGain.gain.setTargetAtTime(0, webAudioCtx.currentTime, 0.1);
    } catch(e){}
  }
}



function celebrateConfetti() {
  if (typeof confetti === 'function') {
    // Grand gold and colorful celebration shower
    const count = 200;
    const defaults = {
      origin: { y: 0.7 }
    };

    function fire(particleRatio, opts) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio)
      });
    }

    fire(0.25, {
      spread: 26,
      startVelocity: 55,
      colors: ['#d4af37', '#ffd700', '#fef08a']
    });
    fire(0.2, {
      spread: 60,
      colors: ['#ffffff', '#f59e0b', '#d97706']
    });
    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
      colors: ['#e2e8f0', '#d4af37', '#fbbf24']
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
      colors: ['#fef3c7', '#b45309', '#ffd700']
    });
  }
}

// Global countdown state
let countdownInterval = null;
let targetDate = new Date();

// Countdown Timer
function startCountdown() {
  // Check if saved target datetime exists
  const savedTarget = localStorage.getItem('countdown_target_iso');
  if (savedTarget) {
    targetDate = new Date(savedTarget);
  } else {
    // Default fallback: Friday, September 4, 2026 at 10:30 AM
    targetDate = new Date('2026-09-04T10:30:00');
  }

  // Populate datetime-local input in customizer
  const datetimeInput = document.getElementById('input-countdown-datetime');
  if (datetimeInput) {
    const tzOffset = targetDate.getTimezoneOffset() * 60000;
    const localISOTime = new Date(targetDate.getTime() - tzOffset).toISOString().slice(0, 16);
    datetimeInput.value = localISOTime;
  }

  updateCountdownDisplay();

  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(updateCountdownDisplay, 1000);
}

function updateCountdownDisplay() {
  const now = new Date().getTime();
  const diff = targetDate.getTime() - now;

  const targetLabelEl = document.getElementById('countdown-target-display');
  if (targetLabelEl) {
    const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    targetLabelEl.innerText = targetDate.toLocaleDateString('en-US', options);
  }

  const finishedBanner = document.getElementById('countdown-finished-banner');
  const timerGrid = document.getElementById('countdown-timer-grid');

  if (diff <= 0) {
    document.getElementById('countdown-days').innerText = "00";
    document.getElementById('countdown-hours').innerText = "00";
    document.getElementById('countdown-minutes').innerText = "00";
    document.getElementById('countdown-seconds').innerText = "00";

    if (finishedBanner) finishedBanner.classList.remove('hidden');
    return;
  }

  if (finishedBanner) finishedBanner.classList.add('hidden');

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  document.getElementById('countdown-days').innerText = String(days).padStart(2, '0');
  document.getElementById('countdown-hours').innerText = String(hours).padStart(2, '0');
  document.getElementById('countdown-minutes').innerText = String(minutes).padStart(2, '0');
  document.getElementById('countdown-seconds').innerText = String(seconds).padStart(2, '0');
}

// Live Customizer Drawer
function toggleEditor() {
  const drawer = document.getElementById('customizer-drawer');
  const isOpen = !drawer.classList.contains('translate-x-full');
  
  if (isOpen) {
    drawer.classList.add('translate-x-full');
  } else {
    drawer.classList.remove('translate-x-full');
  }
}

function applyCustomizations() {
  const fields = [
    { input: 'input-company-name', target: 'card-company-name' },
    { input: 'input-tagline', target: 'card-tagline' },
    { input: 'input-sub-header', target: 'card-sub-header' },
    { input: 'input-date-display', target: 'card-date-display' },
    { input: 'input-day-subtitle', target: 'card-day-subtitle' },
    { input: 'input-time-display', target: 'card-time-display' },
    { input: 'input-ribbon-time', target: 'card-ribbon-time' },
    { input: 'input-venue-title', target: 'card-venue-title' },
    { input: 'input-venue-address', target: 'card-venue-address' },
    { input: 'input-chief-guest-name', target: 'card-chief-guest-name' },
    { input: 'input-chief-guest-title', target: 'card-chief-guest-title' },
    { input: 'input-host-name', target: 'card-host-name' },
    { input: 'input-contact-phone', target: 'card-contact-phone' },
    { input: 'input-rsvp-heading', target: 'card-rsvp-heading' },
    { input: 'input-rsvp-email', target: 'card-rsvp-email' },
    { input: 'input-whatsapp-phone', target: null }
  ];

  const savedData = {};

  fields.forEach(f => {
    const el = document.getElementById(f.input);
    if (el) {
      const val = el.value;
      if (f.target) {
        const targetEl = document.getElementById(f.target);
        if (targetEl) {
          targetEl.innerText = val;
        }
      }
      savedData[f.input] = val;
    }
  });

  // Handle Countdown Datetime Picker
  const customDatetime = document.getElementById('input-countdown-datetime').value;
  if (customDatetime) {
    targetDate = new Date(customDatetime);
    localStorage.setItem('countdown_target_iso', targetDate.toISOString());
    updateCountdownDisplay();
  }

  // Handle Music Settings from Customizer
  const customDur = document.getElementById('input-music-duration');
  if (customDur && customDur.value) {
    MUSIC_CONFIG.playDurationSec = parseInt(customDur.value, 10) || 15;
    localStorage.setItem('music_duration_sec', MUSIC_CONFIG.playDurationSec);
  }
  const customStart = document.getElementById('input-music-start');
  if (customStart && customStart.value) {
    MUSIC_CONFIG.startOffsetSec = parseInt(customStart.value, 10) || 0;
    localStorage.setItem('music_start_sec', MUSIC_CONFIG.startOffsetSec);
  }
  const customAuto = document.getElementById('input-music-autoplay');
  if (customAuto) {
    MUSIC_CONFIG.autoPlayOnOpen = customAuto.checked;
    localStorage.setItem('music_autoplay', MUSIC_CONFIG.autoPlayOnOpen);
  }

  syncMusicConfigUI();

  localStorage.setItem('office_invitation_custom', JSON.stringify(savedData));
  showToast("Updated Successfully", `Invitation Card & Music settings (${MUSIC_CONFIG.playDurationSec}s) updated!`);
  toggleEditor();
  celebrateConfetti();
}

function resetDefaults() {
  localStorage.removeItem('office_invitation_custom');
  localStorage.removeItem('countdown_target_iso');
  localStorage.removeItem('music_duration_sec');
  localStorage.removeItem('music_start_sec');
  localStorage.removeItem('music_autoplay');
  location.reload();
}

function loadSavedCustomizations() {
  // Load Music config from localStorage
  const savedStart = localStorage.getItem('music_start_sec');
  const savedEnd = localStorage.getItem('music_end_sec');
  const savedDur = localStorage.getItem('music_duration_sec');
  const savedAuto = localStorage.getItem('music_autoplay');

  if (savedStart !== null) MUSIC_CONFIG.startOffsetSec = parseInt(savedStart, 10);
  if (savedEnd !== null && savedStart !== null) {
    MUSIC_CONFIG.playDurationSec = Math.max(1, parseInt(savedEnd, 10) - parseInt(savedStart, 10));
  } else if (savedDur) {
    MUSIC_CONFIG.playDurationSec = parseInt(savedDur, 10);
  }
  if (savedAuto !== null) MUSIC_CONFIG.autoPlayOnOpen = (savedAuto === 'true');

  syncMusicConfigUI();

  const saved = localStorage.getItem('office_invitation_custom');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      const fields = [
        { input: 'input-company-name', target: 'card-company-name' },
        { input: 'input-tagline', target: 'card-tagline' },
        { input: 'input-sub-header', target: 'card-sub-header' },
        { input: 'input-date-display', target: 'card-date-display' },
        { input: 'input-day-subtitle', target: 'card-day-subtitle' },
        { input: 'input-time-display', target: 'card-time-display' },
        { input: 'input-ribbon-time', target: 'card-ribbon-time' },
        { input: 'input-venue-title', target: 'card-venue-title' },
        { input: 'input-venue-address', target: 'card-venue-address' },
        { input: 'input-chief-guest-name', target: 'card-chief-guest-name' },
        { input: 'input-chief-guest-title', target: 'card-chief-guest-title' },
        { input: 'input-host-name', target: 'card-host-name' },
        { input: 'input-contact-phone', target: 'card-contact-phone' },
        { input: 'input-rsvp-heading', target: 'card-rsvp-heading' },
        { input: 'input-rsvp-email', target: 'card-rsvp-email' },
        { input: 'input-whatsapp-phone', target: null }
      ];

      fields.forEach(f => {
        if (data[f.input]) {
          const inputEl = document.getElementById(f.input);
          if (inputEl) inputEl.value = data[f.input];
          if (f.target) {
            const targetEl = document.getElementById(f.target);
            if (targetEl) targetEl.innerText = data[f.input];
          }
        }
      });
    } catch (e) {
      console.error("Error loading saved customized data", e);
    }
  }

  // Load countdown target datetime
  const savedTarget = localStorage.getItem('countdown_target_iso');
  if (savedTarget) {
    targetDate = new Date(savedTarget);
    const datetimeInput = document.getElementById('input-countdown-datetime');
    if (datetimeInput) {
      const tzOffset = targetDate.getTimezoneOffset() * 60000;
      const localISOTime = new Date(targetDate.getTime() - tzOffset).toISOString().slice(0, 16);
      datetimeInput.value = localISOTime;
    }
    updateCountdownDisplay();
  }
}

// Attendance Modal Handlers
function openRSVPModal() {
  const modal = document.getElementById('rsvp-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeRSVPModal() {
  const modal = document.getElementById('rsvp-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// 1. Send Confirmation via WhatsApp Direct to Host
function sendRSVPViaWhatsApp() {
  const name = document.getElementById('rsvp-name').value.trim();
  const phone = document.getElementById('rsvp-phone').value.trim();
  const guests = document.getElementById('rsvp-guests').value;
  const attendingRadio = document.querySelector('input[name="attending"]:checked');
  const attending = attendingRadio ? attendingRadio.value : 'yes';
  const notes = document.getElementById('rsvp-notes').value.trim();

  if (!name) {
    alert("Please enter your name.");
    document.getElementById('rsvp-name').focus();
    return;
  }
  if (!phone) {
    alert("Please enter your phone number.");
    document.getElementById('rsvp-phone').focus();
    return;
  }

  const company = document.getElementById('card-company-name').innerText;
  const whatsappNumberInput = document.getElementById('input-whatsapp-phone');
  let hostNumber = whatsappNumberInput ? whatsappNumberInput.value.replace(/[^0-9]/g, '') : '919598689216';
  if (!hostNumber) hostNumber = '919598689216';

  const statusText = attending === 'yes' ? '✅ Joyfully Accept' : '❌ Regretfully Decline';
  
  // Clean formatted WhatsApp message
  let message = `🎉 *OFFICE INAUGURATION ATTENDANCE*\n\n`;
  message += `🏢 *Company:* ${company}\n`;
  message += `👤 *Guest Name:* ${name}\n`;
  message += `📞 *Contact Number:* ${phone}\n`;
  message += `👥 *Total Guests:* ${guests}\n`;
  message += `📋 *Status:* ${statusText}\n`;
  if (notes) {
    message += `💬 *Message / Wishes:* "${notes}"\n`;
  }
  message += `\n_Sent via Digital Invitation Card_`;

  // Save in local storage
  const rsvpRecord = { name, phone, guests, attending, notes, method: 'WhatsApp', date: new Date().toISOString() };
  localStorage.setItem('rsvp_entry_' + Date.now(), JSON.stringify(rsvpRecord));

  const waUrl = `https://api.whatsapp.com/send?phone=${hostNumber}&text=${encodeURIComponent(message)}`;
  
  closeRSVPModal();
  celebrateConfetti();
  showToast("Opening WhatsApp...", `Sending confirmation from ${name} to Host!`);
  
  // Open WhatsApp in new tab / app
  setTimeout(() => {
    window.open(waUrl, '_blank');
  }, 400);
}

// 2. Send Confirmation via Direct Email (mailto)
function sendRSVPViaEmail() {
  const name = document.getElementById('rsvp-name').value.trim();
  const phone = document.getElementById('rsvp-phone').value.trim();
  const guests = document.getElementById('rsvp-guests').value;
  const attendingRadio = document.querySelector('input[name="attending"]:checked');
  const attending = attendingRadio ? attendingRadio.value : 'yes';
  const notes = document.getElementById('rsvp-notes').value.trim();

  if (!name) {
    alert("Please enter your name.");
    document.getElementById('rsvp-name').focus();
    return;
  }
  if (!phone) {
    alert("Please enter your phone number.");
    document.getElementById('rsvp-phone').focus();
    return;
  }

  const company = document.getElementById('card-company-name').innerText;
  const hostEmail = document.getElementById('input-rsvp-email').value || 'contact@zennextverify.com';
  const statusText = attending === 'yes' ? 'Joyfully Accept' : 'Regretfully Decline';

  const subject = encodeURIComponent(`Attendance Confirmation: ${name} (${company} Inauguration)`);
  let body = `Dear ${company} Team,\n\n`;
  body += `I would like to submit my attendance response for the Grand Office Inauguration ceremony:\n\n`;
  body += `• Name: ${name}\n`;
  body += `• Contact Phone: ${phone}\n`;
  body += `• Attendance Status: ${statusText}\n`;
  body += `• Total Guests: ${guests}\n`;
  if (notes) {
    body += `• Message / Wishes: ${notes}\n`;
  }
  body += `\nBest regards,\n${name}`;

  // Save in local storage
  const rsvpRecord = { name, phone, guests, attending, notes, method: 'Email', date: new Date().toISOString() };
  localStorage.setItem('rsvp_entry_' + Date.now(), JSON.stringify(rsvpRecord));

  const mailtoUrl = `mailto:${hostEmail}?subject=${subject}&body=${encodeURIComponent(body)}`;

  closeRSVPModal();
  celebrateConfetti();
  showToast("Opening Email...", `Preparing email to ${hostEmail}`);

  setTimeout(() => {
    window.location.href = mailtoUrl;
  }, 400);
}

// Calendar & Maps Helpers
function addToCalendar() {
  const companyName = document.getElementById('card-company-name').innerText;
  const venueTitle = document.getElementById('card-venue-title').innerText;
  const venueAddr = document.getElementById('card-venue-address').innerText;
  
  const title = encodeURIComponent(`Grand Office Inauguration - ${companyName}`);
  const details = encodeURIComponent(`You are cordially invited to the Grand Inauguration & Ribbon Cutting Ceremony of ${companyName}'s new corporate office.`);
  const location = encodeURIComponent(`${venueTitle}, ${venueAddr}`);

  // Create Google Calendar URL (Example for event)
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}&dates=20261025T050000Z/20261025T083000Z`;

  window.open(gcalUrl, '_blank');
}

function openGoogleMaps() {
  const venue = document.getElementById('card-venue-address').innerText;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
  window.open(mapsUrl, '_blank');
}

// Notification Toast
function showToast(title, msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-title').innerText = title;
  document.getElementById('toast-msg').innerText = msg;

  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 4000);
}
