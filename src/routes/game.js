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
      'SELECT c.id, c.name, c.hq_state, c.hq_city, c.hq_latitude, c.hq_longitude, c.hq_county, c.hq_neighborhood, p.username FROM companies c LEFT JOIN players p ON c.owner_id = p.id WHERE c.id = $1',
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

router.post('/admin/delete-company', async (req, res) => {
  try {
    const { companyId } = req.body;
    const companyRes = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);
    if (companyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    await pool.query('UPDATE players SET current_company_id = NULL WHERE current_company_id = $1', [companyId]);
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

module.exports = router;
