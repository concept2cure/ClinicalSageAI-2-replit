export default function testDocuShareRoutes(app) {
  app.get('/api/test/docushare-connection', async (req, res) => {
    try {
      const vaultDmsService = app.locals.vaultDmsService;

      if (!vaultDmsService) {
        return res.status(500).json({
          error: 'VaultDMSService not available',
          connected: false,
        });
      }

      const isConnected = await vaultDmsService.checkDocuShareConnection();

      res.json({
        connected: isConnected,
        message: isConnected ? 'DocuShare is ready' : 'DocuShare connection failed',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        connected: false,
        error: error.message,
        message: 'DocuShare connection failed',
      });
    }
  });
}
