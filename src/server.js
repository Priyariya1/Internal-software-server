import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection } from './config/database.js';
import authRoutes from './routes/auth.js';
import employeeRoutes from './routes/employees.js';
import projectRoutes from './routes/projects.js';
import hrRoutes from './routes/hr.js';
import financeRoutes from './routes/finance.js';
import operationsRoutes from './routes/operations.js';
import analyticsRoutes from './routes/analytics.js';
import questionnairesRoutes from './routes/questionnaires.js';
import proposalsRoutes from './routes/proposals.js';
import adminRoutes from './routes/admin.js';
import { initSchema } from './models/schema.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin:
    process.env.NODE_ENV === 'production'
      ? ['https://yourdomain.com']
      : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Test DB
testConnection();
initSchema();

// Base route
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Core Flow API is running!',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      employees: '/api/employees',
      projects: '/api/projects',
      hr: '/api/hr',
      finance: '/api/finance',
      operations: '/api/operations',
      analytics: '/api/analytics',
      questionnaires: '/api/questionnaires',
      proposals: '/api/proposals',
      health: '/api/health',
    },
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/operations', operationsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/questionnaires', questionnairesRoutes);
app.use('/api/proposals', proposalsRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Test database endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const pool = await import('./config/database.js');
    const [rows] = await pool.default.execute('SELECT COUNT(*) as count FROM profiles');
    res.json({
      status: 'Database OK',
      profileCount: rows[0].count
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      error: 'Database error',
      message: error.message
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Base URL: http://localhost:${PORT}/api`);
});
