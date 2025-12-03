import pool from '../config/database.js';

export const initSchema = async () => {
  try {
    const connection = await pool.getConnection();

    // Audit Logs Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        action VARCHAR(255) NOT NULL,
        details JSON,
        ip_address VARCHAR(45),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      )
    `);

    // Proposals Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS proposals (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        client_name VARCHAR(255),
        value DECIMAL(15, 2),
        status VARCHAR(50) DEFAULT 'draft',
        created_by VARCHAR(36) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_created_by (created_by),
        INDEX idx_status (status)
      )
    `);

    // Create password_reset_otps table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS password_reset_otps (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_expires_at (expires_at)
      )
    `);

    console.log('Database schema initialized successfully');
    connection.release();
  } catch (error) {
    console.error('Error initializing schema:', error);
  }
};
