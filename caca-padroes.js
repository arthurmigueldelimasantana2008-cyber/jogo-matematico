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
  { id: "aritmetica", type: "Aritmética", gen: () => { const a = rnd(1, 10), d = rnd(1, 10); return seq(6, i => a + i * d); }, hint: s => `Cada termo aumenta em ${s[1] - s[0]}` },
  { id: "aritmetica_dec", type: "Aritmética decrescente", gen: () => { const a = rnd(20, 60), d = rnd(2, 8); return seq(6, i => a - i * d); }, hint: s => `Cada termo diminui em ${s[0] - s[1]}` },
  { id: "geometrica", type: "Geométrica", gen: () => { const a = rnd(1, 5), r = rnd(2, 4); return seq(6, i => a * r ** i); }, hint: s => `Cada termo é multiplicado por ${s[1] / s[0]}` },
  { id: "quadrados", type: "Quadrados perfeitos", gen: () => { const start = rnd(1, 5); return seq(6, i => (start + i) ** 2); }, hint: () => "Quadrados perfeitos consecutivos" },
  { id: "cubos", type: "Cubos perfeitos", gen: () => seq(6, i => (i + 1) ** 3), hint: () => "Cubos perfeitos: 1³, 2³, 3³..." },
  { id: "fibonacci", type: "Fibonacci", gen: () => { const a = rnd(1, 5), b = rnd(1, 5); const s = [a, b]; for (let i = 2; i < 6; i++) s.push(s[i - 1] + s[i - 2]); return s; }, hint: s => `Cada termo é a soma dos dois anteriores: ${s[0]}+${s[1]}=${s[2]}` },
  { id: "potencias2", type: "Potências de 2", gen: () => { const s = rnd(0, 3); return seq(6, i => 2 ** (s + i)); }, hint: () => "Potências de 2: 2⁰, 2¹, 2²..." },
  { id: "primos", type: "Números primos", gen: () => [2, 3, 5, 7, 11, 13], hint: () => "Números primos em ordem crescente" },
  { id: "triangulares", type: "Números triangulares", gen: () => seq(6, i => (i + 1) * (i + 2) / 2), hint: () => "Números triangulares: soma de 1+2+3+..." },
  { id: "dif_crescente", type: "Diferença crescente", gen: () => { const a = rnd(1, 5); const arr = [a]; let d = 1; for (let i = 1; i < 6; i++) { arr.push(arr[i - 1] + d); d++; } return arr; }, hint: s => `As diferenças entre termos são: ${s.slice(1).map((v, i) => v - s[i]).join(", ")}` },
  { id: "aritmetica_avancada", type: "Aritmética (avançada)", gen: () => { const a = rnd(5, 50), d = rnd(3, 15); return seq(6, i => a + i * d); }, hint: s => `Diferença constante de ${s[1] - s[0]}` },
  { id: "geometrica_avancada", type: "Geométrica (avançada)", gen: () => { const a = rnd(1, 3), r = rnd(2, 3); return seq(6, i => a * r ** i); }, hint: s => `Razão constante de ${s[1] / s[0]}` },
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
//  NAVEGAÇÃO DE TELAS
// ═══════════════════════════════════════════════════

const screens = ["menuScreen", "joinScreen", "createScreen", "lobbyScreen", "gameScreen", "multiEndScreen"];

function showScreen(id) {
  screens.forEach(s => {
    const el = $(s);
    if (el) el.classList.toggle("hidden", s !== id);
  });
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

setupToggleGroup("modeToggle", val => {
  $("modeHint").textContent = val === "jvj"
    ? "Free-for-all: cada um por si, até 6 jogadores"
    : "Times: azul vs vermelho";
});

setupToggleGroup("typeToggle", val => {
  $("customSettings").classList.toggle("hidden", val !== "custom");
});

setupToggleGroup("diffToggle");
setupToggleGroup("qCountToggle");
setupToggleGroup("qTimerToggle");
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
  const container = $("lobbyPlayers");
  container.innerHTML = "";
  roomData.players.forEach(p => {
    const div = document.createElement("div");
    div.className = "lobby-player" + (p.id === myPlayer?.id ? " self" : "");

    let teamBadge = "";
    if (roomData.mode === "gvg" && p.team) {
      const canSwitch = isHost ? ` onclick="switchTeam('${p.id}')"` : "";
      teamBadge = `<span class="player-team-badge ${p.team}"${canSwitch}>${p.team === "blue" ? "Azul" : "Vermelho"}</span>`;
    }

    div.innerHTML = `
      <div class="player-dot" style="background:${p.color}"></div>
      <span class="player-name">${p.name}</span>
      ${p.isHost ? '<span class="player-host-badge">Host</span>' : ""}
      ${teamBadge}
    `;
    container.appendChild(div);
  });
}

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

  // ── Criação de sala ──
  socket.on("roomCreated", ({ roomId, player, room }) => {
    console.log("[CLIENT] Room created:", roomId);
    myPlayer = player;
    roomData = room;
    isHost = true;
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
  socket.on("answerResult", ({ correct, points, answers }) => {
    if (correct) {
      showMpFeedback(`+${points} pontos ✓`, "ok");
      // Marcar campos como corretos
      mpCurrentQuestion.blanks.forEach((idx, j) => {
        const inp = $("b" + idx);
        if (inp) { inp.classList.add("correct"); inp.readOnly = true; inp.value = answers[j]; }
      });
    } else {
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
    clearTimers();
    showMultiResults(results);
  });

  // ── Voltar ao lobby ──
  socket.on("backToLobby", ({ room }) => {
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
  spState = { score: 0, lives: MAX_LIVES, q: 0, streak: 0 };
  showScreen("gameScreen");

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
  const sequence = p.gen();
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
      <div class="hint-row">Questão ${spState.q + 1} de ${TOTAL_QUESTIONS} &nbsp;·&nbsp; <span class="hint-type">${spCurrent.type}</span></div>
      <div class="sequence-row">${seqHTML}</div>
      <div class="action-row">
        <button class="btn btn-primary" id="btnCheck">Verificar</button>
        <button class="btn" id="btnHint">Dica</button>
        <span class="feedback" id="fb"></span>
      </div>
      <div class="pattern-hint" id="hintBox">${spCurrent.hint}</div>
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
  let anyFilled = false;

  spCurrent.blanks.forEach((idx, j) => {
    const inp = $("b" + idx);
    if (!inp) return;
    const val = parseInt(inp.value, 10);
    if (isNaN(val)) { allCorrect = false; return; }
    anyFilled = true;
    if (val === spCurrent.answers[j]) {
      inp.classList.add("correct");
      inp.readOnly = true;
    } else {
      inp.classList.add("wrong");
      allCorrect = false;
    }
  });

  if (!anyFilled) { showFeedback("Preencha os campos!", "err"); return; }

  if (allCorrect) {
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
    spState.lives--;
    spState.streak = 0;
    renderLives();
    updateStreakBadge();
    showFeedback("Tente novamente!", "err");
    if (spState.lives <= 0) { setTimeout(showSingleEnd, END_DELAY_MS); return; }
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
  if (spState.q >= TOTAL_QUESTIONS) { showSingleEnd(); return; }
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
      <div class="hint-row">Questão ${qData.index + 1} de ${qData.total} &nbsp;·&nbsp; <span class="hint-type">${qData.type}</span></div>
      <div class="sequence-row">${seqHTML}</div>
      <div class="action-row">
        <button class="btn btn-primary" id="btnMpCheck">Verificar</button>
        <button class="btn" id="btnMpHint">Dica</button>
        <span class="feedback" id="fb"></span>
      </div>
      <div class="pattern-hint" id="hintBox">${qData.hint}</div>
      ${qData.timer ? '<div class="question-timer-bar"><div class="question-timer-fill" id="qTimerFill" style="width:100%"></div></div>' : ""}
    </div>
  `;

  $("btnMpCheck").addEventListener("click", submitMultiAnswer);
  $("btnMpHint").addEventListener("click", () => $("hintBox").classList.toggle("show"));

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
    if (remaining <= 10) $("timerVal").style.color = "#A32D2D";
    if (remaining <= 0) clearInterval(globalTimerInterval);
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
  $("btnPlayAgain").addEventListener("click", () => {
    if (socket) socket.emit("playAgain");
  });

  $("btnBackToMenu").addEventListener("click", () => {
    if (socket) socket.disconnect();
    socket = null;
    roomData = null;
    showScreen("menuScreen");
  });
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
