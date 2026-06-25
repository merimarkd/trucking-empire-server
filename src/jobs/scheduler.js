// src/jobs/scheduler.js
// Tick scheduler using node-cron

const cron = require('node-cron');
const {
  accrueInterest,
  processAutoPayments,
  escalateDefaults,
  processGarnishment,
  checkCompliance
} = require('../banking/ticks');
const { updateFuelPrices } = require('./fuelPrices');

function initializeScheduler() {
  console.log('🔄 Initializing tick scheduler...');

  // TICK 1: Interest accrual - Daily at 00:00 UTC
  cron.schedule('0 0 * * *', accrueInterest, { name: 'accrueInterest' });
  console.log('  ✓ Interest accrual: Daily 00:00 UTC');

  // TICK 2: Auto-payments - Every 6 hours
  cron.schedule('0 */6 * * *', processAutoPayments, { name: 'processAutoPayments' });
  console.log('  ✓ Auto-payments: Every 6 hours');

  // TICK 3: Default escalation - Daily at 01:00 UTC
  cron.schedule('0 1 * * *', escalateDefaults, { name: 'escalateDefaults' });
  console.log('  ✓ Default escalation: Daily 01:00 UTC');

  // TICK 4: Garnishment - Every 12 hours
  cron.schedule('0 */12 * * *', processGarnishment, { name: 'processGarnishment' });
  console.log('  ✓ Garnishment processing: Every 12 hours');

  // TICK 5: Compliance checks - Daily at 02:00 UTC
  cron.schedule('0 2 * * *', checkCompliance, { name: 'checkCompliance' });
  console.log('  ✓ Compliance checks: Daily 02:00 UTC');

  // TICK 6: Fuel prices - Daily at 06:00 UTC
  cron.schedule('0 6 * * *', updateFuelPrices, { name: 'updateFuelPrices' });
  console.log('  ✓ Fuel prices: Daily 06:00 UTC');

  // Auto-delete inactive players (30+ days no login)
cron.schedule('0 3 * * *', async () => {
  console.log('Running: Auto-delete inactive players...');
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const inactivePlayers = await pool.query(
      'SELECT id, username, email, personal_credit_score FROM players WHERE last_login < $1 AND is_admin = FALSE',
      [thirtyDaysAgo]
    );

    for (const player of inactivePlayers.rows) {
      // Move to deletion history
      await pool.query(`
        INSERT INTO deleted_players_history (username, email, personal_credit_score, deletion_reason, deletion_notes, auto_purge_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        player.username,
        player.email,
        player.personal_credit_score,
        'inactivity',
        'Auto-deleted due to 30+ days inactivity',
        new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000) // 6 months from now
      ]);

      // Delete player
      await pool.query('DELETE FROM players WHERE id = $1', [player.id]);
    }

    if (inactivePlayers.rows.length > 0) {
      console.log(`✓ Deleted ${inactivePlayers.rows.length} inactive players`);
    }
  } catch (error) {
    console.error('Auto-delete error:', error);
  }
});

// Auto-purge deleted player records older than 6 months
cron.schedule('0 4 * * *', async () => {
  console.log('Running: Purge old deleted player records...');
  try {
    const result = await pool.query(
      'DELETE FROM deleted_players_history WHERE auto_purge_at < NOW()'
    );
    if (result.rowCount > 0) {
      console.log(`✓ Purged ${result.rowCount} old deleted player records`);
    }
  } catch (error) {
    console.error('Purge error:', error);
  }
});

// Run fuel prices immediately on startup
  updateFuelPrices();
  console.log('✅ Tick scheduler initialized');
}

module.exports = { initializeScheduler };
