const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static from root and public
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req,res)=>{
  res.send(`
  <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{background:#111;color:#fff;font-family:sans-serif;padding:20px;text-align:center}
  a{display:block;padding:18px;background:#7c3aed;color:#fff;border-radius:12px;margin:12px 0;text-decoration:none;font-weight:bold;font-size:18px}
  .ok{color:#22c55e}</style></head><body>
  <h1>Impressora TikTok ONLINE! <span class="ok">✅</span></h1>
  <p>Modelo PRO 9:16</p>
  <a href="/tela?room=TESTE123">📺 TELA 9:16 - Celular 1 (Impressora)</a>
  <a href="/controle?room=TESTE123">🎮 CONTROLE 9:16 - Celular 2 (Controle Remoto)</a>
  <p style="opacity:0.7;margin-top:20px">Para parear use mesma sala: ?room=NOME</p>
  <p>Arquivos: ${fs.existsSync(path.join(__dirname,'tela.html'))?'tela.html ✅':'❌'} | ${fs.existsSync(path.join(__dirname,'controle.html'))?'controle.html ✅':'❌'}</p>
  </body></html>
  `);
});

function sendFileSmart(res, filename){
  const paths = [
    path.join(__dirname, filename),
    path.join(__dirname, 'public', filename),
  ];
  for(let p of paths){
    if(fs.existsSync(p)) return res.sendFile(p);
  }
  return res.status(404).send(`<h1>${filename} não encontrado</h1><p>Coloque ${filename} na raiz ou em public/</p>`);
}

app.get('/tela',(req,res)=>sendFileSmart(res,'tela.html'));
app.get('/controle',(req,res)=>sendFileSmart(res,'controle.html'));

io.on('connection',(socket)=>{
  console.log('Conectado',socket.id);
  socket.on('create_room',({roomId})=>{socket.join(roomId);socket.emit('room_created',{roomId}); console.log('Sala criada',roomId);});
  socket.on('join_room',({roomId})=>{socket.join(roomId);io.to(roomId).emit('paired',{roomId}); console.log('Entrou sala',roomId);});
  socket.on('gift_manual',(d)=>{console.log('Gift',d); io.to(d.roomId).emit('print_gift',d);});
  socket.on('gift_auto',(d)=>{io.to(d.roomId).emit('print_gift',{...d,tipo:'auto'});});
  socket.on('member_event',(d)=>{io.to(d.roomId).emit('member_event',d);});
  socket.on('chat_event',(d)=>{io.to(d.roomId).emit('chat_event',d);});
  socket.on('faq_event',(d)=>{io.to(d.roomId).emit('print_gift',{...d,tipo:'faq'});});
  socket.on('copy_event',(d)=>{io.to(d.roomId).emit('print_gift',{...d,tipo:'copy'});});
  socket.on('presentes_event',(d)=>{io.to(d.roomId).emit('presentes_event',d);});
});

server.listen(PORT,'0.0.0.0',()=>console.log('PRO 9:16 LIVE porta '+PORT));
