require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: true });

const stateOsmIds = {
  'AL':162110016,'AK':162109846,'AZ':162017790,'AR':162109828,'CA':162117809,
  'CO':162109727,'CT':162109048,'DE':162110040,'FL':162039,'GA':161957,
  'HI':166563,'ID':162116,'IL':122586,'IN':161816,'IA':161650,
  'KS':161644,'KY':161723,'LA':224922,'ME':63512,'MD':162112,
  'MA':165791,'MI':165789,'MN':165471,'MS':161943,'MO':161638,
  'MT':162115,'NE':161648,'NV':165473,'NH':67213,'NJ':224951,
  'NM':162014,'NY':61320,'NC':224045,'ND':161651,'OH':162173,
  'OK':161645,'OR':165476,'PA':162109,'RI':392915,'SC':224040,
  'SD':161652,'TN':161838,'TX':114690,'UT':161993,'VT':60759,
  'VA':224042,'WA':165479,'WV':162068,'WI':165466,'WY':161991,'DC':162069
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
    if (attempt < 3) { await sleep(8000); }
  }
  if (!data || !data.elements || data.elements.length === 0) {
    console.log(stateCode + ': FAILED after 3 attempts');
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
  // Insert in chunks of 500 to stay under Postgres parameter limit
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await insertBatch(rows.slice(i, i + CHUNK));
  }
  console.log(stateCode + ': ' + rows.length + ' segments imported');
  return rows.length;
}

async function run() {
  console.log('Starting highway import...');
  await pool.query('TRUNCATE us_highways RESTART IDENTITY');
  const states = Object.keys(stateOsmIds);
  let total = 0;
  for (const state of states) {
    const count = await importState(state, stateOsmIds[state]);
    total += count;
    await sleep(6000);
  }
  console.log('Total highway segments imported:', total);
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
