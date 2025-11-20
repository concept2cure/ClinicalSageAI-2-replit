import { Router } from 'express';
import * as deviceProfileService from '../services/deviceProfileService';

const router = Router();

// Create a new device profile
router.post('/', (req, res) => {
  try {
    const profile = deviceProfileService.createProfile(
      req.body,
      req.body.organizationId,
      req.body.clientWorkspaceId
    );
    res.status(201).json(profile);
  } catch (error) {
    res.status(400).json({ error: `Failed to create device profile: ${error.message}` });
  }
});

// List all device profiles (optionally filtered by organization)
router.get('/', (req, res) => {
  try {
    const organizationId = req.query.organizationId || undefined;
    const profiles = deviceProfileService.listProfiles(organizationId as string);
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: `Failed to list device profiles: ${error.message}` });
  }
});

// Get a specific device profile by ID
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.query.organizationId || undefined;
    const profile = deviceProfileService.getProfile(id, organizationId as string);

    if (!profile) {
      return res.status(404).json({ error: 'Device profile not found' });
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: `Failed to get device profile: ${error.message}` });
  }
});

// Update an existing device profile
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.body.organizationId || req.query.organizationId || undefined;
    const profile = deviceProfileService.updateProfile(id, req.body, organizationId as string);
    res.json(profile);
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(400).json({ error: `Failed to update device profile: ${error.message}` });
  }
});

// Delete a device profile
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = req.query.organizationId || undefined;
    const success = deviceProfileService.deleteProfile(id, organizationId as string);

    if (!success) {
      return res.status(404).json({ error: 'Device profile not found' });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: `Failed to delete device profile: ${error.message}` });
  }
});

export default router;
