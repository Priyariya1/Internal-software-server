import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Proposals: draft to approval, revenue opportunities
router.get('/overview', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ module: 'proposals', status: 'ok' });
});

router.get('/', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ items: [] });
});

router.post('/', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.status(201).json({ id: null });
});

export default router;


