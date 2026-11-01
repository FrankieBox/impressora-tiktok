const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST"] }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rota base - teste
app.get('/', (req, res) => {
  res.send(`
    <h1>Impressora TikTok - ONLINE</h1>
    <p>Server rodando!</p>
    <ul>
      <li><a href="/tela">/tela - Tela da Impressora (Phone 1)</a></li>
      <li><a href="/controle">/controle - Controle Remoto (Phone 2)</a></li>
    </ul>
  `);
});

// Rotas provisórias - vamos substituir pelos HTMLs reais depois
app.get('/tela', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tela.html'), (err) => {
    if (err) res.send('<h1>TELA</h1><p>public/tela.html ainda não criado - mas server OK</p><script src="/socket.io/socket.io.js"></script>');
  });
});

app.get('/controle', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'controle.html'), (err) => {
    if (err) res.send('<h1>CONTROLE</h1><p>public/controle.html ainda não criado - mas server OK</p><script src="/socket.io/socket.io.js"></script>');
  });
});

// Sistema de salas com QR
const rooms = {};

io.on('connection', (socket) => {
  console.log('Novo conectado:', socket.id);

  socket.on('create_room', ({ roomId }) => {
    rooms[roomId] = { tela: socket.id, controle: null };
    socket.join(roomId);
    socket.emit('room_created', { roomId });
    console.log('Sala criada:', roomId);
  });

  socket.on('join_room', ({ roomId, type }) => {
    if (!rooms[roomId]) rooms[roomId] = {};
    rooms[roomId][type] = socket.id;
    socket.join(roomId);
    io.to(roomId).emit('paired', { roomId });
    console.log(`${type} entrou na sala ${roomId}`);
  });

  // Manual: controle -> tela
  socket.on('gift_manual', (data) => {
    const { roomId } = data;
    if (roomId) io.to(roomId).emit('print_gift', data);
    else io.emit('print_gift', data);
  });

  // Auto: server tiktok -> tela (futuro)
  socket.on('gift_auto', (data) => {
    const { roomId } = data;
    if (roomId) io.to(roomId).emit('print_gift', { ...data, auto: true });
  });

  // Históricos
  socket.on('member_join', (data) => {
    const { roomId } = data;
    if (roomId) io.to(roomId).emit('member_event', data);
  });

  socket.on('chat_message', (data) => {
    const { roomId } = data;
    if (roomId) io.to(roomId).emit('chat_event', data);
  });

  socket.on('disconnect', () => {
    console.log('Desconectado:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server rodando na porta ${PORT}`);
});
