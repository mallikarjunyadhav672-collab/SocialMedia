const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { WebSocketServer, OPEN } = require('ws');

const app = express();

const entryFile = fs.existsSync(path.join(__dirname, 'index (2).html'))
  ? 'index (2).html'
  : 'index.html';

app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, entryFile));
});

const clients = new Set();
const messages = [];

function broadcast(payload) {
  const data = JSON.stringify(payload);
  clients.forEach((client) => {
    if (client.readyState === OPEN) {
      client.send(data);
    }
  });
}

function setupRealtime(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'history', messages }));

    ws.on('message', (raw) => {
      let payload;
      try {
        payload = JSON.parse(raw.toString());
      } catch (error) {
        return;
      }

      if (payload.type === 'message') {
        const message = {
          id: Date.now(),
          sender: payload.sender || 'Guest',
          text: payload.text || '',
          time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          room: payload.room || 'global',
          type: 'message'
        };
        messages.push(message);
        if (messages.length > 80) messages.shift();
        broadcast({ type: 'message', message });
      }
    });

    ws.on('close', () => clients.delete(ws));
  });

  return wss;
}

const DEFAULT_PORT = Number(process.env.PORT) || 3000;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '127.0.0.1');
  });
}

async function startServer(port) {
  const server = http.createServer(app);
  setupRealtime(server);

  if (!(await isPortAvailable(port))) {
    const nextPort = port + 1;
    console.log(`Port ${port} is busy. Trying http://localhost:${nextPort} instead.`);
    return startServer(nextPort);
  }

  server.listen(port, '127.0.0.1', () => {
    console.log(`Realtime social server running on http://localhost:${port}`);
  });
}

startServer(DEFAULT_PORT).catch((err) => {
  console.error(err);
  process.exit(1);
});
