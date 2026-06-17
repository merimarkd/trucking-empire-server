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
router.post('/admin/delete-company', async (req, res) => {
  try {
    const { companyId, reason } = req.body;
    
    // Get company details
    const companyRes = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);
    if (companyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const company = companyRes.rows[0];
    
    // Create auction at 50% value
    const auctionPrice = parseFloat(company.cash) * 0.5;
    await pool.query(`
      INSERT INTO company_auctions (company_id, company_name, original_owner_id, starting_price, current_price)
      VALUES ($1, $2, $3, $4, $5)
    `, [companyId, company.name, company.owner_id, auctionPrice, auctionPrice]);
    
    // Delete company (will cascade delete related data)
    await pool.query('DELETE FROM companies WHERE id = $1', [companyId]);
    
    res.json({ success: true, message: 'Company deleted and auctioned' });
  } catch (error) {
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
      INSERT INTO deleted_players_history (username, email, personal_credit_score, deletion_reason, deletion_notes, auto_purge_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [player.username, player.email, player.personal_credit_score, reason, notes, purgeDate]);
    
    // Step 5: Add to banned list
    await pool.query(`
      INSERT INTO banned_players (email, reason)
      VALUES ($1, $2)
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

module.exports = router;
