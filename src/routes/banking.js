// src/routes/banking.js
// Banking system API endpoints

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/connection');
const {
  calculateInterestRate,
  calculateMaxLoanAmount,
  calculateApprovalTimeline,
  calculateMonthlyPayment,
  validateLoanApplication
} = require('../banking/underwriting');

/**
 * POST /api/banking/loan-application
 * Apply for a bank loan
 * Body: { companyId, requestedAmount, termMonths }
 */
router.post('/loan-application', async (req, res) => {
  try {
    const { companyId, requestedAmount, termMonths } = req.body;

    if (!companyId || !requestedAmount || !termMonths) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validation = await validateLoanApplication(companyId, requestedAmount, termMonths);
    
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error, maxApprovable: validation.maxApprovable });
    }

    const applicationId = uuidv4();
    const approvalDate = validation.approvalDate;

    const result = await pool.query(
      `INSERT INTO loan_applications 
       (id, company_id, requested_amount, requested_term_months, lender_type, status, 
        calculated_interest_rate, max_approvable_amount, approval_timeline_hours, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        applicationId,
        companyId,
        requestedAmount,
        termMonths,
        validation.lenderType,
        'pending',
        validation.interestRate,
        validation.maxApprovable,
        validation.approvalHours,
        approvalDate
      ]
    );

    await pool.query(
      `INSERT INTO transactions (company_id, transaction_type, amount, description, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [companyId, 'loan_application_submitted', 0, `Loan application for $${requestedAmount}`, 'pending']
    );

    res.json({
      applicationId: result.rows[0].id,
      status: 'pending',
      requestedAmount,
      calculatedRate: validation.interestRate,
      monthlyPayment: validation.monthlyPayment,
      tier: validation.tier,
      lenderType: validation.lenderType,
      approvalHours: validation.approvalHours,
      approvalDate: approvalDate.toISOString(),
      message: `Application submitted. Expect decision in ~${validation.approvalHours} hours.`
    });
  } catch (error) {
    console.error('Error submitting loan application:', error);
    res.status(500).json({ error: 'Failed to submit loan application' });
  }
});

/**
 * GET /api/banking/loan/:loanId
 */
router.get('/loan/:loanId', async (req, res) => {
  try {
    const { loanId } = req.params;

    const result = await pool.query(
      'SELECT * FROM loans WHERE id = $1',
      [loanId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    const loan = result.rows[0];
    const nextPaymentDue = new Date(loan.next_payment_due);
    const daysUntilDue = Math.ceil((nextPaymentDue - new Date()) / (1000 * 60 * 60 * 24));

    res.json({
      ...loan,
      daysUntilDue: Math.max(daysUntilDue, 0),
      interestAccruedThisMonth: calculateDailyInterest(loan.balance_remaining, loan.interest_rate),
      status_description: getStatusDescription(loan.status),
      maturityDate: new Date(loan.maturity_date).toISOString().split('T')[0],
      nextPaymentDate: nextPaymentDue.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Error fetching loan:', error);
    res.status(500).json({ error: 'Failed to fetch loan' });
  }
});

/**
 * POST /api/banking/make-payment
 */
router.post('/make-payment', async (req, res) => {
  try {
    const { loanId, companyId, paymentAmount } = req.body;

    if (!loanId || !companyId || !paymentAmount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const loanResult = await pool.query('SELECT * FROM loans WHERE id = $1 AND company_id = $2', [loanId, companyId]);
    if (!loanResult.rows[0]) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    const loan = loanResult.rows[0];

    const companyResult = await pool.query('SELECT cash FROM companies WHERE id = $1', [companyId]);
    if (!companyResult.rows[0] || companyResult.rows[0].cash < paymentAmount) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    const dailyRate = loan.interest_rate / 100 / 365;
    const daysElapsed = Math.floor((new Date() - new Date(loan.last_payment_date || loan.originated_at)) / (1000 * 60 * 60 * 24));
    const accruedInterest = loan.balance_remaining * dailyRate * daysElapsed;
    
    const principalPortion = Math.max(0, paymentAmount - accruedInterest);
    const interestPortion = Math.min(paymentAmount, accruedInterest);

    const newBalance = Math.max(0, loan.balance_remaining - principalPortion);
    const isPaymentOnTime = new Date() <= new Date(loan.next_payment_due);
    
    await pool.query(
      `UPDATE loans 
       SET balance_remaining = $1, 
           total_interest_paid = total_interest_paid + $2,
           total_payments_made = total_payments_made + 1,
           last_payment_date = NOW(),
           days_past_due = 0,
           payments_missed = 0,
           status = CASE WHEN $1 <= 0 THEN 'paid_off' ELSE status END,
           next_payment_due = CASE WHEN $1 > 0 THEN next_payment_due + INTERVAL '1 month' ELSE now() END,
           updated_at = NOW()
       WHERE id = $1`,
      [newBalance, interestPortion, loanId]
    );

    await pool.query(
      'UPDATE companies SET cash = cash - $1 WHERE id = $2',
      [paymentAmount, companyId]
    );

    await pool.query(
      `INSERT INTO loan_payments (loan_id, company_id, amount, principal_portion, interest_portion, payment_status, due_date, payment_date, days_late)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
      [loanId, companyId, paymentAmount, principalPortion, interestPortion, isPaymentOnTime ? 'on_time' : 'late', loan.next_payment_due, isPaymentOnTime ? 0 : daysUntilDue(loan.next_payment_due)]
    );

    await pool.query(
      `INSERT INTO transactions (company_id, transaction_type, amount, loan_id, description, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [companyId, 'loan_payment', -paymentAmount, loanId, `Loan payment: $${paymentAmount} (Principal: $${principalPortion}, Interest: $${interestPortion})`, 'completed']
    );

    await pool.query(
      `UPDATE company_statistics 
       SET total_interest_paid = total_interest_paid + $1,
           updated_at = NOW()
       WHERE company_id = $2`,
      [interestPortion, companyId]
    );

    res.json({
      success: true,
      paymentAmount,
      principalPortion: parseFloat(principalPortion.toFixed(2)),
      interestPortion: parseFloat(interestPortion.toFixed(2)),
      newBalance: parseFloat(newBalance.toFixed(2)),
      loanStatus: newBalance <= 0 ? 'paid_off' : 'active',
      paymentStatus: isPaymentOnTime ? 'on_time' : 'late',
      message: newBalance <= 0 ? 'Loan paid off!' : `Payment applied. New balance: $${newBalance.toFixed(2)}`
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

/**
 * GET /api/banking/company-loans/:companyId
 */
router.get('/company-loans/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;

    const result = await pool.query(
      `SELECT * FROM loans 
       WHERE company_id = $1 
       ORDER BY created_at DESC`,
      [companyId]
    );

    const loans = result.rows.map(loan => ({
      ...loan,
      balance: parseFloat(loan.balance_remaining),
      monthlyPayment: parseFloat(loan.monthly_payment),
      interestRate: parseFloat(loan.interest_rate),
      daysUntilMaturity: Math.ceil((new Date(loan.maturity_date) - new Date()) / (1000 * 60 * 60 * 24))
    }));

    res.json({
      companyId,
      activeLoans: loans.filter(l => l.status === 'active').length,
      totalDebt: loans.reduce((sum, l) => sum + parseFloat(l.balance_remaining), 0),
      loans
    });
  } catch (error) {
    console.error('Error fetching company loans:', error);
    res.status(500).json({ error: 'Failed to fetch loans' });
  }
});

/**
 * GET /api/banking/transaction-history/:companyId
 */
router.get('/transaction-history/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT * FROM transactions 
       WHERE company_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [companyId, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM transactions WHERE company_id = $1',
      [companyId]
    );

    res.json({
      companyId,
      transactions: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: parseInt(countResult.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    res.status(500).json({ error: 'Failed to fetch transaction history' });
  }
});

/**
 * GET /api/banking/compliance/:companyId
 */
router.get('/compliance/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;

    const strikesResult = await pool.query(
      `SELECT * FROM compliance_strikes 
       WHERE company_id = $1 
       ORDER BY created_at DESC`,
      [companyId]
    );

    const strikes = strikesResult.rows;
    const strikeCount = strikes.length;
    const secondStrike = strikes.find(s => s.strike_number === 2);
    const isLockedOut = secondStrike && new Date() < new Date(secondStrike.lockout_until);

    res.json({
      companyId,
      strikeCount,
      strikes,
      isLockedOut,
      lockoutUntil: isLockedOut ? secondStrike.lockout_until : null,
      canBorrow: strikeCount < 2 && !isLockedOut,
      message: isLockedOut ? `Cannot borrow until ${new Date(secondStrike.lockout_until).toDateString()}` : 'In good standing'
    });
  } catch (error) {
    console.error('Error fetching compliance status:', error);
    res.status(500).json({ error: 'Failed to fetch compliance status' });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateDailyInterest(principal, annualRate) {
  return (principal * (annualRate / 100)) / 365;
}

function daysUntilDue(dueDate) {
  return Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
}

function getStatusDescription(status) {
  const descriptions = {
    'active': 'Loan is active, payments due',
    'paid_off': 'Loan has been fully paid',
    'defaulted': 'Loan is in default status',
    'accelerated': 'Full balance is due immediately'
  };
  return descriptions[status] || status;
}

module.exports = router;
