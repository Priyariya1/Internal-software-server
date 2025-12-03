-- Core Flow Database Schema
-- MySQL/MariaDB compatible

CREATE DATABASE IF NOT EXISTS core_flow_db;
USE core_flow_db;

-- Profiles table (users)
CREATE TABLE IF NOT EXISTS profiles (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- User roles table
CREATE TABLE IF NOT EXISTS user_roles (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    role ENUM('admin', 'manager', 'employee') NOT NULL DEFAULT 'employee',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    department VARCHAR(100),
    position VARCHAR(100),
    salary DECIMAL(10, 2),
    join_date DATE,
    status ENUM('active', 'inactive', 'terminated') DEFAULT 'active',
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    client_name VARCHAR(255),
    start_date DATE,
    end_date DATE,
    budget DECIMAL(12, 2),
    status ENUM('planning', 'in_progress', 'on_hold', 'completed', 'cancelled') DEFAULT 'planning',
    created_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Project assignments table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS project_assignments (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    project_id VARCHAR(36) NOT NULL,
    employee_id VARCHAR(36) NOT NULL,
    role VARCHAR(100),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    UNIQUE KEY unique_assignment (project_id, employee_id)
);

-- ==========================================
-- QUESTIONNAIRE MODULE TABLES
-- ==========================================

-- Main questionnaire form
CREATE TABLE IF NOT EXISTS questionnaires (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_by VARCHAR(36) NOT NULL,
    is_anonymous BOOLEAN DEFAULT FALSE,
    is_template BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Questions in each questionnaire
CREATE TABLE IF NOT EXISTS questionnaire_questions (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    questionnaire_id VARCHAR(36) NOT NULL,
    question_text TEXT NOT NULL,
    question_type ENUM(
        'short_text', 
        'long_text', 
        'multiple_choice', 
        'checkbox', 
        'dropdown', 
        'rating', 
        'file_upload', 
        'date'
    ) NOT NULL,
    options JSON NULL,   -- For MCQs, dropdowns, checkboxes
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE
);

-- Form assignments (who receives the form)
CREATE TABLE IF NOT EXISTS questionnaire_assignments (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    questionnaire_id VARCHAR(36) NOT NULL,
    assigned_to VARCHAR(36),        -- profile_id (employee, manager, etc.)
    assigned_to_email VARCHAR(255), -- for external clients
    scheduled_date DATE,
    status ENUM('assigned', 'completed', 'pending') DEFAULT 'assigned',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Responses from users
CREATE TABLE IF NOT EXISTS questionnaire_responses (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    questionnaire_id VARCHAR(36) NOT NULL,
    responder_id VARCHAR(36) NULL,
    answers JSON NOT NULL, -- { questionId: "answer value" }
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE,
    FOREIGN KEY (responder_id) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_questionnaires_created_by ON questionnaires(created_by);
CREATE INDEX idx_questionnaire_assignments_questionnaire_id ON questionnaire_assignments(questionnaire_id);
CREATE INDEX idx_questionnaire_responses_questionnaire_id ON questionnaire_responses(questionnaire_id);


-- Create indexes for better performance
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_employees_email ON employees(email);
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_project_assignments_project_id ON project_assignments(project_id);
CREATE INDEX idx_project_assignments_employee_id ON project_assignments(employee_id);

-- Insert sample admin user (password: admin123)
-- Note: In production, you should hash passwords properly
INSERT INTO profiles (id, email, full_name) VALUES 
('admin-001', 'admin@coreflow.com', 'System Administrator');

INSERT INTO user_roles (user_id, role) VALUES 
('admin-001', 'admin');

-- Insert sample manager
INSERT INTO profiles (id, email, full_name) VALUES 
('manager-001', 'manager@coreflow.com', 'Project Manager');

INSERT INTO user_roles (user_id, role) VALUES 
('manager-001', 'manager');

-- Insert sample employee
INSERT INTO profiles (id, email, full_name) VALUES 
('employee-001', 'employee@coreflow.com', 'John Doe');

INSERT INTO user_roles (user_id, role) VALUES 
('employee-001', 'employee');

-- Insert sample employees
INSERT INTO employees (id, full_name, email, phone, department, position, salary, join_date, status, created_by) VALUES
('emp-001', 'John Doe', 'john.doe@company.com', '+1234567890', 'Engineering', 'Software Developer', 75000.00, '2023-01-15', 'active', 'admin-001'),
('emp-002', 'Jane Smith', 'jane.smith@company.com', '+1234567891', 'Engineering', 'Senior Developer', 95000.00, '2022-06-01', 'active', 'admin-001'),
('emp-003', 'Mike Johnson', 'mike.johnson@company.com', '+1234567892', 'Marketing', 'Marketing Manager', 65000.00, '2023-03-10', 'active', 'manager-001'),
('emp-004', 'Sarah Wilson', 'sarah.wilson@company.com', '+1234567893', 'HR', 'HR Specialist', 55000.00, '2023-02-20', 'active', 'admin-001');

-- Insert sample projects
INSERT INTO projects (id, name, description, client_name, start_date, end_date, budget, status, created_by) VALUES
('proj-001', 'E-commerce Platform', 'Build a modern e-commerce platform with React and Node.js', 'TechCorp Inc.', '2024-01-01', '2024-06-30', 150000.00, 'in_progress', 'manager-001'),
('proj-002', 'Mobile App Development', 'Develop a cross-platform mobile application', 'StartupXYZ', '2024-02-15', '2024-08-15', 120000.00, 'planning', 'manager-001'),
('proj-003', 'Data Analytics Dashboard', 'Create analytics dashboard for business intelligence', 'DataCorp', '2023-11-01', '2024-01-31', 80000.00, 'completed', 'admin-001');

-- Insert sample project assignments
INSERT INTO project_assignments (project_id, employee_id, role) VALUES
('proj-001', 'emp-001', 'Lead Developer'),
('proj-001', 'emp-002', 'Senior Developer'),
('proj-002', 'emp-001', 'Frontend Developer'),
('proj-002', 'emp-002', 'Backend Developer'),
('proj-003', 'emp-001', 'Full Stack Developer');
