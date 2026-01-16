import { Router } from 'express';
import OpenAI from 'openai';

const router = Router();

// Initialize OpenAI client (will use OPENAI_API_KEY from environment)
let openai = null;

// Check and initialize OpenAI client
const initOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  if (apiKey && !openai) {
    openai = new OpenAI({ apiKey });
  }
  return !!openai;
};

// Check AI availability
router.get('/api/ai/status', async (req, res) => {
  try {
    const isAvailable = initOpenAI();
    res.json({ 
      available: isAvailable,
      provider: isAvailable ? 'openai' : 'template',
      model: isAvailable ? 'gpt-4' : null
    });
  } catch (error) {
    res.json({ 
      available: false,
      provider: 'template',
      error: error.message 
    });
  }
});

// Generate AI content
router.post('/api/ai/generate', async (req, res) => {
  try {
    const { prompt, maxTokens = 2000, temperature = 0.7, systemPrompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    // Try to use OpenAI if available
    if (initOpenAI()) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: systemPrompt || 'You are an FDA regulatory expert helping prepare medical device submissions.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: maxTokens,
          temperature: temperature,
        });
        
        const content = completion.choices[0]?.message?.content || '';
        
        // Format content as HTML if it's not already
        const htmlContent = content.includes('<') ? content : `<div>${content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</div>`;
        
        return res.json({
          success: true,
          content: htmlContent,
          source: 'ai',
          model: 'gpt-4',
          confidence: 0.95,
          usage: completion.usage
        });
      } catch (aiError) {
        console.error('OpenAI generation error:', aiError);
        // Fall back to template
      }
    }
    
    // Fallback: Generate template-based content
    const templateContent = generateTemplateContent(prompt);
    
    res.json({
      success: true,
      content: templateContent,
      source: 'template',
      confidence: 0.7
    });
    
  } catch (error) {
    console.error('AI generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate content',
      message: error.message 
    });
  }
});

// STAGE 3: ENRICH
// POST /api/ai-generate-section
// Body: { projectId: string, section: string }
// Response: { text: string, confidence: number, citations: string[] }
router.post('/api/ai-generate-section', async (req, res) => {
  try {
    const { projectId, section } = req.body || {};
    if (!section || typeof section !== 'string') {
      return res.status(400).json({ error: 'section is required' });
    }

    const sectionKey = String(section).trim();
    const systemPrompt =
      'You are an FDA regulatory writing assistant. Produce concise, defensible 510(k) section prose. ' +
      'Avoid hallucinating citations: if unsure, output generic placeholders like "FDA Guidance (year)".';

    const userPrompt =
      `Generate a 510(k) section draft for: ${sectionKey}.\n` +
      `ProjectId: ${projectId || 'N/A'}.\n` +
      'Return STRICT JSON with keys: text (string), confidence (number 0-1), citations (array of strings).';

    if (initOpenAI()) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 900,
          temperature: 0.3,
        });

        const content = completion.choices[0]?.message?.content || '';
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed.text === 'string') {
            return res.json({
              text: parsed.text,
              confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.87,
              citations: Array.isArray(parsed.citations) ? parsed.citations : [],
              source: 'ai',
              model: 'gpt-4',
            });
          }
        } catch (_e) {
          // If model didn't return JSON, fall through to template.
        }
      } catch (aiError) {
        console.error('OpenAI section generation error:', aiError);
      }
    }

    // Template fallback
    const templates = {
      device_description:
        'Device Description (Draft)\n\nThe subject device is a medical device intended to [INTENDED USE]. It consists of [KEY COMPONENTS] and operates by [PRINCIPLE OF OPERATION]. The device is manufactured under a quality system compliant with 21 CFR 820.\n\nKey design features include [FEATURES]. Performance characteristics relevant to safety and effectiveness are supported by bench testing, software verification/validation (if applicable), and risk management per ISO 14971.',
    };

    const text =
      templates[sectionKey] ||
      `Section ${sectionKey} (Draft)\n\nProvide a clear, test-supported narrative for ${sectionKey}. Include device context, rationale, and supporting evidence references.`;

    return res.json({
      text,
      confidence: 0.87,
      citations: ['21 CFR 807.87', '21 CFR 820', 'FDA Guidance (year)'],
      source: 'template',
    });
  } catch (error) {
    console.error('AI generate section error:', error);
    res.status(500).json({ error: 'Failed to generate section' });
  }
});

// AI File Tagging - Extract keywords and suggest tags
router.post('/api/ai/tag-file', async (req, res) => {
  try {
    const { fileId, fileName, category } = req.body;
    
    if (!fileName) {
      return res.status(400).json({ error: 'Filename is required' });
    }
    
    // Generate suggested tags based on filename and category
    const suggestedTags = generateTagsFromFile(fileName, category);
    
    // Try to use AI if available
    if (initOpenAI()) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are an FDA regulatory expert. Suggest 3-5 relevant tags for 510(k) submission files based on the filename and category. Return only a JSON array of tag strings, no explanation.'
            },
            {
              role: 'user',
              content: `File: ${fileName}\nCategory: ${category}\n\nSuggest relevant tags for this 510(k) submission file.`
            }
          ],
          max_tokens: 200,
          temperature: 0.3,
        });
        
        const aiResponse = completion.choices[0]?.message?.content || '[]';
        try {
          const aiTags = JSON.parse(aiResponse);
          if (Array.isArray(aiTags) && aiTags.length > 0) {
            return res.json({
              success: true,
              suggestedTags: aiTags,
              source: 'ai'
            });
          }
        } catch (parseError) {
          console.log('AI response not JSON, using fallback tags');
        }
      } catch (aiError) {
        console.error('AI tagging error:', aiError);
      }
    }
    
    // Fallback to rule-based tagging
    res.json({
      success: true,
      suggestedTags: suggestedTags,
      source: 'rules'
    });
    
  } catch (error) {
    console.error('File tagging error:', error);
    res.status(500).json({ 
      error: 'Failed to generate tags',
      message: error.message 
    });
  }
});

// Generate tags from filename and category using comprehensive 3-axis model
function generateTagsFromFile(fileName, category) {
  const tags = [];
  const fileNameLower = fileName.toLowerCase();
  
  // Axis 1: Category-specific tags
  const categoryTags = {
    'bench_test_report': ['testing', 'validation', 'performance'],
    'biocompatibility': ['safety', 'biocompat', 'ISO-10993'],
    'sterilization': ['sterility', 'validation'],
    'packaging_shelf_life': ['packaging', 'aging', 'ASTM'],
    'emc_60601_1_2': ['EMC', 'IEC-60601-1-2', 'electromagnetic'],
    'electrical_safety_60601_1': ['safety', 'IEC-60601-1', 'electrical'],
    'software_validation_62304': ['software', 'IEC-62304', 'validation'],
    'usability_62366': ['usability', 'IEC-62366', 'human-factors'],
    'cybersecurity': ['security', 'FDA-cybersecurity'],
    'clinical_performance_ivd': ['clinical', 'IVD', 'CLSI'],
    'predicate_labeling': ['predicate', 'labeling', 'comparison'],
    'risk_analysis_14971': ['risk', 'ISO-14971', 'FMEA']
  };
  
  if (categoryTags[category]) {
    tags.push(...categoryTags[category]);
  }
  
  // Axis 2: Test Standard detection from filename
  const standardMappings = {
    'iso 10993': ['ISO-10993', 'biocompatibility'],
    '10993-1': ['ISO-10993-1'],
    '10993-5': ['ISO-10993-5', 'cytotoxicity'],
    '10993-10': ['ISO-10993-10', 'irritation'],
    'iso 14971': ['ISO-14971', 'risk-management'],
    'iec 60601-1': ['IEC-60601-1', 'electrical-safety'],
    '60601-1-2': ['IEC-60601-1-2', 'EMC'],
    'iec 62304': ['IEC-62304', 'software'],
    'iec 62366': ['IEC-62366', 'usability'],
    'ul 60601': ['UL-60601-1'],
    'astm f2150': ['ASTM-F2150'],
    'astm f1980': ['ASTM-F1980', 'accelerated-aging'],
    'clsi ep05': ['CLSI-EP05', 'precision'],
    'clsi ep15': ['CLSI-EP15']
  };
  
  for (const [pattern, standardTags] of Object.entries(standardMappings)) {
    if (fileNameLower.includes(pattern)) {
      tags.push(...standardTags);
    }
  }
  
  // Axis 3: Device Component detection
  const componentMappings = {
    'housing': ['housing', 'enclosure'],
    'electrode': ['electrodes', 'patient-contact'],
    'sensor': ['sensor', 'transducer'],
    'firmware': ['firmware', 'embedded'],
    'software': ['software', 'UI'],
    'label': ['labeling', 'IFU'],
    'packaging': ['packaging', 'sterile-barrier'],
    'pcb': ['circuit-board', 'electronics'],
    'display': ['display', 'screen'],
    'power': ['power-supply', 'battery'],
    'cable': ['cable', 'connector']
  };
  
  for (const [pattern, compTags] of Object.entries(componentMappings)) {
    if (fileNameLower.includes(pattern)) {
      tags.push(...compTags);
    }
  }
  
  // File type tags
  if (fileNameLower.includes('test') || fileNameLower.includes('report')) {
    tags.push('test-report');
  }
  if (fileNameLower.includes('protocol')) {
    tags.push('protocol');
  }
  if (fileNameLower.includes('cert')) {
    tags.push('certification');
  }
  if (fileNameLower.includes('validation')) {
    tags.push('validation');
  }
  if (fileNameLower.includes('risk')) {
    tags.push('risk-analysis');
  }
  
  // Default tag
  if (tags.length === 0) {
    tags.push('510k', 'regulatory');
  }
  
  return [...new Set(tags)]; // Remove duplicates
}

// Analyze content for compliance
router.post('/api/ai/analyze', async (req, res) => {
  try {
    const { content, sectionType } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    // Perform compliance analysis
    const issues = [];
    const suggestions = [];
    
    // Check for placeholder text
    if (content.includes('[') && content.includes(']')) {
      issues.push({
        type: 'error',
        message: 'Contains placeholder text that must be replaced',
        severity: 'high',
        location: 'Throughout document'
      });
    }
    
    // Check minimum content
    const textContent = content.replace(/<[^>]*>/g, '').trim();
    if (textContent.length < 100) {
      issues.push({
        type: 'warning',
        message: 'Section appears incomplete - needs more detail',
        severity: 'medium'
      });
    }
    
    // Section-specific checks
    if (sectionType === 'indications') {
      if (!textContent.toLowerCase().includes('indicated for use')) {
        issues.push({
          type: 'error',
          message: 'Must include "indicated for use" language',
          severity: 'high'
        });
      }
      if (!textContent.includes('Prescription') && !textContent.includes('Over-The-Counter')) {
        suggestions.push({
          type: 'recommendation',
          message: 'Specify prescription or OTC status'
        });
      }
    }
    
    // Calculate compliance score
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    const score = Math.max(0, 100 - (errorCount * 20) - (warningCount * 10));
    
    res.json({
      compliant: errorCount === 0,
      score,
      issues,
      suggestions,
      analyzed: true
    });
    
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze content',
      message: error.message 
    });
  }
});

// Generate template-based content when AI is not available
function generateTemplateContent(prompt) {
  const promptLower = prompt.toLowerCase();
  
  if (promptLower.includes('indications for use') || promptLower.includes('indicated for use')) {
    return `<h3>Indications for Use Statement</h3>
<p>This medical device is indicated for use in clinical settings by qualified healthcare professionals.</p>
<p><strong>Intended Use:</strong> The device is intended for diagnostic and therapeutic purposes as specified in the device labeling.</p>
<p><strong>Patient Population:</strong> Adult patients requiring medical intervention as determined by a healthcare provider.</p>
<p><strong>Environment of Use:</strong> Professional healthcare facilities including hospitals, clinics, and medical offices.</p>
<p><strong>Prescription Status:</strong> This device is restricted to use by or on the order of a physician.</p>`;
  }
  
  if (promptLower.includes('device description')) {
    return `<h3>Device Description</h3>
<p><strong>Physical Characteristics:</strong> The device consists of medical-grade materials designed for clinical use.</p>
<p><strong>Functional Components:</strong> Key components include the main unit, control interface, and necessary accessories.</p>
<p><strong>Principles of Operation:</strong> The device operates based on established medical technology principles to achieve its intended clinical purpose.</p>
<p><strong>Technical Specifications:</strong> Detailed specifications are provided in the technical documentation section.</p>`;
  }
  
  if (promptLower.includes('substantial equivalence')) {
    return `<h3>Substantial Equivalence Discussion</h3>
<p>The subject device has been demonstrated to be substantially equivalent to legally marketed predicate devices.</p>
<p><strong>Intended Use Comparison:</strong> The subject device has the same intended use as the predicate device.</p>
<p><strong>Technological Characteristics:</strong> The technological characteristics are similar to the predicate, with no significant differences that affect safety or effectiveness.</p>
<p><strong>Performance Data:</strong> Bench testing demonstrates that the device performs equivalently to the predicate device.</p>
<p><strong>Conclusion:</strong> Based on the comparison provided, the device is substantially equivalent to the identified predicate.</p>`;
  }
  
  if (promptLower.includes('biocompatibility')) {
    return `<h3>Biocompatibility Assessment</h3>
<p><strong>Device Categorization:</strong> The device has been categorized per ISO 10993-1:2018 standards.</p>
<p><strong>Materials Assessment:</strong> All patient-contacting materials have been evaluated for biocompatibility.</p>
<p><strong>Testing Performed:</strong> Appropriate biological evaluation has been conducted based on the nature and duration of patient contact.</p>
<p><strong>Results:</strong> All biocompatibility testing meets the acceptance criteria established in ISO 10993 standards.</p>
<p><strong>Conclusion:</strong> The device has been demonstrated to be biocompatible for its intended use.</p>`;
  }
  
  // Default template
  return `<h3>Section Content</h3>
<p>This section provides comprehensive information as required by FDA regulations for 510(k) submissions.</p>
<p>Please customize this content based on your specific device characteristics and regulatory requirements.</p>`;
}

export default router;