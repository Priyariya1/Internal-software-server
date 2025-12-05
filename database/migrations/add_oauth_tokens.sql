USE core_flow_db;

CREATE TABLE IF NOT EXISTS oauth_tokens (
    user_id VARCHAR(36) PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expiry_date BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);
