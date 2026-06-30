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

    // Add email_verified column to players
    await pool.query(`
      ALTER TABLE players
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE
    `);
    console.log('✓ Migration: Added email_verified to players');

    // Add verification_token column to players
    await pool.query(`
      ALTER TABLE players
      ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)
    `);
    console.log('✓ Migration: Added verification_token to players');

    // Add verification_token_expires_at column to players
    await pool.query(`
      ALTER TABLE players
      ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMP
    `);
    console.log('✓ Migration: Added verification_token_expires_at to players');

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

await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS hq_city VARCHAR(255)`);
    console.log('✓ Migration: Added hq_city to companies');
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS hq_latitude DECIMAL(10,6)`);
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS hq_longitude DECIMAL(10,6)`);
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS hq_county VARCHAR(255)`);
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS hq_neighborhood VARCHAR(255)`);
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS location_latitude DECIMAL(10,6)`);
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS location_longitude DECIMAL(10,6)`);
    console.log('✓ Migration: Added location coordinates to companies');
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS hq_zone VARCHAR(255)`);
    console.log('✓ Migration: Added hq_zone to companies');
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS hq_neighborhood VARCHAR(255)`);
    console.log('✓ Migration: Added hq coordinates to companies');
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS location_latitude DECIMAL(10,7)`);
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS location_longitude DECIMAL(10,7)`);
    console.log('✓ Migration: Added location_latitude and location_longitude to companies');

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

    // Create market_items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS market_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category VARCHAR(100) NOT NULL,
        subcategory VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        base_price DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category, subcategory, name)
      )
    `);
    console.log('✓ Migration: Created market_items table');

    // Create market_orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS market_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL REFERENCES market_items(id),
        company_id UUID NOT NULL REFERENCES companies(id),
        order_type VARCHAR(4) NOT NULL CHECK (order_type IN ('buy', 'sell')),
        quantity INTEGER NOT NULL,
        price_per_unit DECIMAL(15,2) NOT NULL,
        min_quantity INTEGER DEFAULT 1,
        expires_at TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Migration: Created market_orders table');

    // Create market_price_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS market_price_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID NOT NULL REFERENCES market_items(id),
        avg_price DECIMAL(15,2) NOT NULL,
        volume INTEGER DEFAULT 0,
        recorded_date DATE NOT NULL,
        UNIQUE(item_id, recorded_date)
      )
    `);
    console.log('✓ Migration: Created market_price_history table');

    // Clean up duplicate market items
    await pool.query(`
      DELETE FROM market_items
      WHERE id NOT IN (
        SELECT MIN(id::text)::uuid
        FROM market_items
        GROUP BY category, subcategory, name
      )
    `);
    console.log('✓ Migration: Cleaned duplicate market items');

    // Add unique constraint to market_items if not exists
    await pool.query(`
      ALTER TABLE market_items 
      DROP CONSTRAINT IF EXISTS market_items_category_subcategory_name_key;
      ALTER TABLE market_items 
      ADD CONSTRAINT market_items_category_subcategory_name_key 
      UNIQUE (category, subcategory, name);
    `);
    console.log('✓ Migration: Added unique constraint to market_items');

    // Seed initial market items
    await pool.query(`
      INSERT INTO market_items (category, subcategory, name, description, base_price) VALUES
      ('Trucks', 'Kenworth', 'Kenworth T680', 'Long-haul Class 8 sleeper', 185000),
      ('Trucks', 'Kenworth', 'Kenworth W900', 'Iconic long-nose Class 8', 175000),
      ('Trucks', 'Peterbilt', 'Peterbilt 379', 'Classic long-nose Class 8', 170000),
      ('Trucks', 'Peterbilt', 'Peterbilt 389', 'Modern long-nose Class 8', 180000),
      ('Trucks', 'Freightliner', 'Freightliner Cascadia', 'Aerodynamic Class 8 sleeper', 165000),
      ('Trucks', 'Mack', 'Mack Anthem', 'Heavy duty Class 8', 160000),
      ('Trailers', 'Dry Van', '53ft Dry Van', 'Standard enclosed trailer', 45000),
      ('Trailers', 'Reefer', '53ft Refrigerated', 'Temperature controlled trailer', 65000),
      ('Trailers', 'Flatbed', '48ft Flatbed', 'Open deck flatbed trailer', 35000),
      ('Trailers', 'Tanker', 'Fuel Tanker', 'Liquid bulk tanker', 55000),
      ('Trailers', 'Tanker', 'Chemical Tanker', 'Hazmat liquid tanker', 75000),
      ('Fuel', 'Diesel', 'Diesel - National Average', 'National average diesel price per gallon', 3.85),
      ('Parts & Equipment', 'Engine Parts', 'Oil Filter', 'Standard Class 8 oil filter', 45),
      ('Parts & Equipment', 'Engine Parts', 'Air Filter', 'Heavy duty air filter', 85),
      ('Parts & Equipment', 'Engine Parts', 'Fuel Filter', 'Primary fuel filter', 65),
      ('Parts & Equipment', 'Tires', 'Drive Tire 11R22.5', 'Standard drive axle tire', 450),
      ('Parts & Equipment', 'Tires', 'Steer Tire 295/75R22.5', 'Standard steer axle tire', 550)
      ON CONFLICT DO NOTHING
    `);
    console.log('✓ Migration: Seeded market items');

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

    // ===== Truck Equipment System =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS truck_manufacturers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        country VARCHAR(50),
        founded_year INTEGER
      )
    `);
    console.log('✓ Migration: Created truck_manufacturers table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS truck_models (
        id SERIAL PRIMARY KEY,
        manufacturer_id INTEGER REFERENCES truck_manufacturers(id),
        name VARCHAR(100) NOT NULL,
        body_style VARCHAR(50),
        year_start INTEGER,
        year_end INTEGER,
        UNIQUE(manufacturer_id, name)
      )
    `);
    console.log('✓ Migration: Created truck_models table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS truck_trims (
        id SERIAL PRIMARY KEY,
        model_id INTEGER REFERENCES truck_models(id),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        base_price INTEGER,
        UNIQUE(model_id, name)
      )
    `);
    console.log('✓ Migration: Created truck_trims table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS engine_options (
        id SERIAL PRIMARY KEY,
        manufacturer_name VARCHAR(100) NOT NULL,
        model_name VARCHAR(100) NOT NULL,
        displacement_liters DECIMAL(4,1),
        horsepower_range VARCHAR(50),
        torque_range VARCHAR(50),
        UNIQUE(manufacturer_name, model_name)
      )
    `);
    console.log('✓ Migration: Created engine_options table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transmission_options (
        id SERIAL PRIMARY KEY,
        manufacturer_name VARCHAR(100) NOT NULL,
        model_name VARCHAR(100) NOT NULL,
        speeds INTEGER,
        type VARCHAR(50),
        UNIQUE(manufacturer_name, model_name)
      )
    `);
    console.log('✓ Migration: Created transmission_options table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS truck_trim_engines (
        trim_id INTEGER REFERENCES truck_trims(id),
        engine_id INTEGER REFERENCES engine_options(id),
        PRIMARY KEY (trim_id, engine_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS truck_trim_transmissions (
        trim_id INTEGER REFERENCES truck_trims(id),
        transmission_id INTEGER REFERENCES transmission_options(id),
        PRIMARY KEY (trim_id, transmission_id)
      )
    `);
    console.log('✓ Migration: Created truck trim-engine/transmission link tables');

    // Seed manufacturers (fictional names mirroring real-world counterparts)
    await pool.query(`
      INSERT INTO truck_manufacturers (name, country, founded_year) VALUES
      ('Kentworth', 'USA', 1923),
      ('Peterbuilt', 'USA', 1939),
      ('Freightlite', 'USA', 1942),
      ('Volvar Trucks', 'Sweden', 1928),
      ('Mackson', 'USA', 1900),
      ('Continental Trucks', 'USA', 1907),
      ('Western Eagle', 'USA', 1967)
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('✓ Migration: Seeded truck manufacturers');

    // Seed engine options (fictional names mirroring real engine families)
    await pool.query(`
      INSERT INTO engine_options (manufacturer_name, model_name, displacement_liters, horsepower_range, torque_range) VALUES
      ('Cummings', 'X15', 15.0, '400-605 hp', '1450-2050 lb-ft'),
      ('Cummings', 'X12', 11.8, '350-500 hp', '1250-1700 lb-ft'),
      ('Motown Diesel', 'DD13', 12.8, '375-505 hp', '1450-1850 lb-ft'),
      ('Motown Diesel', 'DD15', 14.8, '400-505 hp', '1450-1850 lb-ft'),
      ('Motown Diesel', 'DD16', 15.6, '500-600 hp', '1850-2050 lb-ft'),
      ('PACCO MX', 'MX-11', 10.8, '355-430 hp', '1250-1650 lb-ft'),
      ('PACCO MX', 'MX-13', 12.9, '405-510 hp', '1450-1850 lb-ft'),
      ('Volvar', 'D11', 10.8, '350-425 hp', '1250-1550 lb-ft'),
      ('Volvar', 'D13', 12.8, '375-500 hp', '1450-1850 lb-ft'),
      ('Mackson', 'MP7', 10.8, '325-405 hp', '1200-1560 lb-ft'),
      ('Mackson', 'MP8', 12.8, '405-505 hp', '1460-1860 lb-ft')
      ON CONFLICT (manufacturer_name, model_name) DO NOTHING
    `);
    console.log('✓ Migration: Seeded engine options');

    // Seed transmission options (fictional names mirroring real transmission families)
    await pool.query(`
      INSERT INTO transmission_options (manufacturer_name, model_name, speeds, type) VALUES
      ('Eatonn Fuller', 'Roadranger 10-Speed', 10, 'Manual'),
      ('Eatonn Fuller', 'Roadranger 13-Speed', 13, 'Manual'),
      ('Eatonn Fuller', 'Roadranger 18-Speed', 18, 'Manual'),
      ('Eatonn Fuller', 'Advantage 10-Speed', 10, 'Automated Manual'),
      ('Allisson', '4000 Series', 6, 'Automatic'),
      ('PACCO', 'PACCO AMT', 12, 'Automated Manual'),
      ('Mackson', 'mDrive HD', 14, 'Automated Manual'),
      ('Volvar', 'I-Shift', 12, 'Automated Manual')
      ON CONFLICT (manufacturer_name, model_name) DO NOTHING
    `);
    console.log('✓ Migration: Seeded transmission options');

    // Seed truck models (modern era, 2000-present)
    await pool.query(`
      INSERT INTO truck_models (manufacturer_id, name, body_style, year_start, year_end)
      SELECT m.id, v.name, v.body_style, v.year_start, v.year_end FROM (VALUES
        ('Kentworth', 'T680', 'Conventional', 2013, NULL),
        ('Kentworth', 'T880', 'Conventional Vocational', 2013, NULL),
        ('Kentworth', 'W900', 'Conventional Long Hood', 1961, NULL),
        ('Peterbuilt', '389', 'Conventional Long Hood', 2007, 2022),
        ('Peterbuilt', '579', 'Conventional Aero', 2012, NULL),
        ('Peterbuilt', '567', 'Conventional Vocational', 2014, NULL),
        ('Freightlite', 'Cascadia', 'Conventional Aero', 2007, NULL),
        ('Freightlite', 'Columbia', 'Conventional', 2000, 2010),
        ('Continental Trucks', 'LT Series', 'Conventional Aero', 2017, NULL),
        ('Continental Trucks', 'RH Series', 'Conventional Vocational', 2018, NULL),
        ('Mackson', 'Anthem', 'Conventional Aero', 2017, NULL),
        ('Mackson', 'Pinnacle', 'Conventional', 2007, 2021),
        ('Mackson', 'Granite', 'Conventional Vocational', 2002, NULL),
        ('Volvar Trucks', 'VNL', 'Conventional Aero', 1996, NULL),
        ('Volvar Trucks', 'VHD', 'Conventional Vocational', 1997, NULL),
        ('Western Eagle', '49X', 'Conventional Long Hood', 2008, NULL),
        ('Western Eagle', '57X', 'Conventional Aero', 2018, NULL)
      ) AS v(mfr_name, name, body_style, year_start, year_end)
      JOIN truck_manufacturers m ON m.name = v.mfr_name
      ON CONFLICT (manufacturer_id, name) DO NOTHING
    `);
    console.log('✓ Migration: Seeded truck models');

    // Seed trims for each model
    await pool.query(`
      INSERT INTO truck_trims (model_id, name, description, base_price)
      SELECT mo.id, v.trim_name, v.description, v.base_price FROM (VALUES
        ('T680', 'Base', 'Standard day cab configuration', 135000),
        ('T680', 'Signature', 'Premium interior and aero package', 165000),
        ('T680', '76" Sleeper', 'Full sleeper configuration', 175000),
        ('T880', 'Base', 'Standard vocational spec', 145000),
        ('T880', 'Severe Duty', 'Heavy vocational reinforced frame', 178000),
        ('W900', 'Base', 'Classic long hood configuration', 155000),
        ('W900', 'Studio Sleeper', 'Large sleeper long hood', 195000),
        ('389', 'Base', 'Standard long hood', 150000),
        ('389', 'Glider', 'Premium chrome and trim package', 210000),
        ('579', 'Base', 'Standard aero day cab', 140000),
        ('579', 'UltraLoft', 'Maximum sleeper aero package', 185000),
        ('567', 'Base', 'Standard vocational spec', 148000),
        ('Cascadia', 'Base', 'Standard day cab', 132000),
        ('Cascadia', 'Premium Aero', 'Maximum fuel efficiency package', 168000),
        ('Cascadia', '72" Sleeper', 'Mid-size sleeper configuration', 172000),
        ('Columbia', 'Base', 'Standard day cab', 95000),
        ('LT Series', 'Base', 'Standard aero day cab', 138000),
        ('LT Series', 'Premium', 'Premium interior and sleeper', 174000),
        ('RH Series', 'Base', 'Standard vocational spec', 142000),
        ('Anthem', 'Base', 'Standard day cab', 137000),
        ('Anthem', 'Sleeper', '70" sleeper configuration', 171000),
        ('Pinnacle', 'Base', 'Standard configuration', 128000),
        ('Granite', 'Base', 'Standard vocational spec', 144000),
        ('VNL', 'Base', 'Standard day cab', 136000),
        ('VNL', '760 Sleeper', 'Premium 70" sleeper', 173000),
        ('VHD', 'Base', 'Standard vocational spec', 141000),
        ('49X', 'Base', 'Classic long hood configuration', 158000),
        ('57X', 'Base', 'Standard aero day cab', 139000)
      ) AS v(model_name, trim_name, description, base_price)
      JOIN truck_models mo ON mo.name = v.model_name
      ON CONFLICT (model_id, name) DO NOTHING
    `);
    console.log('✓ Migration: Seeded truck trims');

    // Add price modifiers to engine and transmission options
    await pool.query(`ALTER TABLE engine_options ADD COLUMN IF NOT EXISTS price_modifier INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE transmission_options ADD COLUMN IF NOT EXISTS price_modifier INTEGER DEFAULT 0`);
    console.log('✓ Migration: Added price_modifier columns');

    // Set engine price modifiers (cost delta from trim base price, scaled by displacement/hp tier)
    await pool.query(`
      UPDATE engine_options SET price_modifier = v.modifier FROM (VALUES
        ('Cummings', 'X12', 0),
        ('Cummings', 'X15', 9000),
        ('Motown Diesel', 'DD13', 0),
        ('Motown Diesel', 'DD15', 7000),
        ('Motown Diesel', 'DD16', 14000),
        ('PACCO MX', 'MX-11', 0),
        ('PACCO MX', 'MX-13', 8000),
        ('Volvar', 'D11', 0),
        ('Volvar', 'D13', 8500),
        ('Mackson', 'MP7', 0),
        ('Mackson', 'MP8', 8500)
      ) AS v(manufacturer_name, model_name, modifier)
      WHERE engine_options.manufacturer_name = v.manufacturer_name AND engine_options.model_name = v.model_name
    `);
    console.log('✓ Migration: Set engine price modifiers');

    // Set transmission price modifiers
    await pool.query(`
      UPDATE transmission_options SET price_modifier = v.modifier FROM (VALUES
        ('Eatonn Fuller', 'Roadranger 10-Speed', 0),
        ('Eatonn Fuller', 'Roadranger 13-Speed', 1500),
        ('Eatonn Fuller', 'Roadranger 18-Speed', 2200),
        ('Eatonn Fuller', 'Advantage 10-Speed', 5500),
        ('Allisson', '4000 Series', 9500),
        ('PACCO', 'PACCO AMT', 6000),
        ('Mackson', 'mDrive HD', 6200),
        ('Volvar', 'I-Shift', 6200)
      ) AS v(manufacturer_name, model_name, modifier)
      WHERE transmission_options.manufacturer_name = v.manufacturer_name AND transmission_options.model_name = v.model_name
    `);
    console.log('✓ Migration: Set transmission price modifiers');

    // Link trims to compatible engines (manufacturer house engines + Cummings as common third-party option)
    await pool.query(`
      INSERT INTO truck_trim_engines (trim_id, engine_id)
      SELECT t.id, e.id
      FROM truck_trims t
      JOIN truck_models mo ON t.model_id = mo.id
      JOIN truck_manufacturers mf ON mo.manufacturer_id = mf.id
      JOIN engine_options e ON (
        (mf.name IN ('Kentworth', 'Peterbuilt', 'Western Eagle', 'Continental Trucks') AND e.manufacturer_name IN ('PACCO MX', 'Cummings'))
        OR (mf.name = 'Freightlite' AND e.manufacturer_name IN ('Motown Diesel', 'Cummings'))
        OR (mf.name = 'Mackson' AND e.manufacturer_name IN ('Mackson', 'Cummings'))
        OR (mf.name = 'Volvar Trucks' AND e.manufacturer_name IN ('Volvar', 'Cummings'))
      )
      ON CONFLICT DO NOTHING
    `);
    console.log('✓ Migration: Linked trims to compatible engines');

    // Link trims to compatible transmissions (Eatonn Fuller universal, manufacturer AMT for their own trucks, Allisson for vocational trims)
    await pool.query(`
      INSERT INTO truck_trim_transmissions (trim_id, transmission_id)
      SELECT t.id, tr.id
      FROM truck_trims t
      JOIN truck_models mo ON t.model_id = mo.id
      JOIN truck_manufacturers mf ON mo.manufacturer_id = mf.id
      JOIN transmission_options tr ON (
        tr.manufacturer_name = 'Eatonn Fuller'
        OR (mf.name = 'Mackson' AND tr.manufacturer_name = 'Mackson')
        OR (mf.name = 'Volvar Trucks' AND tr.manufacturer_name = 'Volvar')
        OR (mf.name IN ('Kentworth', 'Peterbuilt', 'Western Eagle', 'Continental Trucks') AND tr.manufacturer_name = 'PACCO')
        OR (mo.body_style ILIKE '%Vocational%' AND tr.manufacturer_name = 'Allisson')
      )
      ON CONFLICT DO NOTHING
    `);
    console.log('✓ Migration: Linked trims to compatible transmissions');

    // ===== RoadRoster Job Posting System =====
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_postings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        route_type VARCHAR(20) NOT NULL,
        equipment_type VARCHAR(20) NOT NULL,
        pay_per_mile DECIMAL(5,3) NOT NULL,
        home_time VARCHAR(30) NOT NULL,
        referral_bonus INTEGER DEFAULT 0,
        cdl_school_partner BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT valid_route_type CHECK (route_type IN ('OTR', 'Regional', 'Local', 'Dedicated')),
        CONSTRAINT valid_equipment_type CHECK (equipment_type IN ('Dry Van', 'Reefer', 'Flatbed', 'Tanker', 'Heavy Haul')),
        CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'closed'))
      )
    `);
    console.log('✓ Migration: Created job_postings table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_posting_id UUID NOT NULL REFERENCES job_postings(id),
        candidate_name VARCHAR(100) NOT NULL,
        years_experience INTEGER NOT NULL,
        cdl_class VARCHAR(5) DEFAULT 'A',
        endorsements TEXT,
        safety_score INTEGER NOT NULL,
        requested_wage DECIMAL(5,3) NOT NULL,
        location VARCHAR(100),
        cdl_school_grad BOOLEAN DEFAULT FALSE,
        status VARCHAR(20) DEFAULT 'pending',
        applied_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT valid_application_status CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn'))
      )
    `);
    console.log('✓ Migration: Created job_applications table');

    // Highway segments table for proximity validation (plain Postgres, no PostGIS required)
    // Each row is a simplified highway segment represented as a center point
    await pool.query(`
      CREATE TABLE IF NOT EXISTS us_highways (
        id SERIAL PRIMARY KEY,
        osm_id BIGINT,
        highway_type VARCHAR(20),
        ref VARCHAR(50),
        name VARCHAR(255),
        lat DECIMAL(10,7) NOT NULL,
        lng DECIMAL(10,7) NOT NULL
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS us_highways_lat_idx ON us_highways (lat)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS us_highways_lng_idx ON us_highways (lng)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS us_highways_type_idx ON us_highways (highway_type)`);
    console.log('✓ Migration: Created us_highways table');
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('✓ Tables already exist');
    } else {
      console.error('Migration error:', error.message);
    }
  }
}

module.exports = { runMigrations };
