const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/connection');

const router = express.Router();

// Buy a truck
router.post('/buy-truck', async (req, res) => {
  const { companyId, vehicleType, purchasePrice } = req.body;

  if (!companyId || !vehicleType || !purchasePrice) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check company has enough cash
    const companyResult = await pool.query(
      'SELECT cash FROM companies WHERE id = $1',
      [companyId]
    );

    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const currentCash = parseFloat(companyResult.rows[0].cash);
    if (currentCash < purchasePrice) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    // Create truck
    const truckId = uuidv4();
    await pool.query(
      `INSERT INTO trucks (id, company_id, vehicle_type, purchase_price)
       VALUES ($1, $2, $3, $4)`,
      [truckId, companyId, vehicleType, purchasePrice]
    );

    // Deduct from company cash
    await pool.query(
      'UPDATE companies SET cash = cash - $1 WHERE id = $2',
      [purchasePrice, companyId]
    );

    res.json({ success: true, truckId, message: 'Truck purchased' });
  } catch (err) {
    console.error('Buy truck error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Hire a driver
router.post('/hire-driver', async (req, res) => {
  const { companyId, driverName, wagePerMile } = req.body;

  if (!companyId || !driverName || !wagePerMile) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const driverId = uuidv4();
    await pool.query(
      `INSERT INTO drivers (id, company_id, name, wage_per_mile)
       VALUES ($1, $2, $3, $4)`,
      [driverId, companyId, driverName, wagePerMile]
    );

    res.json({ success: true, driverId, message: 'Driver hired' });
  } catch (err) {
    console.error('Hire driver error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Assign driver to truck
router.post('/assign-driver', async (req, res) => {
  const { truckId, driverId } = req.body;

  if (!truckId || !driverId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Verify truck and driver exist
    const truckResult = await pool.query(
      'SELECT * FROM trucks WHERE id = $1',
      [truckId]
    );

    const driverResult = await pool.query(
      'SELECT * FROM drivers WHERE id = $1',
      [driverId]
    );

    if (truckResult.rows.length === 0 || driverResult.rows.length === 0) {
      return res.status(404).json({ error: 'Truck or driver not found' });
    }

    // Assign driver to truck
    await pool.query(
      'UPDATE trucks SET driver_id = $1 WHERE id = $2',
      [driverId, truckId]
    );

    // Update driver status
    await pool.query(
      'UPDATE drivers SET status = $1 WHERE id = $2',
      ['assigned', driverId]
    );

    res.json({ success: true, message: 'Driver assigned to truck' });
  } catch (err) {
    console.error('Assign driver error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create a load
router.post('/create-load', async (req, res) => {
  const { companyId, cargoType, ratePerMile, pickupLocation, dropoffLocation, distanceMiles } = req.body;

  if (!companyId || !cargoType || !ratePerMile || !pickupLocation || !dropoffLocation) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const loadId = uuidv4();
    const revenue = distanceMiles ? distanceMiles * ratePerMile : 0;

    await pool.query(
      `INSERT INTO loads (id, company_id, cargo_type, rate_per_mile, pickup_location, dropoff_location, distance_miles, revenue)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [loadId, companyId, cargoType, ratePerMile, pickupLocation, dropoffLocation, distanceMiles, revenue]
    );

    res.json({ success: true, loadId, revenue, message: 'Load created' });
  } catch (err) {
    console.error('Create load error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Assign truck to load
router.post('/assign-load', async (req, res) => {
  const { truckId, loadId } = req.body;

  if (!truckId || !loadId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await pool.query(
      'UPDATE trucks SET load_id = $1 WHERE id = $2',
      [loadId, truckId]
    );

    await pool.query(
      'UPDATE loads SET truck_id = $1, status = $2 WHERE id = $3',
      [truckId, 'assigned', loadId]
    );

    res.json({ success: true, message: 'Load assigned to truck' });
  } catch (err) {
    console.error('Assign load error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get company trucks
router.get('/trucks/:companyId', async (req, res) => {
  const { companyId } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM trucks WHERE company_id = $1',
      [companyId]
    );

    res.json({ trucks: result.rows });
  } catch (err) {
    console.error('Get trucks error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get company drivers
router.get('/drivers/:companyId', async (req, res) => {
  const { companyId } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM drivers WHERE company_id = $1',
      [companyId]
    );

    res.json({ drivers: result.rows });
  } catch (err) {
    console.error('Get drivers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get company loads
router.get('/loads/:companyId', async (req, res) => {
  const { companyId } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM loads WHERE company_id = $1',
      [companyId]
    );

    res.json({ loads: result.rows });
  } catch (err) {
    console.error('Get loads error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all companies with metrics
router.get('/admin/companies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id, c.name, c.dot_number, c.owner_id, c.cash, c.created_at,
        p.username as owner_name,
        (SELECT COUNT(*) FROM trucks WHERE company_id = c.id) as truck_count,
        (SELECT COUNT(*) FROM drivers WHERE company_id = c.id) as driver_count,
        (SELECT COUNT(*) FROM loans WHERE company_id = c.id AND status != 'paid_off') as active_loans
      FROM companies c
      LEFT JOIN players p ON c.owner_id = p.id
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Delete player error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get overview stats
router.get('/admin/stats', async (req, res) => {
  try {
    const playerCount = await pool.query('SELECT COUNT(*) as count FROM players');
    const companyCount = await pool.query('SELECT COUNT(*) as count FROM companies');
    const cashSum = await pool.query('SELECT SUM(cash) as total FROM companies');
    const creditAvg = await pool.query('SELECT AVG(personal_credit_score) as avg FROM players');
    const loanCount = await pool.query("SELECT COUNT(*) as count FROM loans WHERE status = 'active'");
    
    res.json({
      totalPlayers: playerCount.rows[0].count || 0,
      totalCompanies: companyCount.rows[0].count || 0,
      totalCash: cashSum.rows[0].total || 0,
      avgCreditScore: creditAvg.rows[0].avg || 0,
      activeLoans: loanCount.rows[0].count || 0
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all companies with metrics
router.get('/admin/companies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id, c.name, c.dot_number, c.owner_id, c.cash, c.created_at,
        (SELECT COUNT(*) FROM trucks WHERE company_id = c.id) as truck_count,
        (SELECT COUNT(*) FROM drivers WHERE company_id = c.id) as driver_count,
        (SELECT COUNT(*) FROM loans WHERE company_id = c.id AND status != 'paid_off') as active_loans
      FROM companies c
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get overview stats
router.get('/admin/stats', async (req, res) => {
  try {
    const players = await pool.query('SELECT COUNT(*) as count FROM players');
    const companies = await pool.query('SELECT COUNT(*) as count FROM companies');
    const totalCash = await pool.query('SELECT COALESCE(SUM(cash), 0) as total FROM companies');
    const avgCreditScore = await pool.query('SELECT COALESCE(AVG(personal_credit_score), 0) as avg FROM players');
    const activeLoans = await pool.query("SELECT COUNT(*) as count FROM loans WHERE status != 'paid_off'");
    
    res.json({
      totalPlayers: parseInt(players.rows[0].count),
      totalCompanies: parseInt(companies.rows[0].count),
      totalCash: parseFloat(totalCash.rows[0].total),
      avgCreditScore: Math.round(parseFloat(avgCreditScore.rows[0].avg)),
      activeLoans: parseInt(activeLoans.rows[0].count)
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get company dashboard data
router.get('/company/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    
    const company = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);
    const trucks = await pool.query('SELECT COUNT(*) as count FROM trucks WHERE company_id = $1', [companyId]);
    const drivers = await pool.query('SELECT COUNT(*) as count FROM drivers WHERE company_id = $1', [companyId]);
    const loans = await pool.query('SELECT * FROM loans WHERE company_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 5', [companyId, 'active']);
    const owner = await pool.query('SELECT username, personal_credit_score FROM players WHERE id = $1', [company.rows[0].owner_id]);
    
    res.json({
      company: company.rows[0],
      truckCount: trucks.rows[0].count,
      driverCount: drivers.rows[0].count,
      owner: owner.rows[0],
      loans: loans.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get HQ data for player dashboard
router.get('/hq/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    
    const companyRes = await pool.query(
      'SELECT c.id, c.name, c.hq_state, c.hq_city, c.hq_latitude, c.hq_longitude, c.hq_county, c.hq_neighborhood, c.location_latitude, c.location_longitude, c.hq_zone, p.username FROM companies c LEFT JOIN players p ON c.owner_id = p.id WHERE c.id = $1',
      [companyId]
    );
    
    if (companyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    res.json(companyRes.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/game/ping - Update last_login to keep player online
router.post('/ping', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.substring(7);
    const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'freight-empire-secret-key-change-in-production');
    await pool.query('UPDATE players SET last_login = NOW() WHERE id = $1', [decoded.playerId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get players online count
router.get('/players-online', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(DISTINCT id) as count FROM players WHERE last_login > NOW() - INTERVAL \'2 minutes\''
    );
    res.json({ count: parseInt(result.rows[0].count) || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get company financial and operations stats
router.get('/company-stats/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    
    // Get company cash
    const companyRes = await pool.query(
      'SELECT cash FROM companies WHERE id = $1',
      [companyId]
    );
    
    if (companyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const cash = companyRes.rows[0].cash || 0;
    
    // Get driver count (simplified - no active status yet)
const driverRes = await pool.query(
  'SELECT COUNT(*)::INT as total FROM drivers WHERE company_id = $1',
  [companyId]
);

const drivers = driverRes.rows[0] || { total: 0 };

res.json({
  cash: parseInt(cash) || 0,
  totalDrivers: parseInt(drivers.total) || 0,
  activeDrivers: 0
});
  } catch (error) {
    console.error('Error in company-stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete company
router.delete('/company/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    
    // Clear player's current company first
    await pool.query('UPDATE players SET current_company_id = NULL WHERE current_company_id = $1', [companyId]);
    await pool.query('DELETE FROM market_orders WHERE company_id = $1', [companyId]);
    await pool.query('DELETE FROM loan_payments WHERE company_id = $1', [companyId]);
    await pool.query('DELETE FROM loans WHERE company_id = $1', [companyId]);
    await pool.query('DELETE FROM transactions WHERE company_id = $1', [companyId]);
    await pool.query('DELETE FROM compliance_strikes WHERE company_id = $1', [companyId]);
    await pool.query('DELETE FROM drivers WHERE company_id = $1', [companyId]);
    await pool.query('UPDATE companies SET owner_id = NULL WHERE id = $1', [companyId]);
    await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
    
    // Delete the company (other tables will cascade if FK constraints exist)
    await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Reset all data (DANGEROUS - development only)
router.post('/admin/reset-all', async (req, res) => {
  try {
    // Delete in correct order to respect foreign keys
    await pool.query('DELETE FROM company_auctions');
    await pool.query('DELETE FROM loans');
    await pool.query('DELETE FROM company_statistics');
    await pool.query('DELETE FROM trucks');
    await pool.query('DELETE FROM drivers');
    await pool.query('DELETE FROM players');  // Delete players BEFORE companies
    await pool.query('DELETE FROM companies');
    
    res.json({ success: true, message: 'All data deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Delete a company and put it up for auction
router.post('/admin/auction-company', async (req, res) => {
  try {
    const { companyId } = req.body;
    const companyRes = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);
    if (companyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    const company = companyRes.rows[0];
    const auctionPrice = parseFloat(company.cash) * 0.5;
    await pool.query(`
      INSERT INTO company_auctions (company_id, company_name, original_owner_id, starting_price, current_price)
      VALUES ($1, $2, $3, $4, $5)
    `, [companyId, company.name, company.owner_id, auctionPrice, auctionPrice]);
    await pool.query('UPDATE players SET current_company_id = NULL WHERE current_company_id = $1', [companyId]);
    await pool.query('UPDATE companies SET owner_id = NULL WHERE id = $1', [companyId]);
    res.json({ success: true, message: 'Company sent to auction' });
  } catch (error) {
    console.error('Auction company error:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/game/industrial-zones - find industrial zones near coordinates
router.get('/industrial-zones', async (req, res) => {
  try {
    const { lat, lng, state } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

    // State bounding boxes for filtering
    const stateBounds = {
      'AL':{s:30.14,n:35.01,w:-88.47,e:-84.89},'AK':{s:54.77,n:71.35,w:-168.00,e:-129.99},
      'AZ':{s:31.33,n:37.00,w:-114.82,e:-109.04},'AR':{s:33.00,n:36.50,w:-94.62,e:-89.64},
      'CA':{s:32.53,n:42.01,w:-124.41,e:-114.13},'CO':{s:36.99,n:41.00,w:-109.06,e:-102.04},
      'CT':{s:40.95,n:42.05,w:-73.73,e:-71.79},'DE':{s:38.45,n:39.84,w:-75.79,e:-75.05},
      'FL':{s:24.52,n:31.00,w:-87.63,e:-80.03},'GA':{s:30.36,n:35.00,w:-85.61,e:-80.84},
      'HI':{s:18.91,n:22.24,w:-160.25,e:-154.81},'ID':{s:41.99,n:49.00,w:-117.24,e:-111.04},
      'IL':{s:36.97,n:42.51,w:-91.51,e:-87.52},'IN':{s:37.77,n:41.76,w:-87.53,e:-84.78},
      'IA':{s:40.38,n:43.50,w:-96.64,e:-90.14},'KS':{s:36.99,n:40.00,w:-102.05,e:-94.62},
      'KY':{s:36.50,n:39.15,w:-89.57,e:-81.96},'LA':{s:28.93,n:33.02,w:-94.04,e:-88.82},
      'ME':{s:43.06,n:47.46,w:-71.08,e:-66.95},'MD':{s:38.30,n:39.72,w:-79.49,e:-75.05},
      'MA':{s:41.24,n:42.89,w:-73.51,e:-69.93},'MI':{s:41.70,n:48.31,w:-90.42,e:-82.41},
      'MN':{s:43.50,n:49.38,w:-97.24,e:-89.49},'MS':{s:30.17,n:35.01,w:-91.65,e:-88.10},
      'MO':{s:35.99,n:40.61,w:-95.77,e:-89.10},'MT':{s:44.36,n:49.00,w:-116.05,e:-104.04},
      'NE':{s:39.99,n:43.00,w:-104.05,e:-95.31},'NV':{s:35.00,n:42.00,w:-120.00,e:-114.04},
      'NH':{s:42.70,n:45.31,w:-72.56,e:-70.61},'NJ':{s:38.93,n:41.36,w:-75.20,e:-73.89},
      'NM':{s:31.33,n:37.00,w:-109.05,e:-103.00},'NY':{s:40.50,n:45.01,w:-79.76,e:-71.86},
      'NC':{s:33.84,n:36.59,w:-84.32,e:-75.46},'ND':{s:45.94,n:49.00,w:-104.05,e:-96.55},
      'OH':{s:38.40,n:41.98,w:-84.82,e:-80.52},'OK':{s:33.62,n:37.00,w:-103.00,e:-94.43},
      'OR':{s:41.99,n:46.24,w:-124.57,e:-116.46},'PA':{s:39.72,n:42.27,w:-80.52,e:-74.72},
      'RI':{s:41.15,n:42.02,w:-71.91,e:-71.12},'SC':{s:32.05,n:35.22,w:-83.35,e:-78.54},
      'SD':{s:42.48,n:45.95,w:-104.06,e:-96.44},'TN':{s:34.98,n:36.68,w:-90.31,e:-81.65},
      'TX':{s:25.84,n:36.50,w:-106.65,e:-93.51},'UT':{s:36.99,n:42.00,w:-114.05,e:-109.04},
      'VT':{s:42.73,n:45.02,w:-73.44,e:-71.46},'VA':{s:36.54,n:39.47,w:-83.68,e:-75.24},
      'WA':{s:45.54,n:49.00,w:-124.73,e:-116.92},'WV':{s:37.20,n:40.64,w:-82.64,e:-77.72},
      'WI':{s:42.49,n:47.31,w:-92.89,e:-86.25},'WY':{s:40.99,n:45.01,w:-111.06,e:-104.05},
      'DC':{s:38.79,n:38.99,w:-77.12,e:-76.91}
    };

    const radius = 10000;
    // Use OSM area filter for state to get precise boundaries
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
    const osmId = state && stateOsmIds[state] ? 3600000000 + stateOsmIds[state] : null;
    let query;
    if (osmId) {
      query = `[out:json][timeout:30];area(${osmId})->.st;(way["landuse"="industrial"](around:${radius},${lat},${lng})(area.st)(if: length() > 500);way["landuse"="warehouse"](around:${radius},${lat},${lng})(area.st)(if: length() > 500););out center;`;
    } else {
      query = `[out:json][timeout:30];(way["landuse"="industrial"](around:${radius},${lat},${lng})(if: length() > 500);way["landuse"="warehouse"](around:${radius},${lat},${lng})(if: length() > 500););out center;`;
    }
    const https = require('https');
    const options = {
      hostname: 'overpass-api.de',
      path: '/api/interpreter?data=' + encodeURIComponent(query),
      headers: { 'User-Agent': 'FreightEmpire/1.0 (game; contact@merimarkdigital.com)' }
    };
    const data = await new Promise((resolve, reject) => {
      https.get(options, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      }).on('error', reject);
    });
    const existingCompanies = await pool.query(
      'SELECT location_latitude, location_longitude FROM companies WHERE location_latitude IS NOT NULL'
    );
    const occupied = existingCompanies.rows.map(c => ({
      lat: parseFloat(c.location_latitude),
      lng: parseFloat(c.location_longitude)
    }));
    const haversine = (lat1, lng1, lat2, lng2) => {
      const R = 6371000;
      const dLat = (lat2-lat1) * Math.PI/180;
      const dLng = (lng2-lng1) * Math.PI/180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };
    // Keywords that disqualify a named OSM feature from being a valid Class 8 zone
    const excludeKeywords = [
      'park', 'maintenance', 'school', 'church', 'cemetery', 'garden',
      'recreation', 'playground', 'hospital', 'clinic', 'museum', 'library',
      'temple', 'mosque', 'synagogue', 'community', 'center', 'centre',
      'terminal', 'passenger', 'utility', 'water', 'sewage', 'substation',
      'depot', 'yard', 'pumping', 'treatment', 'shelter', 'fire', 'police'
    ];

    const bounds = state ? stateBounds[state] : null;
    const rawZones = (data.elements || [])
      .filter(e => e.center || (e.lat && e.lon))
      .filter(e => {
        // Filter out tiny zones (fewer than 6 nodes = too small for Class 8 trucks)
        if (e.nodes && e.nodes.length < 6) return false;
        // Filter out named zones with non-industrial keywords
        if (e.tags && e.tags.name) {
          const nameLower = e.tags.name.toLowerCase();
          if (excludeKeywords.some(kw => nameLower.includes(kw))) return false;
        }
        return true;
      })
      .map(e => ({
        lat: e.center ? e.center.lat : e.lat,
        lng: e.center ? e.center.lon : e.lon,
        name: null, // Strip all OSM names — zones are numbered sequentially
      }))
      .filter(z => {
        if (bounds) {
          if (z.lat < bounds.s || z.lat > bounds.n || z.lng < bounds.w || z.lng > bounds.e) return false;
        }
        return true;
      });

    // Cluster zones within 800m of each other into single markers
    const clustered = [];
    const used = new Set();
    rawZones.forEach((zone, i) => {
      if (used.has(i)) return;
      const cluster = [zone];
      used.add(i);
      rawZones.forEach((other, j) => {
        if (used.has(j)) return;
        if (haversine(zone.lat, zone.lng, other.lat, other.lng) < 1500) {
          cluster.push(other);
          used.add(j);
        }
      });
      const avgLat = cluster.reduce((s,z) => s + z.lat, 0) / cluster.length;
      const avgLng = cluster.reduce((s,z) => s + z.lng, 0) / cluster.length;
      const namedZone = cluster.find(z => z.name);
      clustered.push({
        lat: avgLat,
        lng: avgLng,
        name: namedZone ? namedZone.name : 'Industrial Zone ' + (clustered.length + 1)
      });
    });

    const zones = clustered.filter(z => !occupied.some(c => haversine(c.lat, c.lng, z.lat, z.lng) < 150));
    res.json({ zones });
  } catch (error) {
    console.error('Industrial zones error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/game/config - serve public config to frontend
router.get('/config', async (req, res) => {
  res.json({ mapboxToken: process.env.MAPBOX_API_KEY });
});

// GET /api/game/map-companies - returns all companies with coordinates for map
router.get('/map-companies', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, c.hq_city, c.hq_state, c.hq_latitude, c.hq_longitude,
             c.location_latitude, c.location_longitude, p.username
      FROM companies c
      LEFT JOIN players p ON c.owner_id = p.id
      WHERE c.hq_latitude IS NOT NULL OR c.location_latitude IS NOT NULL
    `);
    res.json({ companies: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/delete-company', async (req, res) => {
  try {
    const { companyId } = req.body;
    const companyRes = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);
    if (companyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    await pool.query('UPDATE players SET current_company_id = NULL WHERE current_company_id = $1', [companyId]);
    await pool.query('DELETE FROM market_orders WHERE company_id = $1', [companyId]);
    await pool.query('DELETE FROM loan_payments WHERE company_id = $1', [companyId]);
    await pool.query('DELETE FROM loans WHERE company_id = $1', [companyId]);
    await pool.query('DELETE FROM transactions WHERE company_id = $1', [companyId]);
    await pool.query('DELETE FROM compliance_strikes WHERE company_id = $1', [companyId]);
    await pool.query('DELETE FROM drivers WHERE company_id = $1', [companyId]);
    await pool.query('UPDATE companies SET owner_id = NULL WHERE id = $1', [companyId]);
    await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
    res.json({ success: true, message: 'Company permanently deleted' });
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Delete a player permanently
router.post('/admin/delete-player', async (req, res) => {
  try {
    const { playerId, reason, notes } = req.body;
    
    // Get player details
    const playerRes = await pool.query(
      'SELECT id, username, email, personal_credit_score FROM players WHERE id = $1',
      [playerId]
    );
    if (playerRes.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    const player = playerRes.rows[0];
    
    // Step 1: FIRST - Clear player's current_company_id to remove FK constraint
    await pool.query('UPDATE players SET current_company_id = NULL WHERE id = $1', [playerId]);
    
    // Step 2: Track original owner before orphaning
    await pool.query('UPDATE companies SET previous_owner_id = owner_id WHERE owner_id = $1', [playerId]);
    
    // Step 3: Now orphan player's companies (set owner_id to NULL)
    await pool.query('UPDATE companies SET owner_id = NULL WHERE owner_id = $1', [playerId]);
    
    // Step 4: Archive to deleted players history
    const purgeDate = new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000); // 6 months
    await pool.query(`
  INSERT INTO deleted_players_history (id, username, email, personal_credit_score, deletion_reason, deletion_notes, auto_purge_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
`, [player.id, player.username, player.email, player.personal_credit_score, reason, notes, purgeDate]);
    
    // Step 5: Add to banned list
    await pool.query(`
      INSERT INTO banned_players (email, reason)
      VALUES ($1, $2)
      ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason
    `, [player.email, notes]);
    
    // Step 6: Delete player
    await pool.query('DELETE FROM players WHERE id = $1', [playerId]);
    
    res.json({ success: true, message: 'Player deleted. Companies orphaned.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all deleted players
router.get('/admin/deleted-players', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM deleted_players_history
      WHERE auto_purge_at > NOW()
      ORDER BY deleted_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get deleted player details with orphaned companies
router.get('/admin/deleted-players/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    
    const playerRes = await pool.query(
      'SELECT * FROM deleted_players_history WHERE id = $1',
      [playerId]
    );
    
    if (playerRes.rows.length === 0) {
      return res.status(404).json({ error: 'Deleted player not found' });
    }
    
    const player = playerRes.rows[0];
    
    // Get orphaned companies that belonged to this deleted player
    const companiesRes = await pool.query(
      'SELECT id, name, cash FROM companies WHERE previous_owner_id = $1 ORDER BY created_at DESC',
      [playerId]
    );
    
    res.json({ player, orphanedCompanies: companiesRes.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

    // Admin/Owner: Elevate player credentials
router.post('/admin/elevate-player', async (req, res) => {
  try {
    const { playerId, newCredentials } = req.body;
    const allowedCredentials = ['player', 'moderator', 'admin', 'owner'];
    if (!allowedCredentials.includes(newCredentials)) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    await pool.query('UPDATE players SET credentials = $1 WHERE id = $2', [newCredentials, playerId]);
    res.json({ success: true, message: `Player elevated to ${newCredentials}` });
  } catch (error) {
    console.error('Elevate player error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Owner: Permanently purge deleted player and ALL associated data
router.post('/admin/purge-deleted-player', async (req, res) => {
  try {
    const { playerId } = req.body;
    
    // Get deleted player to find their email
    const deletedRes = await pool.query('SELECT email FROM deleted_players_history WHERE id = $1', [playerId]);
    if (deletedRes.rows.length === 0) {
      return res.status(404).json({ error: 'Deleted player not found' });
    }
    const playerEmail = deletedRes.rows[0].email;

    // Delete from banned_players
    await pool.query('DELETE FROM banned_players WHERE email = $1', [playerEmail]);

    // Find all companies owned by this player and delete related data
    const companiesRes = await pool.query('SELECT id FROM companies WHERE owner_id = $1', [playerId]);
    for (const company of companiesRes.rows) {
      await pool.query('DELETE FROM loans WHERE company_id = $1', [company.id]);
      await pool.query('DELETE FROM loan_payments WHERE company_id = $1', [company.id]);
      await pool.query('DELETE FROM transactions WHERE company_id = $1', [company.id]);
      await pool.query('DELETE FROM compliance_strikes WHERE company_id = $1', [company.id]);
      await pool.query('DELETE FROM drivers WHERE company_id = $1', [company.id]);
      await pool.query('DELETE FROM companies WHERE id = $1', [company.id]);
    }

    // Delete from deleted_players_history (final purge)
    await pool.query('DELETE FROM deleted_players_history WHERE id = $1', [playerId]);

    res.json({ success: true, message: 'Player permanently purged. All data deleted.' });
  } catch (error) {
    console.error('Purge deleted player error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Owner: Verify player data is completely purged
router.post('/admin/verify-purge', async (req, res) => {
  try {
    const { playerId } = req.body;
    
    const checks = {
      deletedHistory: 0,
      bannedPlayers: 0,
      companies: 0,
      loans: 0,
      drivers: 0,
      transactions: 0,
      strikes: 0
    };

    // Check deleted_players_history
    const delRes = await pool.query('SELECT COUNT(*) as count FROM deleted_players_history WHERE id = $1', [playerId]);
    checks.deletedHistory = parseInt(delRes.rows[0].count);

    // Check banned_players (need to find email first - won't exist if purged)
    // This won't find anything if already purged, which is correct

    // Check companies owned by this player
    const compRes = await pool.query('SELECT COUNT(*) as count FROM companies WHERE owner_id = $1', [playerId]);
    checks.companies = parseInt(compRes.rows[0].count);

    // Check loans tied to companies
    const loanRes = await pool.query(`
      SELECT COUNT(*) as count FROM loans 
      WHERE company_id IN (SELECT id FROM companies WHERE owner_id = $1)
    `, [playerId]);
    checks.loans = parseInt(loanRes.rows[0].count);

    // Check drivers tied to companies
    const drvRes = await pool.query(`
      SELECT COUNT(*) as count FROM drivers 
      WHERE company_id IN (SELECT id FROM companies WHERE owner_id = $1)
    `, [playerId]);
    checks.drivers = parseInt(drvRes.rows[0].count);

    // Check transactions
    const txRes = await pool.query(`
      SELECT COUNT(*) as count FROM transactions 
      WHERE company_id IN (SELECT id FROM companies WHERE owner_id = $1)
    `, [playerId]);
    checks.transactions = parseInt(txRes.rows[0].count);

    // Check compliance strikes
    const strikeRes = await pool.query(`
      SELECT COUNT(*) as count FROM compliance_strikes 
      WHERE company_id IN (SELECT id FROM companies WHERE owner_id = $1)
    `, [playerId]);
    checks.strikes = parseInt(strikeRes.rows[0].count);

    const totalRemaining = Object.values(checks).reduce((a, b) => a + b, 0);
    
    res.json({ 
      success: true, 
      purged: totalRemaining === 0,
      remaining: checks,
      totalRemaining 
    });
  } catch (error) {
    console.error('Verify purge error:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/game/validate-location - validate HQ placement by highway proximity
router.get('/validate-location', async (req, res) => {
  try {
    const { lat, lng, state } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
    const latF = parseFloat(lat);
    const lngF = parseFloat(lng);
    const searchRadius = 8047;
    const maxRadius = 4828;
    const hwQuery = `[out:json][timeout:15];(way["highway"="motorway"](around:${searchRadius},${latF},${lngF});way["highway"="trunk"](around:${searchRadius},${latF},${lngF});way["highway"="primary"](around:${searchRadius},${latF},${lngF}););out center tags;`;
    const https = require('https');
    const overpassData = await new Promise((resolve, reject) => {
      https.get({
        hostname: 'overpass-api.de',
        path: '/api/interpreter?data=' + encodeURIComponent(hwQuery),
        headers: { 'User-Agent': 'FreightEmpire/1.0 (game; contact@merimarkdigital.com)' }
      }, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      }).on('error', reject);
    });
    const haversine = (lat1, lng1, lat2, lng2) => {
      const R = 6371000;
      const dLat = (lat2-lat1)*Math.PI/180;
      const dLng = (lng2-lng1)*Math.PI/180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };
    const hwLabels = { motorway: 'Interstate', trunk: 'US Route', primary: 'State Route' };
    let nearest = null;
    let nearestDist = Infinity;
    for (const el of (overpassData.elements || [])) {
      const elLat = el.center ? el.center.lat : el.lat;
      const elLng = el.center ? el.center.lon : el.lon;
      if (!elLat || !elLng) continue;
      const dist = haversine(latF, lngF, elLat, elLng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = {
          type: el.tags && el.tags.highway ? el.tags.highway : 'primary',
          ref: el.tags && el.tags.ref ? el.tags.ref : null,
          name: el.tags && el.tags.name ? el.tags.name : null
        };
      }
    }
    const distMiles = nearest ? (nearestDist / 1609.34).toFixed(1) : null;
    const hwLabel = nearest ? (hwLabels[nearest.type] || 'Highway') : 'Major highway';
    const hwName = nearest ? (nearest.ref || nearest.name || hwLabel) : null;
    if (!nearest || nearestDist > maxRadius) {
      return res.json({
        valid: false,
        message: hwName
          ? hwName + ' is ' + distMiles + ' miles away. Must be within 3 miles of an Interstate, US Route, or State Route.'
          : 'No major highway found within 5 miles. Choose a location closer to an Interstate, US Route, or State Route.'
      });
    }
    const mapboxKey = process.env.MAPBOX_API_KEY;
    const geoUrl = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + lngF + ',' + latF + '.json?access_token=' + mapboxKey + '&country=us&types=address';
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    let address = null;
    const feature = geoData.features && geoData.features[0];
    if (feature) {
      const context = feature.context || [];
      const postcodeCtx = context.find(c => c.id && c.id.startsWith('postcode'));
      const placeCtx = context.find(c => c.id && c.id.startsWith('place'));
      const regionCtx = context.find(c => c.id && c.id.startsWith('region'));
      const streetName = feature.text || 'Industrial Blvd';
      const streetNum = (Math.abs(Math.round(latF * lngF * 100)) % 8900) + 100;
      const zip = postcodeCtx ? postcodeCtx.text : generateZip(state);
      const city = placeCtx ? placeCtx.text : '';
      const stateAbbr = regionCtx ? (regionCtx.short_code ? regionCtx.short_code.replace('US-', '') : (state || '')) : (state || '');
      address = streetNum + ' ' + streetName + ', ' + city + ', ' + stateAbbr + ' ' + zip;
    } else {
      address = (Math.floor(Math.random() * 8900) + 100) + ' Industrial Blvd, ' + generateZip(state);
    }
    res.json({ valid: true, address, nearestHighway: hwName, highwayType: hwLabel, distanceMiles: distMiles });
  } catch (error) {
    console.error('Validate location error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

function generateZip(state) {
  const p = { 'AL':'350','AK':'995','AZ':'850','AR':'716','CA':'900','CO':'800','CT':'060','DE':'197','FL':'320','GA':'300','HI':'967','ID':'832','IL':'600','IN':'460','IA':'500','KS':'660','KY':'400','LA':'700','ME':'040','MD':'210','MA':'010','MI':'480','MN':'550','MS':'390','MO':'630','MT':'590','NE':'680','NV':'890','NH':'030','NJ':'070','NM':'870','NY':'100','NC':'270','ND':'580','OH':'430','OK':'730','OR':'970','PA':'150','RI':'029','SC':'290','SD':'570','TN':'370','TX':'750','UT':'840','VT':'050','VA':'220','WA':'980','WV':'247','WI':'530','WY':'820','DC':'200' };
  return (state && p[state] ? p[state] : '100') + String(Math.floor(Math.random() * 90) + 10);
}

module.exports = router;
