const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
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

console.log('✓ Creating company_statistics table...');
  
  await pool.query(`
    ALTER TABLE players ADD COLUMN IF NOT EXISTS current_company_id UUID REFERENCES companies(id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_statistics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
      total_revenue DECIMAL(15, 2) DEFAULT 0,
      total_costs DECIMAL(15, 2) DEFAULT 0,
      total_wages_paid DECIMAL(15, 2) DEFAULT 0,
      total_fuel_costs DECIMAL(15, 2) DEFAULT 0,
      total_maintenance_costs DECIMAL(15, 2) DEFAULT 0,
      total_loan_payments DECIMAL(15, 2) DEFAULT 0,
      total_interest_paid DECIMAL(15, 2) DEFAULT 0,
      peak_cash DECIMAL(15, 2) DEFAULT 0,
      lowest_cash DECIMAL(15, 2) DEFAULT 0,
      current_profitability DECIMAL(15, 2) DEFAULT 0,
      average_monthly_profit DECIMAL(15, 2) DEFAULT 0,
      best_month_revenue DECIMAL(15, 2) DEFAULT 0,
      worst_month_revenue DECIMAL(15, 2) DEFAULT 0,
      total_miles_driven DECIMAL(15, 2) DEFAULT 0,
      total_loads_completed INT DEFAULT 0,
      total_loads_abandoned INT DEFAULT 0,
      total_fuel_consumed DECIMAL(15, 2) DEFAULT 0,
      average_fuel_economy DECIMAL(10, 2) DEFAULT 0,
      total_trucks_owned INT DEFAULT 0,
      total_trucks_sold INT DEFAULT 0,
      total_trucks_lost INT DEFAULT 0,
      current_truck_count INT DEFAULT 0,
      average_miles_per_truck DECIMAL(15, 2) DEFAULT 0,
      average_load_profit DECIMAL(15, 2) DEFAULT 0,
      fleet_uptime_percent DECIMAL(5, 2) DEFAULT 100,
      load_success_rate DECIMAL(5, 2) DEFAULT 100,
      total_employees_hired INT DEFAULT 0,
      total_drivers_hired INT DEFAULT 0,
      total_dispatchers_hired INT DEFAULT 0,
      total_mechanics_hired INT DEFAULT 0,
      total_staff_hired INT DEFAULT 0,
      total_employees_fired INT DEFAULT 0,
      total_employees_quit INT DEFAULT 0,
      total_employees_lost INT DEFAULT 0,
      current_employee_count INT DEFAULT 0,
      current_driver_count INT DEFAULT 0,
      current_dispatcher_count INT DEFAULT 0,
      current_mechanic_count INT DEFAULT 0,
      current_staff_count INT DEFAULT 0,
      average_driver_retention_days INT DEFAULT 0,
      total_wages_per_employee DECIMAL(15, 2) DEFAULT 0,
      average_wage_per_mile DECIMAL(10, 4) DEFAULT 0,
      total_violations INT DEFAULT 0,
      total_oos_orders INT DEFAULT 0,
      total_inspections INT DEFAULT 0,
      inspection_pass_rate DECIMAL(5, 2) DEFAULT 100,
      total_hos_violations INT DEFAULT 0,
      total_unsafe_driving_violations INT DEFAULT 0,
      total_maintenance_violations INT DEFAULT 0,
      total_substance_violations INT DEFAULT 0,
      current_violations_open INT DEFAULT 0,
      current_caps_active INT DEFAULT 0,
      audit_failures INT DEFAULT 0,
      new_entrant_audit_status VARCHAR(50),
      current_iss_score INT DEFAULT 50,
      current_iss_tier VARCHAR(50) DEFAULT 'Optional',
      company_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      days_in_operation INT DEFAULT 0,
      hours_in_operation INT DEFAULT 0,
      minutes_in_operation INT DEFAULT 0,
      seconds_in_operation INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_company_statistics_company_id ON company_statistics(company_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_company_statistics_updated_at ON company_statistics(updated_at DESC)`);

  console.log('✓ Company statistics table initialized');
}

module.exports = { pool, initDatabase };
