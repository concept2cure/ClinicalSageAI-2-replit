/**
 * IND Sequence Models
 *
 * Database models for IND eCTD sequences and related audit trail entries.
 */

const { db } = require('../db');

/**
 * Initialize database tables for IND sequences and audit trail
 */
async function initIndSequenceTables() {
  try {
    // Check if tables already exist
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'ind_sequences'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('IND sequence tables already exist');
      return;
    }

    // Create sequence table
    await db.query(`
      CREATE TABLE ind_sequences (
        id SERIAL PRIMARY KEY,
        sequence_number VARCHAR(10) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by INTEGER NOT NULL,
        document_count INTEGER NOT NULL DEFAULT 0,
        directory_path TEXT NOT NULL,
        ind_number VARCHAR(20),
        status VARCHAR(20) DEFAULT 'draft',
        submission_date TIMESTAMP,
        validation_status VARCHAR(20) DEFAULT 'not_validated',
        validation_details JSONB
      );
    `);

    // Create audit trail table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_trail (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        event_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        user_id INTEGER NOT NULL,
        event_details JSONB NOT NULL
      );
    `);

    // Create document updates tracking table
    await db.query(`
      CREATE TABLE IF NOT EXISTS document_lifecycle (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        sequence_id INTEGER NOT NULL,
        operation VARCHAR(20) NOT NULL,
        version VARCHAR(10) NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        md5_hash VARCHAR(32) NOT NULL,
        CONSTRAINT fk_sequence FOREIGN KEY(sequence_id) REFERENCES ind_sequences(id),
        CONSTRAINT fk_document FOREIGN KEY(document_id) REFERENCES documents(id)
      );
    `);

    console.log('Successfully created IND sequence tables');
  } catch (error) {
    console.error('Error creating IND sequence tables:', error);
    throw error;
  }
}

/**
 * Get sequence by ID
 */
async function getSequenceById(id) {
  try {
    const result = await db.query('SELECT * FROM ind_sequences WHERE id = $1', [id]);
    return result.rows[0];
  } catch (error) {
    console.error('Error retrieving sequence:', error);
    throw error;
  }
}

/**
 * Get sequence by sequence number
 */
async function getSequenceByNumber(sequenceNumber) {
  try {
    const result = await db.query('SELECT * FROM ind_sequences WHERE sequence_number = $1', [
      sequenceNumber,
    ]);
    return result.rows[0];
  } catch (error) {
    console.error('Error retrieving sequence:', error);
    throw error;
  }
}

/**
 * Get audit trail for a sequence
 */
async function getSequenceAuditTrail(sequenceNumber) {
  try {
    const result = await db.query(
      `
      SELECT at.* 
      FROM audit_trail at
      WHERE at.event_details->>'sequence' = $1
      ORDER BY at.event_timestamp DESC
    `,
      [sequenceNumber]
    );

    return result.rows;
  } catch (error) {
    console.error('Error retrieving audit trail:', error);
    throw error;
  }
}

/**
 * Update sequence status
 */
async function updateSequenceStatus(sequenceId, status, userId) {
  try {
    // Update status
    await db.query('UPDATE ind_sequences SET status = $1 WHERE id = $2', [status, sequenceId]);

    // Add audit entry
    await db.query(
      'INSERT INTO audit_trail (event_type, user_id, event_details) VALUES ($1, $2, $3)',
      [
        'SEQUENCE_STATUS_CHANGE',
        userId,
        JSON.stringify({
          sequenceId,
          newStatus: status,
          timestamp: new Date().toISOString(),
        }),
      ]
    );

    return true;
  } catch (error) {
    console.error('Error updating sequence status:', error);
    throw error;
  }
}

/**
 * Get documents included in a sequence
 */
async function getSequenceDocuments(sequenceNumber) {
  try {
    const result = await db.query(
      `
      SELECT d.id, d.title, d.version, dl.operation, dl.md5_hash, dl.timestamp
      FROM document_lifecycle dl
      JOIN documents d ON d.id = dl.document_id
      JOIN ind_sequences s ON s.id = dl.sequence_id
      WHERE s.sequence_number = $1
    `,
      [sequenceNumber]
    );

    return result.rows;
  } catch (error) {
    console.error('Error retrieving sequence documents:', error);
    throw error;
  }
}

module.exports = {
  initIndSequenceTables,
  getSequenceById,
  getSequenceByNumber,
  getSequenceAuditTrail,
  updateSequenceStatus,
  getSequenceDocuments,
};
