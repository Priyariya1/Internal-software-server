import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Simple UUID generator
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export class User {
    static async create({ email, password, full_name, avatar_url = null }) {
        try {
          const userId = generateUUID();
          //  MODIFICATION: Added 'password' to the INSERT statement
          const [result] = await pool.execute(
            'INSERT INTO profiles (id, email, password, full_name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
            [userId, email, password, full_name, avatar_url] // 'password' is the HASHED password
          );
          
          const roleId = generateUUID();
          await pool.execute(
            'INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, "employee", NOW())',
            [roleId, userId]
          );
          
          return userId;
        } catch (error) {
          console.error('Error creating user:', error);
          throw error;
        }
      }

  static async findByEmail(email) {
    // Prefer highest-privilege role if multiple rows exist
    const [rows] = await pool.execute(
      'SELECT p.*, ur.role FROM profiles p LEFT JOIN user_roles ur ON p.id = ur.user_id WHERE p.email = ? ORDER BY FIELD(ur.role, "admin", "manager", "employee") LIMIT 1',
      [email]
    );
    return rows[0];
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT p.*, ur.role FROM profiles p LEFT JOIN user_roles ur ON p.id = ur.user_id WHERE p.id = ? ORDER BY FIELD(ur.role, "admin", "manager", "employee") LIMIT 1',
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
      `UPDATE profiles SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );
    
    return result.affectedRows > 0;
  }

  static generateToken(user) {
    return jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  }

  static async verifyPassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
  }
}
