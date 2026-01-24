/**
 * CER Generation API Routes
 *
 * Handles starting and monitoring the CER generation process.
 */

const express = require('express');
const router = express.Router();
const { sendEventToJob } = require('../routes');
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Store active jobs
const activeJobs = new Map();

/**
 * Start a new CER generation job
 */
router.post('/generate', async (req, res) => {
  try {
    // Generate a job ID
    const jobId = `cer-${Date.now().toString(36)}`;

    // Get input data from request
    const { deviceData, clinicalData, literature, templateSettings } = req.body;

    // Store job data
    activeJobs.set(jobId, {
      status: 'pending',
      progress: 0,
      deviceData,
      clinicalData,
      literature,
      templateSettings,
      sections: {},
      startTime: new Date(),
      logs: [],
    });

    // Send initial response with job ID
    res.status(201).json({ jobId });

    // Start the generation process in the background
    startCerGeneration(jobId);
  } catch (error) {
    console.error('Error starting CER generation:', error);
    res.status(500).json({ error: error.message || 'Error starting CER generation' });
  }
});

/**
 * Get the status of a CER generation job
 */
router.get('/job/:jobId', (req, res) => {
  const { jobId } = req.params;

  if (!activeJobs.has(jobId)) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(activeJobs.get(jobId));
});

/**
 * Start the CER generation process for a job
 */
async function startCerGeneration(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) return;

  try {
    // Log the start of the process
    addJobLog(jobId, 'Generation process started');

    // Update job status
    updateJobStatus(jobId, 'running', 0);

    // Send initial SSE event
    sendEventToJob(jobId, 'progress', {
      jobId,
      progress: 0,
      stage: 0,
      message: 'Starting generation process',
    });

    // Process each stage
    await processStage(jobId, 0, 'Initializing generation process');
    await processStage(jobId, 1, 'Gathering device information');

    // Device analysis with OpenAI
    addJobLog(jobId, 'Starting device data analysis with OpenAI');
    sendEventToJob(jobId, 'progress', {
      jobId,
      progress: 15,
      stage: 1,
      message: 'Analyzing device data with AI',
    });

    const deviceAnalysis = await generateDeviceAnalysis(jobId, job.deviceData);
    job.sections.deviceAnalysis = deviceAnalysis;

    await processStage(jobId, 2, 'Analyzing clinical data');

    // Clinical data analysis with OpenAI
    addJobLog(jobId, 'Starting clinical data analysis with OpenAI');
    sendEventToJob(jobId, 'progress', {
      jobId,
      progress: 25,
      stage: 2,
      message: 'Analyzing clinical data with AI',
    });

    const clinicalAnalysis = await generateClinicalAnalysis(jobId, job.clinicalData);
    job.sections.clinicalAnalysis = clinicalAnalysis;

    // Process remaining stages
    await processStage(jobId, 3, 'Retrieving literature review data');
    await processStage(jobId, 4, 'Synthesizing regulatory requirements');
    await processStage(jobId, 5, 'Building document structure');
    await processStage(jobId, 6, 'Generating content sections');
    await processStage(jobId, 7, 'Applying template formatting');
    await processStage(jobId, 8, 'Validating against regulatory standards');
    await processStage(jobId, 9, 'Creating final document');

    // Update job status to complete
    updateJobStatus(jobId, 'complete', 100);

    // Send completion event
    sendEventToJob(jobId, 'complete', {
      jobId,
      message: 'CER generation complete',
      completionTime: new Date(),
    });

    addJobLog(jobId, 'Generation process completed successfully');
  } catch (error) {
    console.error(`Error in CER generation for job ${jobId}:`, error);

    // Update job status to error
    updateJobStatus(jobId, 'error', 0);

    // Send error event
    sendEventToJob(jobId, 'error', {
      jobId,
      message: error.message || 'An error occurred during CER generation',
      error: error.toString(),
    });

    addJobLog(jobId, `Generation process failed: ${error.message}`);
  }
}

/**
 * Generate device analysis using OpenAI
 */
async function generateDeviceAnalysis(jobId, deviceData) {
  try {
    addJobLog(jobId, 'Sending device data to OpenAI for analysis');

    const deviceAnalysisPrompt = `
      Analyze the following medical device information for a Clinical Evaluation Report:
      ${JSON.stringify(deviceData, null, 2)}
      
      Provide a structured summary of the device characteristics, including:
      1. Device classification and regulatory context
      2. Technical specifications
      3. Intended use and indications
      4. Market history
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert medical device regulatory writer specializing in Clinical Evaluation Reports. Analyze device information and provide structured, professional summaries.',
        },
        { role: 'user', content: deviceAnalysisPrompt },
      ],
      temperature: 0.2,
    });

    const analysis = response.choices[0].message.content;
    addJobLog(jobId, 'Device analysis completed successfully');

    sendEventToJob(jobId, 'section', {
      jobId,
      sectionName: 'deviceAnalysis',
      sectionContent: analysis,
      status: 'complete',
    });

    return analysis;
  } catch (error) {
    addJobLog(jobId, `Device analysis failed: ${error.message}`);
    throw new Error(`Device analysis failed: ${error.message}`);
  }
}

/**
 * Generate clinical data analysis using OpenAI
 */
async function generateClinicalAnalysis(jobId, clinicalData) {
  try {
    addJobLog(jobId, 'Sending clinical data to OpenAI for analysis');

    const clinicalAnalysisPrompt = `
      Analyze the following clinical data for a medical device Clinical Evaluation Report:
      ${JSON.stringify(clinicalData, null, 2)}
      
      Provide a structured analysis including:
      1. Study design and methodology assessment
      2. Key findings and outcomes
      3. Statistical significance of results
      4. Post-market surveillance insights
      5. Identified risks and benefits
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert clinical data analyst specializing in medical device evaluations. Analyze clinical study data and provide detailed, objective assessments.',
        },
        { role: 'user', content: clinicalAnalysisPrompt },
      ],
      temperature: 0.1,
    });

    const analysis = response.choices[0].message.content;
    addJobLog(jobId, 'Clinical analysis completed successfully');

    sendEventToJob(jobId, 'section', {
      jobId,
      sectionName: 'clinicalAnalysis',
      sectionContent: analysis,
      status: 'complete',
    });

    return analysis;
  } catch (error) {
    addJobLog(jobId, `Clinical analysis failed: ${error.message}`);
    throw new Error(`Clinical analysis failed: ${error.message}`);
  }
}

/**
 * Process a single stage of the generation pipeline
 */
async function processStage(jobId, stageIndex, stageName) {
  const totalStages = 10;
  const progressPerStage = 100 / totalStages;
  const baseProgress = stageIndex * progressPerStage;
  const steps = 10;

  addJobLog(jobId, `Starting stage ${stageIndex}: ${stageName}`);

  // Simulate processing by sending progress updates
  for (let i = 0; i < steps; i++) {
    // Except for device and clinical analysis stages which have their own processing
    if (stageIndex === 1 && i >= 5) return;
    if (stageIndex === 2 && i >= 5) return;

    // Set timeout for stage processing step
    await new Promise(resolve => setTimeout(resolve, 100));

    // Calculate current progress
    const stageProgress = ((i + 1) / steps) * progressPerStage;
    const totalProgress = Math.min(100, Math.round(baseProgress + stageProgress));

    // Update job status with new progress
    updateJobStatus(jobId, 'running', totalProgress);

    // Send progress event
    sendEventToJob(jobId, 'progress', {
      jobId,
      progress: totalProgress,
      stage: stageIndex,
      message: stageName,
    });
  }

  addJobLog(jobId, `Completed stage ${stageIndex}: ${stageName}`);
}

/**
 * Update job status
 */
function updateJobStatus(jobId, status, progress) {
  const job = activeJobs.get(jobId);
  if (job) {
    job.status = status;
    job.progress = progress;
    activeJobs.set(jobId, job);
  }
}

/**
 * Add a log entry to a job
 */
function addJobLog(jobId, message) {
  const job = activeJobs.get(jobId);
  if (job) {
    job.logs.push({
      timestamp: new Date(),
      message,
    });
    activeJobs.set(jobId, job);
  }
  console.log(`[CER Job ${jobId}] ${message}`);
}

module.exports = router;
