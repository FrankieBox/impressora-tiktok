const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('<h1>Impressora ONLINE!</h1><p>Funcionando! <a href="/tela">TELA</a> | <a href="/controle">CONTROLE</a></p>');
});

app.get('/tela', (req, res) => {
  res.send('<h1>TELA - Impressora OK!</h1>');
});

app.get('/controle', (req, res) => {
  res.send('<h1>CONTROLE - OK!</h1>');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server running');
});
