const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/connection');
const crypto = require('crypto');

const router = express.Router();

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'freight-empire-secret-key-change-in-production';

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Password validation
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    // Check if email already exists
    const existingUser = await pool.query('SELECT id FROM players WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Check if email is banned
    const bannedEmail = await pool.query('SELECT id FROM banned_players WHERE email = $1', [email]);
    if (bannedEmail.rows.length > 0) {
      return res.status(400).json({ error: 'This email cannot be used' });
    }

    // Generate verification token (24-hour expiry)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Auto-generate username from email
    const username = email.split('@')[0] + '_' + Math.random().toString(36).substring(7);

    // Create player (unverified)
    const newPlayer = await pool.query(
      `INSERT INTO players (username, email, password_hash, email_verified, verification_token, verification_token_expires_at, personal_credit_score, last_login) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
       RETURNING id, username, email`,
      [username, email, hashedPassword, false, verificationToken, tokenExpiresAt, 650]
    );

    // Send verification email
const verificationLink = `https://freightempire.merimarkdigital.com/?verify=${verificationToken}`;

try {
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  await sgMail.send({
        to: email,
        from: {
          email: 'noreply@game.merimarkdigital.com',
          name: 'Freight Empire'
        },
        subject: 'Verify Your Freight Empire Account',
        text: `Welcome to Freight Empire! Verify your email by visiting this link: ${verificationLink} — This link expires in 24 hours. If you did not create this account, ignore this email.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #1f6feb;">Welcome to Freight Empire</h2>
            <p>Thanks for creating your account. Please confirm your email address to activate it.</p>
            <p style="margin: 24px 0;">
              <a href="${verificationLink}" style="background-color: #1f6feb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email Address</a>
            </p>
            <p>Or paste this link into your browser:<br>
            <a href="${verificationLink}">${verificationLink}</a></p>
            <p style="color: #888; font-size: 13px;">This link expires in 24 hours. If you did not create this account, you can safely ignore this email.</p>
          </div>
        `
      });
} catch (emailError) {
  console.error('Failed to send verification email:', emailError);
  return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
}

    res.status(201).json({
      message: 'Account created! Check your email to verify.',
      username: newPlayer.rows[0].username,
      email: newPlayer.rows[0].email
    });

  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// GET /api/auth/verify-email - Verify email and activate account
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Invalid verification link' });
    }

    // Find player with this token
    const player = await pool.query(
      `SELECT id, email FROM players 
       WHERE verification_token = $1 AND verification_token_expires_at > NOW()`,
      [token]
    );

    if (player.rows.length === 0) {
      return res.status(400).json({ error: 'Verification link expired or invalid. Please sign up again.' });
    }

    // Mark as verified and clear token
    await pool.query(
      `UPDATE players 
       SET email_verified = TRUE, verification_token = NULL, verification_token_expires_at = NULL 
       WHERE id = $1`,
      [player.rows[0].id]
    );

    res.json({ 
      message: 'Email verified! You can now log in.',
      email: player.rows[0].email
    });

  } catch (err) {
    console.error('Email verification error:', err);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const user = await pool.query('SELECT id, password_hash, email_verified FROM players WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if email is verified
    if (!user.rows[0].email_verified) {
      return res.status(401).json({ error: 'Please verify your email before logging in' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await pool.query('UPDATE players SET last_login = NOW() WHERE id = $1', [user.rows[0].id]);

    // Create JWT token
    const token = jwt.sign({ playerId: user.rows[0].id }, JWT_SECRET);

    res.json({ token, message: 'Login successful' });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
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
    
    const { name, username, hqCity, hqState, hqLatitude, hqLongitude } = req.body;
    
    if (!name || !username || !ownerId) {
  return res.status(400).json({ error: 'Company name and username are required' });
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
  'UPDATE players SET current_company_id = $1, username = $2 WHERE id = $3',
  [company.id, username, ownerId]
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
      .map(feature => {
        const context = feature.context || [];
        const regionContext = context.find(c => c.id && c.id.startsWith('region'));
        const stateAbbr = regionContext ? regionContext.short_code?.replace('US-', '') : null;
        return {
          name: feature.place_name,
          latitude: feature.geometry.coordinates[1],
          longitude: feature.geometry.coordinates[0],
          id: feature.id,
          state: stateAbbr
        };
      })
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

// POST /api/auth/admin-login
router.post('/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const result = await pool.query('SELECT id, admin_type, password_hash FROM admins WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email or password incorrect' });
    }
    const admin = result.rows[0];
    const bcrypt = require('bcrypt');
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Email or password incorrect' });
    }
    const token = require('jsonwebtoken').sign({ adminId: admin.id, adminType: admin.admin_type }, 'freight-empire-secret-key-change-in-production');
    res.json({ token });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
