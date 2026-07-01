require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: true });

const missingStates = {
  'AL':162110016,'AK':162109846,'AZ':162017790,'AR':162109828,'CA':162117809,
  'CO':162109727,'CT':162109048,'DE':162110040,'FL':162039,
  'KY':161723,'MA':165791,'ND':161651,'OH':162173
};

function overpassQuery(query) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Accept': 'application/json',
        'User-Agent': 'FreightEmpire/1.0 (game; contact@merimarkdigital.com)'
      }
    }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write('data=' + query);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function insertBatch(rows) {
  if (rows.length === 0) return;
  const insertValues = [];
  const insertParams = [];
  let pIdx = 1;
  for (const row of rows) {
    insertValues.push('($' + pIdx + ', $' + (pIdx+1) + ', $' + (pIdx+2) + ', $' + (pIdx+3) + ', $' + (pIdx+4) + ', $' + (pIdx+5) + ')');
    insertParams.push(row.osmId, row.hwType, row.ref, row.name, row.lat, row.lng);
    pIdx += 6;
  }
  await pool.query(
    'INSERT INTO us_highways (osm_id, highway_type, ref, name, lat, lng) VALUES ' + insertValues.join(',') + ' ON CONFLICT DO NOTHING',
    insertParams
  );
}

async function importState(stateCode, osmId) {
  const areaId = 3600000000 + osmId;
  const query = '[out:json][timeout:60];area(' + areaId + ')->.st;(way["highway"~"^(motorway|trunk|primary)$"](area.st););out center tags;';
  let data = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    data = await overpassQuery(query);
    if (data && data.elements && data.elements.length > 0) break;
    if (attempt < 3) { console.log(stateCode + ': retry ' + attempt); await sleep(10000); }
  }
  if (!data || !data.elements || data.elements.length === 0) {
    console.log(stateCode + ': FAILED');
    return 0;
  }
  const rows = [];
  for (const el of data.elements) {
    const lat = el.center ? el.center.lat : el.lat;
    const lng = el.center ? el.center.lon : el.lon;
    if (!lat || !lng) continue;
    rows.push({
      osmId: el.id,
      hwType: el.tags && el.tags.highway ? el.tags.highway : 'primary',
      ref: el.tags && el.tags.ref ? el.tags.ref.substring(0, 50) : null,
      name: el.tags && el.tags.name ? el.tags.name.substring(0, 255) : null,
      lat, lng
    });
  }
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await insertBatch(rows.slice(i, i + CHUNK));
  }
  console.log(stateCode + ': ' + rows.length + ' segments imported');
  return rows.length;
}

async function run() {
  console.log('Re-importing missing states...');
  const states = Object.keys(missingStates);
  let total = 0;
  for (const state of states) {
    const count = await importState(state, missingStates[state]);
    total += count;
    await sleep(8000);
  }
  console.log('Done. Total added:', total);
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
