/**
 * CER Chat Service
 *
 * This service provides AI assistant capabilities specifically tailored for
 * Clinical Evaluation Report (CER) generation and enhancement.
 */

import { OpenAI } from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Process a chat message using the OpenAI API with specialized CER knowledge
 *
 * @param {string} userMessage - The user's message or prompt
 * @param {Object} context - Additional context (product details, etc.)
 * @returns {Promise<Object>} - The processed response
 */
async function processMessage(userMessage, context = {}) {
  try {
    // Check if we have an API key
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key is not set. Using fallback response.');
      return {
        response:
          'API key is not configured. This is a placeholder response. Please set up the OpenAI API key to enable AI-powered responses.',
        context: 'fallback',
      };
    }

    // Product-specific context
    const productContext = context.productName
      ? `This is regarding the medical device/product: ${context.productName}.`
      : '';

    // Build system message with specialized CER knowledge
    const systemMessage = `
      You are an expert regulatory affairs consultant specializing in Clinical Evaluation Reports (CERs)
      for medical devices. Your expertise covers EU MDR compliance, ISO 14155, and FDA 21 CFR 812 requirements.
      
      ${productContext}
      
      IMPORTANT GUIDELINES:
      - Be thorough and accurate in all responses regarding regulatory matters.
      - Ensure all content follows MEDDEV 2.7/1 Rev 4 guidance for structure.
      - Include all necessary sections required by applicable regulations.
      - Use professional, formal language appropriate for regulatory documents.
      - Provide substantive and detailed information, not placeholder text.
      - Format responses with clear headings, subheadings, and bullet points for readability.
      - Maintain the confidentiality of client information.
      
      Respond with complete, detailed sections that could be directly incorporated into
      a professional Clinical Evaluation Report.
    `;

    // Call the OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: 'system', content: systemMessage.trim() },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3, // Lower temperature for more consistent, factual outputs
      max_tokens: 2000, // Reasonable limit for section generation
    });

    // Extract the response
    const responseContent = completion.choices[0].message.content;

    return {
      response: responseContent,
      model: 'gpt-4o',
      context: 'cer-expert',
      usage: completion.usage || {},
    };
  } catch (error) {
    console.error('Error processing CER chat message:', error);

    // Provide a fallback response
    return {
      response: `An error occurred while processing your request: ${error.message}. If this is an API key issue, please ensure the OPENAI_API_KEY environment variable is properly set.`,
      context: 'error',
    };
  }
}

/**
 * Generate a full CER document with all required sections
 *
 * @param {Object} productInfo - Information about the product
 * @param {string} templateType - Type of CER template to use (full, abbreviated, etc.)
 * @returns {Promise<Object>} - The generated CER content
 */
async function generateFullCER(productInfo, templateType = 'full') {
  try {
    console.log(
      `Generating full CER for ${productInfo.name || 'unnamed product'} using ${templateType} template`
    );

    // Check if we have an API key
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key is not set. Using fallback response for full CER.');
      return {
        success: false,
        error:
          'OpenAI API key is not configured. Please set up the API key to enable CER generation.',
        sections: {},
      };
    }

    // Build the prompt for full CER generation
    const promptTemplate = `
      Generate a complete Clinical Evaluation Report (CER) for the medical device: "${productInfo.name || 'unnamed medical device'}"
      
      Device Information:
      - Name: ${productInfo.name || 'Unknown'}
      - Manufacturer: ${productInfo.manufacturer || 'Unknown'}
      - Indication: ${productInfo.indication || 'Unknown'}
      - Classification: ${productInfo.classification || 'Unknown'}
      
      Format the response as a complete CER following MEDDEV 2.7/1 Rev 4 guidance with ALL of the following sections:
      
      1. Executive Summary
      2. Scope of the Clinical Evaluation
      3. Device Description and Specification
      4. Intended Clinical Performance
      5. Clinical Background, Current Knowledge, and State of the Art
      6. Device Risk Analysis
      7. Clinical Evaluation Data Sources & Assessment Methods
      8. Analysis of Clinical Data
      9. Conclusions
      10. References
      
      Ensure each section is detailed and comprehensive with appropriate subheadings.
    `;

    // Call the OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content: `You are an expert regulatory affairs consultant specializing in Clinical Evaluation Reports. Generate detailed, professional content following MEDDEV 2.7/1 Rev 4 guidance.`,
        },
        { role: 'user', content: promptTemplate.trim() },
      ],
      temperature: 0.2, // Lower temperature for more consistent results
      max_tokens: 4000, // Higher limit for full document generation
    });

    // Extract the response
    const responseContent = completion.choices[0].message.content;

    // Simple processing to extract sections
    const sections = {};
    const sectionRegex = /## ([^#\n]+)([\s\S]*?)(?=## |$)/g;
    let match;

    while ((match = sectionRegex.exec(responseContent)) !== null) {
      const title = match[1].trim();
      const content = match[2].trim();
      const id = title.toLowerCase().replace(/\s+/g, '-');

      sections[id] = {
        title,
        content,
        wordCount: content.split(/\s+/).length,
      };
    }

    return {
      success: true,
      fullContent: responseContent,
      sections,
      model: 'gpt-4o',
      usage: completion.usage || {},
    };
  } catch (error) {
    console.error('Error generating full CER:', error);

    return {
      success: false,
      error: `An error occurred while generating the full CER: ${error.message}`,
      sections: {},
    };
  }
}

/**
 * Check compliance of CER content against regulatory requirements
 *
 * @param {string} content - CER content to check
 * @param {string} standard - Regulatory standard to check against
 * @returns {Promise<Object>} - Compliance assessment results
 */
async function checkCompliance(content, standard = 'EU MDR') {
  try {
    console.log(`Checking CER compliance against ${standard}`);

    // Check if we have an API key
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key is not set. Using fallback response for compliance check.');
      return {
        score: 0,
        issues: ['API key not configured. Unable to perform compliance check.'],
        recommendations: ['Configure the OpenAI API key to enable compliance checking.'],
      };
    }

    // Build the prompt for compliance checking
    const prompt = `
      Analyze the following Clinical Evaluation Report content against ${standard} requirements.
      
      Return a detailed assessment with:
      1. An overall compliance score from 0-100
      2. A list of specific compliance issues or gaps
      3. Concrete recommendations for improving compliance
      
      CER Content:
      ${content.substring(0, 7000)} // Trim if necessary
    `;

    // Specify the output format
    const format = {
      score: 0, // Compliance score 0-100
      issues: [], // List of compliance issues
      recommendations: [], // List of improvement recommendations
    };

    // Call the OpenAI API with JSON mode
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content: `You are an expert regulatory compliance analyst specializing in Clinical Evaluation Reports. Analyze the provided content against ${standard} requirements and provide a detailed assessment. Format your response as JSON with the exact schema shown in the user's message.`,
        },
        {
          role: 'user',
          content: `${prompt}\n\nReturn your assessment in this exact JSON format: ${JSON.stringify(format, null, 2)}`,
        },
      ],
      temperature: 0.1, // Very low temperature for consistent analysis
      response_format: { type: 'json_object' }, // Request JSON output
    });

    // Parse the JSON response
    const responseContent = completion.choices[0].message.content;
    const assessment = JSON.parse(responseContent);

    return {
      ...assessment,
      standard,
      model: 'gpt-4o',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error checking CER compliance:', error);

    return {
      score: 0,
      issues: [`Error during compliance check: ${error.message}`],
      recommendations: [
        'Try again with a smaller content sample or ensure OpenAI API key is properly configured.',
      ],
      standard,
      error: true,
    };
  }
}

export default {
  processMessage,
  generateFullCER,
  checkCompliance,
};
