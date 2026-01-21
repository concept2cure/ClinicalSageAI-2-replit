CREATE TABLE IF NOT EXISTS document_drafts (
    section_id VARCHAR(50) PRIMARY KEY,
    content TEXT,
    last_updated TIMESTAMP DEFAULT NOW(),
    updated_by VARCHAR(50)
);
