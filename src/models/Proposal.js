import pool from '../config/database.js';

// Simple UUID generator (reused from User.js for consistency if needed, though auto-increment ID is often easier for simple items, let's stick to UUIDs for consistency if the DB uses them, but the schema seems to imply mixed usage. Let's use UUIDs for IDs to be safe and consistent with User model)
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export class Proposal {
    static async create({ title, description, client_name, value, status = 'draft', created_by }) {
        const id = generateUUID();
        await pool.execute(
            'INSERT INTO proposals (id, title, description, client_name, value, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
            [id, title, description, client_name, value, status, created_by]
        );
        return id;
    }

    static async findAll() {
        const [rows] = await pool.execute(
            `SELECT p.*, u.full_name as created_by_name 
       FROM proposals p 
       LEFT JOIN profiles u ON p.created_by = u.id 
       ORDER BY p.updated_at DESC`
        );
        return rows;
    }

    static async findById(id) {
        const [rows] = await pool.execute(
            `SELECT p.*, u.full_name as created_by_name 
       FROM proposals p 
       LEFT JOIN profiles u ON p.created_by = u.id 
       WHERE p.id = ?`,
            [id]
        );
        return rows[0];
    }

    static async update(id, updates) {
        const fields = [];
        const values = [];

        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(updates[key]);
            }
        });

        if (fields.length === 0) return null;

        values.push(id);
        const [result] = await pool.execute(
            `UPDATE proposals SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
            values
        );

        return result.affectedRows > 0;
    }

    static async delete(id) {
        const [result] = await pool.execute('DELETE FROM proposals WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}
