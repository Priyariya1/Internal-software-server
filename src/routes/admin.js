import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import pool from '../config/database.js';
import { AuditLog } from '../models/AuditLog.js';

const router = express.Router();

// Get all users
router.get('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const [users] = await pool.execute(`
      SELECT p.id, p.email, p.full_name, p.created_at, ur.role 
      FROM profiles p 
      LEFT JOIN user_roles ur ON p.id = ur.user_id 
      ORDER BY p.created_at DESC
    `);
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Update user role
router.put('/users/:id/role', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (!['admin', 'manager', 'employee'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Update or insert role (assuming one role per user for simplicity as per User.js logic)
        // First, delete existing role
        await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [id]);

        // Insert new role
        // We need a UUID for the role entry, let's generate one or just use a random string since it's internal
        const roleId = Math.random().toString(36).substring(2, 15);
        await pool.execute(
            'INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, NOW())',
            [roleId, id, role]
        );

        await AuditLog.create({
            user_id: req.user.id,
            action: 'UPDATE_USER_ROLE',
            details: { target_user_id: id, new_role: role },
            ip_address: req.ip
        });

        res.json({ message: 'User role updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update user role' });
    }
});

// Get audit logs
router.get('/audit-logs', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const logs = await AuditLog.findAll({ limit: 200 });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

export default router;
