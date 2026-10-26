import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { parseSample, estimateSoc, createSimulator } from './telemetry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const SIMULATE = process.env.SIMULATE === '1';
const INGEST_TOKEN = process.env.INGEST_TOKEN || 'change-me';
const V_MIN = Number(process.env.PACK_V_MIN || 20.0); // pack empty (e.g. 7S Li-ion)
const V_MAX = Number(process.env.PACK_V_MAX || 29.4); // pack full
const HISTORY = 3600; // samples kept in memory (~30 min at 2 Hz)

const history = [];
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/history', (_req, res) => res.json({ vMin: V_MIN, vMax: V_MAX, samples: history }));

app.get('/api/export.csv', (_req, res) => {
  const rows = ['timestamp,volts,amps,watts,speed_kmh,temp_c'];
  for (const s of history) {
    rows.push([new Date(s.ts).toISOString(), s.v, s.i, s.p, s.spd, s.temp].join(','));
  }
  res.type('text/csv').attachment('kart-run.csv').send(rows.join('\n'));
});

const server = http.createServer(app);
const ingest = new WebSocketServer({ noServer: true });
const live = new WebSocketServer({ noServer: true });

function publish(sample) {
  sample.soc = estimateSoc(sample.v, V_MIN, V_MAX);
  history.push(sample);
  if (history.length > HISTORY) history.shift();
  const msg = JSON.stringify(sample);
  for (const client of live.clients) if (client.readyState === 1) client.send(msg);
}

ingest.on('connection', (ws) => {
  console.log('kart connected');
  ws.on('message', (data) => {
    const sample = parseSample(data.toString());
    if (sample) publish(sample);
  });
  ws.on('close', () => console.log('kart disconnected'));
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/live') {
    live.handleUpgrade(req, socket, head, (ws) => live.emit('connection', ws, req));
  } else if (url.pathname === '/ingest' && url.searchParams.get('token') === INGEST_TOKEN) {
    ingest.handleUpgrade(req, socket, head, (ws) => ingest.emit('connection', ws, req));
  } else {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
  }
});

if (SIMULATE) {
  const next = createSimulator({ vMax: V_MAX });
  setInterval(() => publish(parseSample(next())), 500);
  console.log('Simulator on: streaming fake kart data');
}

server.listen(PORT, () => console.log(`Dashboard on http://localhost:${PORT}`));
