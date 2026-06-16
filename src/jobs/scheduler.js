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

  console.log('✅ Tick scheduler initialized');
}

module.exports = { initializeScheduler };
