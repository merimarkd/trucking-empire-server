const express = require('express');
const router = express.Router();
const { pool } = require('../db/migrations');
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, 'freight-empire-secret-key-change-in-production');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// GET /api/market/categories — get category tree
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT category, subcategory, COUNT(*) as item_count
      FROM market_items
      GROUP BY category, subcategory
      ORDER BY category, subcategory
    `);
    const tree = {};
    result.rows.forEach(row => {
      if (!tree[row.category]) tree[row.category] = [];
      tree[row.category].push({ subcategory: row.subcategory, count: row.item_count });
    });
    res.json({ categories: tree });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/market/items?category=&subcategory= — get items in category
router.get('/items', async (req, res) => {
  try {
    const { category, subcategory, search } = req.query;
    let query = 'SELECT * FROM market_items WHERE 1=1';
    const params = [];
    if (category) { params.push(category); query += ` AND category = $${params.length}`; }
    if (subcategory) { params.push(subcategory); query += ` AND subcategory = $${params.length}`; }
    if (search) { params.push(`%${search}%`); query += ` AND name ILIKE $${params.length}`; }
    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json({ items: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/market/orders/:itemId — get buy/sell orders for item
router.get('/orders/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const sellers = await pool.query(`
      SELECT mo.id, mo.quantity, mo.price_per_unit, mo.min_quantity, mo.expires_at,
             c.name as company_name
      FROM market_orders mo
      JOIN companies c ON c.id = mo.company_id
      WHERE mo.item_id = $1 AND mo.order_type = 'sell' AND mo.is_active = TRUE AND mo.expires_at > NOW()
      ORDER BY mo.price_per_unit ASC
    `, [itemId]);
    const buyers = await pool.query(`
      SELECT mo.id, mo.quantity, mo.price_per_unit, mo.min_quantity, mo.expires_at,
             c.name as company_name
      FROM market_orders mo
      JOIN companies c ON c.id = mo.company_id
      WHERE mo.item_id = $1 AND mo.order_type = 'buy' AND mo.is_active = TRUE AND mo.expires_at > NOW()
      ORDER BY mo.price_per_unit DESC
    `, [itemId]);

    // Get price history for ticker
    const history = await pool.query(`
      SELECT avg_price, volume, recorded_date
      FROM market_price_history
      WHERE item_id = $1
      ORDER BY recorded_date DESC
      LIMIT 2
    `, [itemId]);

    let priceChange = null;
    if (history.rows.length >= 2) {
      const today = parseFloat(history.rows[0].avg_price);
      const yesterday = parseFloat(history.rows[1].avg_price);
      priceChange = ((today - yesterday) / yesterday * 100).toFixed(2);
    }

    res.json({ sellers: sellers.rows, buyers: buyers.rows, priceChange });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/market/order — place buy or sell order
router.post('/order', authMiddleware, async (req, res) => {
  try {
    const { itemId, orderType, quantity, pricePerUnit, minQuantity, durationDays } = req.body;
    const playerId = req.user.playerId;
    const companyRes = await pool.query(
      'SELECT id, cash FROM companies WHERE player_id = $1', [playerId]
    );
    if (companyRes.rows.length === 0) return res.status(400).json({ error: 'No company found' });
    const company = companyRes.rows[0];
    if (orderType === 'buy') {
      const totalCost = quantity * pricePerUnit;
      if (parseFloat(company.cash) < totalCost) {
        return res.status(400).json({ error: 'Insufficient funds' });
      }
      await pool.query('UPDATE companies SET cash = cash - $1 WHERE id = $2', [totalCost, company.id]);
    }
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (durationDays || 30));
    await pool.query(`
      INSERT INTO market_orders (item_id, company_id, order_type, quantity, price_per_unit, min_quantity, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [itemId, company.id, orderType, quantity, pricePerUnit, minQuantity || 1, expiresAt]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/market/my-orders — get player's own orders
router.get('/my-orders', authMiddleware, async (req, res) => {
  try {
    const playerId = req.user.playerId;
    const companyRes = await pool.query('SELECT id FROM companies WHERE player_id = $1', [playerId]);
    if (companyRes.rows.length === 0) return res.json({ orders: [] });
    const result = await pool.query(`
      SELECT mo.*, mi.name as item_name, mi.category, mi.subcategory
      FROM market_orders mo
      JOIN market_items mi ON mi.id = mo.item_id
      WHERE mo.company_id = $1 AND mo.is_active = TRUE
      ORDER BY mo.created_at DESC
    `, [companyRes.rows[0].id]);
    res.json({ orders: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/market/order/:orderId — cancel order
router.delete('/order/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const playerId = req.user.playerId;
    const companyRes = await pool.query('SELECT id FROM companies WHERE player_id = $1', [playerId]);
    if (companyRes.rows.length === 0) return res.status(400).json({ error: 'No company found' });
    const orderRes = await pool.query(
      'SELECT * FROM market_orders WHERE id = $1 AND company_id = $2',
      [orderId, companyRes.rows[0].id]
    );
    if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderRes.rows[0];
    await pool.query('UPDATE market_orders SET is_active = FALSE WHERE id = $1', [orderId]);
    if (order.order_type === 'buy') {
      const refund = order.quantity * order.price_per_unit;
      await pool.query('UPDATE companies SET cash = cash + $1 WHERE id = $2', [refund, companyRes.rows[0].id]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error:
