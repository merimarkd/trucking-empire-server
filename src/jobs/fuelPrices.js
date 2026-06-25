const https = require('https');
const { pool } = require('../db/connection');

async function fetchEIADieselPrice() {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.EIA_API_KEY;
    const url = `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${apiKey}&start=2026-01-01&length=2&data[]=value&facets[duoarea][]=NUS&facets[product][]=EPD2D`;
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          const data = json.response?.data;
          if (!data || data.length === 0) return reject(new Error('No EIA data'));
          // Sort by period descending to get latest
          data.sort((a, b) => b.period.localeCompare(a.period));
          resolve({ latest: parseFloat(data[0].value), previous: data[1] ? parseFloat(data[1].value) : null, period: data[0].period });
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function updateFuelPrices() {
  try {
    const { latest, previous, period } = await fetchEIADieselPrice();
    console.log(`✓ EIA Diesel price: $${latest}/gal (${period})`);

    // Update market_items base_price for diesel
    await pool.query(`
      UPDATE market_items SET base_price = $1
      WHERE category = 'Fuel' AND subcategory = 'Diesel'
    `, [latest]);

    // Record in price history
    const today = new Date().toISOString().split('T')[0];
    await pool.query(`
      INSERT INTO market_price_history (item_id, avg_price, volume, recorded_date)
      SELECT id, $1, 0, $2
      FROM market_items
      WHERE category = 'Fuel' AND subcategory = 'Diesel'
      ON CONFLICT (item_id, recorded_date) DO UPDATE SET avg_price = $1
    `, [latest, today]);

    console.log(`✓ Fuel prices updated: $${latest}/gal`);
  } catch (error) {
    console.error('Fuel price update error:', error.message);
  }
}

module.exports = { updateFuelPrices };

