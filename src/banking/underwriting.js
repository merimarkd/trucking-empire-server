// src/banking/underwriting.js
const pool = require('../db/connection');

async function calculateInterestRate(companyId, loanAmount) {
  const company = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);
  const stats = await pool.query('SELECT * FROM company_statistics WHERE company_id = $1', [companyId]);
  
  if (!company.rows[0] || !stats.rows[0]) {
    throw new Error('Company not found');
  }

  const comp = company.rows[0];
  const stat = stats.rows[0];

  const createdDate = new Date(comp.created_at);
  const nowDate = new Date();
  const daysInBusiness = Math.floor((nowDate - createdDate) / (1000 * 60 * 60 * 24));
  const yearsInBusiness = daysInBusiness / 365;

  let baseRate = 0;
  let tier = '';

  if (yearsInBusiness >= 3 && stat.current_iss_score <= 50 && stat.total_violations === 0) {
    baseRate = 8.5;
    tier = 'Elite';
  }
  else if (yearsInBusiness >= 2 && stat.current_iss_score <= 65) {
    baseRate = 11.75;
    tier = 'Standard';
  }
  else if (yearsInBusiness < 2) {
    baseRate = 22.5;
    tier = 'Startup';
  }
  else {
    baseRate = 25;
    tier = 'High-Risk';
  }

  if (stat.current_iss_score > 50) {
    const issExcess = stat.current_iss_score - 50;
    baseRate += (issExcess / 10) * 0.5;
  }

  baseRate += stat.total_violations * 0.25;

  if (loanAmount > 250000) {
    baseRate += 1;
  }

  let finalRate = Math.max(5, Math.min(35, baseRate));

  return {
    interestRate: parseFloat(finalRate.toFixed(3)),
    tier,
    baseRate: parseFloat(baseRate.toFixed(3)),
    yearsInBusiness: parseFloat(yearsInBusiness.toFixed(2)),
    issScore: stat.current_iss_score,
    violations: stat.total_violations
  };
}

async function calculateMaxLoanAmount(companyId) {
  const company = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);
  const stats = await pool.query('SELECT * FROM company_statistics WHERE company_id = $1', [companyId]);
  const trucks = await pool.query('SELECT * FROM trucks WHERE company_id = $1', [companyId]);

  if (!company.rows[0] || !stats.rows[0]) {
    throw new Error('Company not found');
  }

  const comp = company.rows[0];
  const stat = stats.rows[0];
  const trucksList = trucks.rows;

  const daysInBusiness = Math.floor((new Date() - new Date(comp.created_at)) / (1000 * 60 * 60 * 24));
  const yearsInBusiness = daysInBusiness / 365;

  const avgTruckValue = 100000;
  const ltv = 0.80;
  const ltvMaxPerTruck = avgTruckValue * ltv;
  const ltvMax = ltvMaxPerTruck * trucksList.length;

  const monthlyRevenue = stat.total_revenue / Math.max(stat.days_in_operation / 30, 1);
  const maxMonthlyPayment = monthlyRevenue / 3.5;
  const revenueMax = maxMonthlyPayment * 60;

  let timeBasedMax = 0;
  if (yearsInBusiness < 0.5) {
    timeBasedMax = 100000;
  } else if (yearsInBusiness < 1) {
    timeBasedMax = 150000;
  } else if (yearsInBusiness < 2) {
    timeBasedMax = 250000;
  } else if (yearsInBusiness < 3) {
    timeBasedMax = 500000;
  } else {
    timeBasedMax = Infinity;
  }

  let issBasedMax = 0;
  if (stat.current_iss_score <= 40) {
    issBasedMax = Infinity;
  } else if (stat.current_iss_score <= 50) {
    issBasedMax = 500000;
  } else if (stat.current_iss_score <= 70) {
    issBasedMax = 300000;
  } else {
    issBasedMax = 150000;
  }

  const maxAmount = Math.min(
    ltvMax || 500000,
    revenueMax || 300000,
    timeBasedMax,
    issBasedMax
  );

  return {
    maxApprovableAmount: Math.round(maxAmount),
    ltvMax: Math.round(ltvMax),
    revenueMax: Math.round(revenueMax),
    timeBasedMax: Math.round(timeBasedMax),
    issBasedMax: Math.round(issBasedMax),
    yearsInBusiness: parseFloat(yearsInBusiness.toFixed(2)),
    monthlyRevenue: Math.round(monthlyRevenue),
    restrictingFactor: 'Multiple factors applied'
  };
}

function calculateApprovalTimeline(loanAmount, yearsInBusiness) {
  let lenderType = '';
  let approvalHours = 0;
  let minHours = 0;
  let maxHours = 0;

  if (loanAmount <= 75000) {
    lenderType = 'specialized';
    minHours = 2;
    maxHours = 24;
    approvalHours = Math.random() * (maxHours - minHours) + minHours;
  } else if (loanAmount <= 250000) {
    lenderType = 'bank';
    minHours = 48;
    maxHours = 168;
    approvalHours = Math.random() * (maxHours - minHours) + minHours;
  } else {
    lenderType = 'sba';
    minHours = 672;
    maxHours = 1344;
    approvalHours = Math.random() * (maxHours - minHours) + minHours;
  }

  if (yearsInBusiness < 2) {
    approvalHours *= 1.5;
  }

  return {
    lenderType,
    approvalHours: Math.round(approvalHours),
    minHours,
    maxHours,
    approvalDate: new Date(Date.now() + approvalHours * 60 * 60 * 1000)
  };
}

function calculateMonthlyPayment(principal, annualRate, termMonths) {
  const monthlyRate = annualRate / 100 / 12;
  const numerator = monthlyRate * Math.pow(1 + monthlyRate, termMonths);
  const denominator = Math.pow(1 + monthlyRate, termMonths) - 1;
  
  const payment = principal * (numerator / denominator);
  return parseFloat(payment.toFixed(2));
}

async function validateLoanApplication(companyId, requestedAmount, termMonths) {
  try {
    const company = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);
    if (!company.rows[0]) {
      return { valid: false, error: 'Company not found' };
    }

    const defaultedLoans = await pool.query(
      'SELECT COUNT(*) as count FROM loans WHERE company_id = $1 AND status = $2',
      [companyId, 'defaulted']
    );

    if (defaultedLoans.rows[0].count > 0) {
      return { valid: false, error: 'Cannot apply: Company has defaulted loans' };
    }

    const interestCalc = await calculateInterestRate(companyId, requestedAmount);
    const maxCalc = await calculateMaxLoanAmount(companyId);
    const timelineCalc = calculateApprovalTimeline(requestedAmount, interestCalc.yearsInBusiness);

    if (requestedAmount > maxCalc.maxApprovableAmount) {
      return {
        valid: false,
        error: `Requested amount ($${requestedAmount.toLocaleString()}) exceeds maximum ($${maxCalc.maxApprovableAmount.toLocaleString()})`,
        maxApprovable: maxCalc.maxApprovableAmount
      };
    }

    const monthlyPayment = calculateMonthlyPayment(requestedAmount, interestCalc.interestRate, termMonths);

    return {
      valid: true,
      interestRate: interestCalc.interestRate,
      maxApprovable: maxCalc.maxApprovableAmount,
      monthlyPayment,
      lenderType: timelineCalc.lenderType,
      approvalHours: timelineCalc.approvalHours,
      approvalDate: timelineCalc.approvalDate,
      tier: interestCalc.tier
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

module.exports = {
  calculateInterestRate,
  calculateMaxLoanAmount,
  calculateApprovalTimeline,
  calculateMonthlyPayment,
  validateLoanApplication
};
