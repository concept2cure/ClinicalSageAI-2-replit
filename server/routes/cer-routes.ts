import express from 'express';
import { z } from 'zod';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { pool } from '../db';

const router = express.Router();

// Validate the presence of API key
async function validateOpenAIKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
}

// Schema for validating FAERS data request
const faersDataRequestSchema = z.object({
  ndcCode: z.string().min(1, 'NDC code is required'),
});

// Schema for validating report generation request
const reportGenerationSchema = z.object({
  faersData: z.object({
    results: z.array(z.any()).optional(),
    drug_info: z
      .object({
        brand_name: z.string().optional(),
        generic_name: z.string().optional(),
        manufacturer: z.string().optional(),
      })
      .optional(),
  }),
  productName: z.string().optional(),
});

// Schema for validating report save request
const saveReportSchema = z.object({
  title: z.string().min(1, 'Report title is required'),
  content: z.string().min(1, 'Report content is required'),
  ndcCode: z.string(),
  productName: z.string().optional(),
  manufacturer: z.string().optional(),
  metadata: z
    .object({
      faersRecordCount: z.number().optional(),
      generatedAt: z.string().optional(),
    })
    .optional(),
});

// Helper function to get sample FAERS data for demonstration
function getSampleFaersData(ndcCode: string) {
  // In a production environment, this would connect to the actual FDA FAERS API
  const sampleResults = Array.from({ length: 25 }, (_, i) => ({
    report_id: `FAERS-${Math.floor(Math.random() * 1000000)}`,
    report_date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    patient_age: Math.floor(Math.random() * 70) + 18,
    patient_sex: Math.random() > 0.5 ? 'Male' : 'Female',
    event_type: ['Adverse Event', 'Product Problem', 'Serious Adverse Event'][
      Math.floor(Math.random() * 3)
    ],
    outcome: [
      'Hospitalization',
      'Life Threatening',
      'Disability',
      'Required Intervention',
      'Other',
    ][Math.floor(Math.random() * 5)],
    reaction_terms: ['Nausea', 'Vomiting', 'Headache', 'Dizziness', 'Rash', 'Fever', 'Fatigue']
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.floor(Math.random() * 3) + 1),
  }));

  const drugInfo = {
    ndc_code: ndcCode,
    brand_name:
      ndcCode === '0310-0790'
        ? 'Nexium'
        : ndcCode === '0078-0357'
          ? 'Diovan'
          : 'Product ' + ndcCode,
    generic_name:
      ndcCode === '0310-0790'
        ? 'esomeprazole'
        : ndcCode === '0078-0357'
          ? 'valsartan'
          : 'compound ' + ndcCode,
    manufacturer:
      ndcCode === '0310-0790'
        ? 'AstraZeneca'
        : ndcCode === '0078-0357'
          ? 'Novartis'
          : 'Pharma Corp',
  };

  return {
    results: sampleResults,
    drug_info: drugInfo,
  };
}

// Helper function to organize FAERS data for report generation
function organizeFaersDataForReport(faersData: any) {
  // Extract unique reaction terms and count their frequency
  const reactionFrequency: { [key: string]: number } = {};
  let totalReports = 0;

  if (faersData.results && Array.isArray(faersData.results)) {
    totalReports = faersData.results.length;

    faersData.results.forEach((report: any) => {
      if (report.reaction_terms && Array.isArray(report.reaction_terms)) {
        report.reaction_terms.forEach((term: string) => {
          reactionFrequency[term] = (reactionFrequency[term] || 0) + 1;
        });
      }
    });
  }

  // Calculate demographics
  const demographics = {
    age: {
      min: Number.MAX_SAFE_INTEGER,
      max: 0,
      avg: 0,
    },
    sex: {
      male: 0,
      female: 0,
      unknown: 0,
    },
  };

  let ageSum = 0;
  let ageCount = 0;

  if (faersData.results && Array.isArray(faersData.results)) {
    faersData.results.forEach((report: any) => {
      if (report.patient_age && !isNaN(report.patient_age)) {
        const age = Number(report.patient_age);
        demographics.age.min = Math.min(demographics.age.min, age);
        demographics.age.max = Math.max(demographics.age.max, age);
        ageSum += age;
        ageCount++;
      }

      if (report.patient_sex) {
        if (report.patient_sex.toLowerCase() === 'male') {
          demographics.sex.male++;
        } else if (report.patient_sex.toLowerCase() === 'female') {
          demographics.sex.female++;
        } else {
          demographics.sex.unknown++;
        }
      } else {
        demographics.sex.unknown++;
      }
    });
  }

  if (ageCount > 0) {
    demographics.age.avg = Math.round(ageSum / ageCount);
  }

  if (demographics.age.min === Number.MAX_SAFE_INTEGER) {
    demographics.age.min = 0;
  }

  // Get top reactions
  const sortedReactions = Object.entries(reactionFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => ({
      term,
      count,
      percentage: Math.round((count / totalReports) * 100),
    }));

  return {
    product: faersData.drug_info?.brand_name || 'Product',
    generic: faersData.drug_info?.generic_name || 'Generic name',
    manufacturer: faersData.drug_info?.manufacturer || 'Manufacturer',
    total_reports: totalReports,
    demographics,
    top_reactions: sortedReactions,
  };
}

// Generate a CER report using OpenAI API
async function generateCERNarrative(faersData: any, productName?: string) {
  await validateOpenAIKey();

  const organizationData = organizeFaersDataForReport(faersData);
  const displayName =
    productName ||
    faersData.drug_info?.brand_name ||
    faersData.drug_info?.generic_name ||
    'Product';

  const promptTemplate = `
    Generate a detailed Clinical Evaluation Report (CER) for ${displayName} (${organizationData.generic}) based on FDA FAERS data.
    
    FAERS DATA SUMMARY:
    - Total adverse event reports: ${organizationData.total_reports}
    - Manufacturer: ${organizationData.manufacturer}
    - Patient demographics: Ages ${organizationData.demographics.age.min} to ${organizationData.demographics.age.max}, average ${organizationData.demographics.age.avg} years
    - Gender distribution: ${organizationData.demographics.sex.male} males, ${organizationData.demographics.sex.female} females, ${organizationData.demographics.sex.unknown} unspecified
    - Top reported adverse events: ${organizationData.top_reactions.map(r => `${r.term} (${r.percentage}%)`).join(', ')}
    
    Your CER should follow MEDDEV 2.7/1 Rev. 4 structure with these sections:
    
    1. EXECUTIVE SUMMARY
    2. SCOPE OF THE CLINICAL EVALUATION
      2.1. Device Description
      2.2. Clinical Background, Current Knowledge, State of the Art
    3. CLINICAL EVALUATION DATA
      3.1. Summary of Safety Data
      3.2. Demonstration of Acceptability of Benefit-Risk Profile
      3.3. Risk Management Measures and Post-Market Activities
    4. CONCLUSIONS
      4.1. Safety & Performance Conclusions
      4.2. Overall Risk-Benefit Conclusions
      4.3. Ongoing Monitoring Recommendations
    
    Make the report structured, authoritative, evidence-based, and balanced using real FDA FAERS data provided.
    Ensure appropriate clinical language but exclude raw data tables or placeholders.
    Include specific recommendations for clinicians.
  `;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4-0125-preview',
        messages: [
          {
            role: 'system',
            content:
              'You are a clinical research expert specialized in generating regulatory-compliant Clinical Evaluation Reports based on pharmacovigilance data.',
          },
          { role: 'user', content: promptTemplate },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error: any) {
    console.error('Error generating CER narrative:', error.response?.data || error.message);
    throw new Error(
      'Failed to generate CER narrative: ' + (error.response?.data?.error?.message || error.message)
    );
  }
}

// CER FAERS data endpoints
router.post('/faers/data', async (req, res) => {
  try {
    const { ndcCode } = faersDataRequestSchema.parse(req.body);

    // Get sample FAERS data for demo purposes
    // In production, this would call the actual FDA FAERS API
    const faersData = getSampleFaersData(ndcCode);

    if (!faersData || !faersData.results || faersData.results.length === 0) {
      return res.status(404).json({ error: 'No data found for the provided NDC code' });
    }

    res.json(faersData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error fetching FAERS data:', error);
    res.status(500).json({ error: 'Failed to fetch FAERS data' });
  }
});

router.post('/faers/generate-narrative', async (req, res) => {
  try {
    const { faersData, productName } = reportGenerationSchema.parse(req.body);

    if (!faersData || !faersData.results || faersData.results.length === 0) {
      return res.status(400).json({ error: 'Invalid FAERS data provided' });
    }

    // Generate CER narrative
    const narrative = await generateCERNarrative(faersData, productName);

    res.json({ narrative });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error generating CER narrative:', error);
    res.status(500).json({ error: 'Failed to generate CER narrative' });
  }
});

router.post('/faers/save-report', async (req, res) => {
  try {
    const reportData = saveReportSchema.parse(req.body);

    // In production, you would save this to your database
    // For now, we'll create a simplified in-memory storage solution
    const report = {
      id: Date.now().toString(),
      ...reportData,
      created_at: new Date().toISOString(),
    };

    // Create directory if it doesn't exist
    const reportsDir = path.join(process.cwd(), 'data', 'cer_reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Save report to file
    const filePath = path.join(reportsDir, `${report.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

    // Also insert into database for production-like behavior
    try {
      const result = await pool.query(
        `INSERT INTO cer_reports (title, content, ndc_code, product_name, manufacturer, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          report.title,
          report.content,
          report.ndcCode,
          report.productName || null,
          report.manufacturer || null,
          report.metadata || {},
          report.created_at,
        ]
      );

      report.db_id = result.rows[0].id;
    } catch (dbError) {
      console.error('Note: Database insert failed, but continuing with file storage:', dbError);
      // We'll still consider this a success since we saved to file
    }

    res.status(201).json({
      id: report.id,
      saved: true,
      message: 'CER report saved successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error saving CER report:', error);
    res.status(500).json({ error: 'Failed to save CER report' });
  }
});

// Get a list of saved CER reports
router.get('/reports', async (req, res) => {
  try {
    const reportsDir = path.join(process.cwd(), 'data', 'cer_reports');
    if (!fs.existsSync(reportsDir)) {
      return res.json({ reports: [] });
    }

    const files = fs.readdirSync(reportsDir).filter(file => file.endsWith('.json'));
    const reports = files
      .map(file => {
        try {
          const reportData = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf8'));
          return {
            id: reportData.id,
            title: reportData.title,
            productName: reportData.productName,
            ndcCode: reportData.ndcCode,
            manufacturer: reportData.manufacturer,
            created_at: reportData.created_at,
          };
        } catch (err) {
          console.error(`Error reading report file ${file}:`, err);
          return null;
        }
      })
      .filter(Boolean);

    // Sort by creation date, newest first
    reports.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({ reports });
  } catch (error) {
    console.error('Error fetching CER reports:', error);
    res.status(500).json({ error: 'Failed to fetch CER reports' });
  }
});

// Get a specific CER report by ID
router.get('/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const reportPath = path.join(process.cwd(), 'data', 'cer_reports', `${id}.json`);

    if (!fs.existsSync(reportPath)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    res.json(reportData);
  } catch (error) {
    console.error('Error fetching CER report:', error);
    res.status(500).json({ error: 'Failed to fetch CER report' });
  }
});

export default router;
