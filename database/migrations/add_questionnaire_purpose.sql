-- Migration: Add purpose column to questionnaires table
-- This column is used for role-based access control

USE core_flow_db;

-- Add purpose column to questionnaires table
ALTER TABLE questionnaires 
ADD COLUMN purpose ENUM(
    'employee_feedback',
    'client_requirements', 
    'recruitment',
    'onboarding'
) DEFAULT 'employee_feedback' AFTER description;

-- Add index for better query performance
CREATE INDEX idx_questionnaires_purpose ON questionnaires(purpose);
