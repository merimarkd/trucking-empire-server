const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  console.log('✓ Database pool connected');
});

pool.on('error', (err) => {
  console.error('✗ Unexpected error on idle client', err);
});

// Initialize database schema
async function initDatabase() {
  try {
    // Check if basic tables exist, create if not
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        dot_number VARCHAR(20) UNIQUE NOT NULL,
        mc_number VARCHAR(20) UNIQUE NOT NULL,
        owner_id UUID NOT NULL,
        cash DECIMAL(15, 2) DEFAULT 500000.00,
        iss_score INT DEFAULT 50,
        iss_tier VARCHAR(50) DEFAULT 'Optional',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        personal_credit_score INT DEFAULT 650,
        company_id UUID REFERENCES companies(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS trucks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        vehicle_type VARCHAR(50) NOT NULL,
        purchase_price DECIMAL(15, 2) NOT NULL,
        fuel_level DECIMAL(10, 2) DEFAULT 100,
        current_lat DECIMAL(10, 6),
        current_lon DECIMAL(10, 6),
        driver_id UUID,
        load_id UUID,
        maintenance_status VARCHAR(50) DEFAULT 'operational',
        mileage INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        name VARCHAR(255) NOT NULL,
        wage_per_mile DECIMAL(10, 2) NOT NULL,
        wage_accrued DECIMAL(15, 2) DEFAULT 0,
        hos_hours_remaining INT DEFAULT 11,
        hos_weekly_remaining INT DEFAULT 70,
        status VARCHAR(50) DEFAULT 'available',
        current_lat DECIMAL(10, 6),
        current_lon DECIMAL(10, 6),
        violations_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS loads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        cargo_type VARCHAR(100) NOT NULL,
        rate_per_mile DECIMAL(10, 2) NOT NULL,
        pickup_location VARCHAR(255) NOT NULL,
        dropoff_location VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        truck_id UUID,
        distance_miles DECIMAL(10, 2),
        revenue DECIMAL(15, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✓ Database tables initialized');
  } catch (err) {
    console.error('✗ Database initialization error:', err);
    throw err;
  }
}

module.exports = { pool, initDatabase };
