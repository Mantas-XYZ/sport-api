const http = require('http');
const { randomUUID } = require('crypto');
const { CosmosClient } = require('@azure/cosmos');
const { DefaultAzureCredential } = require('@azure/identity');

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
// Entra ID auth: in Azure Container Apps this resolves to the app's
// system-assigned managed identity. No Cosmos key is used or needed.
const container = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, aadCredentials: new DefaultAzureCredential() })
  .database(process.env.COSMOS_DATABASE || 'sportdb')
  .container(process.env.COSMOS_CONTAINER || 'workouts');

const SPORTS = ['Running', 'Cycling', 'Swimming', 'Gym', 'Football'];

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 10_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
  });
}

function validate(b) {
  const minutes = Number(b.minutes), distance = Number(b.distance || 0);
  if (!SPORTS.includes(b.sport)) return null;
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) return null;
  if (!Number.isFinite(distance) || distance < 0 || distance > 1000) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return null;
  return { sport: b.sport, minutes, distance, date: b.date };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'OPTIONS') return send(res, 204);
    if (url.pathname === '/health') return send(res, 200, { ok: true });

    if (url.pathname === '/api/workouts' && req.method === 'GET') {
      const { resources } = await container.items
        .query('SELECT c.id, c.sport, c.minutes, c.distance, c.date FROM c ORDER BY c.date DESC')
        .fetchAll();
      return send(res, 200, resources);
    }

    if (url.pathname === '/api/workouts' && req.method === 'POST') {
      const w = validate(await readJson(req));
      if (!w) return send(res, 400, { error: 'Invalid workout' });
      const { resource } = await container.items.create({ id: randomUUID(), ...w });
      return send(res, 201, { id: resource.id, ...w });
    }

    const m = url.pathname.match(/^\/api\/workouts\/([0-9a-f-]{36})$/);
    if (m && req.method === 'DELETE') {
      await container.item(m[1], m[1]).delete().catch(e => { if (e.code !== 404) throw e; });
      return send(res, 204);
    }

    send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Server error' });
  }
}).listen(PORT, () => console.log(`sport-api listening on ${PORT}`));
