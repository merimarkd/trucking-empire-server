const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

router.get('/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;

    const result = await pool.query(
      'SELECT * FROM company_statistics WHERE company_id = $1',
      [companyId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Statistics not found for this company' });
    }

    const stats = result.rows[0];

    const now = new Date();
    const created = new Date(stats.company_created_at);
    const diffMs = now - created;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    const years = Math.floor(diffDays / 365);
    const months = Math.floor((diffDays % 365) / 30);
    const days = diffDays % 30;
    const hours = diffHours % 24;
    const minutes = diffMins % 60;
    const seconds = diffSecs % 60;

    res.json({
      ...stats,
      company_age_formatted: `${years} years, ${months} months, ${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
