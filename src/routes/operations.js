import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Operations: meetings, resources, notifications
router.get('/overview', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ module: 'operations', status: 'ok' });
});

router.get('/meetings', authenticateToken, requireRole(['admin', 'manager', 'employee']), async (req, res) => {
  res.json({ items: [], count: 0 });
});

router.get('/resources', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ items: [], count: 0 });
});

router.post('/notifications/test', authenticateToken, requireRole(['admin']), async (req, res) => {
  res.json({ sent: true });
});

export default router;


