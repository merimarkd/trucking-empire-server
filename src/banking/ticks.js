// src/banking/ticks.js
// Tick system: interest accrual, payment processing, default escalation

const { pool } = require('../db/connection');

/**
 * TICK 1: Daily interest accrual
 * Runs once per day (midnight UTC)
 * Accrues daily interest on all active loans
 */
async function accrueInterest() {
  try {
    const result = await pool.query(`
      SELECT id, company_id, balance_remaining, interest_rate, 
             last_interest_accrual_date, status
      FROM loans
      WHERE status IN ('active', 'past_due')
      AND balance_remaining > 0
    `);

    for (const loan of result.rows) {
      const lastAccrual = loan.last_interest_accrual_date || loan.originated_at;
      const daysElapsed = Math.floor((Date.now() - new Date(lastAccrual)) / (1000 * 60 * 60 * 24));
      
      if (daysElapsed < 1) continue; // Only accrue once per day

      const dailyRate = (loan.interest_rate / 100) / 365;
      const accrualAmount = loan.balance_remaining * dailyRate;

      await pool.query(
        `UPDATE loans 
         SET balance_remaining = balance_remaining + $1,
             last_interest_accrual_date = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [accrualAmount, loan.id]
      );

      await pool.query(
        `INSERT INTO transactions 
         (company_id, transaction_type, amount, loan_id, description, status)
         VALUES ($1, 'interest_accrual', $2, $3, $4, 'completed')`,
        [loan.company_id, accrualAmount, loan.id, `Daily interest accrual: $${accrualAmount.toFixed(2)}`]
      );
    }

    console.log(`✓ Interest accrual: ${result.rows.length} loans processed`);
  } catch (error) {
    console.error('Error in accrueInterest:', error);
  }
}

/**
 * TICK 2: Process scheduled auto-payments
 * Runs every 6 hours
 * Automatically deduct payments from company cash if enabled
 */
async function processAutoPayments() {
  try {
    const result = await pool.query(`
      SELECT l.id, l.company_id, l.monthly_payment, l.next_payment_due, 
             l.balance_remaining, c.cash
      FROM loans l
      JOIN companies c ON l.company_id = c.id
      WHERE l.auto_pay_enabled = TRUE
      AND l.status IN ('active', 'past_due')
      AND DATE(l.next_payment_due) <= DATE(NOW())
      AND c.cash >= l.monthly_payment
    `);

    for (const loan of result.rows) {
      // Calculate interest portion
      const dailyRate = (loan.interest_rate / 100) / 365;
      const daysElapsed = Math.floor((Date.now() - new Date(loan.last_payment_date || loan.originated_at)) / (1000 * 60 * 60 * 24));
      const accruedInterest = loan.balance_remaining * dailyRate * daysElapsed;
      const principalPortion = Math.max(0, loan.monthly_payment - accruedInterest);
      const interestPortion = Math.min(loan.monthly_payment, accruedInterest);
      const newBalance = Math.max(0, loan.balance_remaining - principalPortion);

      await pool.query(
        `UPDATE loans
         SET balance_remaining = $1,
             total_interest_paid = total_interest_paid + $2,
             total_payments_made = total_payments_made + 1,
             last_payment_date = NOW(),
             days_past_due = 0,
             payments_missed = 0,
             default_phase = 0,
             status = CASE WHEN $1 <= 0 THEN 'paid_off' ELSE 'active' END,
             next_payment_due = CASE WHEN $1 > 0 THEN next_payment_due + INTERVAL '1 month' ELSE NOW() END,
             updated_at = NOW()
         WHERE id = $3`,
        [newBalance, interestPortion, loan.id]
      );

      await pool.query(
        `UPDATE companies SET cash = cash - $1 WHERE id = $2`,
        [loan.monthly_payment, loan.company_id]
      );

      await pool.query(
        `INSERT INTO loan_payments 
         (loan_id, company_id, amount, principal_portion, interest_portion, payment_status, due_date, payment_date, days_late)
         VALUES ($1, $2, $3, $4, $5, 'on_time', $6, NOW(), 0)`,
        [loan.id, loan.company_id, loan.monthly_payment, principalPortion, interestPortion, loan.next_payment_due]
      );

      await pool.query(
        `INSERT INTO transactions 
         (company_id, transaction_type, amount, loan_id, description, status)
         VALUES ($1, 'auto_payment', -$2, $3, $4, 'completed')`,
        [loan.company_id, loan.monthly_payment, loan.id, `Auto-payment processed: $${loan.monthly_payment.toFixed(2)}`]
      );
    }

    console.log(`✓ Auto-payments: ${result.rows.length} loans processed`);
  } catch (error) {
    console.error('Error in processAutoPayments:', error);
  }
}

/**
 * TICK 3: Track overdue payments & escalate defaults
 * Runs once per day
 * Tracks days past due, applies late fees, escalates through default phases
 */
async function escalateDefaults() {
  try {
    const result = await pool.query(`
      SELECT id, company_id, next_payment_due, days_past_due, 
             balance_remaining, monthly_payment, default_phase
      FROM loans
      WHERE status IN ('active', 'past_due')
      AND balance_remaining > 0
      AND next_payment_due < NOW()
    `);

    for (const loan of result.rows) {
      const daysLate = Math.floor((Date.now() - new Date(loan.next_payment_due)) / (1000 * 60 * 60 * 24));
      let newPhase = loan.default_phase;
      let lateFeeApplied = 0;

      // Escalate through phases
      if (daysLate >= 90 && loan.default_phase < 90) {
        newPhase = 90;
        lateFeeApplied = Math.min(loan.monthly_payment * 0.25, 500); // 25% late fee, cap $500
      } else if (daysLate >= 45 && loan.default_phase < 45) {
        newPhase = 45;
        lateFeeApplied = Math.min(loan.monthly_payment * 0.15, 300); // 15% late fee, cap $300
      } else if (daysLate >= 30 && loan.default_phase < 30) {
        newPhase = 30;
        lateFeeApplied = Math.min(loan.monthly_payment * 0.10, 150); // 10% late fee, cap $150
      } else if (daysLate >= 15 && loan.default_phase < 15) {
        newPhase = 15;
        lateFeeApplied = Math.min(loan.monthly_payment * 0.05, 75); // 5% late fee, cap $75
      }

      // Update loan with new phase and late fee
      const newBalance = loan.balance_remaining + lateFeeApplied;
      await pool.query(
        `UPDATE loans
         SET days_past_due = $1,
             default_phase = $2,
             late_fees_accrued = late_fees_accrued + $3,
             balance_remaining = $4,
             status = CASE WHEN $2 >= 90 THEN 'defaulted' WHEN $2 >= 30 THEN 'past_due' ELSE 'active' END,
             default_initiated_at = CASE WHEN $2 > 0 AND default_initiated_at IS NULL THEN NOW() ELSE default_initiated_at END,
             updated_at = NOW()
         WHERE id = $5`,
        [daysLate, newPhase, lateFeeApplied, newBalance, loan.id]
      );

      // Log late fee if applied
      if (lateFeeApplied > 0) {
        await pool.query(
          `INSERT INTO transactions 
           (company_id, transaction_type, amount, loan_id, description, status)
           VALUES ($1, 'late_fee', $2, $3, $4, 'completed')`,
          [loan.company_id, lateFeeApplied, loan.id, `Late fee applied (${daysLate} days): $${lateFeeApplied.toFixed(2)}`]
        );
      }
    }

    console.log(`✓ Default escalation: ${result.rows.length} loans reviewed`);
  } catch (error) {
    console.error('Error in escalateDefaults:', error);
  }
}

/**
 * TICK 4: Auto-garnishment for severely defaulted loans
 * Runs every 12 hours
 * Automatically deducts from company cash if 45+ days late
 */
async function processGarnishment() {
  try {
    const result = await pool.query(`
      SELECT l.id, l.company_id, l.monthly_payment, l.default_phase, 
             l.balance_remaining, c.cash
      FROM loans l
      JOIN companies c ON l.company_id = c.id
      WHERE l.default_phase >= 45
      AND l.garnishment_enabled = TRUE
      AND l.status IN ('past_due', 'defaulted')
      AND c.cash > 0
    `);

    for (const loan of result.rows) {
      // Garnish 50% of monthly payment amount
      const garnishAmount = Math.min(loan.monthly_payment * 0.5, loan.cash);
      
      await pool.query(
        `UPDATE loans
         SET balance_remaining = GREATEST(0, balance_remaining - $1),
             updated_at = NOW()
         WHERE id = $2`,
        [garnishAmount, loan.id]
      );

      await pool.query(
        `UPDATE companies SET cash = cash - $1 WHERE id = $2`,
        [garnishAmount, loan.company_id]
      );

      await pool.query(
        `INSERT INTO transactions 
         (company_id, transaction_type, amount, loan_id, description, status)
         VALUES ($1, 'garnishment', -$2, $3, $4, 'completed')`,
        [loan.company_id, garnishAmount, loan.id, `Auto-garnishment deducted: $${garnishAmount.toFixed(2)}`]
      );
    }

    console.log(`✓ Garnishment: ${result.rows.length} loans processed`);
  } catch (error) {
    console.error('Error in processGarnishment:', error);
  }
}

/**
 * TICK 5: Strike system enforcement
 * Runs once per day
 * Tracks compliance violations and applies strike system
 */
async function checkCompliance() {
  try {
    const result = await pool.query(`
      SELECT c.id, COUNT(l.id) as defaulted_loans
      FROM companies c
      LEFT JOIN loans l ON c.id = l.company_id AND l.status = 'defaulted'
      GROUP BY c.id
      HAVING COUNT(l.id) >= 1
    `);

    for (const company of result.rows) {
      const strikeResult = await pool.query(
        `SELECT COUNT(*) as strike_count FROM compliance_strikes 
         WHERE company_id = $1 AND lockout_until > NOW()`,
        [company.id]
      );

      const activeStrikes = parseInt(strikeResult.rows[0].strike_count);

      // Award strike if not already in lockout
      if (activeStrikes === 0) {
        const lockoutUntil = new Date();
        lockoutUntil.setDate(lockoutUntil.getDate() + 180); // 6 month lockout per strike

        await pool.query(
          `INSERT INTO compliance_strikes 
           (company_id, strike_number, reason, lockout_until)
           VALUES ($1, $2, $3, $4)`,
          [company.id, activeStrikes + 1, `${company.defaulted_loans} defaulted loan(s)`, lockoutUntil]
        );

        console.log(`⚠️  Strike awarded to company ${company.id} (${company.defaulted_loans} defaults)`);
      }
    }

    console.log(`✓ Compliance check: ${result.rows.length} companies reviewed`);
  } catch (error) {
    console.error('Error in checkCompliance:', error);
  }
}

module.exports = {
  accrueInterest,
  processAutoPayments,
  escalateDefaults,
  processGarnishment,
  checkCompliance
};
