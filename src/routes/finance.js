import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Finance: expenses, invoices, P/L, Razorpay webhook placeholder
router.get('/overview', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ module: 'finance', status: 'ok' });
});

router.get('/expenses', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ items: [], count: 0 });
});

router.get('/invoices', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ items: [], count: 0 });
});

router.get('/profit-loss', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ revenue: 0, expenses: 0, profit: 0 });
});

// Placeholder for Razorpay webhook
router.post('/webhooks/razorpay', async (req, res) => {
  // TODO: verify signature and handle events
  res.status(204).send();
});

export default router;


