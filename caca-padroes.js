// ═══════════════════════════════════════════════════
//  Caça-Padrões — Client JavaScript
//  Singleplayer + Multiplayer (JvJvJ / GvG)
// ═══════════════════════════════════════════════════

// ── Configuração ──
const TOTAL_QUESTIONS = 10;
const MAX_LIVES = 3;
const BASE_POINTS = 10;
const STREAK_BONUS = 2;
const NEXT_DELAY_MS = 1000;
const END_DELAY_MS = 700;

// ── Padrões disponíveis (singleplayer) ──
const patternDefinitions = [
  { id: "aritmetica", type: "Aritmética Simples", gen: (lvl = 1) => { 
      const a = rnd(1, 10 + lvl * 5); const d = rnd(1, 5 + lvl * 2); 
      return seq(6, i => a + i * d); 
    }, hint: s => `Soma constante de ${s[1] - s[0]}` 
  },
  { id: "aritmetica_neg", type: "Aritmética de Inteiros", gen: (lvl = 1) => { 
      const a = rnd(-10 - lvl * 5, 20); const d = rnd(-5 - lvl, -1); 
      return seq(6, i => a + i * d); 
    }, hint: s => `Diferença constante de ${s[1] - s[0]}` 
  },
  { id: "geometrica", type: "Geométrica Simples", gen: (lvl = 1) => { 
      const a = rnd(1, 2 + Math.floor(lvl/2)); const r = rnd(2, 2 + Math.floor(lvl/3)); 
      return seq(6, i => a * r ** i); 
    }, hint: s => `Multiplicado constantemente por ${s[1] / s[0]}` 
  },
  { id: "quadrados", type: "Quadrados e Cubos", gen: (lvl = 1) => { 
      const start = rnd(1, 2 + lvl); 
      const type = rnd(0, 1);
      if (type === 0 || lvl < 3) return seq(6, i => (start + i) ** 2);
      else return seq(6, i => (start + i) ** 3);
    }, hint: () => "Potências perfeitas (x² ou x³)" 
  },
  { id: "fibonacci", type: "Série Estilo Fibonacci", gen: (lvl = 1) => { 
      const a = rnd(1, lvl + 2), b = rnd(1, lvl + 2); 
      const s = [a, b]; for (let i = 2; i < 6; i++) s.push(s[i - 1] + s[i - 2]); 
      return s; 
    }, hint: s => `A soma dos dois últimos: ${s[0]}+${s[1]}=${s[2]}` 
  },
  { id: "mistura", type: "Operação Dupla (Matadora)", gen: (lvl = 1) => { 
      if (lvl < 4) return seq(6, i => rnd(2,10) + i * 2);
      const a = rnd(1, 4), mult = rnd(2, 3), sum = rnd(1, 3); 
      const s = [a]; for (let i = 1; i < 6; i++) s.push(s[i - 1] * mult + sum); 
      return s; 
    }, hint: s => `Multiplica o anterior e depois soma um fixo!` 
  },
  { id: "alternada", type: "Diferença Alternada", gen: (lvl = 1) => { 
      if (lvl < 2) return seq(6, i => i*3);
      const a = rnd(10, 20 + lvl*2), d1 = rnd(2, 4 + lvl), d2 = rnd(-5 - lvl, -2); 
      const s = [a]; for (let i = 1; i < 6; i++) s.push(s[i - 1] + (i % 2 !== 0 ? d1 : d2)); 
      return s; 
    }, hint: s => `Dois passos intercalados: soma ${s[1]-s[0]} e depois soma ${s[2]-s[1]}` 
  },
  { id: "primos", type: "Primos em Fuga", gen: (lvl = 1) => { 
      const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
      const start = rnd(0, Math.min(10, lvl)); 
      return primes.slice(start, start + 6); 
    }, hint: () => "Apenas números que dividem por 1 e por si mesmos" 
  }
];

// ── Utilitários ──
function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function seq(length, fn) { return Array.from({ length }, (_, i) => fn(i)); }
function $(id) { return document.getElementById(id); }

// ── Estado global ──
let gameMode = "single"; // "single" | "jvj" | "gvg"
let socket = null;
let myPlayer = null;
let roomData = null;
let isHost = false;

// Singleplayer state
let spState = { score: 0, lives: MAX_LIVES, q: 0, streak: 0 };
let spCurrent = null;
let spSubmitted = false;

// Multiplayer state
let mpPlayers = [];
let mpCurrentQuestion = null;
let mpSubmitted = false;
let mpTotalQuestions = 0;
let mpQuestionIndex = 0;
let questionTimerInterval = null;
let globalTimerInterval = null;

// ═══════════════════════════════════════════════════
//  SISTEMA DE ÁUDIO (Web Audio API)
// ═══════════════════════════════════════════════════

let audioEnabled = true;
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let actx = null;

function playTone(freq, type, duration, vol = 0.1) {
  if (!audioEnabled || !AudioCtx) return;
  if (!actx) actx = new AudioCtx();
  if (actx.state === "suspended") actx.resume();

  const osc = actx.createOscillator();
  const gain = actx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, actx.currentTime);
  
  gain.gain.setValueAtTime(vol, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + Math.max(duration, 0.01));

  osc.connect(gain);
  gain.connect(actx.destination);
  
  osc.start();
  osc.stop(actx.currentTime + duration);
}

const sfx = {
  click: () => playTone(600, 'sine', 0.1, 0.05),
  correct: () => { playTone(600, 'sine', 0.1, 0.1); setTimeout(() => playTone(800, 'sine', 0.15, 0.1), 100); },
  wrong: () => { playTone(200, 'triangle', 0.1, 0.1); setTimeout(() => playTone(150, 'sawtooth', 0.3, 0.1), 100); },
  streak: () => { playTone(400, 'sine', 0.1); setTimeout(() => playTone(600, 'sine', 0.1), 100); setTimeout(() => playTone(800, 'sine', 0.2), 200); },
  finish: () => { playTone(500, 'square', 0.1); setTimeout(() => playTone(700, 'square', 0.3), 150); },
  tick: () => playTone(800, 'sine', 0.05, 0.02)
};

// ═══════════════════════════════════════════════════
//  CHILLWAVE SYNTH ENGINE (Web Audio API)
// ═══════════════════════════════════════════════════

// Utilidades musicais
const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);
const pentatonic = [0, 3, 5, 7, 10]; // Escala pentatônica menor

function getNote(root, octave, degree) {
  const idx = ((degree % pentatonic.length) + pentatonic.length) % pentatonic.length;
  const octShift = Math.floor(degree / pentatonic.length);
  return midiToFreq(root + (octave + octShift) * 12 + pentatonic[idx]);
}

// Nó de delay simples (simula reverb)
function createDelay(ctx, dest, time, feedback, wet) {
  const delay = ctx.createDelay();
  const fbGain = ctx.createGain();
  const wetGain = ctx.createGain();
  delay.delayTime.value = time;
  fbGain.gain.value = feedback;
  wetGain.gain.value = wet;
  delay.connect(fbGain);
  fbGain.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(dest);
  return delay;
}

const bgmEngine = {
  isPlaying: false,
  highTension: false,
  gameState: 'menu',
  nextNoteTime: 0,
  currentStep: 0,
  measure: 0,
  timerID: null,
  delayNode: null,

  // ── Progressão de acordes (MIDI) — Am | F | C | G | Dm | Am | F | Em ──
  chords: [57, 53, 48, 55, 50, 57, 53, 52],
  currentRoot: 57,

  // ── Formas de arpejo pré-definidas (graus da pentatônica) ──
  arpShapes: [
    [0, 1, 2, 3, 4, 3, 2, 1],     // ascending/descending (onda)
    [4, 3, 2, 1, 0, 1, 2, 3],     // pendulum invertido
    [0, 2, 1, 3, 0, 4, 2, 3],     // saltitante
    [0, 0, 2, 2, 3, 3, 4, 4],     // pares repetidos
    [4, -1, 3, -1, 2, -1, 1, -1], // staccato (com pausas)
    [0, 1, -1, 2, 3, -1, 4, 3],   // groove com respiro
  ],
  currentArpShape: 0,
  arpPattern: [],

  // ── Padrões de bateria (K=kick, H=hat, .=silêncio, S=snare hat) ──
  //  16 steps cada
  drumPatterns: [
    { kick: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], hat: [0,0,1,0, 1,0,1,0, 0,0,1,0, 1,0,1,0] }, // básico
    { kick: [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0], hat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1] }, // groove
    { kick: [1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0], hat: [1,0,1,0, 0,0,1,0, 1,0,1,0, 0,0,1,0] }, // sutil
  ],
  currentDrumPattern: 0,

  // ── Padrão de baixo por compasso (quais beats tocam e grau) ──
  bassPatterns: [
    [0, -1, 0, -1],   // só tônica nos beats 1 e 3
    [0, 4,  0,  3],   // tônica, 5ª, tônica, 4ª
    [0, -1, 2, -1],   // tônica e 3ª
  ],
  currentBassPattern: 0,

  // ── Seção da música (controla quando mudar padrões) ──
  section: 0, // cada seção = 4 compassos
  
  // Escolher nova seção a cada 4 compassos
  updateSection: () => {
    if (bgmEngine.measure % 4 !== 0) return;
    bgmEngine.section = Math.floor(bgmEngine.measure / 4);
    
    // Trocar forma do arpejo a cada 4 compassos (ciclando)
    bgmEngine.currentArpShape = bgmEngine.section % bgmEngine.arpShapes.length;
    
    // Trocar groove de bateria a cada 8 compassos
    if (bgmEngine.measure % 8 === 0) {
      bgmEngine.currentDrumPattern = (bgmEngine.currentDrumPattern + 1) % bgmEngine.drumPatterns.length;
    }
    
    // Trocar padrão de baixo a cada 8 compassos (defasado)
    if (bgmEngine.measure % 8 === 4) {
      bgmEngine.currentBassPattern = (bgmEngine.currentBassPattern + 1) % bgmEngine.bassPatterns.length;
    }
  },

  // Montar arpejo do compasso atual a partir da shape
  buildArpPattern: () => {
    const shape = bgmEngine.arpShapes[bgmEngine.currentArpShape];
    bgmEngine.arpPattern = [];
    for (let i = 0; i < 16; i++) {
      // 2 notas por step da shape (a shape tem 8 notas, distribuídas em 16 steps)
      if (i % 2 === 0) {
        bgmEngine.arpPattern.push(shape[i / 2]);
      } else {
        // Steps ímpares: silêncio (exceto em tensão alta, onde preenchem)
        bgmEngine.arpPattern.push(bgmEngine.highTension ? shape[Math.floor(i / 2)] : -1);
      }
    }
  },

  // ── Criar efeito de delay ──
  ensureDelay: () => {
    if (bgmEngine.delayNode || !actx) return;
    bgmEngine.delayNode = createDelay(actx, actx.destination, 0.35, 0.3, 0.15);
  },

  // ── PAD onírico ──
  playPad: (time, freq, duration) => {
    if (!audioEnabled || !actx) return;
    const vol = bgmEngine.gameState === 'menu' ? 0.04 : 0.025;
    for (const detune of [-8, 8]) {
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      const filter = actx.createBiquadFilter();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      osc.detune.setValueAtTime(detune, time);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, time);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(vol, time + 0.4);
      gain.gain.setValueAtTime(vol, time + duration - 0.5);
      gain.gain.linearRampToValueAtTime(0, time + duration);
      osc.connect(filter); filter.connect(gain);
      gain.connect(actx.destination);
      if (bgmEngine.delayNode) gain.connect(bgmEngine.delayNode);
      osc.start(time); osc.stop(time + duration);
    }
  },

  // ── BASS quente ──
  playBass: (time, freq) => {
    if (!audioEnabled || !actx) return;
    const isMenu = bgmEngine.gameState === 'menu';
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    const filter = actx.createBiquadFilter();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isMenu ? 300 : (bgmEngine.highTension ? 600 : 400), time);
    const vol = isMenu ? 0.06 : 0.05;
    const decay = isMenu ? 0.6 : 0.3;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    osc.connect(filter); filter.connect(gain);
    gain.connect(actx.destination);
    osc.start(time); osc.stop(time + decay);
  },

  // ── ARPEJO ──
  playArp: (time, freq) => {
    if (!audioEnabled || !actx) return;
    const isMenu = bgmEngine.gameState === 'menu';
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    const filter = actx.createBiquadFilter();
    osc.type = isMenu ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isMenu ? 2000 : 3000, time);
    filter.frequency.exponentialRampToValueAtTime(500, time + 0.3);
    gain.gain.setValueAtTime(isMenu ? 0.03 : 0.02, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.connect(filter); filter.connect(gain);
    gain.connect(actx.destination);
    if (bgmEngine.delayNode) gain.connect(bgmEngine.delayNode);
    osc.start(time); osc.stop(time + 0.35);
  },

  // ── KICK 808 ──
  playKick: (time) => {
    if (!audioEnabled || !actx) return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, time);
    osc.frequency.exponentialRampToValueAtTime(28, time + 0.4);
    gain.gain.setValueAtTime(bgmEngine.gameState === 'menu' ? 0.1 : 0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(gain); gain.connect(actx.destination);
    osc.start(time); osc.stop(time + 0.45);
  },

  // ── HI-HAT (noise) ──
  playHat: (time) => {
    if (!audioEnabled || !actx) return;
    const bufferSize = actx.sampleRate * 0.05;
    const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = actx.createBufferSource();
    const gain = actx.createGain();
    const filter = actx.createBiquadFilter();
    noise.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    gain.gain.setValueAtTime(bgmEngine.gameState === 'menu' ? 0.01 : 0.02, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    noise.connect(filter); filter.connect(gain);
    gain.connect(actx.destination);
    noise.start(time); noise.stop(time + 0.06);
  },

  // ══════════════════════════════════
  //  SCHEDULER — coração do engine
  // ══════════════════════════════════
  scheduler: () => {
    if (!audioEnabled || !actx) return;
    while (bgmEngine.nextNoteTime < actx.currentTime + 0.1) {
      const isMenu = (bgmEngine.gameState === 'menu');
      const tempo = isMenu ? 82 : (bgmEngine.highTension ? 110 : 95);
      const step = bgmEngine.currentStep;
      const isBeat = (step % 4 === 0);
      const beatIdx = Math.floor(step / 4); // 0-3 (qual beat do compasso)
      const secPerStep = 0.25 * (60.0 / tempo);

      // ── Novo compasso ──
      if (step === 0) {
        bgmEngine.currentRoot = bgmEngine.chords[bgmEngine.measure % bgmEngine.chords.length];
        bgmEngine.updateSection();
        bgmEngine.buildArpPattern();
        bgmEngine.measure++;

        // Pad (dura 1 compasso)
        bgmEngine.playPad(bgmEngine.nextNoteTime, midiToFreq(bgmEngine.currentRoot), secPerStep * 16);
        bgmEngine.playPad(bgmEngine.nextNoteTime, midiToFreq(bgmEngine.currentRoot + 7), secPerStep * 16);
      }

      // ── Baixo (padrão estruturado) ──
      if (isBeat) {
        const bp = bgmEngine.bassPatterns[bgmEngine.currentBassPattern];
        const deg = bp[beatIdx];
        if (deg !== -1) {
          const bassFreq = getNote(bgmEngine.currentRoot, 0, deg);
          bgmEngine.playBass(bgmEngine.nextNoteTime, bassFreq);
        }
      }

      // ── Arpejo (padrão estruturado) ──
      const arpDeg = bgmEngine.arpPattern[step];
      if (arpDeg !== -1 && arpDeg !== undefined) {
        const oct = isMenu ? 2 : 3;
        bgmEngine.playArp(bgmEngine.nextNoteTime, getNote(bgmEngine.currentRoot, oct, arpDeg));
      }

      // ── Drums (padrão estruturado) ──
      const introOver = !isMenu || bgmEngine.measure > 2;
      if (introOver) {
        const dp = bgmEngine.drumPatterns[bgmEngine.currentDrumPattern];
        if (dp.kick[step]) bgmEngine.playKick(bgmEngine.nextNoteTime);
        if (dp.hat[step] || (bgmEngine.highTension && step % 2 === 0)) bgmEngine.playHat(bgmEngine.nextNoteTime);
      }

      bgmEngine.nextNoteTime += secPerStep;
      bgmEngine.currentStep = (bgmEngine.currentStep + 1) % 16;
    }
    bgmEngine.timerID = setTimeout(bgmEngine.scheduler, 25);
  },

  start: () => {
    if (!audioEnabled) return;
    if (!actx) actx = new AudioCtx();
    if (actx.state === 'suspended') actx.resume();
    if (bgmEngine.isPlaying) return;
    bgmEngine.isPlaying = true;
    bgmEngine.currentStep = 0;
    bgmEngine.measure = 0;
    bgmEngine.section = 0;
    bgmEngine.currentArpShape = 0;
    bgmEngine.currentDrumPattern = 0;
    bgmEngine.currentBassPattern = 0;
    bgmEngine.ensureDelay();
    bgmEngine.buildArpPattern();
    bgmEngine.nextNoteTime = actx.currentTime + 0.05;
    bgmEngine.scheduler();
  },

  stop: () => {
    bgmEngine.isPlaying = false;
    clearTimeout(bgmEngine.timerID);
  },

  setState: (state) => { bgmEngine.gameState = state; bgmEngine.highTension = false; },
  setTension: (isHigh) => { bgmEngine.highTension = isHigh; }
};

$("btnToggleSound").addEventListener("click", (e) => {
  audioEnabled = !audioEnabled;
  e.target.textContent = audioEnabled ? "Som: Ativado" : "Som: Desativado";
  e.target.classList.toggle("muted", !audioEnabled);
  if (audioEnabled) bgmEngine.start();
  else bgmEngine.stop();
});

document.addEventListener("click", e => {
  if (audioEnabled && !bgmEngine.isPlaying) bgmEngine.start();
  if (e.target.matches("button, .lobby-player-row.clickable, .sound-toggle-btn")) {
    sfx.click();
  }
});

// ── SISTEMA DE TEMAS (Aparência) ──
let currentTheme = localStorage.getItem("cacaPadroesTheme") || "neon";

function applyTheme(theme) {
  document.body.classList.remove("theme-light", "theme-dark");
  if (theme !== "neon") {
    document.body.classList.add(`theme-${theme}`);
  }
  localStorage.setItem("cacaPadroesTheme", theme);
}
applyTheme(currentTheme);

// ═══════════════════════════════════════════════════
//  NAVEGAÇÃO DE TELAS
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
//  SISTEMA DE VFX (Visual Effects)
// ═══════════════════════════════════════════════════

const vfx = {
  // Cores baseadas no tema atual
  getColor: () => {
    const theme = localStorage.getItem("cacaPadroesTheme") || "neon";
    if (theme === "neon") return "#9D00FF";
    if (theme === "light") return "#185FA5";
    return "#826A9C";
  },

  spawnParticles: (x, y, count = 15) => {
    const color = vfx.getColor();
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "vfx-particle";
      
      // Ajustar posição inicial no centro do clique/elemento
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 100;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      
      p.style.setProperty("--dx", `${dx}px`);
      p.style.setProperty("--dy", `${dy}px`);
      p.style.setProperty("--vfx-color", color);
      
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 800);
    }
  },

  shake: (el) => {
    if (!el) return;
    el.classList.remove("vfx-shake");
    void el.offsetWidth; // Force reflow
    el.classList.add("vfx-shake");
    setTimeout(() => el.classList.remove("vfx-shake"), 500);
  },

  pulse: (el) => {
    if (!el) return;
    const color = vfx.getColor();
    el.style.setProperty("--vfx-color", color);
    el.classList.remove("vfx-pulse");
    void el.offsetWidth; // Force reflow
    el.classList.add("vfx-pulse");
    // Partículas saindo do elemento centralizado
    const rect = el.getBoundingClientRect();
    vfx.spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
};

const screens = ["menuScreen", "settingsScreen", "joinScreen", "createScreen", "lobbyScreen", "gameScreen", "multiEndScreen"];
let currentScreenId = "menuScreen";

function showScreen(id) {
  if (id === currentScreenId && !$(id).classList.contains("hidden")) return;

  const oldScreen = $(currentScreenId);
  const newScreen = $(id);

  if (oldScreen && currentScreenId !== id) {
    oldScreen.classList.add("exit-animation");
    setTimeout(() => {
      oldScreen.classList.add("hidden");
      oldScreen.classList.remove("exit-animation");
      
      if (newScreen) {
        newScreen.classList.remove("hidden");
        newScreen.classList.add("enter-animation");
        void newScreen.offsetWidth;
        setTimeout(() => newScreen.classList.remove("enter-animation"), 300);
      }
    }, 250);
  } else {
    screens.forEach(s => {
      const el = $(s);
      if (el) el.classList.toggle("hidden", s !== id);
    });
    if (newScreen) {
       newScreen.classList.add("enter-animation");
       void newScreen.offsetWidth;
       setTimeout(() => newScreen.classList.remove("enter-animation"), 300);
    }
  }
  
  currentScreenId = id;
}

// ═══════════════════════════════════════════════════
//  MENU PRINCIPAL
// ═══════════════════════════════════════════════════

function getNickname() {
  const val = $("nicknameInput").value.trim();
  return val || `Jogador${rnd(1, 999)}`;
}

// Jogar solo
$("btnPlay").addEventListener("click", () => {
  gameMode = "single";
  startSinglePlayer();
});

// Ir para tela de configurações
$("btnOpenSettings").addEventListener("click", () => {
  showScreen("settingsScreen");
});

$("btnBackSettings").addEventListener("click", () => {
  showScreen("menuScreen");
});

// Ir para tela de entrar em sala
$("btnJoinMenu").addEventListener("click", () => {
  showScreen("joinScreen");
  $("roomCodeInput").value = "";
  $("joinError").classList.add("hidden");
  $("roomCodeInput").focus();
});

// Ir para tela de criar sala
$("btnCreateMenu").addEventListener("click", () => {
  showScreen("createScreen");
  populatePatternChecklist();
});

// ═══════════════════════════════════════════════════
//  ENTRAR EM SALA
// ═══════════════════════════════════════════════════

$("btnBackJoin").addEventListener("click", () => showScreen("menuScreen"));

$("btnJoinRoom").addEventListener("click", async () => {
  const code = $("roomCodeInput").value.trim().toUpperCase();
  if (!code) { showJoinError("Digite o código da sala."); return; }

  await connectSocket();
  socket.emit("joinRoom", { code, name: getNickname() });
});

$("roomCodeInput").addEventListener("keydown", e => {
  if (e.key === "Enter") $("btnJoinRoom").click();
});

function showJoinError(msg) {
  const el = $("joinError");
  el.textContent = msg;
  el.classList.remove("hidden");
}

// ═══════════════════════════════════════════════════
//  CRIAR SALA
// ═══════════════════════════════════════════════════

$("btnBackCreate").addEventListener("click", () => showScreen("menuScreen"));

// Toggle groups
function setupToggleGroup(groupId, onChange) {
  const group = $(groupId);
  group.addEventListener("click", e => {
    const btn = e.target.closest(".toggle-btn");
    if (!btn) return;
    group.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    if (onChange) onChange(btn.dataset.value);
  });
}

function getToggleValue(groupId) {
  const active = $(groupId).querySelector(".toggle-btn.active");
  return active ? active.dataset.value : null;
}

// Configuração do Tema
if ($("themeToggle")) {
  const themeBtns = $("themeToggle").querySelectorAll(".toggle-btn");
  themeBtns.forEach(b => b.classList.remove("active"));
  const activeThemeBtn = $("themeToggle").querySelector(`.toggle-btn[data-value="${currentTheme}"]`);
  if (activeThemeBtn) activeThemeBtn.classList.add("active");
  
  setupToggleGroup("themeToggle", val => {
    currentTheme = val;
    applyTheme(val);
  });
}

setupToggleGroup("modeToggle", val => {
  $("modeHint").textContent = val === "jvj"
    ? "Free-for-all: cada um por si"
    : "Times: azul vs vermelho";
  $("maxPlayersGroup").classList.toggle("hidden", val === "gvg");
});

setupToggleGroup("typeToggle", val => {
  $("customSettings").classList.toggle("hidden", val !== "custom");
});

setupToggleGroup("diffToggle");
setupToggleGroup("qCountToggle");
setupToggleGroup("qTimerToggle");
setupToggleGroup("gTimerToggle");
setupToggleGroup("maxPlayersToggle");
setupToggleGroup("gTimerToggle");

function populatePatternChecklist() {
  const container = $("patternChecklist");
  if (container.children.length > 0) return; // Já populado
  patternDefinitions.forEach(p => {
    const label = document.createElement("label");
    label.className = "pattern-check";
    label.innerHTML = `<input type="checkbox" value="${p.id}" checked> ${p.type}`;
    container.appendChild(label);
  });
}

function getSelectedPatterns() {
  const checks = $("patternChecklist").querySelectorAll("input:checked");
  return Array.from(checks).map(c => c.value);
}

$("btnCreateRoom").addEventListener("click", async () => {
  const mode = getToggleValue("modeToggle");
  const type = getToggleValue("typeToggle");
  const settings = {
    questionCount: parseInt(getToggleValue("qCountToggle")),
    questionTimer: parseInt(getToggleValue("qTimerToggle")),
    globalTimer: parseInt(getToggleValue("gTimerToggle")),
    patterns: type === "custom" ? getSelectedPatterns() : [],
    difficulty: type === "custom" ? getToggleValue("diffToggle") : "all",
    maxPlayers: mode === "jvj" ? parseInt(getToggleValue("maxPlayersToggle")) : 100 // GvG não tem limite estrito
  };

  await connectSocket();
  console.log("[CLIENT] Emitting createRoom", { mode, settings });
  socket.emit("createRoom", { name: getNickname(), mode, settings });
});

// ═══════════════════════════════════════════════════
//  SALA DE ESPERA
// ═══════════════════════════════════════════════════

function renderLobby() {
  if (!roomData) return;

  $("lobbyRoomCode").textContent = roomData.id;
  $("lobbyModeBadge").textContent = roomData.mode === "jvj" ? "JvJvJ" : "GvG";

  const s = roomData.settings;
  let settingsText = `${s.questionCount} perguntas`;
  if (s.questionTimer > 0) settingsText += ` · ${s.questionTimer}s/pergunta`;
  if (s.globalTimer > 0) settingsText += ` · ${Math.floor(s.globalTimer / 60)} min total`;
  if (s.questionTimer === 0 && s.globalTimer === 0) settingsText += " · sem timer";
  $("lobbySettingsText").textContent = settingsText;

  renderLobbyPlayers();

  // Host controls
  const startBtn = $("btnStartGame");
  if (isHost) {
    startBtn.classList.remove("hidden");
    startBtn.disabled = roomData.players.length < 2;
    $("lobbyHint").textContent = roomData.players.length < 2
      ? "Aguardando mais jogadores..."
      : "Pronto para iniciar!";
  } else {
    startBtn.classList.add("hidden");
    $("lobbyHint").textContent = "Aguardando o host iniciar...";
  }
}

function renderLobbyPlayers() {
  const containerPlayers = $("lobbyPlayers");
  const containerSpectators = $("lobbySpectators");
  containerPlayers.innerHTML = "";
  containerSpectators.innerHTML = "";

  roomData.players.forEach(p => {
    const isMe = p.id === myPlayer?.id;
    const div = document.createElement("div");
    div.className = "lobby-player-row" + (isMe ? " self clickable" : "");
    if (isMe) {
      // Toggle team on click
      div.addEventListener("click", () => {
        if (roomData.mode === "gvg" && p.team !== "spectator") {
          const newTeam = p.team === "blue" ? "red" : "blue";
          if (socket) socket.emit("changeTeam", { team: newTeam });
        }
      });
      div.title = "Clique para trocar de time";
    }

    let teamBadge = "";
    if (roomData.mode === "gvg" && p.team && p.team !== "spectator") {
      teamBadge = `<span class="player-team-badge ${p.team}">${p.team === "blue" ? "Azul" : "Vermelho"}</span>`;
    }

    div.innerHTML = `
      <div class="player-dot" style="background:${p.color}"></div>
      <span class="player-name">${p.name} ${isMe ? "(Você)" : ""}</span>
      ${p.isHost ? '<span class="host-badge">Host</span>' : ""}
      ${teamBadge}
    `;

    if (p.team === "spectator") containerSpectators.appendChild(div);
    else containerPlayers.appendChild(div);
  });
}

// Role actions
$("btnJoinGameRole").addEventListener("click", () => {
  const t = roomData?.mode === "gvg" ? "blue" : null;
  if (socket) socket.emit("changeTeam", { team: t });
});

$("btnJoinSpectatorRole").addEventListener("click", () => {
  if (socket) socket.emit("changeTeam", { team: "spectator" });
});

$("btnBalanceTeams").addEventListener("click", () => {
  if (socket && isHost) socket.emit("balanceTeams");
});

$("btnCopyCode").addEventListener("click", () => {
  const code = $("lobbyRoomCode").textContent;
  navigator.clipboard.writeText(code).then(() => {
    $("btnCopyCode").textContent = "✓";
    setTimeout(() => { $("btnCopyCode").textContent = "📋"; }, 1500);
  });
});

$("btnStartGame").addEventListener("click", () => {
  if (socket && isHost) socket.emit("startGame");
});

$("btnLeaveLobby").addEventListener("click", () => {
  if (socket) socket.disconnect();
  socket = null;
  roomData = null;
  showScreen("menuScreen");
});

// Global function for inline onclick (team switch)
window.switchTeam = function (playerId) {
  if (socket && isHost) socket.emit("switchTeam", { playerId });
};

// ═══════════════════════════════════════════════════
//  SOCKET.IO — CONEXÃO E EVENTOS
// ═══════════════════════════════════════════════════

function connectSocket() {
  return new Promise((resolve) => {
    if (socket && socket.connected) {
      console.log("[CLIENT] Socket already connected:", socket.id);
      resolve();
      return;
    }

    // Disconnect old socket if exists but not connected
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    console.log("[CLIENT] Creating new socket connection...");
    socket = io();

    socket.on("connect", () => {
      console.log("[CLIENT] Connected with id:", socket.id);
      resolve();
    });

    socket.on("connect_error", (err) => {
      console.error("[CLIENT] Connection error:", err.message);
    });

  // ── Sala de Espera (Eventos UI) ──
  socket.on("roomCreated", ({ roomId, player, room }) => {
    console.log("[CLIENT] Room created:", roomId);
    myPlayer = player;
    roomData = room;
    isHost = true;
    $("btnBalanceTeams").classList.remove("hidden");
    showScreen("lobbyScreen");
    renderLobby();
  });

  // ── Entrou em sala ──
  socket.on("roomJoined", ({ player, room }) => {
    myPlayer = player;
    roomData = room;
    isHost = false;
    showScreen("lobbyScreen");
    renderLobby();
  });

  socket.on("joinError", ({ message }) => {
    showJoinError(message);
  });

  // ── Jogador entrou ──
  socket.on("playerJoined", ({ players }) => {
    if (roomData) {
      roomData.players = players;
      renderLobby();
    }
  });

  // ── Jogador saiu ──
  socket.on("playerLeft", ({ players }) => {
    if (roomData) {
      roomData.players = players;
      if (roomData.state === "waiting") renderLobby();
    }
  });

  // ── Host mudou ──
  socket.on("hostChanged", ({ newHostId }) => {
    isHost = (socket.id === newHostId);
    if (roomData) {
      roomData.host = newHostId;
      roomData.players.forEach(p => p.isHost = (p.id === newHostId));
      if (roomData.state === "waiting") renderLobby();
    }
  });

  // ── Times atualizados ──
  socket.on("teamUpdated", ({ players }) => {
    if (roomData) {
      roomData.players = players;
      renderLobby();
    }
  });

  // ── Settings atualizados ──
  socket.on("settingsUpdated", (settings) => {
    if (roomData) {
      roomData.settings = settings;
      renderLobby();
    }
  });

  // ── Jogo iniciado ──
  socket.on("gameStarted", ({ mode, totalQuestions, players, settings }) => {
    bgmEngine.setState('game');
    gameMode = mode;
    mpPlayers = players;
    mpTotalQuestions = totalQuestions;
    mpQuestionIndex = 0;
    mpSubmitted = false;

    // Reset scores
    mpPlayers.forEach(p => p.score = 0);

    showScreen("gameScreen");
    setupGameUI(mode, settings);
  });

  // ── Nova pergunta ──
  socket.on("newQuestion", (questionData) => {
    mpCurrentQuestion = questionData;
    mpQuestionIndex = questionData.index;
    mpSubmitted = false;
    renderMultiQuestion(questionData);
  });

  // ── Resultado da resposta ──
  socket.on("answerResult", ({ correct, points, answers, streak }) => {
    const card = document.querySelector(".question-card");
    if (correct) {
      sfx.correct();
      vfx.pulse(card);
      if (streak > 2) sfx.streak();
      showMpFeedback(`+${points} pontos ✓`, "ok");
      // Marcar campos como corretos
      mpCurrentQuestion.blanks.forEach((idx, j) => {
        const inp = $("b" + idx);
        if (inp) { inp.classList.add("correct"); inp.readOnly = true; inp.value = answers[j]; }
      });
      // Overlay de aguardando
      const fb = $("fb");
      fb.innerHTML = `<div class='waiting-overlay'>Aguardando outros jogadores...</div>`;
      fb.className = "";
    } else {
      sfx.wrong();
      vfx.shake(card);
      showMpFeedback("Errou! Resposta: " + answers.join(", "), "err");
      mpCurrentQuestion.blanks.forEach((idx, j) => {
        const inp = $("b" + idx);
        if (inp) { inp.classList.add("wrong"); inp.value = answers[j]; inp.readOnly = true; }
      });
    }
  });

  // ── Atualização de progresso ──
  socket.on("progressUpdate", (data) => {
    if (data.rankings) updateRaceTrack(data.rankings);
    if (data.teams) updateTeamBars(data.teams);
  });

  // ── Timer global ──
  socket.on("timerStart", ({ type, duration }) => {
    if (type === "global") startGlobalTimer(duration);
  });

  // ── Jogo encerrado ──
  socket.on("gameEnded", (results) => {
    bgmEngine.setState('menu');
    sfx.finish();
    clearTimers();
    showMultiResults(results);
  });

  // ── Voltar ao lobby ──
  socket.on("backToLobby", ({ room }) => {
    bgmEngine.setState('menu');
    roomData = room;
    clearTimers();
    showScreen("lobbyScreen");
    renderLobby();
  });

  // ── Erro ao iniciar ──
  socket.on("startError", ({ message }) => {
    $("lobbyHint").textContent = message;
  });

  // ── Desconexão ──
  socket.on("disconnect", (reason) => {
    console.log("[CLIENT] Disconnected:", reason);
    clearTimers();
  });

  }); // end of Promise
}

// ═══════════════════════════════════════════════════
//  SINGLEPLAYER
// ═══════════════════════════════════════════════════

function startSinglePlayer() {
  bgmEngine.setState('game');
  spState = { score: 0, lives: MAX_LIVES, q: 0, streak: 0 };
  showScreen("gameScreen");
  $("btnLeaveGame").classList.remove("hidden");
  $("btnLeaveGame").onclick = () => {
    bgmEngine.setState('menu');
    sfx.click();
    showScreen("menuScreen");
  };

  // Mostrar UI de singleplayer
  $("livesCard").classList.remove("hidden");
  $("timerCard").classList.add("hidden");
  $("singleProgressBar").classList.remove("hidden");
  $("raceTrack").classList.add("hidden");
  $("teamBars").classList.add("hidden");
  $("gameSubtitle").textContent = "Descubra a regra oculta na sequência";

  renderSingleGame();
}

function renderLives() {
  const row = $("livesRow");
  row.innerHTML = "";
  for (let i = 0; i < MAX_LIVES; i++) {
    const heart = document.createElement("div");
    heart.className = "heart" + (i >= spState.lives ? " lost" : "");
    row.appendChild(heart);
  }
}

function getLevelInfo() {
  const lvl = Math.min(Math.floor(spState.q / 3) + 1, 4);
  const names = ["", "Iniciante", "Intermediário", "Avançado", "Expert"];
  return { lvl, name: names[lvl] };
}

function pickBlanks(q) {
  if (q < 3) return [5];
  if (q < 6) return [4, 5];
  return [3, 4, 5];
}

function pickQuestion() {
  const p = patternDefinitions[rnd(0, patternDefinitions.length - 1)];
  const lvl = Math.floor(spState.q / 3) + 1;
  const sequence = p.gen(lvl);
  const blanks = pickBlanks(spState.q);
  return { seq: sequence, blanks, type: p.type, hint: p.hint(sequence), answers: blanks.map(i => sequence[i]) };
}

function buildSequenceHTML(sequence, blanks) {
  return sequence.map((v, i) => {
    const sep = i > 0 ? '<span class="seq-sep">,</span>' : "";
    if (blanks.includes(i)) {
      return sep + `<input class="seq-blank" id="b${i}" type="number" placeholder="?" data-idx="${i}" autocomplete="off">`;
    }
    return sep + `<span class="seq-num">${v}</span>`;
  }).join("");
}

function renderSingleGame() {
  const lvl = getLevelInfo();
  $("levelBadge").textContent = `Nível ${lvl.lvl} — ${lvl.name}`;
  $("progressFill").style.width = (spState.q / TOTAL_QUESTIONS * 100) + "%";
  $("scoreVal").textContent = spState.score;
  renderLives();

  spCurrent = pickQuestion();
  spSubmitted = false;

  const seqHTML = buildSequenceHTML(spCurrent.seq, spCurrent.blanks);

  $("gameArea").innerHTML = `
    <div class="question-card">
      <div class="hint-row">Questão ${spState.q + 1} de ${TOTAL_QUESTIONS}</div>
      <div class="sequence-row">${seqHTML}</div>
      <div class="action-row">
        <button class="btn btn-primary" id="btnCheck">Verificar</button>
        <button class="btn" id="btnHint">Dica</button>
        <span class="feedback" id="fb"></span>
      </div>
      <div class="pattern-hint" id="hintBox">${spCurrent.type}</div>
    </div>
  `;

  $("btnCheck").addEventListener("click", checkSingleAnswer);
  $("btnHint").addEventListener("click", () => $("hintBox").classList.toggle("show"));

  const inputs = document.querySelectorAll(".seq-blank");
  if (inputs.length) inputs[0].focus();
  inputs.forEach(inp => inp.addEventListener("keydown", e => { if (e.key === "Enter") checkSingleAnswer(); }));

  updateStreakBadge();
}

function showFeedback(text, type) {
  const fb = $("fb");
  fb.textContent = text;
  fb.className = `feedback ${type}`;
}

function updateStreakBadge() {
  const badge = $("streakBadge");
  badge.textContent = `🔥 ${spState.streak}x sequência!`;
  badge.className = "streak" + (spState.streak >= 2 ? " show" : "");
}

function checkSingleAnswer() {
  if (spSubmitted) return;

  let allCorrect = true;
  let anyEmpty = false;

  spCurrent.blanks.forEach((idx, j) => {
    const inp = $("b" + idx);
    if (!inp) return;
    const valStr = inp.value.trim();
    if (!valStr) {
      anyEmpty = true;
      allCorrect = false;
      inp.classList.add("wrong");
      return;
    }
    const val = parseInt(valStr, 10);
    if (val === spCurrent.answers[j]) {
      inp.classList.add("correct");
      inp.readOnly = true;
    } else {
      inp.classList.add("wrong");
      allCorrect = false;
    }
  });

  if (anyEmpty) {
    showFeedback("Preencha todos os campos!", "err");
    setTimeout(() => {
      spCurrent.blanks.forEach(idx => {
        const inp = $("b" + idx);
        if (inp && !inp.classList.contains("correct")) inp.classList.remove("wrong");
      });
    }, 800);
    return;
  }

  if (allCorrect) {
    sfx.correct();
    vfx.pulse(document.querySelector(".question-card"));
    if (spState.streak >= 1) sfx.streak(); // streak >= 1 because we increment below
    spSubmitted = true;
    $("btnCheck").disabled = true;
    const pts = BASE_POINTS + spState.streak * STREAK_BONUS;
    spState.score += pts;
    spState.streak++;
    $("scoreVal").textContent = spState.score;
    showFeedback(`+${pts} pontos ✓`, "ok");
    updateStreakBadge();
    setTimeout(nextSingleQuestion, NEXT_DELAY_MS);
  } else {
    sfx.wrong();
    vfx.shake(document.querySelector(".question-card"));
    spState.lives--;
    spState.streak = 0;
    renderLives();
    updateStreakBadge();
    showFeedback("Tente novamente!", "err");
    if (spState.lives <= 0) { sfx.finish(); setTimeout(showSingleEnd, END_DELAY_MS); return; }
    spCurrent.blanks.forEach(idx => {
      const inp = $("b" + idx);
      if (inp && !inp.classList.contains("correct")) {
        inp.value = "";
        setTimeout(() => inp.classList.remove("wrong"), 300);
      }
    });
  }
}

function nextSingleQuestion() {
  spState.q++;
  if (spState.q >= TOTAL_QUESTIONS) { sfx.finish(); showSingleEnd(); return; }
  renderSingleGame();
}

function showSingleEnd() {
  $("progressFill").style.width = "100%";
  const pct = Math.round(spState.score / (TOTAL_QUESTIONS * 14) * 100);
  let grade;
  if (pct >= 90) grade = "Mestre dos Padrões";
  else if (pct >= 70) grade = "Analista de Padrões";
  else if (pct >= 50) grade = "Aprendiz de Padrões";
  else grade = "Continue Tentando!";

  $("gameArea").innerHTML = `
    <div class="end-screen">
      <div class="big-score">${spState.score}</div>
      <p>pontos finais &nbsp;·&nbsp; ${spState.q} questões respondidas</p>
      <div class="grade">${grade}</div>
      <br>
      <button class="btn btn-primary" id="btnRestart">Jogar Novamente</button>
      <button class="btn" id="btnBackMenu">Voltar ao Menu</button>
    </div>
  `;

  bgmEngine.setState('menu');
  $("btnRestart").addEventListener("click", () => startSinglePlayer());
  $("btnBackMenu").addEventListener("click", () => showScreen("menuScreen"));
  $("levelBadge").textContent = "Fim de Jogo";
  $("streakBadge").className = "streak";
}

// ═══════════════════════════════════════════════════
//  MULTIPLAYER — GAME UI
// ═══════════════════════════════════════════════════

function setupGameUI(mode, settings) {
  // Hide singleplayer elements
  $("livesCard").classList.add("hidden");

  // Timer
  if (settings.questionTimer > 0 || settings.globalTimer > 0) {
    $("timerCard").classList.remove("hidden");
  } else {
    $("timerCard").classList.add("hidden");
  }

  // Progress bars
  $("singleProgressBar").classList.add("hidden");

  if (mode === "jvj") {
    $("raceTrack").classList.remove("hidden");
    $("teamBars").classList.add("hidden");
    initRaceTrack();
  } else {
    $("raceTrack").classList.add("hidden");
    $("teamBars").classList.remove("hidden");
    $("blueBar").style.width = "0%";
    $("redBar").style.width = "0%";
    $("blueScore").textContent = "0";
    $("redScore").textContent = "0";
  }

  $("btnLeaveGame").classList.remove("hidden");
  $("btnLeaveGame").onclick = () => {
    bgmEngine.setState('menu');
    sfx.click();
    socket.emit("leaveRoom");
    showScreen("menuScreen");
  };
  $("btnOpenSettings").classList.remove("hidden");
  $("btnOpenSettings").onclick = () => {
    sfx.click();
    showScreen("settingsScreen");
  };
  $("btnBackSettings").onclick = () => {
    sfx.click();
    showScreen("lobbyScreen");
  };

  $("gameSubtitle").textContent = mode === "jvj" ? "Modo: Free-for-all" : "Modo: Azul vs Vermelho";
  $("levelBadge").textContent = `Pergunta 1 de ${mpTotalQuestions}`;
  $("scoreVal").textContent = "0";
  $("streakBadge").className = "streak";
}

function initRaceTrack() {
  const track = $("raceTrack");
  track.innerHTML = "";
  mpPlayers.forEach(p => {
    const lane = document.createElement("div");
    lane.className = "race-lane";
    lane.id = `lane-${p.id}`;
    lane.innerHTML = `
      <span class="race-name">${p.name}</span>
      <div class="race-bar">
        <div class="race-ball" style="background:${p.color}" id="ball-${p.id}"></div>
      </div>
      <span class="race-score" id="rscore-${p.id}">0</span>
    `;
    track.appendChild(lane);
  });
}

function updateRaceTrack(rankings) {
  if (!rankings) return;
  const maxScore = Math.max(...rankings.map(r => r.score), 1);

  rankings.forEach(r => {
    const ball = $(`ball-${r.id}`);
    const scoreEl = $(`rscore-${r.id}`);
    if (ball) {
      const pct = Math.min((r.progress || 0) * 100, 100);
      ball.style.left = `calc(${pct}% - 9px)`;
    }
    if (scoreEl) scoreEl.textContent = r.score;

    // Atualizar meu score
    if (r.id === myPlayer?.id) {
      $("scoreVal").textContent = r.score;
    }
  });
}

function updateTeamBars(teams) {
  if (!teams) return;
  $("blueBar").style.width = (teams.blue.progress * 100) + "%";
  $("redBar").style.width = (teams.red.progress * 100) + "%";
  $("blueScore").textContent = teams.blue.score;
  $("redScore").textContent = teams.red.score;

  // Atualizar meu score
  const myTeam = myPlayer?.team;
  if (myTeam && teams[myTeam]) {
    $("scoreVal").textContent = teams[myTeam].score;
  }
}

function renderMultiQuestion(qData) {
  $("levelBadge").textContent = `Pergunta ${qData.index + 1} de ${qData.total}`;

  const seqHTML = qData.seq.map((v, i) => {
    const sep = i > 0 ? '<span class="seq-sep">,</span>' : "";
    if (v === null) {
      return sep + `<input class="seq-blank" id="b${i}" type="number" placeholder="?" autocomplete="off">`;
    }
    return sep + `<span class="seq-num">${v}</span>`;
  }).join("");

  $("gameArea").innerHTML = `
    <div class="question-card">
      <div class="hint-row">Questão ${qData.index + 1} de ${qData.total}</div>
      <div class="sequence-row">${seqHTML}</div>
      <div class="action-row">
        <button class="btn btn-primary" id="btnMpCheck">Verificar</button>
        <button class="btn" id="btnMpHint">Dica</button>
        <span class="feedback" id="fb"></span>
      </div>
      <div class="pattern-hint" id="hintBox">${qData.type}</div>
      ${qData.timer ? `<div class="question-timer-bar"><div class="question-timer-fill" id="qTimerFill" style="width:100%"></div><div class="question-timer-text" id="qTimerText">${qData.timer}s</div></div>` : ""}
    </div>
  `;

  $("btnMpCheck").addEventListener("click", submitMultiAnswer);
  $("btnMpHint").addEventListener("click", () => $("hintBox").classList.toggle("show"));

  if (qData.timer) startQuestionTimer(qData.timer);

  const inputs = document.querySelectorAll(".seq-blank");
  if (inputs.length) inputs[0].focus();
  inputs.forEach(inp => inp.addEventListener("keydown", e => { if (e.key === "Enter") submitMultiAnswer(); }));
}

function showMpFeedback(text, type) {
  const fb = $("fb");
  if (fb) {
    fb.textContent = text;
    fb.className = `feedback ${type}`;
  }
}

function submitMultiAnswer() {
  if (mpSubmitted) return;
  mpSubmitted = true;

  const answers = [];
  let anyEmpty = false;

  if (mpCurrentQuestion) {
    mpCurrentQuestion.blanks.forEach(idx => {
      const inp = $("b" + idx);
      if (inp) {
        const val = inp.value.trim();
        if (!val) anyEmpty = true;
        answers.push(val);
      }
    });
  }

  if (anyEmpty || answers.length === 0) {
    mpSubmitted = false;
    showMpFeedback("Preencha os campos!", "err");
    return;
  }

  $("btnMpCheck").disabled = true;
  showMpFeedback("Enviado! Aguardando...", "ok");
  socket.emit("submitAnswer", { answers });
}

// ═══════════════════════════════════════════════════
//  TIMERS
// ═══════════════════════════════════════════════════

function startGlobalTimer(duration) {
  let remaining = duration;
  $("timerCard").classList.remove("hidden");
  $("timerVal").textContent = formatTime(remaining);

  if (globalTimerInterval) clearInterval(globalTimerInterval);
  globalTimerInterval = setInterval(() => {
    remaining--;
    $("timerVal").textContent = formatTime(remaining);
    
    bgmEngine.setTension(remaining > 0 && remaining <= 10);
    
    if (remaining <= 10) {
      $("timerVal").style.color = "#A32D2D";
      if (remaining > 0 && remaining <= 5) sfx.tick();
    }
    if (remaining <= 0) {
      bgmEngine.setTension(false);
      clearInterval(globalTimerInterval);
    }
  }, 1000);
}

function startQuestionTimer(duration) {
  if (questionTimerInterval) clearInterval(questionTimerInterval);
  let remaining = duration;
  const fill = $("qTimerFill");
  const txt = $("qTimerText");
  
  questionTimerInterval = setInterval(() => {
    remaining--;
    if (txt) txt.textContent = remaining + "s";
    if (fill) fill.style.width = Math.max(0, ((remaining / duration) * 100)) + "%";
    
    bgmEngine.setTension(remaining > 0 && remaining <= 5);
    if (remaining > 0 && remaining <= 3) sfx.tick();
    
    if (remaining <= 0) {
      bgmEngine.setTension(false);
      clearInterval(questionTimerInterval);
    }
  }, 1000);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function clearTimers() {
  if (questionTimerInterval) clearInterval(questionTimerInterval);
  if (globalTimerInterval) clearInterval(globalTimerInterval);
  questionTimerInterval = null;
  globalTimerInterval = null;
}

// ═══════════════════════════════════════════════════
//  RESULTADOS MULTIPLAYER
// ═══════════════════════════════════════════════════

function showMultiResults(results) {
  showScreen("multiEndScreen");

  if (results.mode === "jvj") {
    $("podiumArea").classList.remove("hidden");
    $("gvgResultArea").classList.add("hidden");
    renderPodium(results.players);
  } else {
    $("podiumArea").classList.add("hidden");
    $("gvgResultArea").classList.remove("hidden");
    renderGvgResult(results);
  }

  renderResultsTable(results.players);

  // Botões
  $("btnPlayAgain").classList.toggle("hidden", !isHost);
  $("btnPlayAgain").onclick = () => {
    if (socket) socket.emit("playAgain");
  };

  $("btnBackToMenu").onclick = () => {
    if (socket) socket.disconnect();
    socket = null;
    roomData = null;
    showScreen("menuScreen");
  };
}

function renderPodium(players) {
  const podium = $("podium");
  podium.innerHTML = "";

  const top3 = players.slice(0, 3);
  // Reorganizar: 2nd, 1st, 3rd
  const order = [1, 0, 2];
  const medals = ["🥇", "🥈", "🥉"];

  order.forEach(pos => {
    if (!top3[pos]) return;
    const p = top3[pos];
    const place = document.createElement("div");
    place.className = "podium-place";
    place.innerHTML = `
      <div class="podium-avatar" style="background:${p.color}">${p.name.charAt(0).toUpperCase()}</div>
      <div class="podium-name">${p.name}</div>
      <div class="podium-score">${p.score} pts</div>
      <div class="podium-stand stand-${pos + 1}">${medals[pos]}</div>
    `;
    podium.appendChild(place);
  });
}

function renderGvgResult(results) {
  const container = $("teamResult");
  let winnerText, winnerClass;

  if (results.winner === "blue") { winnerText = "🔵 Time Azul venceu!"; winnerClass = "blue"; }
  else if (results.winner === "red") { winnerText = "🔴 Time Vermelho venceu!"; winnerClass = "red"; }
  else { winnerText = "🤝 Empate!"; winnerClass = "draw"; }

  container.innerHTML = `
    <div class="team-winner-text ${winnerClass}">${winnerText}</div>
    <div class="team-scores-display">
      <div class="team-score-block">
        <div class="team-score-val blue-text">${results.teamScores.blue}</div>
        <div class="team-score-label blue-text">Azul</div>
      </div>
      <div class="team-score-block">
        <div class="team-score-val red-text">${results.teamScores.red}</div>
        <div class="team-score-label red-text">Vermelho</div>
      </div>
    </div>
  `;
}

function renderResultsTable(players) {
  const table = $("resultsTable");
  table.innerHTML = "";
  players.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "results-row";
    row.innerHTML = `
      <span class="results-pos">${i + 1}º</span>
      <div class="results-dot" style="background:${p.color}"></div>
      <span class="results-name">${p.name}</span>
      <span class="results-score">${p.score} pts</span>
    `;
    table.appendChild(row);
  });
}

// ═══════════════════════════════════════════════════
//  INICIALIZAÇÃO
// ═══════════════════════════════════════════════════

// Mostrar menu ao carregar
showScreen("menuScreen");
const initialNickInput = $("nicknameInput");
if (initialNickInput) {
  setTimeout(() => initialNickInput.focus(), 100);
}
