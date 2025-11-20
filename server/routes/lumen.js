// Enhanced Lumen AI Chat endpoint with document processing integration
app.post('/api/ask-lumen', async (req, res) => {
  try {
    const { query, context, sessionId, documentContent, model = 'openai' } = req.body;

    console.log('🤖 Lumen AI Request:', {
      query: query?.substring(0, 100) + '...',
      context,
      sessionId,
      model,
    });

    // System prompt for Lumen regulatory expert
    const systemPrompt = `You are Lumen, an expert regulatory affairs AI assistant specializing in:
    - FDA submissions and regulatory compliance
    - Clinical trial documentation
    - Medical device protocols (510k, PMA)
    - Pharmaceutical submissions (IND, NDA, BLA)
    - eCTD authoring and validation
    - ICH guidelines and international regulations

    Provide detailed, accurate, and actionable regulatory guidance. Always cite relevant regulations when possible.`;

    let response;

    // Choose AI model based on user preference
    if (model === 'gemini' && process.env.GEMINI_API_KEY) {
      // Use Google Gemini Pro
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const geminiModel = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4000,
        },
      });

      const prompt = documentContent
        ? `${systemPrompt}\n\nDocument context: ${documentContent}\n\nUser question: ${query}`
        : `${systemPrompt}\n\nUser question: ${query}`;

      const result = await geminiModel.generateContent(prompt);
      response = result.response.text();
    } else {
      // Use OpenAI service (default)
      if (documentContent) {
        response = await openaiService.analyzeText(
          `Document context: ${documentContent}\n\nUser question: ${query}`,
          systemPrompt
        );
      } else {
        response = await openaiService.analyzeText(query, systemPrompt);
      }
    }

    res.json({
      response: response,
      answer: response, // Also provide as 'answer' for compatibility
      sessionId: sessionId,
      context: context,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Lumen AI error:', error);
    res.status(500).json({
      error: 'Lumen AI service temporarily unavailable',
      message: 'Please try again in a moment',
      response:
        "I apologize, but I'm currently experiencing technical difficulties. Please try again in a moment, or contact support if the issue persists.",
    });
  }
});
