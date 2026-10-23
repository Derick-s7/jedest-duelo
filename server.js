const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// La direccion base lleva a la pantalla del jugador, que es la que teclean los participantes.
// El anfitrion abre /anfitrion.html
app.get('/', (req, res) => res.redirect('/jugador.html'));
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const COUNTDOWN_MS = 3000;
const ROUND_MS = 60000;
const MAX_ROUNDS = 3;
const WINS_TO_WIN = 2;
const HOST_GRACE_MS = 60000;

const tec = (nombre, senior, carga, turno) => ({ nombre, senior: !!senior, carga, turno });

// Regla: CRÍTICO = solo senior. NORMAL = todos. Gana menor carga; si empatan, menor turno.
const BASE = [
  { titulo: 'Servidor de facturación caído', tipo: 'CRÍTICO', ticket: 'TK-217',
    motivo: 'Nadie puede facturar. Solo un senior puede atenderlo.',
    tecnicos: [tec('Derick', 1, 2, 15), tec('Jose', 0, 0, 3), tec('Esteban', 1, 3, 8), tec('Willy', 0, 1, 2)],
    explicacion: 'Es crítico, así que solo cuentan los senior: Derick y Esteban. Jose y Willy tienen menos carga, pero no son senior. Entre los dos senior, Derick gana con carga 2 contra 3.' },
  { titulo: 'Cambio de contraseña', tipo: 'NORMAL', ticket: 'TK-042',
    motivo: 'Solicitud rutinaria. Cualquier técnico puede tomarla.',
    tecnicos: [tec('Derick', 0, 1, 9), tec('Jose', 0, 1, 4), tec('Esteban', 1, 1, 12), tec('Willy', 0, 1, 6)],
    explicacion: 'Es normal, así que todos participan. Los cuatro tienen carga 1. Gana el turno más bajo: Jose, con 4.' },
  { titulo: 'Sin red en el piso 3', tipo: 'CRÍTICO', ticket: 'TK-388',
    motivo: 'Un piso completo sin internet. Prioridad alta, solo senior.',
    tecnicos: [tec('Derick', 1, 1, 20), tec('Jose', 0, 0, 1), tec('Esteban', 1, 1, 6), tec('Willy', 0, 2, 5)],
    explicacion: 'Es crítico: solo los senior pueden tomarlo. Jose tiene carga 0 y turno 1, pero no es senior. Derick y Esteban empatan con carga 1; gana Esteban, con turno 6 contra 20.' },
  { titulo: 'Impresora sin tinta', tipo: 'NORMAL', ticket: 'TK-119',
    motivo: 'Caso sencillo. Lo puede atender cualquiera.',
    tecnicos: [tec('Derick', 0, 3, 5), tec('Jose', 0, 2, 18), tec('Esteban', 1, 2, 9), tec('Willy', 0, 4, 1)],
    explicacion: 'Es normal. Willy tiene el turno más bajo, pero su carga es 4. La carga más baja es 2, compartida por Jose y Esteban; gana Esteban, con turno 9 contra 18.' },
  { titulo: 'Correo de gerencia bloqueado', tipo: 'CRÍTICO', ticket: 'TK-501',
    motivo: 'La gerencia no puede enviar correos. Solo senior.',
    tecnicos: [tec('Derick', 1, 4, 3), tec('Jose', 0, 0, 2), tec('Esteban', 1, 0, 10), tec('Willy', 0, 1, 4)],
    explicacion: 'Es crítico, así que solo cuentan Derick y Esteban. Jose tiene carga 0 y turno 2, pero no es senior. Esteban tiene carga 0 contra 4 de Derick.' },
  { titulo: 'Teclado con tecla trabada', tipo: 'NORMAL', ticket: 'TK-066',
    motivo: 'Problema menor. Todos pueden participar.',
    tecnicos: [tec('Derick', 0, 0, 12), tec('Jose', 0, 2, 1), tec('Esteban', 1, 1, 7), tec('Willy', 0, 3, 4)],
    explicacion: 'Es normal y Derick tiene carga 0, la más baja. El turno no importa cuando hay una carga menor.' },
  { titulo: 'Intento de phishing reportado', tipo: 'CRÍTICO', ticket: 'TK-612',
    motivo: 'Posible robo de credenciales. Solo senior, ya.',
    tecnicos: [tec('Derick', 0, 2, 4), tec('Jose', 1, 5, 8), tec('Esteban', 0, 0, 3), tec('Willy', 0, 1, 2)],
    explicacion: 'Es crítico y Jose es el único senior. Aunque los demás tienen menos carga, no pueden tomarlo.' }
];

// Ronda normal: acertar manda; si ambos aciertan, el más rápido. Si no, empate.
// Desempate: el tiempo decide siempre, para que salga un ganador sí o sí.
function decidirGanador(res, esDesempate) {
  const nada = { key: null, razon: 'empate' };
  if (res.length !== 2) return nada;
  const [x, y] = res;
  if (x.correct && !y.correct) return { key: x.key, razon: 'unico' };
  if (y.correct && !x.correct) return { key: y.key, razon: 'unico' };
  if (x.correct && y.correct) {
    if (x.ms === y.ms) return nada;
    return { key: x.ms < y.ms ? x.key : y.key, razon: 'rapidez' };
  }
  if (!esDesempate) return { key: null, razon: 'ambos-mal' };
  if (x.ms === null && y.ms === null) return nada;
  if (x.ms === null) return { key: y.key, razon: 'solo-uno' };
  if (y.ms === null) return { key: x.key, razon: 'solo-uno' };
  if (x.ms === y.ms) return nada;
  return { key: x.ms < y.ms ? x.key : y.key, razon: 'rapidez' };
}

function respuestaCorrecta(e) {
  return e.tecnicos
    .map((t, i) => ({ ...t, i }))
    .filter(t => e.tipo === 'NORMAL' || t.senior)
    .sort((a, b) => a.carga - b.carga || a.turno - b.turno)[0].i;
}
const ESCENARIOS = BASE.map(e => ({ ...e, correcta: respuestaCorrecta(e) }));

function publico(e) {
  return { titulo: e.titulo, tipo: e.tipo, ticket: e.ticket, motivo: e.motivo, tecnicos: e.tecnicos };
}

const rooms = new Map();

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function roomState(room) {
  return { code: room.code, started: room.started, players: room.players.map(p => ({ key: p.slot, name: p.name })) };
}

function marcador(room) {
  return room.players.map(p => ({ key: p.slot, name: p.name, wins: room.wins[p.slot] || 0 }));
}

function emitRoom(room, event, payload) {
  room.last = { event, payload };
  io.to(room.code).emit(event, payload);
}

function sendState(socket, room) {
  socket.emit('room:update', roomState(room));
  if (room.last) {
    const payload = room.last.event === 'round:start'
      ? { ...room.last.payload, serverNow: Date.now() }
      : room.last.payload;
    socket.emit(room.last.event, payload);
  }
  if (socket.data.role === 'host') {
    socket.emit('room:picks', room.picks);
  } else if (socket.data.role === 'player') {
    const a = room.answers[socket.data.slot];
    socket.emit('player:ack', { answered: !!a, option: a ? a.option : null });
  }
}

function startRound(room) {
  room.round += 1;
  const esc = room.escenarios[room.round - 1];
  room.current = esc;
  room.answers = {};
  room.picks = {};
  room.open = true;
  room.locked = false;
  room.waitingNext = false;

  const now = Date.now();
  room.countdownEnd = now + COUNTDOWN_MS;
  room.roundEnd = room.countdownEnd + ROUND_MS;

  emitRoom(room, 'round:start', {
    round: room.round,
    totalRounds: room.totalRounds,
    desempate: room.round > MAX_ROUNDS,
    total: room.players.length,
    countdownEnd: room.countdownEnd,
    roundEnd: room.roundEnd,
    serverNow: now,
    escenario: publico(esc),
    marcador: marcador(room),
    historial: room.history
  });
  io.to(room.hostId).emit('room:picks', room.picks);

  clearTimeout(room.timer);
  room.timer = setTimeout(() => lockRound(room), room.roundEnd - now);
}

// Cierra las respuestas y detiene el reloj, pero NO revela nada todavia.
// El anfitrion aprovecha esta pausa para interactuar con el publico.
function lockRound(room) {
  if (!room.open) return;
  room.open = false;
  room.locked = true;
  clearTimeout(room.timer);

  emitRoom(room, 'round:locked', {
    round: room.round,
    totalRounds: room.totalRounds,
    desempate: room.round > MAX_ROUNDS,
    respondieron: Object.keys(room.answers).map(Number),
    total: room.players.length,
    nombres: room.players.map(p => ({ key: p.slot, name: p.name }))
  });
}

function finishRound(room) {
  if (!room.locked) return;
  room.locked = false;

  const e = room.current;
  const res = room.players.map(p => {
    const a = room.answers[p.slot];
    return { key: p.slot, name: p.name, option: a ? a.option : null, ms: a ? a.ms : null, correct: !!a && a.option === e.correcta };
  });

  const esDesempate = room.round > MAX_ROUNDS;
  const fallo = decidirGanador(res, esDesempate);
  const ganadorKey = fallo.key;
  const razon = fallo.razon;
  const conTiempo = res.filter(r => r.ms !== null);
  const diferenciaMs = conTiempo.length === 2 ? Math.abs(conTiempo[0].ms - conTiempo[1].ms) : null;
  if (ganadorKey !== null) room.wins[ganadorKey] = (room.wins[ganadorKey] || 0) + 1;
  res.forEach(r => {
    r.ganador = r.key === ganadorKey;
    r.emoji = ganadorKey !== null ? (r.ganador ? '😎' : '😢') : '😐';
  });

  const ganadorNombre = ganadorKey !== null ? res.find(r => r.key === ganadorKey).name : null;
  room.history.push({ round: room.round, titulo: e.titulo, ganador: ganadorNombre || 'Empate', desempate: esDesempate });
  room.batallas.push({ round: room.round, titulo: e.titulo, ganador: ganadorNombre, correcta: e.tecnicos[e.correcta].nombre });

  const lider = room.players.find(p => (room.wins[p.slot] || 0) >= WINS_TO_WIN);
  let fin = !!lider || room.round >= room.totalRounds;

  // Si se acabaron las rondas y siguen iguales, se agrega una ronda de desempate
  let siguienteDesempate = false;
  if (fin && !lider && room.players.length === 2) {
    const marcas = room.players.map(p => room.wins[p.slot] || 0);
    const iguales = marcas[0] === marcas[1];
    if (iguales && room.totalRounds < MAX_ROUNDS + 4) {
      const extra = room.pool[room.escenarios.length] ||
                    ESCENARIOS[Math.floor(Math.random() * ESCENARIOS.length)];
      room.escenarios.push(extra);
      room.totalRounds += 1;
      fin = false;
      siguienteDesempate = true;
    }
  }
  room.fin = fin;
  room.waitingNext = !fin;

  emitRoom(room, 'round:result', {
    round: room.round,
    totalRounds: room.totalRounds,
    desempate: esDesempate,
    siguienteDesempate,
    escenario: publico(e),
    correcta: e.correcta,
    explicacion: e.explicacion,
    resultados: res,
    ganadorKey,
    ganadorNombre,
    razon,
    diferenciaMs,
    marcador: marcador(room),
    historial: room.history,
    fin
  });
}

function endGame(room) {
  const sc = marcador(room);
  const top = Math.max(0, ...sc.map(s => s.wins));
  const mejores = sc.filter(s => s.wins === top);
  const ganador = top > 0 && mejores.length === 1 ? mejores[0] : null;
  const boleto = ganador ? Math.floor(1000 + Math.random() * 9000) : null;
  room.waitingNext = false;

  emitRoom(room, 'game:over', {
    ganadorKey: ganador ? ganador.key : null,
    ganadorNombre: ganador ? ganador.name : null,
    boleto,
    marcador: sc,
    historial: room.history,
    batallas: room.batallas
  });
}

function closeRoom(room) {
  clearTimeout(room.timer);
  clearTimeout(room.hostTimer);
  io.to(room.code).emit('room:closed');
  rooms.delete(room.code);
}

io.on('connection', (socket) => {
  socket.on('host:create', ({ token } = {}) => {
    const code = makeCode();
    const room = {
      code, hostId: socket.id, hostToken: String(token || ''), hostTimer: null,
      players: [], started: false, timer: null, last: null,
      round: 0, wins: {}, history: [], batallas: [],
      totalRounds: MAX_ROUNDS, pool: [],
      open: false, locked: false, answers: {}, picks: {}, current: null, escenarios: [],
      countdownEnd: 0, roundEnd: 0, waitingNext: false, fin: false, over: false
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data = { role: 'host', code };
    socket.emit('room:created', roomState(room));
  });

  socket.on('host:resume', ({ code, token } = {}, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.hostToken !== String(token || '')) return ack && ack({ ok: false });
    clearTimeout(room.hostTimer);
    room.hostId = socket.id;
    socket.join(room.code);
    socket.data = { role: 'host', code: room.code };
    ack && ack({ ok: true });
    socket.emit('room:created', roomState(room));
    sendState(socket, room);
  });

  socket.on('player:join', ({ code, name, token } = {}, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return ack && ack({ ok: false, error: 'Esa sala no existe.' });

    const tok = String(token || '');
    let p = tok ? room.players.find(x => x.token === tok) : null;
    if (p) {
      p.id = socket.id;
    } else {
      if (room.started) return ack && ack({ ok: false, error: 'Esa partida ya empezó.' });
      if (room.players.length >= 2) return ack && ack({ ok: false, error: 'La sala ya está llena.' });
      const slot = room.players.some(x => x.slot === 0) ? 1 : 0;
      const cleanName = String(name || '').trim().slice(0, 12) || `Jugador ${slot + 1}`;
      p = { id: socket.id, token: tok, slot, name: cleanName };
      room.players.push(p);
    }

    socket.join(room.code);
    socket.data = { role: 'player', code: room.code, slot: p.slot };
    ack && ack({ ok: true, name: p.name, slot: p.slot, started: room.started });
    io.to(room.code).emit('room:update', roomState(room));
    if (room.started) sendState(socket, room);
  });

  socket.on('host:start', (ack) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.id) return ack && ack({ ok: false, error: 'Solo el anfitrión puede iniciar.' });
    if (room.players.length < 2) return ack && ack({ ok: false, error: 'Faltan jugadores.' });
    if (room.started) return ack && ack({ ok: false, error: 'Ya empezó.' });
    room.started = true;
    room.pool = [...ESCENARIOS].sort(() => Math.random() - 0.5);
    room.escenarios = room.pool.slice(0, MAX_ROUNDS);
    room.totalRounds = MAX_ROUNDS;
    io.to(room.code).emit('room:update', roomState(room));
    io.to(room.code).emit('game:started');
    startRound(room);
    ack && ack({ ok: true });
  });

  // El anfitrión decide cuándo empieza la siguiente ronda
  socket.on('host:next', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.id || !room.waitingNext) return;
    startRound(room);
  });

  // El anfitrion decide cuando se revela la respuesta
  socket.on('host:reveal', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.id || !room.locked) return;
    finishRound(room);
  });

  socket.on('host:finish', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.id || !room.fin || room.over) return;
    room.over = true;
    endGame(room);
  });

  // Selección en vivo (aún no bloqueada), solo se muestra al anfitrión
  socket.on('player:pick', ({ option } = {}) => {
    const room = rooms.get(socket.data.code);
    if (!room || socket.data.role !== 'player' || !room.open) return;
    const slot = socket.data.slot;
    if (room.answers[slot]) return;
    const n = Number(option);
    if (!Number.isInteger(n) || n < 0 || n >= room.current.tecnicos.length) return;
    room.picks[slot] = n;
    io.to(room.hostId).emit('room:picks', room.picks);
  });

  socket.on('player:answer', ({ option } = {}) => {
    const room = rooms.get(socket.data.code);
    if (!room || socket.data.role !== 'player' || !room.open) return;
    if (Date.now() < room.countdownEnd) return;
    const slot = socket.data.slot;
    if (room.answers[slot]) return;
    const n = Number(option);
    if (!Number.isInteger(n) || n < 0 || n >= room.current.tecnicos.length) return;

    room.answers[slot] = { option: n, ms: Date.now() - room.countdownEnd };
    room.picks[slot] = n;
    const slots = Object.keys(room.answers).map(Number);
    io.to(room.code).emit('room:answers', { count: slots.length, total: room.players.length, slots });
    io.to(room.hostId).emit('room:picks', room.picks);
    if (slots.length >= room.players.length) lockRound(room);
  });

  socket.on('host:close', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.id) return;
    closeRoom(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    if (socket.data.role === 'host' && room.hostId === socket.id) {
      clearTimeout(room.hostTimer);
      room.hostTimer = setTimeout(() => closeRoom(room), HOST_GRACE_MS);
    } else if (socket.data.role === 'player' && !room.started) {
      const p = room.players.find(x => x.id === socket.id);
      if (p) {
        room.players = room.players.filter(x => x !== p);
        io.to(room.code).emit('room:update', roomState(room));
      }
    }
  });
});

server.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
