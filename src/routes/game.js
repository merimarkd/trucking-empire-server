const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/connection');

const router = express.Router();

// Load real county land value data (derived from Zillow ZHVI)
let COUNTY_LAND_VALUES = {};
try {
  const fs = require('fs');
  const path = require('path');
  const dataPath = path.join(__dirname, '../../data/land_values.json');
  COUNTY_LAND_VALUES = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log('✓ Loaded ' + Object.keys(COUNTY_LAND_VALUES).length + ' county land values');
} catch (e) {
  console.error('Could not load land_values.json:', e.message);
}

function lookupCountyLandValue(county, state) {
  if (!county || !state) return null;
  let normalizedCounty = county.trim().toUpperCase();
  if (!normalizedCounty.includes('COUNTY') && !normalizedCounty.includes('PARISH') && !normalizedCounty.includes('BOROUGH')) {
    normalizedCounty += ' COUNTY';
  }
  const key = normalizedCounty + '|' + state.trim().toUpperCase();
  return COUNTY_LAND_VALUES[key] || null;
}

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
// GET /api/game/portal-candidates - generate procedural driver candidates for hire
const PORTAL_FIRST_NAMES = ['James','Michael','Robert','David','Richard','Joseph','Thomas','Charles','Daniel','Matthew','Anthony','Mark','Donald','Steven','Paul','Andrew','Joshua','Kenneth','Kevin','Brian','George','Edward','Ronald','Timothy','Jason','Jeffrey','Ryan','Jacob','Gary','Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon','Benjamin','Samuel','Gregory','Frank','Raymond','Alexander','Patrick','Jack','Dennis','Jerry','Tyler','Aaron','Henry','Maria','Linda','Patricia','Barbara','Elizabeth','Jennifer','Susan','Jessica','Sarah','Karen','Nancy','Lisa','Margaret','Sandra','Ashley','Kimberly','Donna','Carol','Michelle','Amanda','Melissa'];
const PORTAL_LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts'];
const PORTAL_ENDORSEMENTS = ['Hazmat', 'Tanker', 'Doubles/Triples', 'Passenger', 'School Bus'];
const PORTAL_CITIES = [
  {city:'Dallas',state:'TX'},{city:'Atlanta',state:'GA'},{city:'Chicago',state:'IL'},
  {city:'Memphis',state:'TN'},{city:'Indianapolis',state:'IN'},{city:'Columbus',state:'OH'},
  {city:'Kansas City',state:'MO'},{city:'Phoenix',state:'AZ'},{city:'Charlotte',state:'NC'},
  {city:'Denver',state:'CO'},{city:'Louisville',state:'KY'},{city:'Oklahoma City',state:'OK'}
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateDriverCandidate() {
  const yearsExperience = Math.floor(Math.random() * 26);
  const numEndorsements = Math.floor(Math.random() * 3);
  const endorsements = [];
  const pool = [...PORTAL_ENDORSEMENTS];
  for (let i = 0; i < numEndorsements && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    endorsements.push(pool.splice(idx, 1)[0]);
  }
  const safetyScore = Math.max(40, Math.min(100, Math.round(60 + yearsExperience * 1.5 + (Math.random() * 20 - 10))));
  const baseWage = 0.42 + (yearsExperience * 0.006) + (endorsements.length * 0.015);
  const requestedWage = Math.round((baseWage + (Math.random() * 0.06 - 0.03)) * 1000) / 1000;
  const location = pickRandom(PORTAL_CITIES);

  return {
    id: uuidv4(),
    name: pickRandom(PORTAL_FIRST_NAMES) + ' ' + pickRandom(PORTAL_LAST_NAMES),
    yearsExperience,
    cdlClass: 'A',
    endorsements,
    safetyScore,
    requestedWage,
    location: location.city + ', ' + location.state,
    operationType: Math.random() > 0.5 ? 'OTR' : 'Regional'
  };
}

function generateJobApplicant(routeType, equipmentType, postedWage) {
  const yearsExperience = Math.floor(Math.random() * 26);
  const numEndorsements = Math.floor(Math.random() * 3);
  const endorsements = [];
  const pool = [...PORTAL_ENDORSEMENTS];
  if (equipmentType === 'Tanker' && !endorsements.includes('Tanker')) endorsements.push('Tanker');
  for (let i = 0; i < numEndorsements && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const pick = pool.splice(idx, 1)[0];
    if (!endorsements.includes(pick)) endorsements.push(pick);
  }
  const safetyScore = Math.max(40, Math.min(100, Math.round(60 + yearsExperience * 1.5 + (Math.random() * 20 - 10))));
  const requestedWage = Math.round((parseFloat(postedWage) + (Math.random() * 0.04 - 0.02)) * 1000) / 1000;
  const location = pickRandom(PORTAL_CITIES);
  const cdlSchoolGrad = yearsExperience <= 1 && Math.random() > 0.5;
  return {
    candidateName: pickRandom(PORTAL_FIRST_NAMES) + ' ' + pickRandom(PORTAL_LAST_NAMES),
    yearsExperience,
    cdlClass: 'A',
    endorsements: endorsements.join(', '),
    safetyScore,
    requestedWage,
    location: location.city + ', ' + location.state,
    cdlSchoolGrad
  };
}

router.get('/portal-candidates', async (req, res) => {
  try {
    const count = 10;
    const candidates = [];
    for (let i = 0; i < count; i++) {
      candidates.push(generateDriverCandidate());
    }
    res.json({ candidates });
  } catch (error) {
    console.error('Portal candidates error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/game/post-job - create a new job posting
router.post('/post-job', async (req, res) => {
  try {
    const { companyId, routeType, equipmentType, payPerMile, homeTime, referralBonus, cdlSchoolPartner } = req.body;
    if (!companyId || !routeType || !equipmentType || !payPerMile || !homeTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const result = await pool.query(
      `INSERT INTO job_postings (company_id, route_type, equipment_type, pay_per_mile, home_time, referral_bonus, cdl_school_partner)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [companyId, routeType, equipmentType, payPerMile, homeTime, referralBonus || 0, !!cdlSchoolPartner]
    );
    res.json({ success: true, posting: result.rows[0] });
  } catch (error) {
    console.error('Post job error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/game/job-postings?companyId= - list job postings for a company
router.get('/job-postings', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const result = await pool.query(
      `SELECT p.*, (SELECT COUNT(*) FROM job_applications WHERE job_posting_id = p.id AND status = 'pending') as pending_count
       FROM job_postings p WHERE p.company_id = $1 ORDER BY p.created_at DESC`,
      [companyId]
    );
    res.json({ postings: result.rows });
  } catch (error) {
    console.error('Job postings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/game/job-posting-status - pause/close/reopen a posting
router.post('/job-posting-status', async (req, res) => {
  try {
    const { postingId, status } = req.body;
    if (!postingId || !['active', 'paused', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid postingId or status' });
    }
    await pool.query('UPDATE job_postings SET status = $1 WHERE id = $2', [status, postingId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Job posting status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/game/job-applications?companyId= - applicant inbox for a company
router.get('/job-applications', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const result = await pool.query(
      `SELECT a.*, p.route_type, p.equipment_type, p.pay_per_mile as posted_wage, p.home_time
       FROM job_applications a
       JOIN job_postings p ON a.job_posting_id = p.id
       WHERE p.company_id = $1 AND a.status = 'pending'
       ORDER BY a.applied_at DESC`,
      [companyId]
    );
    res.json({ applications: result.rows });
  } catch (error) {
    console.error('Job applications error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/game/respond-application - accept or decline an applicant
router.post('/respond-application', async (req, res) => {
  try {
    const { applicationId, action, companyId } = req.body;
    if (!applicationId || !['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'Invalid applicationId or action' });
    }
    const appRes = await pool.query('SELECT * FROM job_applications WHERE id = $1', [applicationId]);
    if (appRes.rows.length === 0) return res.status(404).json({ error: 'Application not found' });
    const application = appRes.rows[0];

    if (action === 'decline') {
      await pool.query("UPDATE job_applications SET status = 'declined' WHERE id = $1", [applicationId]);
      return res.json({ success: true, message: 'Application declined' });
    }

    // Accept: create driver record and mark accepted
    const driverId = uuidv4();
    await pool.query(
      `INSERT INTO drivers (id, company_id, name, wage_per_mile) VALUES ($1, $2, $3, $4)`,
      [driverId, companyId, application.candidate_name, application.requested_wage]
    );
    await pool.query("UPDATE job_applications SET status = 'accepted' WHERE id = $1", [applicationId]);
    res.json({ success: true, driverId, message: application.candidate_name + ' hired' });
  } catch (error) {
    console.error('Respond application error:', error);
    res.status(500).json({ error: error.message });
  }
});

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
             c.location_latitude, c.location_longitude, p.username,
             c.dot_number, c.mc_number, c.created_at,
             (SELECT COUNT(*) FROM trucks WHERE company_id = c.id) as truck_count
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


// Major US metro areas for accurate city tier classification (top ~80 by metro population)
// Major US ports - OSM tagging for port/harbor land is too inconsistent to rely on,
// so we maintain an authoritative list with a blocking radius (in meters)
const MAJOR_PORTS = [
  {name:'Port of Los Angeles',lat:33.7395,lng:-118.2610,radius:3000},
  {name:'Port of Long Beach',lat:33.7542,lng:-118.2165,radius:3000},
  {name:'Port of New York/New Jersey',lat:40.6700,lng:-74.1500,radius:3500},
  {name:'Port of Savannah',lat:32.1138,lng:-81.1455,radius:2500},
  {name:'Port of Houston',lat:29.7355,lng:-95.0850,radius:3000},
  {name:'Port of Virginia (Norfolk)',lat:36.8870,lng:-76.3340,radius:2500},
  {name:'Port of Charleston',lat:32.8200,lng:-79.9200,radius:2000},
  {name:'Port of Miami',lat:25.7745,lng:-80.1685,radius:1800},
  {name:'Port Everglades',lat:26.0950,lng:-80.1180,radius:1800},
  {name:'Port of Seattle',lat:47.5850,lng:-122.3450,radius:2000},
  {name:'Port of Tacoma',lat:47.2660,lng:-122.4130,radius:2000},
  {name:'Port of Oakland',lat:37.7990,lng:-122.3170,radius:2200},
  {name:'Port of Baltimore',lat:39.2650,lng:-76.5450,radius:2000},
  {name:'Port of New Orleans',lat:29.9400,lng:-90.0500,radius:2500},
  {name:'Port of Tampa',lat:27.9300,lng:-82.4500,radius:1800},
  {name:'Port of Jacksonville',lat:30.3850,lng:-81.5600,radius:1800},
  {name:'Port of Mobile',lat:30.6900,lng:-88.0300,radius:1800},
  {name:'Port of Philadelphia',lat:39.9100,lng:-75.1300,radius:1800},
  {name:'Port of Boston',lat:42.3400,lng:-71.0200,radius:1800},
  {name:'Port of Honolulu',lat:21.3050,lng:-157.8700,radius:1800},
  {name:'Cape Canaveral / Kennedy Space Center',lat:28.4889,lng:-80.5778,radius:5000},
];

const MAJOR_METROS = [
  {name:'New York',lat:40.7128,lng:-74.0060,pop:8336000,tier:'metro'},
  {name:'Los Angeles',lat:34.0522,lng:-118.2437,pop:3979000,tier:'metro'},
  {name:'Chicago',lat:41.8781,lng:-87.6298,pop:2693000,tier:'metro'},
  {name:'Houston',lat:29.7604,lng:-95.3698,pop:2320000,tier:'metro'},
  {name:'Phoenix',lat:33.4484,lng:-112.0740,pop:1680000,tier:'metro'},
  {name:'Philadelphia',lat:39.9526,lng:-75.1652,pop:1584000,tier:'metro'},
  {name:'San Antonio',lat:29.4241,lng:-98.4936,pop:1547000,tier:'metro'},
  {name:'San Diego',lat:32.7157,lng:-117.1611,pop:1423000,tier:'metro'},
  {name:'Dallas',lat:32.7767,lng:-96.7970,pop:1304000,tier:'metro'},
  {name:'Austin',lat:30.2672,lng:-97.7431,pop:978000,tier:'metro'},
  {name:'Jacksonville',lat:30.3322,lng:-81.6557,pop:949000,tier:'large'},
  {name:'Fort Worth',lat:32.7555,lng:-97.3308,pop:935000,tier:'large'},
  {name:'Columbus',lat:39.9612,lng:-82.9988,pop:898000,tier:'large'},
  {name:'Charlotte',lat:35.2271,lng:-80.8431,pop:885000,tier:'large'},
  {name:'San Francisco',lat:37.7749,lng:-122.4194,pop:873000,tier:'large'},
  {name:'Indianapolis',lat:39.7684,lng:-86.1581,pop:887000,tier:'large'},
  {name:'Seattle',lat:47.6062,lng:-122.3321,pop:737000,tier:'large'},
  {name:'Denver',lat:39.7392,lng:-104.9903,pop:715000,tier:'large'},
  {name:'Washington',lat:38.9072,lng:-77.0369,pop:689000,tier:'large'},
  {name:'Boston',lat:42.3601,lng:-71.0589,pop:675000,tier:'large'},
  {name:'Nashville',lat:36.1627,lng:-86.7816,pop:689000,tier:'large'},
  {name:'Memphis',lat:35.1495,lng:-90.0490,pop:633000,tier:'large'},
  {name:'Portland',lat:45.5051,lng:-122.6750,pop:652000,tier:'large'},
  {name:'Oklahoma City',lat:35.4676,lng:-97.5164,pop:681000,tier:'large'},
  {name:'Las Vegas',lat:36.1699,lng:-115.1398,pop:651000,tier:'large'},
  {name:'Louisville',lat:38.2527,lng:-85.7585,pop:617000,tier:'large'},
  {name:'Baltimore',lat:39.2904,lng:-76.6122,pop:585000,tier:'large'},
  {name:'Milwaukee',lat:43.0389,lng:-87.9065,pop:577000,tier:'large'},
  {name:'Albuquerque',lat:35.0844,lng:-106.6504,pop:564000,tier:'large'},
  {name:'Tucson',lat:32.2226,lng:-110.9747,pop:548000,tier:'large'},
  {name:'Fresno',lat:36.7378,lng:-119.7871,pop:545000,tier:'large'},
  {name:'Sacramento',lat:38.5816,lng:-121.4944,pop:525000,tier:'large'},
  {name:'Kansas City',lat:39.0997,lng:-94.5786,pop:508000,tier:'large'},
  {name:'Mesa',lat:33.4152,lng:-111.8315,pop:504000,tier:'large'},
  {name:'Atlanta',lat:33.7490,lng:-84.3880,pop:499000,tier:'large'},
  {name:'Omaha',lat:41.2565,lng:-95.9345,pop:486000,tier:'large'},
  {name:'Colorado Springs',lat:38.8339,lng:-104.8214,pop:478000,tier:'large'},
  {name:'Raleigh',lat:35.7796,lng:-78.6382,pop:474000,tier:'large'},
  {name:'Miami',lat:25.7617,lng:-80.1918,pop:442000,tier:'large'},
  {name:'Long Beach',lat:33.7701,lng:-118.1937,pop:466000,tier:'large'},
  {name:'Virginia Beach',lat:36.8529,lng:-75.9780,pop:459000,tier:'large'},
  {name:'Oakland',lat:37.8044,lng:-122.2712,pop:440000,tier:'large'},
  {name:'Minneapolis',lat:44.9778,lng:-93.2650,pop:430000,tier:'large'},
  {name:'Tulsa',lat:36.1540,lng:-95.9928,pop:413000,tier:'large'},
  {name:'Tampa',lat:27.9506,lng:-82.4572,pop:399000,tier:'large'},
  {name:'New Orleans',lat:29.9511,lng:-90.0715,pop:383000,tier:'large'},
  {name:'Wichita',lat:37.6872,lng:-97.3301,pop:397000,tier:'large'},
  {name:'Cleveland',lat:41.4993,lng:-81.6944,pop:362000,tier:'large'},
  {name:'Bakersfield',lat:35.3733,lng:-119.0187,pop:407000,tier:'large'},
  {name:'Aurora',lat:39.7294,lng:-104.8319,pop:386000,tier:'large'},
  {name:'Anaheim',lat:33.8366,lng:-117.9143,pop:346000,tier:'large'},
  {name:'Honolulu',lat:21.3069,lng:-157.8583,pop:345000,tier:'large'},
  {name:'Santa Ana',lat:33.7455,lng:-117.8677,pop:310000,tier:'large'},
  {name:'Riverside',lat:33.9533,lng:-117.3962,pop:331000,tier:'large'},
  {name:'Corpus Christi',lat:27.8006,lng:-97.3964,pop:317000,tier:'medium'},
  {name:'Lexington',lat:38.0406,lng:-84.5037,pop:323000,tier:'medium'},
  {name:'Stockton',lat:37.9577,lng:-121.2908,pop:320000,tier:'medium'},
  {name:'St. Louis',lat:38.6270,lng:-90.1994,pop:301000,tier:'medium'},
  {name:'Saint Paul',lat:44.9537,lng:-93.0900,pop:311000,tier:'medium'},
  {name:'Cincinnati',lat:39.1031,lng:-84.5120,pop:309000,tier:'medium'},
  {name:'Pittsburgh',lat:40.4406,lng:-79.9959,pop:303000,tier:'medium'},
  {name:'Greensboro',lat:36.0726,lng:-79.7920,pop:296000,tier:'medium'},
  {name:'Anchorage',lat:61.2181,lng:-149.9003,pop:291000,tier:'medium'},
  {name:'Plano',lat:33.0198,lng:-96.6989,pop:288000,tier:'medium'},
  {name:'Lincoln',lat:40.8136,lng:-96.7026,pop:291000,tier:'medium'},
  {name:'Orlando',lat:28.5383,lng:-81.3792,pop:307000,tier:'medium'},
  {name:'Irvine',lat:33.6846,lng:-117.8265,pop:307000,tier:'medium'},
  {name:'Newark',lat:40.7357,lng:-74.1724,pop:305000,tier:'medium'},
  {name:'Durham',lat:35.9940,lng:-78.8986,pop:285000,tier:'medium'},
  {name:'Chula Vista',lat:32.6401,lng:-117.0842,pop:275000,tier:'medium'},
  {name:'Toledo',lat:41.6528,lng:-83.5379,pop:265000,tier:'medium'},
  {name:'Fort Wayne',lat:41.0793,lng:-85.1394,pop:265000,tier:'medium'},
  {name:'St. Petersburg',lat:27.7676,lng:-82.6403,pop:258000,tier:'medium'},
  {name:'Laredo',lat:27.5306,lng:-99.4803,pop:256000,tier:'medium'},
  {name:'Jersey City',lat:40.7178,lng:-74.0431,pop:262000,tier:'medium'},
  {name:'Chandler',lat:33.3062,lng:-111.8413,pop:261000,tier:'medium'},
  {name:'Madison',lat:43.0731,lng:-89.4012,pop:269000,tier:'medium'},
  {name:'Buffalo',lat:42.8864,lng:-78.8784,pop:278000,tier:'medium'},
  {name:'Reno',lat:39.5296,lng:-119.8138,pop:264000,tier:'medium'},
  {name:'Gilbert',lat:33.3528,lng:-111.7890,pop:267000,tier:'medium'},
  {name:'Norfolk',lat:36.8508,lng:-76.2859,pop:238000,tier:'medium'},
  {name:'Boise',lat:43.6150,lng:-116.2023,pop:235000,tier:'medium'},
  {name:'Spokane',lat:47.6588,lng:-117.4260,pop:230000,tier:'medium'},
  {name:'Richmond',lat:37.5407,lng:-77.4360,pop:226000,tier:'medium'},
  {name:'Baton Rouge',lat:30.4515,lng:-91.1871,pop:220000,tier:'medium'},
  {name:'Billings',lat:45.7833,lng:-108.5007,pop:117000,tier:'small'},
  {name:'Flagstaff',lat:35.1983,lng:-111.6513,pop:76000,tier:'small'},
  {name:'Bozeman',lat:45.6770,lng:-111.0429,pop:53000,tier:'small'},
];

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLng = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function findNearestMetro(lat, lng) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const m of MAJOR_METROS) {
    const dist = haversine(lat, lng, m.lat, m.lng) / 1609.34;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = m;
    }
  }
  return { metro: nearest, distanceMiles: nearestDist };
}

// GET /api/game/validate-location - validate HQ placement by highway proximity
router.get('/validate-location', async (req, res) => {
  try {
    const { lat, lng, state } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
    const latF = parseFloat(lat);
    const lngF = parseFloat(lng);
    // Highway proximity check using local DB (no external API, no rate limits)
    const maxRadius = 4828; // 3 miles in meters
    const bboxDeg = 0.08; // ~5 miles bounding box for pre-filter
    const hwLabels = { motorway: 'Interstate', trunk: 'US Route', primary: 'State Route' };

    const hwResult = await pool.query(
      `SELECT highway_type, ref, name,
        (2 * 6371000 * asin(sqrt(
          sin(radians(($1 - lat) / 2))^2 +
          cos(radians($1)) * cos(radians(lat)) *
          sin(radians(($2 - lng) / 2))^2
        ))) AS dist_meters
       FROM us_highways
       WHERE lat BETWEEN $1 - $3 AND $1 + $3
         AND lng BETWEEN $2 - $3 AND $2 + $3
       ORDER BY dist_meters ASC
       LIMIT 1`,
      [latF, lngF, bboxDeg]
    );

    const hwRow = hwResult.rows[0] || null;
    const nearestDist = hwRow ? parseFloat(hwRow.dist_meters) : Infinity;
    const nearest = hwRow ? { type: hwRow.highway_type, ref: hwRow.ref, name: hwRow.name } : null;
    const distMiles = nearest ? (nearestDist / 1609.34).toFixed(1) : null;
    const hwLabel = nearest ? (hwLabels[nearest.type] || 'Highway') : 'Major highway';
    const hwName = nearest ? (nearest.ref || nearest.name || hwLabel) : null;
    const dbHasData = hwResult.rows.length > 0 || (await pool.query('SELECT COUNT(*) as c FROM us_highways')).rows[0].c > 0;

    if (!dbHasData) {
      console.log('Highway DB empty - skipping check for', latF, lngF);
    } else if (!nearest || nearestDist > maxRadius) {
      return res.json({
        valid: false,
        message: hwName
          ? hwName + ' is ' + distMiles + ' miles away. Must be within 3 miles of an Interstate, US Route, or State Route.'
          : 'No major highway found within 3 miles. Choose a location closer to an Interstate, US Route, or State Route.'
      });
    }
    const mapboxKey = process.env.MAPBOX_API_KEY;

    // Check if the click point is over a body of water (ocean, lake, river, pond, beach)
    try {
      const waterUrl = 'https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/' + lngF + ',' + latF + '.json?radius=10&layers=water,waterway&access_token=' + mapboxKey;
      const waterRes = await fetch(waterUrl);
      const waterData = await waterRes.json();
      if (waterData.features && waterData.features.length > 0) {
        return res.json({
          valid: false,
          message: 'This location is over water. Choose a location on dry land for your company HQ.'
        });
      }
    } catch (e) {
      console.error('Water check error:', e.message);
    }

    // Check against known major US ports/spaceports (OSM tagging unreliable for these)
    for (const port of MAJOR_PORTS) {
      const portDist = haversine(latF, lngF, port.lat, port.lng);
      if (portDist <= port.radius) {
        return res.json({
          valid: false,
          message: 'This location is within ' + port.name + '. Choose a different site for your company HQ.'
        });
      }
    }

    // Check for forbidden zones (airports, rail yards, hospitals, parks, monuments, protected land, etc.)
    try {
      const forbiddenQuery = '[out:json][timeout:10];(' +
        'way["aeroway"](around:300,' + latF + ',' + lngF + ');' +
        'way["railway"~"station|yard"](around:200,' + latF + ',' + lngF + ');' +
        'way["amenity"~"hospital|police|fire_station"](around:150,' + latF + ',' + lngF + ');' +
        'way["leisure"~"park|nature_reserve"](around:150,' + latF + ',' + lngF + ');' +
        'way["boundary"="protected_area"](around:200,' + latF + ',' + lngF + ');' +
        'way["historic"](around:150,' + latF + ',' + lngF + ');' +
        'way["landuse"~"military|cemetery"](around:200,' + latF + ',' + lngF + ');' +
        'way["military"](around:300,' + latF + ',' + lngF + ');' +
        'way["harbour"](around:300,' + latF + ',' + lngF + ');' +
        'way["man_made"="pier"](around:200,' + latF + ',' + lngF + ');' +
        'way["landuse"="port"](around:300,' + latF + ',' + lngF + ');' +
        'way["industrial"="port"](around:300,' + latF + ',' + lngF + ');' +
        ');out tags 1;';
      const forbiddenRes = await new Promise((resolve) => {
        const req = require('https').request({
          hostname: 'overpass-api.de',
          path: '/api/interpreter',
          method: 'POST',
          headers: { 'Content-Type': 'text/plain', 'Accept': 'application/json', 'User-Agent': 'FreightEmpire/1.0 (game; contact@merimarkdigital.com)' }
        }, (r) => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.write('data=' + forbiddenQuery);
        req.end();
      });

      const hit = forbiddenRes && forbiddenRes.elements && forbiddenRes.elements[0];
      if (hit) {
        const tags = hit.tags || {};
        let reason = 'a restricted area';
        if (tags.aeroway) reason = 'an airport';
        else if (tags.railway) reason = 'a rail yard or station';
        else if (tags.amenity === 'hospital') reason = 'a hospital';
        else if (tags.amenity === 'police') reason = 'a police station';
        else if (tags.amenity === 'fire_station') reason = 'a fire station';
        else if (tags.leisure) reason = 'a park or protected natural area';
        else if (tags.boundary === 'protected_area') reason = 'protected land';
        else if (tags.historic) reason = 'a historic site or monument';
        else if (tags.landuse === 'military' || tags.military) reason = 'military property';
        else if (tags.landuse === 'cemetery') reason = 'a cemetery';
        else if (tags.harbour || tags.man_made === 'pier' || tags.landuse === 'port' || tags.industrial === 'port') reason = 'a port or harbor facility';

        return res.json({
          valid: false,
          message: 'This location is too close to ' + reason + '. Choose a different site for your company HQ.'
        });
      }
    } catch (e) {
      console.error('Forbidden zone check error:', e.message);
    }

    // Check landuse tags - only block purely residential areas
    try {
      const landQuery = '[out:json][timeout:10];way["landuse"](around:100,' + latF + ',' + lngF + ');out tags 10;';
      const landRes = await new Promise((resolve) => {
        const req = require('https').request({
          hostname: 'overpass-api.de',
          path: '/api/interpreter',
          method: 'POST',
          headers: { 'Content-Type': 'text/plain', 'Accept': 'application/json', 'User-Agent': 'FreightEmpire/1.0 (game; contact@merimarkdigital.com)' }
        }, (r) => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } });
        });
        req.on('error', () => resolve(null));
        req.write('data=' + landQuery);
        req.end();
      });
      if (landRes && landRes.elements && landRes.elements.length > 0) {
        const landuses = landRes.elements.map(e => e.tags && e.tags.landuse).filter(Boolean);
        const ALLOWED = ['industrial','commercial','brownfield','warehouse','retail','mixed','construction'];
        const hasBlocked = landuses.some(l => l === 'residential');
        const hasAllowed = landuses.some(l => ALLOWED.includes(l));
        if (hasBlocked && !hasAllowed) {
          return res.json({
            valid: false,
            message: 'This location is in a residential area. Choose an industrial, commercial, or undeveloped site for your company HQ.'
          });
        }
      }
    } catch (e) {
      console.error('Landuse check error:', e.message);
    }

    const geoUrl = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + lngF + ',' + latF + '.json?access_token=' + mapboxKey + '&country=us&types=address';
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    let address = null;
    let hqCity = null, hqState = null, hqZip = null, hqCounty = null, hqNeighborhood = null;
    const feature = geoData.features && geoData.features[0];
    if (feature) {
      const context = feature.context || [];
      const postcodeCtx = context.find(c => c.id && c.id.startsWith('postcode'));
      const placeCtx = context.find(c => c.id && c.id.startsWith('place'));
      const regionCtx = context.find(c => c.id && c.id.startsWith('region'));
      const districtCtx = context.find(c => c.id && c.id.startsWith('district'));
      const neighborhoodCtx = context.find(c => c.id && c.id.startsWith('neighborhood'));
      const streetName = feature.text || 'Industrial Blvd';
      const streetNum = (Math.abs(Math.round(latF * lngF * 100)) % 8900) + 100;
      hqZip = postcodeCtx ? postcodeCtx.text : generateZip(state);
      hqCity = placeCtx ? placeCtx.text : '';
      hqState = regionCtx ? (regionCtx.short_code ? regionCtx.short_code.replace('US-', '') : (state || '')) : (state || '');
      hqCounty = districtCtx ? districtCtx.text : null;
      hqNeighborhood = neighborhoodCtx ? neighborhoodCtx.text : null;
      address = streetNum + ' ' + streetName + ', ' + hqCity + ', ' + hqState + ' ' + hqZip;
    } else {
      hqZip = generateZip(state);
      hqState = state || null;
      address = (Math.floor(Math.random() * 8900) + 100) + ' Industrial Blvd, ' + hqZip;
    }
    // Determine city tier using nearest major metro (population-based, reliable for odd geography)
    let cityTier = 'rural';
    let landValue = 3000;
    let distFromCenter = 0;
    let landValueSource = 'synthetic';
    const tierBaseValues = { metro: 200000, large: 120000, medium: 60000, small: 15000, rural: 3000 };

    const { metro: nearestMetro, distanceMiles: distToMetro } = findNearestMetro(latF, lngF);

    const tierOrder = ['rural', 'small', 'medium', 'large', 'metro'];

    if (nearestMetro && distToMetro <= 30) {
      distFromCenter = distToMetro;
      const maxTierIndex = tierOrder.indexOf(nearestMetro.tier);
      // Step down one tier rank approximately every 6 miles from center
      const stepsDown = Math.floor(distToMetro / 6);
      const effectiveTierIndex = Math.max(0, maxTierIndex - stepsDown);
      cityTier = tierOrder[effectiveTierIndex];
      landValue = Math.round(tierBaseValues[cityTier] / (1 + distFromCenter / 3));
    } else {
      try {
        if (hqCity) {
          const placeUrl = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + encodeURIComponent(hqCity + ', ' + (hqState || '')) + '.json?access_token=' + mapboxKey + '&country=us&types=place&limit=1';
          const placeRes = await fetch(placeUrl);
          const placeData = await placeRes.json();
          const placeFeature = placeData.features && placeData.features[0];
          if (placeFeature && placeFeature.bbox) {
            const [w, s, e, n] = placeFeature.bbox;
            const milesPerDegLat = 69;
            const milesPerDegLng = 69 * Math.cos(((s + n) / 2) * Math.PI / 180);
            const widthMiles = Math.abs(e - w) * milesPerDegLng;
            const heightMiles = Math.abs(n - s) * milesPerDegLat;
            const areaSqMi = widthMiles * heightMiles;

            if (areaSqMi >= 80) { cityTier = 'medium'; landValue = tierBaseValues.medium; }
            else if (areaSqMi >= 20) { cityTier = 'small'; landValue = tierBaseValues.small; }
            else { cityTier = 'rural'; landValue = tierBaseValues.rural; }

            const centerLng = (w + e) / 2;
            const centerLat = (s + n) / 2;
            distFromCenter = haversine(latF, lngF, centerLat, centerLng) / 1609.34;
            landValue = Math.round(landValue / (1 + distFromCenter / 3));
          }
        }
      } catch (e) {
        console.error('City tier lookup error:', e.message);
      }
    }

    // Override with real county land value data if available (more accurate than synthetic formula)
    const realCountyData = lookupCountyLandValue(hqCounty, hqState);
    if (realCountyData) {
      landValue = realCountyData.landPerAcre;
      landValueSource = 'county_data';
    }

    let freightAdvisory = null;
    if (distToMetro > 80) {
      freightAdvisory = 'This location is ' + Math.round(distToMetro) + ' miles from ' + (nearestMetro ? nearestMetro.name : 'the nearest major metro') + '. Expect long deadhead distances and limited freight volume in this area.';
    } else if (distToMetro > 40) {
      freightAdvisory = 'This location is ' + Math.round(distToMetro) + ' miles from ' + (nearestMetro ? nearestMetro.name : 'the nearest major metro') + '. Freight options may be lighter than major freight corridors.';
    }

    const lotSizes = { rural: 2, small: 3, medium: 4, large: 5, metro: 6 };
    const lotSizeAcres = lotSizes[cityTier] || 2;
    const totalLandCost = Math.round(landValue * lotSizeAcres);

    res.json({
      valid: true, address,
      nearestHighway: (nearest && dbHasData) ? hwName : null,
      highwayType: (nearest && dbHasData) ? hwLabel : null,
      distanceMiles: (nearest && dbHasData) ? distMiles : null,
      hqCity, hqState, hqZip, hqCounty, hqNeighborhood,
      cityTier, landValuePerAcre: landValue, landValueSource, distanceFromCenterMiles: distFromCenter.toFixed(1),
      lotSizeAcres, totalLandCost, freightAdvisory, nearestMetroName: nearestMetro ? nearestMetro.name : null
    });
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
module.exports.generateDriverCandidate = generateDriverCandidate;
module.exports.generateJobApplicant = generateJobApplicant;
module.exports.pickRandom = pickRandom;
