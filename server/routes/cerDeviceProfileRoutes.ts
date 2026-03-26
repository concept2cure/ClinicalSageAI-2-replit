import express from 'express';
import DeviceProfileService from '../services/DeviceProfileService';
import { validateDeviceProfile } from '../middleware/validateDeviceProfile';

const router = express.Router();
const deviceProfileService = DeviceProfileService.getInstance();

/**
 * Create a new device profile
 * POST /api/cer/device-profile
 */
// Trace request in development only
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Device Profile Route accessed:', req.method, req.path);
  }
  next();
});

router.post('/', validateDeviceProfile, async (req, res) => {
  try {
    const deviceProfileData = req.body;

    // Add creation timestamp if not provided
    if (!deviceProfileData.createdAt) {
      deviceProfileData.createdAt = new Date();
    }

    // Add update timestamp if not provided
    if (!deviceProfileData.updatedAt) {
      deviceProfileData.updatedAt = new Date();
    }

    const deviceProfile = await deviceProfileService.createDeviceProfile(deviceProfileData);

    res.status(201).json(deviceProfile);
  } catch (error) {
    console.error('Error creating device profile:', error);
    res.status(500).json({
      error: 'Failed to create device profile',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * Get device profile by ID
 * GET /api/cer/device-profile/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deviceProfile = await deviceProfileService.getDeviceProfile(id);

    if (!deviceProfile) {
      return res.status(404).json({ error: 'Device profile not found' });
    }

    res.json(deviceProfile);
  } catch (error) {
    console.error('Error getting device profile:', error);
    res.status(500).json({
      error: 'Failed to get device profile',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * Get device profiles for an organization
 * GET /api/cer/device-profile/organization/:organizationId
 */
router.get('/organization/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const deviceProfiles = await deviceProfileService.getDeviceProfilesByOrganization(
      organizationId,
      limit,
      offset
    );

    res.json(deviceProfiles);
  } catch (error) {
    console.error('Error getting device profiles for organization:', error);
    res.status(500).json({
      error: 'Failed to get device profiles',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * Update a device profile
 * PUT /api/cer/device-profile/:id
 */
router.put('/:id', validateDeviceProfile, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Add update timestamp
    updateData.updatedAt = new Date();

    const updatedDeviceProfile = await deviceProfileService.updateDeviceProfile(id, updateData);

    if (!updatedDeviceProfile) {
      return res.status(404).json({ error: 'Device profile not found' });
    }

    res.json(updatedDeviceProfile);
  } catch (error) {
    console.error('Error updating device profile:', error);
    res.status(500).json({
      error: 'Failed to update device profile',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * Delete a device profile
 * DELETE /api/cer/device-profile/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await deviceProfileService.deleteDeviceProfile(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Device profile not found' });
    }

    res.status(204).end();
  } catch (error) {
    console.error('Error deleting device profile:', error);
    res.status(500).json({
      error: 'Failed to delete device profile',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

export default router;
