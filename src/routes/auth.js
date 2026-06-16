const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/connection');

const router = express.Router();

// Generate unique DOT number (8 digits)
function generateDOTNumber() {
  return Math.random().toString().substring(2, 10);
}

// Generate unique MC number (7 digits)
function generateMCNumber() {
  return Math.random().toString().substring(2, 9);
}

// Create company + player on first login
router.post('/create-company', async (req, res) => {
  try {
    const { name, dotNumber, mcNumber, ownerId } = req.body;

    if (!name || !ownerId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const companiesResult = await pool.query(
      'SELECT COUNT(*) as count FROM companies WHERE owner_id = $1',
      [ownerId]
    );
    const companyCount = parseInt(companiesResult.rows[0].count);

    if (companyCount >= 3) {
      return res.status(400).json({ 
        error: 'Player already owns 3 companies. Maximum limit reached.' 
      });
    }

    const companyResult = await pool.query(
      'INSERT INTO companies (name, dot_number, mc_number, owner_id, cash) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, dotNumber || null, mcNumber || null, ownerId, 500000]
    );
    const company = companyResult.rows[0];

    await pool.query(
      'INSERT INTO company_statistics (company_id, company_created_at) VALUES ($1, $2)',
      [company.id, new Date()]
    );

    await pool.query(
      'UPDATE players SET current_company_id = $1 WHERE id = $2',
      [company.id, ownerId]
    );

    res.json(company);
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// Load existing company
router.post('/load-company', async (req, res) => {
  const { playerId } = req.body;
  if (!playerId) {
    return res.status(400).json({ error: 'playerId required' });
  }

  try {
    const result = await pool.query(
      `SELECT p.*, c.* FROM players p
       JOIN companies c ON p.company_id = c.id
       WHERE p.id = $1`,
      [playerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const player = result.rows[0];

    res.json({
      success: true,
      playerId: player.id,
      companyId: player.company_id,
      companyName: player.name,
      dotNumber: player.dot_number,
      mcNumber: player.mc_number,
      cash: parseFloat(player.cash),
      issScore: player.iss_score,
      issTier: player.iss_tier
    });
  } catch (err) {
    console.error('Load company error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get player state (full company data)
router.get('/player/:playerId', async (req, res) => {
  const { playerId } = req.params;

  try {
    const playerResult = await pool.query(
      'SELECT * FROM players WHERE id = $1',
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const companyId = playerResult.rows[0].company_id;

    // Fetch all company data
    const companyResult = await pool.query(
      'SELECT * FROM companies WHERE id = $1',
      [companyId]
    );

    const trucksResult = await pool.query(
      'SELECT * FROM trucks WHERE company_id = $1',
      [companyId]
    );

    const driversResult = await pool.query(
      'SELECT * FROM drivers WHERE company_id = $1',
      [companyId]
    );

    const loadsResult = await pool.query(
      'SELECT * FROM loads WHERE company_id = $1',
      [companyId]
    );

    res.json({
      player: playerResult.rows[0],
      company: companyResult.rows[0],
      trucks: trucksResult.rows,
      drivers: driversResult.rows,
      loads: loadsResult.rows
    });
  } catch (err) {
    console.error('Get player error:', err);
    res.status(500).json({ error: err.message });
  }
});
router.post('/switch-company', async (req, res) => {
  try {
    const { playerId, companyId } = req.body;

    if (!playerId || !companyId) {
      return res.status(400).json({ error: 'Missing playerId or companyId' });
    }

    const ownerCheck = await pool.query(
      'SELECT owner_id FROM companies WHERE id = $1',
      [companyId]
    );

    if (!ownerCheck.rows[0] || ownerCheck.rows[0].owner_id !== playerId) {
      return res.status(403).json({ error: 'You do not own this company' });
    }

    const result = await pool.query(
      'UPDATE players SET current_company_id = $1 WHERE id = $2 RETURNING *',
      [companyId, playerId]
    );

    res.json({ 
      success: true, 
      message: `Switched to company ${companyId}`,
      player: result.rows[0]
    });
  } catch (error) {
    console.error('Error switching company:', error);
    res.status(500).json({ error: 'Failed to switch company' });
  }
});
module.exports = router;
