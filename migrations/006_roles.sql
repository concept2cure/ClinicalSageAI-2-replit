CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
INSERT INTO roles (name) VALUES ('Admin'),('Editor'),('Viewer') ON CONFLICT DO NOTHING;

ALTER TABLE user_organizations ADD COLUMN role_id INT REFERENCES roles(id) DEFAULT 2; -- default Editor