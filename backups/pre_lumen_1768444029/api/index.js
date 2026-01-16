import express from 'express';
import * as cerRoutesModule from './cer.js';

const router = express.Router();
const cerRoutes = cerRoutesModule.default || cerRoutesModule;

// Register API routes
router.use('/cer', cerRoutes);

// Register CMC Blueprint Generator routes (legacy method - will be deprecated)
(async () => {
  try {
    // Try to dynamically import the CMC Blueprint Generator routes
    const cmcBlueprint = await import('./cmc-blueprint-generator.js');
    if (cmcBlueprint && typeof cmcBlueprint.registerCMCBlueprintRoutes === 'function') {
      cmcBlueprint.registerCMCBlueprintRoutes(router);
      console.log('CMC Blueprint Generator routes registered successfully');
    } else {
      console.warn(
        'CMC Blueprint Generator module found but registerCMCBlueprintRoutes function not available'
      );
    }
  } catch (error) {
    console.warn('Failed to load CMC Blueprint Generator routes:', error.message);
  }
})();

// Register comprehensive CMC module routes
(async () => {
  try {
    // Try to dynamically import the CMC module routes
    const cmcModule = await import('./cmc/index.js');
    const cmcRoutes = cmcModule.default || cmcModule;
    router.use('/cmc', cmcRoutes);
    console.log('Successfully registered CMC Module routes');
  } catch (error) {
    console.warn('Failed to load CMC Module routes:', error.message);
  }
})();

export default router;
