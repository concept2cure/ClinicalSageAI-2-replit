// Template generation endpoint
app.post('/api/documents/generate-from-template', async (req, res) => {
  try {
    const { templateId, templateName, content, metadata } = req.body;

    // Save generated document
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const document = {
      id: documentId,
      title: templateName,
      content,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        type: 'generated_document',
        wordCount: content.split(/\s+/).length,
        characterCount: content.length,
      },
    };

    // Try to save to database if available
    try {
      if (global.db) {
        await global.db.query(
          'INSERT INTO documents (id, title, content, metadata, created_at) VALUES ($1, $2, $3, $4, $5)',
          [documentId, templateName, content, JSON.stringify(document.metadata), new Date()]
        );
        console.log('Document saved to database');
      }
    } catch (dbError) {
      console.warn('Database save failed, continuing:', dbError.message);
    }

    console.log('Generated document from template:', templateId);

    res.json({
      success: true,
      documentId,
      document,
      message: 'Template generated successfully',
    });
  } catch (error) {
    console.error('Template generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
