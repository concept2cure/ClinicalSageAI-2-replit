// CMC Event Handlers

// Helper function to generate spec table for CMC data
function generateSpecTable(specs) {
  return {
    headers: ['Parameter', 'Acceptance Criteria', 'Method'],
    rows: specs.map(spec => [
      spec.parameter || '',
      spec.criteria || '',
      spec.method || ''
    ])
  };
}

// Helper function to generate stability table for CMC data
function generateStabilityTable(stability) {
  return {
    headers: ['Time Point', 'Temperature', 'Test', 'Results'],
    rows: stability.map(s => [
      s.timepoint || '',
      s.temperature || '',
      s.test || '',
      s.results || ''
    ])
  };
}

// Helper function to save leaf patches and broadcast updates
async function saveLeafPatch(patch) {
  // Use in-memory storage as per guidelines
  const leaves = global.leavesStorage || (global.leavesStorage = new Map());
  const patches = global.patchesStorage || (global.patchesStorage = new Map());
  
  // Save patch
  patches.set(patch.id, patch);
  
  // Update or create leaf
  let leaf = leaves.get(patch.leaf_id);
  if (!leaf) {
    leaf = {
      id: patch.leaf_id,
      content: '',
      blocks: [],
      citations: [],
      patches: []
    };
    leaves.set(patch.leaf_id, leaf);
  }
  
  leaf.patches.push(patch.id);
  
  // Broadcast to connected SSE clients
  const { broadcastPatch } = await import('../routes/leaves.js');
  broadcastPatch(patch.leaf_id, patch);
  
  return patch;
}

// Handle specification approval events
export async function handleSpecApproved(spec) {
  const patch = {
    id: `patch_spec_${Date.now()}`,
    type: 'spec.approved',
    timestamp: new Date(),
    leaf_id: `m3.2.P.5-${spec.id}`,
    blocks: [{
      type: 'table',
      content: generateSpecTable([spec]),
      ctd_path: 'm3.2.P.5',
      tracked: true
    }],
    citations: [`spec_${spec.id}`]
  };
  
  await saveLeafPatch(patch);
  return patch;
}

// Handle stability update events
export async function handleStabilityUpdated(stability) {
  const patch = {
    id: `patch_stability_${Date.now()}`,
    type: 'stability.updated',
    timestamp: new Date(),
    leaf_id: `m3.2.P.8-${stability.id}`,
    blocks: [{
      type: 'table',
      content: generateStabilityTable([stability]),
      ctd_path: 'm3.2.P.8',
      tracked: true
    }],
    citations: [`stability_${stability.id}`]
  };
  
  await saveLeafPatch(patch);
  return patch;
}

// Handle analytical method validation events
export async function handleMethodValidated(method) {
  const patch = {
    id: `patch_method_${Date.now()}`,
    type: 'method.validated',
    timestamp: new Date(),
    leaf_id: `m3.2.S.4-${method.id}`,
    blocks: [{
      type: 'text',
      content: `Analytical method "${method.name}" has been validated.\nValidation parameters: ${JSON.stringify(method.parameters)}\nResults: ${method.results}`,
      ctd_path: 'm3.2.S.4',
      tracked: true
    }],
    citations: [`method_${method.id}`]
  };
  
  await saveLeafPatch(patch);
  return patch;
}

// Handle manufacturing process update events
export async function handleManufacturingUpdated(process) {
  const patch = {
    id: `patch_manufacturing_${Date.now()}`,
    type: 'manufacturing.updated',
    timestamp: new Date(),
    leaf_id: `m3.2.S.2-${process.id}`,
    blocks: [{
      type: 'section',
      content: `Manufacturing process update: ${process.description}`,
      ctd_path: 'm3.2.S.2',
      tracked: true,
      metadata: {
        processId: process.id,
        batchNumber: process.batchNumber,
        gmpCompliance: process.gmpCompliance
      }
    }],
    citations: [`process_${process.id}`]
  };
  
  await saveLeafPatch(patch);
  return patch;
}

// Handle batch release events
export async function handleBatchReleased(batch) {
  const patch = {
    id: `patch_batch_${Date.now()}`,
    type: 'batch.released',
    timestamp: new Date(),
    leaf_id: `m3.2.P.3-${batch.id}`,
    blocks: [{
      type: 'record',
      content: {
        batchNumber: batch.number,
        releaseDate: batch.releaseDate,
        specifications: batch.specifications,
        testResults: batch.testResults,
        qpApproval: batch.qpApproval
      },
      ctd_path: 'm3.2.P.3',
      tracked: true
    }],
    citations: [`batch_${batch.id}`]
  };
  
  await saveLeafPatch(patch);
  return patch;
}

// Mock event emitter for testing
export async function emitCMCEvent(eventType, data) {
  switch (eventType) {
    case 'spec.approved':
      return handleSpecApproved(data);
    case 'stability.updated':
      return handleStabilityUpdated(data);
    case 'method.validated':
      return handleMethodValidated(data);
    case 'manufacturing.updated':
      return handleManufacturingUpdated(data);
    case 'batch.released':
      return handleBatchReleased(data);
    default:
      throw new Error(`Unknown event type: ${eventType}`);
  }
}

// Event subscription manager for future real-time integration
export class CMCEventManager {
  constructor() {
    this.listeners = new Map();
  }

  on(eventType, handler) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType).add(handler);
  }

  off(eventType, handler) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType).delete(handler);
    }
  }

  async emit(eventType, data) {
    // First handle the built-in event processing
    const patch = await emitCMCEvent(eventType, data);
    
    // Then notify any additional listeners
    if (this.listeners.has(eventType)) {
      for (const handler of this.listeners.get(eventType)) {
        await handler(data, patch);
      }
    }
    
    return patch;
  }
}

// Create singleton instance
export const cmcEventManager = new CMCEventManager();