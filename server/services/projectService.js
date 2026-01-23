// /server/services/projectService.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recursively insert eCTD nodes into the database
 * @param {Object} node - The node from the hierarchy JSON
 * @param {string} projectId - The project UUID
 * @param {string|null} parentId - The parent node UUID (null for root)
 * @param {Object} client - PostgreSQL client for transaction
 * @returns {Promise<string>} - The UUID of the inserted node
 */
async function insertNode(node, projectId, parentId, client) {
  const { name, node_type, sequence_number, children } = node;

  // Insert current node
  const result = await client.query(
    `INSERT INTO ectd_nodes (project_id, parent_id, name, node_type, sequence_number)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [projectId, parentId, name, node_type || 'folder', sequence_number || null]
  );

  const nodeId = result.rows[0].id;

  // Recursively insert children
  if (children && Array.isArray(children)) {
    for (const child of children) {
      await insertNode(child, projectId, nodeId, client);
    }
  }

  return nodeId;
}

/**
 * Create a new project with full eCTD hierarchy
 * @param {Object} projectData - Project creation data
 * @param {number} organizationId - Organization ID from auth token
 * @returns {Promise<Object>} - Created project with node count
 */
async function createProjectWithHierarchy(projectData, organizationId) {
  const { name, type, status = 'active', metadata = {} } = projectData;

  // Load the FDA eCTD hierarchy
  const hierarchyPath = path.join(__dirname, '../data/fda-ectd-hierarchy.json');
  const hierarchyData = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Create the project
    const projectResult = await client.query(
      `INSERT INTO projects (organization_id, name, type, status, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, type, status, created_at`,
      [organizationId, name, type || 'IND', status, JSON.stringify(metadata)]
    );

    const project = projectResult.rows[0];

    // 2. Insert the entire eCTD hierarchy
    await insertNode(hierarchyData, project.id, null, client);

    // 3. Count the nodes created
    const countResult = await client.query(
      `SELECT COUNT(*) FROM ectd_nodes WHERE project_id = $1`,
      [project.id]
    );

    await client.query('COMMIT');

    return {
      ...project,
      node_count: parseInt(countResult.rows[0].count),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get project by ID with node structure
 * @param {string} projectId - Project UUID
 * @returns {Promise<Object>} - Project with hierarchical nodes
 */
async function getProjectById(projectId) {
  const client = await pool.connect();

  try {
    // Get project
    const projectResult = await client.query(
      `SELECT id, name, type, status, metadata, created_at, updated_at
       FROM projects
       WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return null;
    }

    const project = projectResult.rows[0];

    // Get all nodes for the project
    const nodesResult = await client.query(
      `SELECT id, parent_id, name, node_type, sequence_number
       FROM ectd_nodes
       WHERE project_id = $1
       ORDER BY sequence_number NULLS LAST, name`,
      [projectId]
    );

    // Build hierarchy
    const nodesById = {};
    const rootNodes = [];

    nodesResult.rows.forEach(node => {
      nodesById[node.id] = { ...node, children: [] };
    });

    nodesResult.rows.forEach(node => {
      if (node.parent_id === null) {
        rootNodes.push(nodesById[node.id]);
      } else if (nodesById[node.parent_id]) {
        nodesById[node.parent_id].children.push(nodesById[node.id]);
      }
    });

    return {
      ...project,
      nodes: rootNodes[0], // Return the root node with full hierarchy
      node_count: nodesResult.rows.length,
    };
  } finally {
    client.release();
  }
}

/**
 * Get all projects for an organization
 * @param {number} organizationId - Organization ID
 * @returns {Promise<Array>} - List of projects
 */
async function getAllProjects(organizationId) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT p.id, p.name, p.type, p.status, p.metadata, p.created_at, p.updated_at,
              COUNT(e.id) as node_count
       FROM projects p
       LEFT JOIN ectd_nodes e ON e.project_id = p.id
       WHERE p.organization_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [organizationId]
    );

    return result.rows.map(row => ({
      ...row,
      node_count: parseInt(row.node_count),
    }));
  } finally {
    client.release();
  }
}

export {
  createProjectWithHierarchy,
  getProjectById,
  getAllProjects,
};
