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

// Armazena conexões TikTok ativas por sala
const tiktokConnections = {}; // roomId -> { username, connection, status }

app.get('/', (req,res)=>{
  res.send(`
  <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{background:#111;color:#fff;font-family:sans-serif;padding:20px;text-align:center}
  a{display:block;padding:18px;background:#FE2C55;color:#fff;border-radius:12px;margin:12px 0;text-decoration:none;font-weight:bold}
  .ok{color:#22c55e} .warn{color:#f59e0b}</style></head><body>
  <h1>Impressora TikTok ONLINE! <span class="ok">✅</span></h1>
  <p>Modelo PRO 9:16 + TikTok Live Connector</p>
  <a href="/tela?room=LOJA">📺 TELA 9:16 - Celular 1</a>
  <a href="/controle?room=LOJA">🎮 CONTROLE 9:16 + @ Live</a>
  <p style="opacity:0.7;margin-top:20px">Conexões TikTok ativas: ${Object.keys(tiktokConnections).length}</p>
  <p style="opacity:0.5;font-size:12px">Use ?room=NOME_DA_SALA para parear</p>
  </body></html>
  `);
});

function sendFileSmart(res, filename){
  const paths = [path.join(__dirname, filename), path.join(__dirname, 'public', filename)];
  for(let p of paths){ if(fs.existsSync(p)) return res.sendFile(p); }
  return res.status(404).send(filename+' não encontrado na raiz nem em public/');
}

app.get('/tela',(req,res)=>sendFileSmart(res,'tela.html'));
app.get('/controle',(req,res)=>sendFileSmart(res,'controle.html'));

// Endpoint para ativar modo AUTO TikTok
app.post('/api/tiktok/connect', async (req,res)=>{
  const { roomId, username } = req.body;
  if(!roomId || !username) return res.status(400).json({error:'roomId e username obrigatórios'});
  
  const cleanUsername = username.replace('@','').trim();
  
  // Se já tem conexão nessa sala, desconecta
  if(tiktokConnections[roomId]){
    try{ 
      if(tiktokConnections[roomId].connection){
        await tiktokConnections[roomId].connection.disconnect();
      }
    }catch(e){}
    delete tiktokConnections[roomId];
  }
  
  try{
    // Tenta usar tiktok-live-connector se instalado
    let TikTokLiveConnection;
    try{
      const lib = require('tiktok-live-connector');
      TikTokLiveConnection = lib.WebcastPushConnection || lib.TikTokLiveConnection || lib;
    }catch(e){
      console.log('tiktok-live-connector não instalado, modo simulação');
      // MODO SIMULAÇÃO - sem biblioteca
      tiktokConnections[roomId] = { username: cleanUsername, status: 'simulacao', connection: null };
      io.to(roomId).emit('tiktok_status', { status: 'simulacao', username: cleanUsername, message: 'Modo simulação - instale tiktok-live-connector no servidor' });
      return res.json({ success: true, mode: 'simulacao', message: 'Conectado em modo simulação. Para AUTO real, adicione tiktok-live-connector ao package.json' });
    }
    
    const connection = new TikTokLiveConnection(cleanUsername);
    
    connection.connect().then(state=>{
      console.log(`Conectado na live @${cleanUsername} sala ${roomId}`, state);
      tiktokConnections[roomId] = { username: cleanUsername, status: 'conectado', connection, roomId };
      io.to(roomId).emit('tiktok_status', { status: 'conectado', username: cleanUsername, roomId, message: `✅ Conectado na live @${cleanUsername}` });
      
      // Eventos
      connection.on('chat', data=>{
        console.log(`CHAT ${roomId}: ${data.userId} - ${data.comment}`);
        io.to(roomId).emit('chat_event', { nome: data.uniqueId, mensagem: data.comment, tipo: 'tiktok_chat', userId: data.userId });
        io.to(roomId).emit('print_gift', { roomId, nome: data.uniqueId, presente: data.comment, icone: '💬', tipo: 'chat', mensagem: data.comment });
      });
      
      connection.on('gift', data=>{
        console.log(`GIFT ${roomId}:`, data);
        const giftName = data.giftName || data.giftId || 'Presente';
        const diamondCount = data.diamondCount || 1;
        const user = data.uniqueId || 'Anônimo';
        io.to(roomId).emit('gift_event', { nome: user, presente: giftName, moedas: diamondCount });
        io.to(roomId).emit('print_gift', { roomId, nome: user, presente: giftName, icone: '🎁', tipo: 'auto', moedas: diamondCount, mensagem: `Presente real: ${giftName}` });
        io.to(roomId).emit('presentes_event', { nome: user, presente: giftName, moedas: diamondCount });
      });
      
      connection.on('member', data=>{
        console.log(`MEMBER ${roomId}: ${data.uniqueId} entrou`);
        io.to(roomId).emit('member_event', { nome: data.uniqueId, userId: data.userId });
      });
      
      connection.on('disconnected', ()=>{
        console.log(`Desconectado @${cleanUsername} sala ${roomId}`);
        io.to(roomId).emit('tiktok_status', { status: 'desconectado', username: cleanUsername });
        delete tiktokConnections[roomId];
      });
      
    }).catch(err=>{
      console.error(`Erro conectar @${cleanUsername}:`, err);
      io.to(roomId).emit('tiktok_status', { status: 'erro', username: cleanUsername, error: err.message });
      tiktokConnections[roomId] = { username: cleanUsername, status: 'erro', error: err.message };
    });
    
    res.json({ success: true, mode: 'real', username: cleanUsername, roomId, message: `Conectando na live @${cleanUsername}...` });
    
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

app.get('/api/tiktok/status/:roomId', (req,res)=>{
  const conn = tiktokConnections[req.params.roomId];
  res.json(conn || { status: 'desconectado' });
});

io.on('connection',(socket)=>{
  socket.on('create_room',({roomId})=>{
    socket.join(roomId);
    socket.emit('room_created',{roomId});
    // Envia status TikTok se já tiver
    if(tiktokConnections[roomId]){
      socket.emit('tiktok_status', { status: tiktokConnections[roomId].status, username: tiktokConnections[roomId].username });
    }
  });
  socket.on('join_room',({roomId})=>{
    socket.join(roomId);
    io.to(roomId).emit('paired',{roomId});
    if(tiktokConnections[roomId]){
      socket.emit('tiktok_status', { status: tiktokConnections[roomId].status, username: tiktokConnections[roomId].username });
    }
  });
  socket.on('gift_manual',(d)=>{ io.to(d.roomId).emit('print_gift',d); });
  socket.on('faq_event',(d)=>{ io.to(d.roomId).emit('print_gift',{...d,tipo:'faq'}); });
  socket.on('copy_event',(d)=>{ io.to(d.roomId).emit('print_gift',{...d,tipo:'copy'}); });
  socket.on('chat_event',(d)=>{ io.to(d.roomId).emit('chat_event',d); });
  socket.on('member_event',(d)=>{ io.to(d.roomId).emit('member_event',d); });
});

server.listen(PORT,'0.0.0.0',()=>console.log('PRO + TIKTOK LIVE LIVE porta '+PORT+' - Conexões: '+Object.keys(tiktokConnections).length));
