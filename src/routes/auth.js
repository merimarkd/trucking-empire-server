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
  const { username, email, companyName } = req.body;

  if (!username || !email || !companyName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const playerId = uuidv4();
    const companyId = uuidv4();
    const dotNumber = generateDOTNumber();
    const mcNumber = generateMCNumber();

    // Insert company
    await pool.query(
      `INSERT INTO companies (id, name, dot_number, mc_number, owner_id, cash)
       VALUES ($1, $2, $3, $4, $5, 500000)`,
      [companyId, companyName, dotNumber, mcNumber, playerId]
    );

    // Insert player
    await pool.query(
      `INSERT INTO players (id, username, email, company_id, personal_credit_score)
       VALUES ($1, $2, $3, $4, 650)`,
      [playerId, username, email, companyId]
    );

    res.json({
      success: true,
      playerId,
      companyId,
      dotNumber,
      mcNumber,
      initialCash: 500000,
      message: 'Company created successfully'
    });
  } catch (err) {
    console.error('Company creation error:', err);
    res.status(500).json({ error: err.message });
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

module.exports = router;
