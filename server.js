require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server: SocketIOServer } = require('socket.io');
const path = require('path');

// Import modules
const { initDatabase, pool } = require('./src/db/connection');
const authRoutes = require('./src/routes/auth');
const gameRoutes = require('./src/routes/game');
const statsRoutes = require('./src/routes/stats');
const bankingRoutes = require('./src/routes/banking');
const { initializeScheduler } = require('./src/jobs/scheduler');

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Database health check
app.get('/db-health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'DB Connected', timestamp: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'DB Error', error: err.message });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/banking', bankingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ error: err.message });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Listen for player events
  socket.on('player-join', (data) => {
    console.log(`Player joined: ${data.playerId}`);
    socket.broadcast.emit('player-status', { playerId: data.playerId, status: 'online' });
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
  });
});

// Initialize database and start server
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await initDatabase();
    console.log('✓ Database initialized');

// Tick engine - updates company statistics every 1 second
const startTickEngine = async () => {
  setInterval(async () => {
    try {
      const companiesResult = await pool.query('SELECT id FROM companies');
      const companies = companiesResult.rows;

      for (const company of companies) {
        const companyId = company.id;

        await pool.query(`
          UPDATE company_statistics
          SET 
            seconds_in_operation = EXTRACT(EPOCH FROM (NOW() - company_created_at))::INT,
            days_in_operation = EXTRACT(DAY FROM (NOW() - company_created_at))::INT,
            hours_in_operation = EXTRACT(EPOCH FROM (NOW() - company_created_at))::INT / 3600,
            minutes_in_operation = EXTRACT(EPOCH FROM (NOW() - company_created_at))::INT / 60,
            updated_at = NOW()
          WHERE company_id = $1
        `, [companyId]);
      }
    } catch (error) {
      console.error('Tick engine error:', error);
    }
  }, 1000);
};

startTickEngine();
console.log('✓ Tick engine started');

    httpServer.listen(PORT, process.env.HOST || 'localhost', () => {
      console.log(`✓ Server running on http://${process.env.HOST || 'localhost'}:${PORT}`);
      console.log(`✓ Socket.io listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('✗ Failed to start server:', err);
    process.exit(1);
  }
})();

// Initialize background tick system
initializeScheduler();

module.exports = { app, io, httpServer };
