import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { Proposal } from '../models/Proposal.js';
import { AuditLog } from '../models/AuditLog.js';

const router = express.Router();

// Get all proposals
router.get('/', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const proposals = await Proposal.findAll();
    res.json(proposals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// Create proposal
router.post('/', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { title, description, client_name, value, status } = req.body;

    const id = await Proposal.create({
      title,
      description,
      client_name,
      value,
      status,
      created_by: req.user.id
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_PROPOSAL',
      details: { proposal_id: id, title },
      ip_address: req.ip
    });

    res.status(201).json({ id, message: 'Proposal created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

// Update proposal
router.put('/:id', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const success = await Proposal.update(id, updates);

    if (!success) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_PROPOSAL',
      details: { proposal_id: id, updates },
      ip_address: req.ip
    });

    res.json({ message: 'Proposal updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update proposal' });
  }
});

// Delete proposal
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const success = await Proposal.delete(id);

    if (!success) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_PROPOSAL',
      details: { proposal_id: id },
      ip_address: req.ip
    });

    res.json({ message: 'Proposal deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete proposal' });
  }
});

export default router;
