import pool from '../config/database.js';

export class AuditLog {
    static async create({ user_id, action, details, ip_address }) {
        try {
            const [result] = await pool.execute(
                'INSERT INTO audit_logs (user_id, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, NOW())',
                [user_id, action, JSON.stringify(details), ip_address]
            );
            return result.insertId;
        } catch (error) {
            console.error('Error creating audit log:', error);
            // Don't throw, just log error so it doesn't block the main action
        }
    }

    static async findAll({ limit = 100, offset = 0 } = {}) {
        const [rows] = await pool.execute(
            `SELECT a.*, p.full_name, p.email 
       FROM audit_logs a 
       LEFT JOIN profiles p ON a.user_id = p.id 
       ORDER BY a.created_at DESC 
       LIMIT ? OFFSET ?`,
            [limit.toString(), offset.toString()]
        );
        return rows;
    }
}
