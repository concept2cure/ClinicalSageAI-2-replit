// /server/services/ectdSeederService.ts

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ECTDNode {
  name: string;
  node_type: string;
  sequence_number?: number;
  children?: ECTDNode[];
}

/**
 * Recursively insert eCTD nodes into the database
 */
async function insertNode(
  node: ECTDNode,
  projectId: string,
  parentId: string | null,
  client: any
): Promise<string> {
  const { name, node_type, sequence_number, children } = node;

  const result = await client.query(
    `INSERT INTO ectd_nodes (project_id, parent_id, name, node_type, sequence_number)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [projectId, parentId, name, node_type || 'folder', sequence_number || null]
  );

  const nodeId = result.rows[0].id;

  if (children && Array.isArray(children)) {
    for (const child of children) {
      await insertNode(child, projectId, nodeId, client);
    }
  }

  return nodeId;
}

/**
 * Seed eCTD hierarchy for an existing project
 * @param projectId - UUID of the project (from projects table)
 * @returns Number of nodes created
 */
export async function seedECTDHierarchy(projectId: string): Promise<number> {
  const hierarchyPath = path.join(__dirname, '../data/fda-ectd-hierarchy.json');
  const hierarchyData: ECTDNode = JSON.parse(fs.readFileSync(hierarchyPath, 'utf8'));

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if hierarchy already exists for this project
    const existingResult = await client.query(
      `SELECT COUNT(*) FROM ectd_nodes WHERE project_id = $1`,
      [projectId]
    );

    if (parseInt(existingResult.rows[0].count) > 0) {
      console.log(`ℹ️  eCTD hierarchy already exists for project ${projectId}`);
      await client.query('ROLLBACK');
      return parseInt(existingResult.rows[0].count);
    }

    // Insert the entire eCTD hierarchy
    await insertNode(hierarchyData, projectId, null, client);

    // Count the nodes created
    const countResult = await client.query(
      `SELECT COUNT(*) FROM ectd_nodes WHERE project_id = $1`,
      [projectId]
    );

    await client.query('COMMIT');

    const nodeCount = parseInt(countResult.rows[0].count);
    console.log(`✅ Created ${nodeCount} eCTD nodes for project ${projectId}`);

    return nodeCount;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Failed to seed eCTD hierarchy for project ${projectId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get eCTD hierarchy for a project
 */
export async function getECTDHierarchy(projectId: string): Promise<any> {
  const client = await pool.connect();

  try {
    // Get all nodes for the project
    const nodesResult = await client.query(
      `SELECT id, parent_id, name, node_type, sequence_number
       FROM ectd_nodes
       WHERE project_id = $1
       ORDER BY sequence_number NULLS LAST, name`,
      [projectId]
    );

    if (nodesResult.rows.length === 0) {
      return null;
    }

    // Build hierarchy
    const nodesById: Record<string, any> = {};
    const rootNodes: any[] = [];

    nodesResult.rows.forEach((node) => {
      nodesById[node.id] = { ...node, children: [] };
    });

    nodesResult.rows.forEach((node) => {
      if (node.parent_id === null) {
        rootNodes.push(nodesById[node.id]);
      } else if (nodesById[node.parent_id]) {
        nodesById[node.parent_id].children.push(nodesById[node.id]);
      }
    });

    return {
      project_id: projectId,
      node_count: nodesResult.rows.length,
      hierarchy: rootNodes[0] || null,
    };
  } finally {
    client.release();
  }
}
