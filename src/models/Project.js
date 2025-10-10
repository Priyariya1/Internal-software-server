import pool from '../config/database.js';

export class Project {
  static async create(projectData) {
    const {
      name,
      description,
      client_name,
      start_date,
      end_date,
      budget,
      status = 'planning',
      created_by
    } = projectData;

    const [result] = await pool.execute(
      `INSERT INTO projects (id, name, description, client_name, start_date, end_date, budget, status, created_by, created_at, updated_at) 
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [name, description, client_name, start_date, end_date, budget, status, created_by]
    );

    return result.insertId;
  }

  static async findAll(limit = 50, offset = 0) {
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 50;
    const safeOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;
    const sql = `SELECT p.*, pr.full_name as created_by_name
                 FROM projects p
                 LEFT JOIN profiles pr ON p.created_by = pr.id
                 ORDER BY p.created_at DESC
                 LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    const [rows] = await pool.execute(sql);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT p.*, pr.full_name as created_by_name 
       FROM projects p 
       LEFT JOIN profiles pr ON p.created_by = pr.id 
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
      `UPDATE projects SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );
    
    return result.affectedRows > 0;
  }

  static async delete(id) {
    // First delete related project assignments
    await pool.execute('DELETE FROM project_assignments WHERE project_id = ?', [id]);
    
    // Then delete the project
    const [result] = await pool.execute('DELETE FROM projects WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async count() {
    const [rows] = await pool.execute('SELECT COUNT(*) as count FROM projects');
    return rows[0].count;
  }

  static async findByStatus(status, limit = 50, offset = 0) {
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 50;
    const safeOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;
    const sql = `SELECT p.*, pr.full_name as created_by_name
                 FROM projects p
                 LEFT JOIN profiles pr ON p.created_by = pr.id
                 WHERE p.status = ?
                 ORDER BY p.created_at DESC
                 LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    const [rows] = await pool.execute(sql, [status]);
    return rows;
  }

  static async getProjectAssignments(projectId) {
    const [rows] = await pool.execute(
      `SELECT pa.*, e.full_name as employee_name, e.email as employee_email 
       FROM project_assignments pa 
       JOIN employees e ON pa.employee_id = e.id 
       WHERE pa.project_id = ?`,
      [projectId]
    );
    return rows;
  }

  static async assignEmployee(projectId, employeeId, role = null) {
    const [result] = await pool.execute(
      'INSERT INTO project_assignments (id, project_id, employee_id, role, assigned_at) VALUES (UUID(), ?, ?, ?, NOW())',
      [projectId, employeeId, role]
    );
    return result.insertId;
  }

  static async removeEmployeeAssignment(projectId, employeeId) {
    const [result] = await pool.execute(
      'DELETE FROM project_assignments WHERE project_id = ? AND employee_id = ?',
      [projectId, employeeId]
    );
    return result.affectedRows > 0;
  }
}
