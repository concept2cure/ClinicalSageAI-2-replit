import { Router } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { storage } from './storage';

const execPromise = promisify(exec);

export const csrDeepLearningRouter = Router();

/**
 * API endpoint to generate embeddings for CSRs
 */
csrDeepLearningRouter.post('/generate-embeddings', async (req, res) => {
  try {
    const { limit = 100 } = req.body;

    // Run Python script to generate embeddings
    const scriptPath = path.join(process.cwd(), 'csr_deep_learning.py');
    const cmd = `python ${scriptPath} --function embeddings --limit ${limit}`;

    const { stdout, stderr } = await execPromise(cmd);

    if (stderr) {
      console.error('Error from Python script:', stderr);
    }

    res.json({
      success: true,
      message: 'CSR embeddings generated successfully',
      details: stdout.trim(),
    });
  } catch (error) {
    console.error('Error generating CSR embeddings:', error);
    res.status(500).json({ error: 'Failed to generate CSR embeddings' });
  }
});

/**
 * API endpoint to identify CSR clusters
 */
csrDeepLearningRouter.post('/identify-clusters', async (req, res) => {
  try {
    const { limit = 100 } = req.body;

    // Run Python script to identify clusters
    const scriptPath = path.join(process.cwd(), 'csr_deep_learning.py');
    const cmd = `python ${scriptPath} --function clusters --limit ${limit}`;

    const { stdout, stderr } = await execPromise(cmd);

    if (stderr) {
      console.error('Error from Python script:', stderr);
    }

    // If a clusters visualization was generated, return its path
    const visualizationPath = path.join(process.cwd(), 'data/csr_analytics/csr_clusters.png');
    const hasVisualization = fs.existsSync(visualizationPath);

    res.json({
      success: true,
      message: 'CSR clusters identified successfully',
      details: stdout.trim(),
      visualization: hasVisualization ? '/api/deep-learning/visualization/csr_clusters.png' : null,
    });
  } catch (error) {
    console.error('Error identifying CSR clusters:', error);
    res.status(500).json({ error: 'Failed to identify CSR clusters' });
  }
});

/**
 * API endpoint to mine clinical insights from CSRs
 */
csrDeepLearningRouter.post('/mine-insights', async (req, res) => {
  try {
    const { limit = 100 } = req.body;

    // Run Python script to mine insights
    const scriptPath = path.join(process.cwd(), 'csr_deep_learning.py');
    const cmd = `python ${scriptPath} --function insights --limit ${limit}`;

    const { stdout, stderr } = await execPromise(cmd);

    if (stderr) {
      console.error('Error from Python script:', stderr);
    }

    // Check if insights file was generated
    const insightsFile = path.join(process.cwd(), 'data/csr_analytics/csr_insights.json');
    let insights = null;

    if (fs.existsSync(insightsFile)) {
      insights = JSON.parse(fs.readFileSync(insightsFile, 'utf8'));
    }

    res.json({
      success: true,
      message: 'Clinical insights mined successfully',
      details: stdout.trim(),
      insights,
    });
  } catch (error) {
    console.error('Error mining clinical insights:', error);
    res.status(500).json({ error: 'Failed to mine clinical insights' });
  }
});

/**
 * API endpoint to generate strategic intelligence report
 */
csrDeepLearningRouter.post('/strategic-intelligence', async (req, res) => {
  try {
    const { indication } = req.body;

    if (!indication) {
      return res.status(400).json({ error: 'Indication is required' });
    }

    // Run Python script to generate strategic intelligence
    const scriptPath = path.join(process.cwd(), 'csr_deep_learning.py');
    const cmd = `python ${scriptPath} --function strategic --indication "${indication}"`;

    const { stdout, stderr } = await execPromise(cmd);

    if (stderr) {
      console.error('Error from Python script:', stderr);
    }

    // Check if report file was generated
    const reportFile = path.join(
      process.cwd(),
      'data/csr_analytics',
      `${indication.replace(/ /g, '_')}_strategic_report.json`
    );
    let report = null;

    if (fs.existsSync(reportFile)) {
      report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    }

    res.json({
      success: true,
      message: `Strategic intelligence generated for ${indication}`,
      details: stdout.trim(),
      report,
    });
  } catch (error) {
    console.error('Error generating strategic intelligence:', error);
    res.status(500).json({ error: 'Failed to generate strategic intelligence' });
  }
});

/**
 * API endpoint to discover patterns in CSRs
 */
csrDeepLearningRouter.post('/discover-patterns', async (req, res) => {
  try {
    const { limit = 100 } = req.body;

    // Run Python script to discover patterns
    const scriptPath = path.join(process.cwd(), 'csr_deep_learning.py');
    const cmd = `python ${scriptPath} --function patterns --limit ${limit}`;

    const { stdout, stderr } = await execPromise(cmd);

    if (stderr) {
      console.error('Error from Python script:', stderr);
    }

    // Check if patterns file was generated
    const patternsFile = path.join(process.cwd(), 'data/learned_csr_patterns.json');
    let patterns = null;

    if (fs.existsSync(patternsFile)) {
      patterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
    }

    res.json({
      success: true,
      message: 'CSR patterns discovered successfully',
      details: stdout.trim(),
      patterns,
    });
  } catch (error) {
    console.error('Error discovering CSR patterns:', error);
    res.status(500).json({ error: 'Failed to discover CSR patterns' });
  }
});

/**
 * API endpoint to analyze specific CSR text for deep insights
 */
csrDeepLearningRouter.post('/analyze-csr', async (req, res) => {
  try {
    const { csr_id } = req.body;

    if (!csr_id) {
      return res.status(400).json({ error: 'CSR ID is required' });
    }

    // Get CSR details
    const csrReport = await storage.getCsrReport(parseInt(csr_id));
    const csrDetails = await storage.getCsrDetails(parseInt(csr_id));

    if (!csrReport || !csrDetails) {
      return res.status(404).json({ error: 'CSR not found' });
    }

    // Prepare CSR data for analysis
    const csrData = {
      id: csrReport.id,
      title: csrReport.title,
      sponsor: csrReport.sponsor,
      indication: csrReport.indication,
      phase: csrReport.phase,
      details: csrDetails,
    };

    // Create temporary file with CSR data
    const tempDataFile = path.join(process.cwd(), 'data/temp_csr_data.json');
    fs.writeFileSync(tempDataFile, JSON.stringify([csrData]));

    // Run Python script for analysis
    const scriptPath = path.join(process.cwd(), 'csr_deep_learning.py');
    const cmd = `python ${scriptPath} --function analyze --csr_id ${csr_id} --data_file ${tempDataFile}`;

    const { stdout, stderr } = await execPromise(cmd);

    if (stderr) {
      console.error('Error from Python script:', stderr);
    }

    // Check if analysis file was generated
    const analysisFile = path.join(
      process.cwd(),
      `data/processed_csrs/csr_${csr_id}_analysis.json`
    );
    let analysis = null;

    if (fs.existsSync(analysisFile)) {
      analysis = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));
    }

    // Clean up temporary file
    fs.unlinkSync(tempDataFile);

    res.json({
      success: true,
      message: `CSR ${csr_id} analyzed successfully`,
      details: stdout.trim(),
      analysis,
    });
  } catch (error) {
    console.error('Error analyzing CSR:', error);
    res.status(500).json({ error: 'Failed to analyze CSR' });
  }
});

/**
 * API endpoint to serve visualization files
 */
csrDeepLearningRouter.get('/visualization/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const visualizationPath = path.join(process.cwd(), 'data/csr_analytics', filename);

    if (!fs.existsSync(visualizationPath)) {
      return res.status(404).json({ error: 'Visualization not found' });
    }

    res.sendFile(visualizationPath);
  } catch (error) {
    console.error('Error serving visualization:', error);
    res.status(500).json({ error: 'Failed to serve visualization' });
  }
});

/**
 * API endpoint to get all available strategic reports
 */
csrDeepLearningRouter.get('/strategic-reports', (req, res) => {
  try {
    const analyticsDir = path.join(process.cwd(), 'data/csr_analytics');

    if (!fs.existsSync(analyticsDir)) {
      return res.json({ reports: [] });
    }

    const reportFiles = fs
      .readdirSync(analyticsDir)
      .filter(file => file.endsWith('_strategic_report.json'));

    const reports = reportFiles.map(file => {
      const filePath = path.join(analyticsDir, file);
      const report = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      return {
        indication: report.indication,
        report_date: report.report_date,
        total_csrs: report.summary?.total_csrs || 0,
        file_name: file,
      };
    });

    res.json({ reports });
  } catch (error) {
    console.error('Error getting strategic reports:', error);
    res.status(500).json({ error: 'Failed to get strategic reports' });
  }
});

/**
 * API endpoint to get a specific strategic report
 */
csrDeepLearningRouter.get('/strategic-reports/:indication', (req, res) => {
  try {
    const { indication } = req.params;
    const reportFile = path.join(
      process.cwd(),
      'data/csr_analytics',
      `${indication.replace(/ /g, '_')}_strategic_report.json`
    );

    if (!fs.existsSync(reportFile)) {
      return res.status(404).json({ error: 'Strategic report not found' });
    }

    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    res.json(report);
  } catch (error) {
    console.error('Error getting strategic report:', error);
    res.status(500).json({ error: 'Failed to get strategic report' });
  }
});

/**
 * API endpoint to generate training data for ML models from CSRs
 */
csrDeepLearningRouter.post('/generate-training-data', async (req, res) => {
  try {
    const { limit = 100, target_field } = req.body;

    if (!target_field) {
      return res.status(400).json({ error: 'Target field is required' });
    }

    // Run Python script to generate training data
    const scriptPath = path.join(process.cwd(), 'csr_deep_learning.py');
    const cmd = `python ${scriptPath} --function training-data --target_field ${target_field} --limit ${limit}`;

    const { stdout, stderr } = await execPromise(cmd);

    if (stderr) {
      console.error('Error from Python script:', stderr);
    }

    // Check if training data file was generated
    const trainingDataFile = path.join(
      process.cwd(),
      'data/csr_analytics',
      `training_data_${target_field.replace(/ /g, '_')}.json`
    );

    let trainingInfo = null;
    if (fs.existsSync(trainingDataFile)) {
      trainingInfo = JSON.parse(fs.readFileSync(trainingDataFile, 'utf8'));
    }

    res.json({
      success: true,
      message: `Training data generated for ${target_field}`,
      details: stdout.trim(),
      training_info: trainingInfo,
    });
  } catch (error) {
    console.error('Error generating training data:', error);
    res.status(500).json({ error: 'Failed to generate training data' });
  }
});

/**
 * API endpoint to predict outcomes using trained CSR models
 */
csrDeepLearningRouter.post('/predict', async (req, res) => {
  try {
    const { csr_id, model_type } = req.body;

    if (!csr_id) {
      return res.status(400).json({ error: 'CSR ID is required' });
    }

    if (!model_type) {
      return res.status(400).json({ error: 'Model type is required' });
    }

    // Get CSR details
    const csrReport = await storage.getCsrReport(parseInt(csr_id));
    const csrDetails = await storage.getCsrDetails(parseInt(csr_id));

    if (!csrReport || !csrDetails) {
      return res.status(404).json({ error: 'CSR not found' });
    }

    // Prepare CSR data for prediction
    const csrData = {
      id: csrReport.id,
      title: csrReport.title,
      sponsor: csrReport.sponsor,
      indication: csrReport.indication,
      phase: csrReport.phase,
      details: csrDetails,
    };

    // Create temporary file with CSR data
    const tempDataFile = path.join(process.cwd(), 'data/temp_prediction_data.json');
    fs.writeFileSync(tempDataFile, JSON.stringify([csrData]));

    // Run Python script for prediction
    const scriptPath = path.join(process.cwd(), 'csr_deep_learning.py');
    const cmd = `python ${scriptPath} --function predict --csr_id ${csr_id} --model_type ${model_type} --data_file ${tempDataFile}`;

    const { stdout, stderr } = await execPromise(cmd);

    if (stderr) {
      console.error('Error from Python script:', stderr);
    }

    // Check if prediction file was generated
    const predictionFile = path.join(
      process.cwd(),
      `data/processed_csrs/csr_${csr_id}_${model_type}_prediction.json`
    );

    let prediction = null;
    if (fs.existsSync(predictionFile)) {
      prediction = JSON.parse(fs.readFileSync(predictionFile, 'utf8'));
    }

    // Clean up temporary file
    fs.unlinkSync(tempDataFile);

    res.json({
      success: true,
      message: `Prediction generated for CSR ${csr_id} using ${model_type} model`,
      details: stdout.trim(),
      prediction,
    });
  } catch (error) {
    console.error('Error generating prediction:', error);
    res.status(500).json({ error: 'Failed to generate prediction' });
  }
});

/**
 * API endpoint to evaluate CSR model performance
 */
csrDeepLearningRouter.get('/model-performance/:model_type', (req, res) => {
  try {
    const { model_type } = req.params;
    const performanceFile = path.join(
      process.cwd(),
      'data/csr_analytics',
      `${model_type}_model_performance.json`
    );

    if (!fs.existsSync(performanceFile)) {
      return res.status(404).json({ error: 'Model performance data not found' });
    }

    const performance = JSON.parse(fs.readFileSync(performanceFile, 'utf8'));
    res.json(performance);
  } catch (error) {
    console.error('Error getting model performance:', error);
    res.status(500).json({ error: 'Failed to get model performance' });
  }
});
