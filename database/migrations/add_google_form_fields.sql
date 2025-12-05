USE core_flow_db;

ALTER TABLE questionnaires 
ADD COLUMN google_form_id VARCHAR(255) DEFAULT NULL AFTER purpose,
ADD COLUMN google_form_url TEXT DEFAULT NULL AFTER google_form_id;
