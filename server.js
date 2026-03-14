const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ── Servir arquivos estáticos ──
app.use(express.static(path.join(__dirname)));

// Rota raiz → servir caca-padroes.html (pois não se chama index.html)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "caca-padroes.html"));
});

// ── Dados em memória ──
const rooms = new Map(); // roomId -> Room

// ── Constantes ──
const PLAYER_COLORS = ["#185FA5", "#3B6D11", "#E88D1A", "#7B42BC", "#D94A8C", "#0EA5A0"];
const MAX_PLAYERS = 6;
const QUESTION_DELAY_MS = 1500;

// ── Padrões (espelhados do client para gerar server-side) ──
function rnd(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function seq(length, fn) {
  return Array.from({ length }, (_, i) => fn(i));
}

const patternDefinitions = [
  {
    id: "aritmetica",
    type: "Aritmética",
    difficulty: 1,
    gen: () => { const a = rnd(1, 10), d = rnd(1, 10); return seq(6, i => a + i * d); },
    hint: s => `Cada termo aumenta em ${s[1] - s[0]}`
  },
  {
    id: "aritmetica_dec",
    type: "Aritmética decrescente",
    difficulty: 1,
    gen: () => { const a = rnd(20, 60), d = rnd(2, 8); return seq(6, i => a - i * d); },
    hint: s => `Cada termo diminui em ${s[0] - s[1]}`
  },
  {
    id: "geometrica",
    type: "Geométrica",
    difficulty: 2,
    gen: () => { const a = rnd(1, 5), r = rnd(2, 4); return seq(6, i => a * r ** i); },
    hint: s => `Cada termo é multiplicado por ${s[1] / s[0]}`
  },
  {
    id: "quadrados",
    type: "Quadrados perfeitos",
    difficulty: 2,
    gen: () => { const start = rnd(1, 5); return seq(6, i => (start + i) ** 2); },
    hint: () => "Quadrados perfeitos consecutivos"
  },
  {
    id: "cubos",
    type: "Cubos perfeitos",
    difficulty: 3,
    gen: () => seq(6, i => (i + 1) ** 3),
    hint: () => "Cubos perfeitos: 1³, 2³, 3³..."
  },
  {
    id: "fibonacci",
    type: "Fibonacci",
    difficulty: 2,
    gen: () => {
      const a = rnd(1, 5), b = rnd(1, 5);
      const s = [a, b];
      for (let i = 2; i < 6; i++) s.push(s[i - 1] + s[i - 2]);
      return s;
    },
    hint: s => `Cada termo é a soma dos dois anteriores: ${s[0]}+${s[1]}=${s[2]}`
  },
  {
    id: "potencias2",
    type: "Potências de 2",
    difficulty: 2,
    gen: () => { const s = rnd(0, 3); return seq(6, i => 2 ** (s + i)); },
    hint: () => "Potências de 2: 2⁰, 2¹, 2²..."
  },
  {
    id: "primos",
    type: "Números primos",
    difficulty: 3,
    gen: () => [2, 3, 5, 7, 11, 13],
    hint: () => "Números primos em ordem crescente"
  },
  {
    id: "triangulares",
    type: "Números triangulares",
    difficulty: 3,
    gen: () => seq(6, i => (i + 1) * (i + 2) / 2),
    hint: () => "Números triangulares: soma de 1+2+3+..."
  },
  {
    id: "dif_crescente",
    type: "Diferença crescente",
    difficulty: 2,
    gen: () => {
      const a = rnd(1, 5); const arr = [a]; let d = 1;
      for (let i = 1; i < 6; i++) { arr.push(arr[i - 1] + d); d++; }
      return arr;
    },
    hint: s => `As diferenças entre termos são: ${s.slice(1).map((v, i) => v - s[i]).join(", ")}`
  },
  {
    id: "aritmetica_avancada",
    type: "Aritmética (avançada)",
    difficulty: 3,
    gen: () => { const a = rnd(5, 50), d = rnd(3, 15); return seq(6, i => a + i * d); },
    hint: s => `Diferença constante de ${s[1] - s[0]}`
  },
  {
    id: "geometrica_avancada",
    type: "Geométrica (avançada)",
    difficulty: 3,
    gen: () => { const a = rnd(1, 3), r = rnd(2, 3); return seq(6, i => a * r ** i); },
    hint: s => `Razão constante de ${s[1] / s[0]}`
  },
];

// ── Gerar código da sala ──
function generateRoomCode() {
  const num = rnd(1000, 9999);
  const code = `MATH-${num}`;
  return rooms.has(code) ? generateRoomCode() : code;
}

// ── Gerar perguntas para a sala ──
function generateQuestions(settings) {
  const { questionCount, patterns: allowedPatterns, difficulty } = settings;
  let pool = patternDefinitions;

  // Filtrar por padrões selecionados
  if (allowedPatterns && allowedPatterns.length > 0) {
    pool = pool.filter(p => allowedPatterns.includes(p.id));
  }

  // Filtrar por dificuldade
  if (difficulty && difficulty !== "all") {
    const maxDiff = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
    pool = pool.filter(p => p.difficulty <= maxDiff);
  }

  if (pool.length === 0) pool = patternDefinitions;

  const questions = [];
  for (let q = 0; q < questionCount; q++) {
    const p = pool[rnd(0, pool.length - 1)];
    const sequence = p.gen();

    // Determinar blanks baseados na posição da questão
    let blanks;
    if (q < Math.floor(questionCount * 0.3)) blanks = [5];
    else if (q < Math.floor(questionCount * 0.6)) blanks = [4, 5];
    else blanks = [3, 4, 5];

    questions.push({
      seq: sequence,
      blanks,
      type: p.type,
      hint: p.hint(sequence),
      answers: blanks.map(i => sequence[i]),
    });
  }
  return questions;
}

// ── Calcular pontuação ──
function calculatePoints(questionIndex, streak, timeBonus) {
  const base = 10;
  const streakBonus = streak * 2;
  return base + streakBonus + (timeBonus || 0);
}

// ── Enviar ranking/progresso para todos na sala ──
function broadcastProgress(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.mode === "jvj") {
    const rankings = room.players
      .map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        progress: p.answeredCorrect / room.questions.length,
      }))
      .sort((a, b) => b.score - a.score);
    io.to(roomId).emit("progressUpdate", { rankings });
  } else {
    // GvG: pontuação por time
    const teams = { blue: { score: 0, progress: 0, count: 0 }, red: { score: 0, progress: 0, count: 0 } };
    room.players.forEach(p => {
      const t = teams[p.team];
      if (t) {
        t.score += p.score;
        t.progress += p.answeredCorrect;
        t.count++;
      }
    });
    // Normalizar progresso
    const totalQ = room.questions.length;
    if (teams.blue.count > 0) teams.blue.progress = teams.blue.progress / (teams.blue.count * totalQ);
    if (teams.red.count > 0) teams.red.progress = teams.red.progress / (teams.red.count * totalQ);

    io.to(roomId).emit("progressUpdate", { teams });
  }
}

// ── Enviar próxima pergunta ──
function sendQuestion(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.state !== "playing") return;

  if (room.currentQuestion >= room.questions.length) {
    endGame(roomId);
    return;
  }

  const q = room.questions[room.currentQuestion];
  // Enviar pergunta sem as respostas
  const questionData = {
    index: room.currentQuestion,
    total: room.questions.length,
    seq: q.seq.map((v, i) => q.blanks.includes(i) ? null : v),
    blanks: q.blanks,
    type: q.type,
    hint: q.hint,
  };

  room.answeredThisRound = new Set();
  io.to(roomId).emit("newQuestion", questionData);

  // Timer por pergunta (se configurado)
  if (room.settings.questionTimer > 0) {
    room.questionStartTime = Date.now();
    room.questionTimerId = setTimeout(() => {
      // Tempo esgotado — avançar para próxima
      room.currentQuestion++;
      // Marcar quem não respondeu como errado
      room.players.forEach(p => {
        if (!room.answeredThisRound.has(p.id)) {
          p.streak = 0;
        }
      });
      broadcastProgress(roomId);
      setTimeout(() => sendQuestion(roomId), QUESTION_DELAY_MS);
    }, room.settings.questionTimer * 1000);
  }

  // Timer global
  if (room.settings.globalTimer > 0 && room.currentQuestion === 0) {
    room.globalTimerId = setTimeout(() => {
      endGame(roomId);
    }, room.settings.globalTimer * 1000);
    room.globalStartTime = Date.now();
    io.to(roomId).emit("timerStart", {
      type: "global",
      duration: room.settings.globalTimer,
    });
  }
}

// ── Verificar se todos responderam ──
function checkAllAnswered(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.answeredThisRound.size >= room.players.length) {
    if (room.questionTimerId) clearTimeout(room.questionTimerId);
    room.currentQuestion++;
    broadcastProgress(roomId);
    setTimeout(() => sendQuestion(roomId), QUESTION_DELAY_MS);
  }
}

// ── Finalizar jogo ──
function endGame(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.state = "ended";
  if (room.questionTimerId) clearTimeout(room.questionTimerId);
  if (room.globalTimerId) clearTimeout(room.globalTimerId);

  const results = {
    mode: room.mode,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      team: p.team,
      score: p.score,
      answeredCorrect: p.answeredCorrect,
      totalQuestions: room.questions.length,
    })).sort((a, b) => b.score - a.score),
  };

  if (room.mode === "gvg") {
    const teamScores = { blue: 0, red: 0 };
    room.players.forEach(p => { teamScores[p.team] = (teamScores[p.team] || 0) + p.score; });
    results.teamScores = teamScores;
    results.winner = teamScores.blue > teamScores.red ? "blue" : teamScores.red > teamScores.blue ? "red" : "draw";
  }

  io.to(roomId).emit("gameEnded", results);
}

// ── Socket.IO ──
io.on("connection", (socket) => {
  console.log(`[SERVER] New connection: ${socket.id}`);
  let currentRoom = null;

  // Criar sala
  socket.on("createRoom", ({ name, mode, settings }) => {
    console.log(`[SERVER] createRoom from ${socket.id}:`, { name, mode });
    const roomId = generateRoomCode();
    const colorIndex = 0;

    const player = {
      id: socket.id,
      name: name || "Jogador 1",
      color: PLAYER_COLORS[colorIndex],
      team: mode === "gvg" ? "blue" : null,
      score: 0,
      streak: 0,
      answeredCorrect: 0,
      isHost: true,
    };

    const room = {
      id: roomId,
      host: socket.id,
      mode: mode || "jvj",
      settings: {
        questionCount: settings?.questionCount || 10,
        questionTimer: settings?.questionTimer || 0,
        globalTimer: settings?.globalTimer || 0,
        patterns: settings?.patterns || [],
        difficulty: settings?.difficulty || "all",
      },
      players: [player],
      questions: [],
      currentQuestion: 0,
      answeredThisRound: new Set(),
      state: "waiting",
      questionTimerId: null,
      globalTimerId: null,
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    currentRoom = roomId;

    console.log(`[SERVER] Room created: ${roomId} by ${name}`);
    socket.emit("roomCreated", {
      roomId,
      player,
      room: sanitizeRoom(room),
    });
  });

  // Entrar em sala
  socket.on("joinRoom", ({ code, name }) => {
    const room = rooms.get(code);

    if (!room) {
      socket.emit("joinError", { message: "Sala não encontrada." });
      return;
    }
    if (room.state !== "waiting") {
      socket.emit("joinError", { message: "Partida já em andamento." });
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      socket.emit("joinError", { message: "Sala lotada (máximo 6 jogadores)." });
      return;
    }

    const colorIndex = room.players.length;

    // Auto-assign team for GvG
    let team = null;
    if (room.mode === "gvg") {
      const blueCount = room.players.filter(p => p.team === "blue").length;
      const redCount = room.players.filter(p => p.team === "red").length;
      team = blueCount <= redCount ? "blue" : "red";
    }

    const player = {
      id: socket.id,
      name: name || `Jogador ${room.players.length + 1}`,
      color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length],
      team,
      score: 0,
      streak: 0,
      answeredCorrect: 0,
      isHost: false,
    };

    room.players.push(player);
    socket.join(code);
    currentRoom = code;

    socket.emit("roomJoined", {
      player,
      room: sanitizeRoom(room),
    });

    socket.to(code).emit("playerJoined", {
      player: { id: player.id, name: player.name, color: player.color, team: player.team },
      players: room.players.map(sanitizePlayer),
    });
  });

  // Host altera time do jogador (GvG)
  socket.on("switchTeam", ({ playerId }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.host !== socket.id || room.mode !== "gvg") return;

    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.team = player.team === "blue" ? "red" : "blue";
      io.to(currentRoom).emit("teamUpdated", {
        players: room.players.map(sanitizePlayer),
      });
    }
  });

  // Update room settings (host only)
  socket.on("updateSettings", (settings) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.host !== socket.id || room.state !== "waiting") return;

    Object.assign(room.settings, settings);
    socket.to(currentRoom).emit("settingsUpdated", room.settings);
  });

  // Iniciar jogo (host)
  socket.on("startGame", () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 2) {
      socket.emit("startError", { message: "Mínimo de 2 jogadores para iniciar." });
      return;
    }

    room.state = "playing";
    room.questions = generateQuestions(room.settings);
    room.currentQuestion = 0;

    io.to(currentRoom).emit("gameStarted", {
      mode: room.mode,
      totalQuestions: room.questions.length,
      players: room.players.map(sanitizePlayer),
      settings: room.settings,
    });

    setTimeout(() => sendQuestion(currentRoom), 1000);
  });

  // Jogador envia resposta
  socket.on("submitAnswer", ({ answers }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.state !== "playing") return;
    if (room.answeredThisRound.has(socket.id)) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const question = room.questions[room.currentQuestion];
    if (!question) return;

    // Verificar respostas
    let allCorrect = true;
    question.blanks.forEach((idx, j) => {
      if (parseInt(answers[j]) !== question.answers[j]) {
        allCorrect = false;
      }
    });

    room.answeredThisRound.add(socket.id);

    if (allCorrect) {
      // Calcular time bonus
      let timeBonus = 0;
      if (room.settings.questionTimer > 0 && room.questionStartTime) {
        const elapsed = (Date.now() - room.questionStartTime) / 1000;
        const remaining = room.settings.questionTimer - elapsed;
        timeBonus = Math.max(0, Math.floor(remaining));
      }

      const pts = calculatePoints(room.currentQuestion, player.streak, timeBonus);
      player.score += pts;
      player.streak++;
      player.answeredCorrect++;

      socket.emit("answerResult", { correct: true, points: pts, answers: question.answers });
    } else {
      player.streak = 0;
      socket.emit("answerResult", { correct: false, points: 0, answers: question.answers });
    }

    broadcastProgress(currentRoom);
    checkAllAnswered(currentRoom);
  });

  // Jogar novamente
  socket.on("playAgain", () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.host !== socket.id) return;

    room.state = "waiting";
    room.currentQuestion = 0;
    room.questions = [];
    room.players.forEach(p => {
      p.score = 0;
      p.streak = 0;
      p.answeredCorrect = 0;
    });

    io.to(currentRoom).emit("backToLobby", {
      room: sanitizeRoom(room),
    });
  });

  // Desconexão
  socket.on("disconnect", () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      // Sala vazia — limpar
      if (room.questionTimerId) clearTimeout(room.questionTimerId);
      if (room.globalTimerId) clearTimeout(room.globalTimerId);
      rooms.delete(currentRoom);
      return;
    }

    // Se o host saiu, transferir para o próximo
    if (room.host === socket.id) {
      room.host = room.players[0].id;
      room.players[0].isHost = true;
      io.to(currentRoom).emit("hostChanged", { newHostId: room.host });
    }

    io.to(currentRoom).emit("playerLeft", {
      playerId: socket.id,
      players: room.players.map(sanitizePlayer),
    });

    // Se estava jogando, verificar se todos responderam
    if (room.state === "playing") {
      room.answeredThisRound.delete(socket.id);
      checkAllAnswered(currentRoom);
    }
  });
});

// ── Helpers para sanitizar dados enviados ao client ──
function sanitizePlayer(p) {
  return { id: p.id, name: p.name, color: p.color, team: p.team, score: p.score, isHost: p.isHost };
}

function sanitizeRoom(room) {
  return {
    id: room.id,
    mode: room.mode,
    state: room.state,
    settings: room.settings,
    players: room.players.map(sanitizePlayer),
    host: room.host,
  };
}

// ── Iniciar servidor ──
server.listen(PORT, () => {
  console.log(`\n  🎮 Caça-Padrões Multiplayer`);
  console.log(`  ➜ http://localhost:${PORT}\n`);
});
