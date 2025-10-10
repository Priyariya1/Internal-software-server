import pool from '../config/database.js';

export class Employee {
  static async create(employeeData) {
    const {
      full_name,
      email,
      phone,
      department,
      position,
      salary,
      join_date,
      status = 'active',
      created_by
    } = employeeData;

    const [result] = await pool.execute(
      `INSERT INTO employees (id, full_name, email, phone, department, position, salary, join_date, status, created_by, created_at, updated_at) 
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [full_name, email, phone, department, position, salary, join_date, status, created_by]
    );

    return result.insertId;
  }

  static async findAll(limit = 50, offset = 0) {
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 50;
    const safeOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;
    const sql = `SELECT e.*, p.full_name as created_by_name
                 FROM employees e
                 LEFT JOIN profiles p ON e.created_by = p.id
                 ORDER BY e.created_at DESC
                 LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    const [rows] = await pool.execute(sql);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT e.*, p.full_name as created_by_name 
       FROM employees e 
       LEFT JOIN profiles p ON e.created_by = p.id 
       WHERE e.id = ?`,
      [id]
    );
    return rows[0];
  }

  static async findByEmail(email) {
    const [rows] = await pool.execute(
      'SELECT * FROM employees WHERE email = ?',
      [email]
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
      `UPDATE employees SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );
    
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM employees WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async count() {
    const [rows] = await pool.execute('SELECT COUNT(*) as count FROM employees');
    return rows[0].count;
  }

  static async findByDepartment(department, limit = 50, offset = 0) {
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 50;
    const safeOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;
    const sql = `SELECT e.*, p.full_name as created_by_name
                 FROM employees e
                 LEFT JOIN profiles p ON e.created_by = p.id
                 WHERE e.department = ?
                 ORDER BY e.created_at DESC
                 LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    const [rows] = await pool.execute(sql, [department]);
    return rows;
  }
}
