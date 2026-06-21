const { pool } = require('./connection');

async function runMigrations() {
  try {
    // Add is_admin column to players
    await pool.query(`
      ALTER TABLE players 
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE
    `);
    console.log('✓ Migration: Added is_admin column to players');

    // Add password_hash column to players
    await pool.query(`
      ALTER TABLE players
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)
    `);
    console.log('✓ Migration: Added password_hash to players');

    // Add last_login to players
    await pool.query(`
      ALTER TABLE players 
      ADD COLUMN IF NOT EXISTS last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('✓ Migration: Added last_login to players');

    // Add current_company_id column to players
    await pool.query(`
      ALTER TABLE players
      ADD COLUMN IF NOT EXISTS current_company_id UUID
    `);
    console.log('✓ Migration: Added current_company_id to players');

    // Create deleted_players_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deleted_players_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255),
        email VARCHAR(255),
        personal_credit_score INT,
        deletion_reason VARCHAR(50),
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_by_admin_id UUID,
        deletion_notes TEXT,
        auto_purge_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Migration: Created deleted_players_history table');

    // Create banned_players table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS banned_players (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        reason VARCHAR(500),
        banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Migration: Created banned_players table');

    // Create loans table
await pool.query(`
  CREATE TABLE IF NOT EXISTS loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    principal DECIMAL(15, 2) NOT NULL,
    balance_remaining DECIMAL(15, 2) NOT NULL,
    interest_rate DECIMAL(5, 2) NOT NULL,
    monthly_payment DECIMAL(15, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    originated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    maturity_date TIMESTAMP,
    next_payment_due TIMESTAMP,
    last_payment_date TIMESTAMP,
    total_payments_made INT DEFAULT 0,
    total_interest_paid DECIMAL(15, 2) DEFAULT 0,
    days_past_due INT DEFAULT 0,
    payments_missed INT DEFAULT 0,
    auto_pay_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✓ Migration: Created loans table');

// Create loan_payments table
await pool.query(`
  CREATE TABLE IF NOT EXISTS loan_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    amount DECIMAL(15, 2) NOT NULL,
    principal_portion DECIMAL(15, 2),
    interest_portion DECIMAL(15, 2),
    payment_status VARCHAR(50),
    due_date TIMESTAMP,
    payment_date TIMESTAMP,
    days_late INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✓ Migration: Created loan_payments table');

// Create transactions table
await pool.query(`
  CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    transaction_type VARCHAR(100),
    amount DECIMAL(15, 2),
    loan_id UUID REFERENCES loans(id),
    description TEXT,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✓ Migration: Created transactions table');

// Create compliance_strikes table
await pool.query(`
  CREATE TABLE IF NOT EXISTS compliance_strikes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    strike_number INT,
    reason VARCHAR(255),
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lockout_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✓ Migration: Created compliance_strikes table');

// Allow owner_id to be NULL for orphaned companies
await pool.query(`
  ALTER TABLE companies
  ALTER COLUMN owner_id DROP NOT NULL
`);

// Track previous owner of orphaned companies
await pool.query(`
  ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS previous_owner_id UUID
`);
console.log('✓ Migration: Added previous_owner_id to companies');

// Add HQ state for timezone tracking
await pool.query(`
  ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS hq_state VARCHAR(2)
`);
console.log('✓ Migration: Added hq_state to companies');

// Create drivers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        username VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Migration: Created drivers table');

    // Set owner account (one-time setup)
    await pool.query(`
      UPDATE players SET credentials = 'owner' WHERE email = 'ahelsleyy@gmail.com'
    `);
    console.log('✓ Setup: Owner account configured');

    // Create owner admin account
    const bcrypt = require('bcrypt');
    const hashedAdminPassword = await bcrypt.hash('344811aAaA!!', 10);
    await pool.query(`
      INSERT INTO admins (email, password_hash, admin_type)
      VALUES ($1, $2, 'owner')
      ON CONFLICT (email) DO NOTHING
    `, ['ahelsleyy@gmail.com', hashedAdminPassword]);
    console.log('✓ Setup: Owner admin account created');

    // Create admins table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        admin_type VARCHAR(50) NOT NULL DEFAULT 'game-admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by_id UUID,
        promoted_to_server_admin_at TIMESTAMP,
        promoted_to_game_admin_at TIMESTAMP,
        promoted_to_senior_admin_at TIMESTAMP,
        CONSTRAINT valid_admin_type CHECK (admin_type IN ('owner', 'senior-admin', 'server-admin', 'game-admin'))
      )
    `);
    console.log('✓ Migration: Created admins table');

  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('✓ Tables already exist');
    } else {
      console.error('Migration error:', error.message);
    }
  }
}

module.exports = { runMigrations };
