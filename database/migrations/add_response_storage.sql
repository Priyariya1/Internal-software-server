-- Migration: Add response storage and sync tracking
-- This migration enhances the questionnaire_responses table to store Google Forms responses

USE core_flow_db;

-- Add answers column if it doesn't exist
SET @dbname = 'core_flow_db';
SET @tablename = 'questionnaire_responses';
SET @columnname = 'answers';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' JSON DEFAULT NULL AFTER respondent_email')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add google_response_id column if it doesn't exist
SET @columnname = 'google_response_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = @tablename AND table_schema = @dbname AND column_name = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(255) DEFAULT NULL AFTER id')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add response_data column if it doesn't exist
SET @columnname = 'response_data';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = @tablename AND table_schema = @dbname AND column_name = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' JSON DEFAULT NULL AFTER answers')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add synced_at column if it doesn't exist
SET @columnname = 'synced_at';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = @tablename AND table_schema = @dbname AND column_name = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' TIMESTAMP NULL DEFAULT NULL AFTER response_data')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add sync_status column if it doesn't exist
SET @columnname = 'sync_status';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = @tablename AND table_schema = @dbname AND column_name = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' ENUM(\'pending\', \'synced\', \'failed\', \'partial\') DEFAULT \'synced\' AFTER synced_at')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add google_sheet_url column if it doesn't exist
SET @columnname = 'google_sheet_url';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = @tablename AND table_schema = @dbname AND column_name = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' TEXT DEFAULT NULL AFTER sync_status')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add created_at column if it doesn't exist (rename submitted_at if needed)
SET @columnname = 'created_at';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = @tablename AND table_schema = @dbname AND column_name = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE questionnaire_responses CHANGE submitted_at created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add unique constraint to prevent duplicate Google Form responses
SET @constraint_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
    WHERE CONSTRAINT_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND CONSTRAINT_NAME = 'unique_google_response');

SET @sql = IF(@constraint_exists = 0,
    'ALTER TABLE questionnaire_responses ADD UNIQUE KEY unique_google_response (questionnaire_id, google_response_id)',
    'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add indexes for better query performance
SET @index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
    WHERE table_schema = @dbname AND table_name = @tablename AND index_name = 'idx_questionnaire_responses_google_response_id');
SET @sql = IF(@index_exists = 0,
    'CREATE INDEX idx_questionnaire_responses_google_response_id ON questionnaire_responses(google_response_id)',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
    WHERE table_schema = @dbname AND table_name = @tablename AND index_name = 'idx_questionnaire_responses_sync_status');
SET @sql = IF(@index_exists = 0,
    'CREATE INDEX idx_questionnaire_responses_sync_status ON questionnaire_responses(sync_status)',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
    WHERE table_schema = @dbname AND table_name = @tablename AND index_name = 'idx_questionnaire_responses_synced_at');
SET @sql = IF(@index_exists = 0,
    'CREATE INDEX idx_questionnaire_responses_synced_at ON questionnaire_responses(synced_at)',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add sync tracking table for questionnaires
CREATE TABLE IF NOT EXISTS questionnaire_sync_logs (
    id VARCHAR(36) PRIMARY KEY,
    questionnaire_id VARCHAR(36) NOT NULL,
    sync_type ENUM('manual', 'automatic', 'scheduled') DEFAULT 'manual',
    responses_fetched INT DEFAULT 0,
    responses_new INT DEFAULT 0,
    responses_updated INT DEFAULT 0,
    responses_failed INT DEFAULT 0,
    sync_status ENUM('in_progress', 'completed', 'failed', 'partial') DEFAULT 'in_progress',
    error_message TEXT DEFAULT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE
);

-- Add indexes for sync logs
SET @tablename = 'questionnaire_sync_logs';
SET @index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
    WHERE table_schema = @dbname AND table_name = @tablename AND index_name = 'idx_sync_logs_questionnaire_id');
SET @sql = IF(@index_exists = 0,
    'CREATE INDEX idx_sync_logs_questionnaire_id ON questionnaire_sync_logs(questionnaire_id)',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
    WHERE table_schema = @dbname AND table_name = @tablename AND index_name = 'idx_sync_logs_started_at');
SET @sql = IF(@index_exists = 0,
    'CREATE INDEX idx_sync_logs_started_at ON questionnaire_sync_logs(started_at)',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add columns to questionnaires table
SET @tablename = 'questionnaires';
SET @columnname = 'last_synced_at';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = @tablename AND table_schema = @dbname AND column_name = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' TIMESTAMP NULL DEFAULT NULL AFTER google_form_url')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = 'total_responses';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = @tablename AND table_schema = @dbname AND column_name = @columnname) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' INT DEFAULT 0 AFTER last_synced_at')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
