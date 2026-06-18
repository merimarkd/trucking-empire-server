const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/connection');

const router = express.Router();

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'freight-empire-secret-key-change-in-production';

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const existingUser = await pool.query('SELECT id FROM players WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    
    // Generate unique username from email
    let baseUsername = email.split('@')[0];
    let username = baseUsername;
    let counter = 1;
    
    while (true) {
      const existingUsername = await pool.query('SELECT id FROM players WHERE username = $1', [username]);
      if (existingUsername.rows.length === 0) break;
      username = baseUsername + counter;
      counter++;
    }
    
    const result = await pool.query(
      'INSERT INTO players (username, email, personal_credit_score) VALUES ($1, $2, $3) RETURNING id',
      [username, email, 650]
    );
    
    const token = require('jsonwebtoken').sign({ playerId: result.rows[0].id }, 'freight-empire-secret-key-change-in-production');
    res.json({ token });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const result = await pool.query('SELECT id, password_hash FROM players WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ playerId: user.id }, JWT_SECRET);
    await pool.query('UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE email = $1', [email]);
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }
    
    const token = authHeader.substring(7);
    const decoded = require('jsonwebtoken').verify(token, 'freight-empire-secret-key-change-in-production');
    const ownerId = decoded.playerId;
    
    const { name, hqCity, hqState, hqLatitude, hqLongitude } = req.body;
    
    if (!name || !ownerId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const companiesResult = await pool.query(
      'SELECT COUNT(*) as count FROM companies WHERE owner_id = $1',
      [ownerId]
    );
    
    if (parseInt(companiesResult.rows[0].count) >= 3) {
      return res.status(400).json({ error: 'Player already owns 3 companies. Maximum limit reached.' });
    }
    
    
// Generate realistic USDOT (8 digits) and MC (7 digits) numbers
const dotNumber = String(Math.floor(Math.random() * 90000000) + 10000000); // 8-digit number
const mcNumber = String(Math.floor(Math.random() * 9000000) + 1000000); // 7-digit number

const companyResult = await pool.query(
     'INSERT INTO companies (name, dot_number, mc_number, owner_id, cash, hq_state) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
     [name, dotNumber, mcNumber, ownerId, 500000, hqState]
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
    res.status(500).json({ error: error.message });
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

/**
 * GET /api/auth/search-cities?q=query
 * Search for US cities via Mapbox Geocoding API
 */
router.get('/search-cities', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const mapboxKey = process.env.MAPBOX_API_KEY;
    if (!mapboxKey) {
      return res.status(500).json({ error: 'Mapbox key not configured' });
    }

    const query = encodeURIComponent(`${q}, USA`);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxKey}&country=us&limit=10`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      return res.json({ cities: [] });
    }

    const cities = data.features
      .filter(feature => {
        const types = feature.place_type || [];
        return types.includes('place');
      })
      .map(feature => ({
        name: feature.place_name,
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        id: feature.id
      }))
      .slice(0, 10);

    res.json({ cities });
  } catch (error) {
    console.error('Error searching cities:', error);
    res.status(500).json({ error: 'Failed to search cities' });
  }
});

// Admin: Get all players
router.get('/admin/players', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id, p.username, p.email, p.personal_credit_score, p.current_company_id, p.created_at,
        c.name as company_name
      FROM players p
      LEFT JOIN companies c ON p.current_company_id = c.id
      ORDER BY p.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current player from JWT token
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing token' });
    }
    
    const token = authHeader.substring(7);
    const decoded = require('jsonwebtoken').verify(token, 'freight-empire-secret-key-change-in-production');
    const result = await pool.query('SELECT id, username, email, personal_credit_score, current_company_id FROM players WHERE id = $1', [decoded.playerId]);
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
