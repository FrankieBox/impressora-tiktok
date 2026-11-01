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
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

const tiktokConnections = {};

app.get('/', (req,res)=>{
  res.send(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#111;color:#fff;font-family:sans-serif;padding:20px;text-align:center}
  a{display:block;padding:18px;background:#FE2C55;color:#fff;border-radius:12px;margin:12px 0;text-decoration:none;font-weight:bold}</style></head><body>
  <h1>Impressora TikTok ONLINE! ✅ FIX 2.5.0</h1>
  <p>Modelo PRO 9:16 + TikTok Live Connector 2.5.0</p>
  <a href="/tela?room=LOJA">📺 TELA 9:16</a>
  <a href="/controle?room=LOJA">🎮 CONTROLE + @ Live</a>
  <p style="opacity:0.7">Conexões ativas: ${Object.keys(tiktokConnections).length}</p>
  </body></html>`);
});

function sendFileSmart(res, filename){
  const paths = [path.join(__dirname, filename), path.join(__dirname, 'public', filename)];
  for(let p of paths){ if(fs.existsSync(p)) return res.sendFile(p); }
  return res.status(404).send(filename+' nao encontrado');
}
app.get('/tela',(req,res)=>sendFileSmart(res,'tela.html'));
app.get('/controle',(req,res)=>sendFileSmart(res,'controle.html'));

app.post('/api/tiktok/connect', async (req,res)=>{
  const { roomId, username } = req.body;
  if(!roomId || !username) return res.status(400).json({error:'roomId e username obrigatórios'});
  const cleanUsername = username.replace('@','').trim();
  if(tiktokConnections[roomId]){
    try{ if(tiktokConnections[roomId].connection) await tiktokConnections[roomId].connection.disconnect(); }catch(e){}
    delete tiktokConnections[roomId];
  }
  try{
    let ConnectionClass;
    try{
      const lib = require('tiktok-live-connector');
      ConnectionClass = lib.WebcastPushConnection || lib.TikTokLiveConnection || lib.TikTokLiveConnector || lib;
      console.log('Lib loaded:', Object.keys(lib));
    }catch(e){
      console.log('tiktok-live-connector não instalado', e);
      tiktokConnections[roomId] = { username: cleanUsername, status: 'simulacao', connection: null };
      io.to(roomId).emit('tiktok_status', { status: 'simulacao', username: cleanUsername });
      return res.json({ success: true, mode: 'simulacao' });
    }
    
    // v2 API usa WebcastPushConnection
    const connection = new ConnectionClass(cleanUsername, { enableExtendedGiftInfo: true });
    
    connection.connect().then(state=>{
      console.log(`✅ Conectado @${cleanUsername} sala ${roomId}`, state);
      tiktokConnections[roomId] = { username: cleanUsername, status: 'conectado', connection, roomId };
      io.to(roomId).emit('tiktok_status', { status: 'conectado', username: cleanUsername, message: `✅ Conectado @${cleanUsername}` });
      
      // Eventos v2
      connection.on('chat', data=>{
        console.log(`CHAT ${roomId}: ${data.uniqueId}: ${data.comment}`);
        io.to(roomId).emit('chat_event', { nome: data.uniqueId, mensagem: data.comment });
        io.to(roomId).emit('print_gift', { roomId, nome: data.uniqueId, presente: data.comment, icone: '💬', tipo: 'chat', mensagem: data.comment });
      });
      
      connection.on('gift', data=>{
        console.log(`GIFT ${roomId}:`, data.uniqueId, data.giftName);
        const giftName = data.giftName || `Gift ${data.giftId}` || 'Presente';
        io.to(roomId).emit('print_gift', { roomId, nome: data.uniqueId, presente: giftName, icone: '🎁', tipo: 'auto', moedas: data.diamondCount });
        io.to(roomId).emit('presentes_event', { nome: data.uniqueId, presente: giftName, moedas: data.diamondCount });
      });
      
      connection.on('member', data=>{
        console.log(`MEMBER ${roomId}: ${data.uniqueId}`);
        io.to(roomId).emit('member_event', { nome: data.uniqueId });
      });
      
      connection.on('disconnected', ()=>{
        console.log(`Desconectado @${cleanUsername} sala ${roomId}`);
        io.to(roomId).emit('tiktok_status', { status: 'desconectado', username: cleanUsername });
        delete tiktokConnections[roomId];
      });
      
    }).catch(err=>{
      console.error(`Erro conectar @${cleanUsername}:`, err);
      io.to(roomId).emit('tiktok_status', { status: 'erro', username: cleanUsername, error: err.message || String(err) });
      tiktokConnections[roomId] = { username: cleanUsername, status: 'erro', error: err.message };
    });
    
    res.json({ success: true, username: cleanUsername, roomId });
    
  }catch(err){
    console.error('Erro geral', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tiktok/disconnect', async (req,res)=>{
  const { roomId } = req.body;
  if(tiktokConnections[roomId]){
    try{ if(tiktokConnections[roomId].connection) await tiktokConnections[roomId].connection.disconnect(); }catch(e){}
    delete tiktokConnections[roomId];
  }
  io.to(roomId).emit('tiktok_status', { status: 'desconectado' });
  res.json({ success: true });
});

io.on('connection',(socket)=>{
  socket.on('create_room',({roomId})=>{
    socket.join(roomId);
    socket.emit('room_created',{roomId});
    if(tiktokConnections[roomId]) socket.emit('tiktok_status', { status: tiktokConnections[roomId].status, username: tiktokConnections[roomId].username });
  });
  socket.on('join_room',({roomId})=>{
    socket.join(roomId);
    io.to(roomId).emit('paired',{roomId});
    if(tiktokConnections[roomId]) socket.emit('tiktok_status', { status: tiktokConnections[roomId].status, username: tiktokConnections[roomId].username });
  });
  socket.on('gift_manual',(d)=>{ io.to(d.roomId).emit('print_gift',d); });
  socket.on('faq_event',(d)=>{ io.to(d.roomId).emit('print_gift',{...d,tipo:'faq'}); });
  socket.on('copy_event',(d)=>{ io.to(d.roomId).emit('print_gift',{...d,tipo:'copy'}); });
});

server.listen(PORT,'0.0.0.0',()=>console.log('FIX 2.5.0 LIVE porta '+PORT));
