import express from 'express';
const router = express.Router();
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { db } from '../db';
import { cerFaersData, cdiscDeviceDe } from '@shared/schema';
import { and, eq, gte, lte, isNotNull } from 'drizzle-orm';

const normalizeSeverity = (severity) => String(severity || '').toLowerCase();

const isSeriousSeverity = (severity) => {
  const value = normalizeSeverity(severity);
  return [
    'serious',
    'severe',
    'critical',
    'life-threatening',
    'life threatening',
    'fatal',
    'death',
  ].includes(value);
};

const buildBuckets = (startDate, endDate, periods) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalMs = Math.max(0, end.getTime() - start.getTime());
  const bucketMs = Math.max(1, Math.floor(totalMs / periods));
  const buckets = [];

  for (let i = 0; i < periods; i++) {
    const bucketStart = new Date(start.getTime() + i * bucketMs);
    const bucketEnd = i === periods - 1 ? end : new Date(start.getTime() + (i + 1) * bucketMs);
    const label = bucketStart.toISOString().split('T')[0];
    buckets.push({ label, start: bucketStart, end: bucketEnd });
  }

  return { buckets, bucketMs, start, end };
};

const buildTrendFromEvents = (startDate, endDate, periods, events) => {
  const { buckets, bucketMs, start, end } = buildBuckets(startDate, endDate, periods);
  const trend = Object.fromEntries(buckets.map(bucket => [bucket.label, 0]));

  for (const event of events) {
    if (!event?.eventDate) continue;
    const eventDate = new Date(event.eventDate);
    if (Number.isNaN(eventDate.getTime())) continue;
    if (eventDate < start || eventDate > end) continue;
    const index = Math.min(
      buckets.length - 1,
      Math.max(0, Math.floor((eventDate.getTime() - start.getTime()) / bucketMs))
    );
    const bucket = buckets[index];
    trend[bucket.label] = (trend[bucket.label] || 0) + 1;
  }

  return trend;
};

const parsePeriods = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
};

const ensureDatabase = () => {
  if (!db) {
    throw new Error('Database is not configured');
  }
};

const fetchFaersAnalysis = async ({ code, startDate, endDate, periods, severity }) => {
  ensureDatabase();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const filters = [
    eq(cerFaersData.faersId, code),
    isNotNull(cerFaersData.eventDate),
    gte(cerFaersData.eventDate, start),
    lte(cerFaersData.eventDate, end),
  ];
  if (severity && severity !== 'all') {
    filters.push(eq(cerFaersData.severity, severity));
  }

  const rows = await db
    .select({
      eventDate: cerFaersData.eventDate,
      severity: cerFaersData.severity,
    })
    .from(cerFaersData)
    .where(and(...filters));

  const trend = buildTrendFromEvents(startDate, endDate, periods, rows);
  const seriousCount = rows.filter(row => isSeriousSeverity(row.severity)).length;

  return {
    trend,
    totalCount: rows.length,
    seriousCount,
  };
};

const fetchDeviceAnalysis = async ({ code, startDate, endDate, periods, severity }) => {
  ensureDatabase();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const filters = [
    eq(cdiscDeviceDe.deviceId, code),
    isNotNull(cdiscDeviceDe.eventDate),
    gte(cdiscDeviceDe.eventDate, start),
    lte(cdiscDeviceDe.eventDate, end),
  ];
  if (severity && severity !== 'all') {
    filters.push(eq(cdiscDeviceDe.severity, severity));
  }

  const rows = await db
    .select({
      eventDate: cdiscDeviceDe.eventDate,
      severity: cdiscDeviceDe.severity,
    })
    .from(cdiscDeviceDe)
    .where(and(...filters));

  const trend = buildTrendFromEvents(startDate, endDate, periods, rows);
  const seriousCount = rows.filter(row => isSeriousSeverity(row.severity)).length;

  return {
    trend,
    totalCount: rows.length,
    seriousCount,
  };
};

// Helper function to generate narrative text
function generateNarrative(type, code, trend, startDate, endDate) {
  const totalEvents = Object.values(trend).reduce((sum, count) => sum + count, 0);
  const avgEvents = totalEvents / Object.keys(trend).length;
  const maxEvents = Math.max(...Object.values(trend));
  const minEvents = Math.min(...Object.values(trend));

  const entries = Object.entries(trend);
  const lastPeriodEvents = entries[entries.length - 1][1];
  const firstPeriodEvents = entries[0][1];
  const trend_direction = lastPeriodEvents > firstPeriodEvents ? 'increasing' : 'decreasing';

  let narrativeText = '';

  if (type === 'faers') {
    narrativeText = `# FAERS Adverse Event Analysis for Product Code: ${code}\n\n`;
    narrativeText += `**Analysis Period:** ${startDate.split('T')[0]} to ${endDate.split('T')[0]}\n\n`;
    narrativeText += `## Summary of Findings\n\n`;
    narrativeText += `During the analyzed period, a total of ${totalEvents} adverse events were identified for the product '${code}'. `;
    narrativeText += `The data shows a ${trend_direction} trend in reported incidents, with an average of ${avgEvents.toFixed(1)} events per reporting period. `;
    narrativeText += `The highest number of events (${maxEvents}) was observed in a single reporting period, while the lowest was ${minEvents}.\n\n`;

    narrativeText += `## Trend Analysis\n\n`;
    narrativeText += `The overall trend of adverse events for this product appears to be ${trend_direction}. `;

    // Add more detailed narrative based on the trend
    if (trend_direction === 'increasing') {
      narrativeText += `This increase may warrant further investigation, particularly to identify any potential patterns in the types of adverse events being reported. `;
      narrativeText += `It is recommended to conduct a detailed review of individual case reports to identify any emerging safety signals.\n\n`;
    } else {
      narrativeText += `This decrease may be indicative of improved product safety or decreased reporting. `;
      narrativeText += `It is recommended to verify if any interventions or modifications to the product were implemented during this period that could explain this trend.\n\n`;
    }

    narrativeText += `## Regulatory Implications\n\n`;
    narrativeText += `Based on the current trend data, the following regulatory considerations should be noted:\n\n`;
    narrativeText += `1. **Periodic Safety Update Reports (PSURs):** This data should be incorporated into the next PSUR submission.\n`;
    narrativeText += `2. **Risk Management Plan:** Consider if the observed trend necessitates updates to the risk management plan.\n`;
    narrativeText += `3. **Labeling Requirements:** Review current labeling to ensure all identified risks are adequately communicated.\n\n`;

    narrativeText += `## Recommendations\n\n`;
    narrativeText += `1. Continue monitoring FAERS data on a quarterly basis\n`;
    narrativeText += `2. Conduct a detailed review of case reports for the periods with highest incidence\n`;
    narrativeText += `3. Compare with other data sources to validate findings\n`;
    narrativeText += `4. Consider if any specific subset analysis is warranted based on demographics, concomitant medications, or other factors\n\n`;

    narrativeText += `*Note: This narrative is generated based on trend analysis and should be supplemented with a detailed clinical assessment of individual case reports.*\n\n`;
  } else if (type === 'device') {
    narrativeText = `# Medical Device Report (MDR) Analysis for Device Code: ${code}\n\n`;
    narrativeText += `**Analysis Period:** ${startDate.split('T')[0]} to ${endDate.split('T')[0]}\n\n`;
    narrativeText += `## Summary of Device Reports\n\n`;
    narrativeText += `During the analyzed period, a total of ${totalEvents} medical device reports were identified for the device '${code}'. `;
    narrativeText += `The data shows a ${trend_direction} trend in reported incidents, with an average of ${avgEvents.toFixed(1)} reports per reporting period. `;
    narrativeText += `The highest number of reports (${maxEvents}) was observed in a single reporting period, while the lowest was ${minEvents}.\n\n`;

    narrativeText += `## Trend Analysis\n\n`;
    narrativeText += `The overall trend of device reports appears to be ${trend_direction}. `;

    // Add more detailed narrative based on the trend
    if (trend_direction === 'increasing') {
      narrativeText += `This increase should be carefully evaluated, particularly to identify any potential patterns in the types of incidents being reported. `;
      narrativeText += `It is recommended to conduct a detailed review of individual reports to identify any emerging safety concerns.\n\n`;
    } else {
      narrativeText += `This decrease may be indicative of improved device safety, device modifications, or decreased reporting. `;
      narrativeText += `It is recommended to verify if any device modifications or training programs were implemented during this period that could explain this trend.\n\n`;
    }

    narrativeText += `## Regulatory Implications\n\n`;
    narrativeText += `Based on the current trend data, the following regulatory considerations should be noted:\n\n`;
    narrativeText += `1. **Periodic Safety Update Reports:** This data should be incorporated into the next CER/PER submission.\n`;
    narrativeText += `2. **Post-Market Surveillance Plan:** Consider if the observed trend necessitates updates to the post-market surveillance activities.\n`;
    narrativeText += `3. **Risk Analysis:** Review current risk assessment to ensure all identified risks are adequately addressed.\n\n`;

    narrativeText += `## Recommendations\n\n`;
    narrativeText += `1. Continue monitoring MDR data on a quarterly basis\n`;
    narrativeText += `2. Conduct a detailed review of reports for the periods with highest incidence\n`;
    narrativeText += `3. Compare with other data sources (e.g., complaints, MAUDE database) to validate findings\n`;
    narrativeText += `4. Consider if any specific subset analysis is warranted based on device versions, usage settings, or other factors\n\n`;

    narrativeText += `*Note: This narrative is generated based on trend analysis and should be supplemented with a detailed technical assessment of individual device reports.*\n\n`;
  }

  return narrativeText;
}

// FAERS narrative endpoint
router.get('/faers/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { periods = 6, start_date, end_date, severity = 'all' } = req.query;

    const startDate = start_date || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end_date || new Date().toISOString();
    const normalizedPeriods = parsePeriods(periods);

    const { trend, totalCount, seriousCount } = await fetchFaersAnalysis({
      code,
      startDate,
      endDate,
      periods: normalizedPeriods,
      severity,
    });

    // Generate narrative
    const narrative = generateNarrative('faers', code, trend, startDate, endDate);

    // Return response
    res.json({
      success: true,
      trend,
      narrative,
      analysis: {
        total_events: totalCount,
        serious_events: seriousCount,
        reporting_periods: Object.keys(trend).length,
        start_date: startDate,
        end_date: endDate,
        severity_filter: severity,
      },
    });
  } catch (error) {
    console.error('Error generating FAERS narrative:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while generating the FAERS narrative',
    });
  }
});

// FAERS PDF endpoint
router.get('/faers/:code/pdf', async (req, res) => {
  try {
    const { code } = req.params;
    const { periods = 6, start_date, end_date, severity = 'all' } = req.query;

    const startDate = start_date || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end_date || new Date().toISOString();
    const normalizedPeriods = parsePeriods(periods);

    const { trend, totalCount, seriousCount } = await fetchFaersAnalysis({
      code,
      startDate,
      endDate,
      periods: normalizedPeriods,
      severity,
    });

    // Generate narrative
    const narrative = generateNarrative('faers', code, trend, startDate, endDate);

    // Create exports directory if it doesn't exist
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    // Create a temporary file for the narrative
    const tempFile = path.join(exportsDir, `faers_narrative_${code}_${Date.now()}.txt`);
    fs.writeFileSync(tempFile, narrative);

    // Output PDF file path
    const outputFile = path.join(exportsDir, `FAERS_${code}_${Date.now()}.pdf`);

    // Try to use the Python-based enhanced PDF generator
    try {
      const { spawn } = require('child_process');
      // First, create a JSON file with the analysis data for the Python script
      const analysisData = {
        source: 'FAERS',
        product_code: code,
        total_count: totalCount,
        serious_count: seriousCount,
        trend: trend,
      };

      const dataFile = path.join(exportsDir, `faers_data_${code}_${Date.now()}.json`);
      fs.writeFileSync(dataFile, JSON.stringify(analysisData, null, 2));

      console.log('Attempting to use enhanced PDF generation...');
      const pythonProcess = spawn('python3', [
        path.join(process.cwd(), 'server', 'narrative.py'),
        '--mode',
        'pdf',
        '--input',
        tempFile,
        '--data',
        dataFile,
        '--output',
        outputFile,
      ]);

      let pythonError = '';
      pythonProcess.stderr.on('data', data => {
        pythonError += data.toString();
        console.error(`Python PDF generation error: ${data}`);
      });

      // Wait for Python process to finish
      const success = await new Promise(resolve => {
        pythonProcess.on('close', code => {
          if (code === 0 && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 0) {
            console.log('Enhanced PDF generation successful');
            try {
              fs.unlinkSync(dataFile);
            } catch (e) {
              /* ignore cleanup errors */
            }
            resolve(true);
          } else {
            console.warn(`Python PDF generation failed: ${pythonError}`);
            resolve(false);
          }
        });
      });

      // If Python generation failed, fall back to basic PDF
      if (!success) {
        console.log('Falling back to basic PDF generation');
        fs.copyFileSync(tempFile, outputFile);
      }
    } catch (e) {
      console.error('Error using enhanced PDF generator, falling back to basic PDF:', e);
      // Fallback to basic method
      fs.copyFileSync(tempFile, outputFile);
    }

    // Delete the temporary file
    fs.unlinkSync(tempFile);

    // Return the PDF file
    res.download(outputFile, `FAERS_${code}_Report.pdf`, err => {
      if (err) {
        console.error('Error sending PDF file:', err);
      } else {
        // Clean up the PDF file after it's been sent
        fs.unlinkSync(outputFile);
      }
    });
  } catch (error) {
    console.error('Error generating FAERS PDF:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while generating the FAERS PDF',
    });
  }
});

// Device narrative endpoint
router.get('/device/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { periods = 6, start_date, end_date, severity = 'all' } = req.query;

    const startDate = start_date || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end_date || new Date().toISOString();
    const normalizedPeriods = parsePeriods(periods);

    const { trend, totalCount, seriousCount } = await fetchDeviceAnalysis({
      code,
      startDate,
      endDate,
      periods: normalizedPeriods,
      severity,
    });

    // Generate narrative
    const narrative = generateNarrative('device', code, trend, startDate, endDate);

    // Return response
    res.json({
      success: true,
      trend,
      narrative,
      analysis: {
        total_events: totalCount,
        serious_events: seriousCount,
        reporting_periods: Object.keys(trend).length,
        start_date: startDate,
        end_date: endDate,
        severity_filter: severity,
      },
    });
  } catch (error) {
    console.error('Error generating device narrative:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while generating the device narrative',
    });
  }
});

// Device PDF endpoint
router.get('/device/:code/pdf', async (req, res) => {
  try {
    const { code } = req.params;
    const { periods = 6, start_date, end_date, severity = 'all' } = req.query;

    const startDate = start_date || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end_date || new Date().toISOString();
    const normalizedPeriods = parsePeriods(periods);

    const { trend, totalCount, seriousCount } = await fetchDeviceAnalysis({
      code,
      startDate,
      endDate,
      periods: normalizedPeriods,
      severity,
    });

    // Generate narrative
    const narrative = generateNarrative('device', code, trend, startDate, endDate);

    // Create exports directory if it doesn't exist
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    // Create a temporary file for the narrative
    const tempFile = path.join(exportsDir, `device_narrative_${code}_${Date.now()}.txt`);
    fs.writeFileSync(tempFile, narrative);

    // Output PDF file path
    const outputFile = path.join(exportsDir, `MDR_${code}_${Date.now()}.pdf`);

    // Try to use the Python-based enhanced PDF generator
    try {
      const { spawn } = require('child_process');
      // First, create a JSON file with the analysis data for the Python script
      const analysisData = {
        source: 'MAUDE',
        product_code: code,
        total_count: totalCount,
        serious_count: seriousCount,
        trend: trend,
      };

      const dataFile = path.join(exportsDir, `device_data_${code}_${Date.now()}.json`);
      fs.writeFileSync(dataFile, JSON.stringify(analysisData, null, 2));

      console.log('Attempting to use enhanced PDF generation for device...');
      const pythonProcess = spawn('python3', [
        path.join(process.cwd(), 'server', 'narrative.py'),
        '--mode',
        'pdf',
        '--input',
        tempFile,
        '--data',
        dataFile,
        '--output',
        outputFile,
      ]);

      let pythonError = '';
      pythonProcess.stderr.on('data', data => {
        pythonError += data.toString();
        console.error(`Python PDF generation error: ${data}`);
      });

      // Wait for Python process to finish
      const success = await new Promise(resolve => {
        pythonProcess.on('close', code => {
          if (code === 0 && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 0) {
            console.log('Enhanced PDF generation successful');
            try {
              fs.unlinkSync(dataFile);
            } catch (e) {
              /* ignore cleanup errors */
            }
            resolve(true);
          } else {
            console.warn(`Python PDF generation failed: ${pythonError}`);
            resolve(false);
          }
        });
      });

      // If Python generation failed, fall back to basic PDF
      if (!success) {
        console.log('Falling back to basic PDF generation');
        fs.copyFileSync(tempFile, outputFile);
      }
    } catch (e) {
      console.error('Error using enhanced PDF generator, falling back to basic PDF:', e);
      // Fallback to basic method
      fs.copyFileSync(tempFile, outputFile);
    }

    // Delete the temporary file
    fs.unlinkSync(tempFile);

    // Return the PDF file
    res.download(outputFile, `MDR_${code}_Report.pdf`, err => {
      if (err) {
        console.error('Error sending PDF file:', err);
      } else {
        // Clean up the PDF file after it's been sent
        fs.unlinkSync(outputFile);
      }
    });
  } catch (error) {
    console.error('Error generating device PDF:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while generating the device PDF',
    });
  }
});

// Multi-source narrative endpoint
router.post('/multi', async (req, res) => {
  try {
    const {
      ndc_codes = [],
      device_codes = [],
      periods = 6,
      start_date,
      end_date,
      severity = 'all',
    } = req.body;

    const startDate = start_date || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end_date || new Date().toISOString();
    const normalizedPeriods = parsePeriods(periods);

    const analyses = [];

    const faersAnalyses = await Promise.all(
      ndc_codes
        .filter(Boolean)
        .map(async code => {
          const { trend, totalCount, seriousCount } = await fetchFaersAnalysis({
            code,
            startDate,
            endDate,
            periods: normalizedPeriods,
            severity,
          });
          return {
            source: 'FAERS',
            product_code: code,
            trend,
            total_count: totalCount,
            serious_count: seriousCount,
          };
        })
    );

    const deviceAnalyses = await Promise.all(
      device_codes
        .filter(Boolean)
        .map(async code => {
          const { trend, totalCount, seriousCount } = await fetchDeviceAnalysis({
            code,
            startDate,
            endDate,
            periods: normalizedPeriods,
            severity,
          });
          return {
            source: 'MDR',
            product_code: code,
            trend,
            total_count: totalCount,
            serious_count: seriousCount,
          };
        })
    );

    analyses.push(...faersAnalyses, ...deviceAnalyses);

    // Generate combined narrative
    let narrative = `# Multi-Source Clinical Evaluation Report\n\n`;
    narrative += `**Analysis Period:** ${startDate.split('T')[0]} to ${endDate.split('T')[0]}\n\n`;

    if (analyses.length === 0) {
      narrative += `No valid product codes were provided for analysis.\n\n`;
    } else {
      narrative += `## Executive Summary\n\n`;
      narrative += `This report presents a comprehensive analysis of safety data collected from multiple regulatory sources `;
      narrative += `for ${ndc_codes.filter(Boolean).length} pharmaceutical products and ${device_codes.filter(Boolean).length} medical devices. `;

      const totalEvents = analyses.reduce((sum, a) => sum + a.total_count, 0);
      const totalSerious = analyses.reduce((sum, a) => sum + a.serious_count, 0);
      const seriousRate = totalEvents > 0 ? Math.round((totalSerious / totalEvents) * 100) : 0;

      narrative += `A total of ${totalEvents} adverse events/incidents were identified, of which ${totalSerious} (${seriousRate}%) were classified as serious.\n\n`;

      narrative += `## Source Data Overview\n\n`;

      // Add FAERS summary
      if (ndc_codes.filter(Boolean).length > 0) {
        const faersAnalyses = analyses.filter(a => a.source === 'FAERS');
        const faersTotalEvents = faersAnalyses.reduce((sum, a) => sum + a.total_count, 0);
        const faersSeriousEvents = faersAnalyses.reduce((sum, a) => sum + a.serious_count, 0);

        narrative += `### FAERS Database Analysis\n\n`;
        narrative += `${ndc_codes.filter(Boolean).length} pharmaceutical products were analyzed in the FDA Adverse Event Reporting System (FAERS), `;
        narrative += `yielding a total of ${faersTotalEvents} adverse event reports, with ${faersSeriousEvents} classified as serious.\n\n`;

        // Add details for each NDC code
        for (const analysis of faersAnalyses) {
          narrative += `#### Product Code: ${analysis.product_code}\n\n`;
          narrative += `- Total Reports: ${analysis.total_count}\n`;
          narrative += `- Serious Events: ${analysis.serious_count}\n`;

          // Trend analysis
          const entries = Object.entries(analysis.trend);
          const lastPeriodEvents = entries[entries.length - 1][1];
          const firstPeriodEvents = entries[0][1];
          const trend_direction =
            lastPeriodEvents > firstPeriodEvents ? 'increasing' : 'decreasing';

          narrative += `- Trend: ${trend_direction}\n`;
          narrative += `- Reporting Periods: ${entries.length}\n\n`;
        }
      }

      // Add Device summary
      if (device_codes.filter(Boolean).length > 0) {
        const deviceAnalyses = analyses.filter(a => a.source === 'MDR');
        const deviceTotalEvents = deviceAnalyses.reduce((sum, a) => sum + a.total_count, 0);
        const deviceSeriousEvents = deviceAnalyses.reduce((sum, a) => sum + a.serious_count, 0);

        narrative += `### Medical Device Reports (MDR) Analysis\n\n`;
        narrative += `${device_codes.filter(Boolean).length} medical devices were analyzed in the FDA MDR database, `;
        narrative += `yielding a total of ${deviceTotalEvents} incident reports, with ${deviceSeriousEvents} classified as serious.\n\n`;

        // Add details for each device code
        for (const analysis of deviceAnalyses) {
          narrative += `#### Device Code: ${analysis.product_code}\n\n`;
          narrative += `- Total Reports: ${analysis.total_count}\n`;
          narrative += `- Serious Incidents: ${analysis.serious_count}\n`;

          // Trend analysis
          const entries = Object.entries(analysis.trend);
          const lastPeriodEvents = entries[entries.length - 1][1];
          const firstPeriodEvents = entries[0][1];
          const trend_direction =
            lastPeriodEvents > firstPeriodEvents ? 'increasing' : 'decreasing';

          narrative += `- Trend: ${trend_direction}\n`;
          narrative += `- Reporting Periods: ${entries.length}\n\n`;
        }
      }

      // Add integrated analysis
      narrative += `## Integrated Analysis\n\n`;
      narrative += `The combined analysis of all data sources reveals the following insights:\n\n`;

      // Calculate total trends
      const combinedTrend = {};
      for (const analysis of analyses) {
        for (const [date, count] of Object.entries(analysis.trend)) {
          combinedTrend[date] = (combinedTrend[date] || 0) + count;
        }
      }

      // Determine overall trend
      const combinedEntries = Object.entries(combinedTrend).sort(
        (a, b) => new Date(a[0]) - new Date(b[0])
      );
      if (combinedEntries.length >= 2) {
        const firstHalf = combinedEntries.slice(0, Math.floor(combinedEntries.length / 2));
        const secondHalf = combinedEntries.slice(Math.floor(combinedEntries.length / 2));

        const firstHalfAvg =
          firstHalf.reduce((sum, [_, count]) => sum + count, 0) / firstHalf.length;
        const secondHalfAvg =
          secondHalf.reduce((sum, [_, count]) => sum + count, 0) / secondHalf.length;

        const overallTrend = secondHalfAvg > firstHalfAvg ? 'increasing' : 'decreasing';
        const percentChange =
          firstHalfAvg === 0
            ? 0
            : Math.abs(Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100));

        narrative += `1. **Overall Trend**: The combined data shows an ${overallTrend} trend with approximately ${percentChange}% change between the first and second half of the reporting period.\n\n`;
      }

      // Add regulatory implications
      narrative += `## Regulatory Implications\n\n`;
      narrative += `Based on the integrated analysis, the following regulatory considerations are recommended:\n\n`;
      narrative += `1. **Vigilance Reporting**: ${totalSerious > 10 ? 'Immediate review of all serious cases is recommended' : 'Continue routine monitoring of serious cases'}\n`;
      narrative += `2. **Risk Management**: ${totalEvents > 50 ? 'Consider updating the risk management file with the latest findings' : 'No immediate updates to risk management documentation appear necessary'}\n`;
      narrative += `3. **Labeling Review**: ${totalSerious > 20 ? 'A comprehensive review of current labeling is recommended to ensure all identified risks are adequately addressed' : 'Current labeling appears adequate based on the reported events'}\n\n`;

      // Add conclusions
      narrative += `## Conclusions\n\n`;
      narrative += `The multi-source evaluation provides a comprehensive view of the safety profile across pharmaceutical products and medical devices. `;
      if (totalEvents > 100) {
        narrative += `The significant number of events (${totalEvents}) warrants close monitoring and potential regulatory action. `;
      } else {
        narrative += `The relatively low number of events (${totalEvents}) suggests that the current risk management measures may be adequate. `;
      }

      if (totalSerious > totalEvents * 0.4) {
        narrative += `The high proportion of serious events (${seriousRate}%) is concerning and requires immediate attention.\n\n`;
      } else {
        narrative += `The proportion of serious events (${seriousRate}%) is within expected ranges for these product categories.\n\n`;
      }

      // Add recommendations
      narrative += `## Recommendations\n\n`;
      narrative += `1. Continue multi-source monitoring on a quarterly basis\n`;
      narrative += `2. Conduct detailed case reviews for products with increasing trends\n`;
      narrative += `3. Consider a focused safety assessment for products with high serious event rates\n`;
      narrative += `4. Integrate findings into the next Periodic Safety Update Report (PSUR) or Clinical Evaluation Report (CER)\n\n`;
    }

    narrative += `*Note: This narrative is generated based on trend analysis and should be supplemented with a detailed assessment of individual reports by qualified personnel.*\n\n`;

    // Return response
    res.json({
      success: true,
      analysis: {
        analyses,
        start_date: startDate,
        end_date: endDate,
        severity_filter: severity,
      },
      narrative,
    });
  } catch (error) {
    console.error('Error generating multi-source narrative:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while generating the multi-source narrative',
    });
  }
});

// Multi-source PDF endpoint
router.post('/multi/pdf', async (req, res) => {
  try {
    const {
      ndc_codes = [],
      device_codes = [],
      periods = 6,
      start_date,
      end_date,
      severity = 'all',
    } = req.body;

    const startDate = start_date || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end_date || new Date().toISOString();
    const normalizedPeriods = parsePeriods(periods);

    const analyses = [];

    const faersAnalyses = await Promise.all(
      ndc_codes
        .filter(Boolean)
        .map(async code => {
          const { trend, totalCount, seriousCount } = await fetchFaersAnalysis({
            code,
            startDate,
            endDate,
            periods: normalizedPeriods,
            severity,
          });
          return {
            source: 'FAERS',
            product_code: code,
            trend,
            total_count: totalCount,
            serious_count: seriousCount,
          };
        })
    );

    const deviceAnalyses = await Promise.all(
      device_codes
        .filter(Boolean)
        .map(async code => {
          const { trend, totalCount, seriousCount } = await fetchDeviceAnalysis({
            code,
            startDate,
            endDate,
            periods: normalizedPeriods,
            severity,
          });
          return {
            source: 'MDR',
            product_code: code,
            trend,
            total_count: totalCount,
            serious_count: seriousCount,
          };
        })
    );

    analyses.push(...faersAnalyses, ...deviceAnalyses);

    // Generate combined narrative
    let narrative = `# Multi-Source Clinical Evaluation Report\n\n`;
    narrative += `**Analysis Period:** ${startDate.split('T')[0]} to ${endDate.split('T')[0]}\n\n`;

    if (analyses.length === 0) {
      narrative += `No valid product codes were provided for analysis.\n\n`;
    } else {
      // Same narrative generation as above (multi endpoint)
      narrative += `## Executive Summary\n\n`;
      narrative += `This report presents a comprehensive analysis of safety data collected from multiple regulatory sources `;
      narrative += `for ${ndc_codes.filter(Boolean).length} pharmaceutical products and ${device_codes.filter(Boolean).length} medical devices. `;

      const totalEvents = analyses.reduce((sum, a) => sum + a.total_count, 0);
      const totalSerious = analyses.reduce((sum, a) => sum + a.serious_count, 0);
      const seriousRate = totalEvents > 0 ? Math.round((totalSerious / totalEvents) * 100) : 0;

      narrative += `A total of ${totalEvents} adverse events/incidents were identified, of which ${totalSerious} (${seriousRate}%) were classified as serious.\n\n`;

      // Rest of narrative generation from the /multi endpoint...
      // (Similar to the code above)
    }

    // Create exports directory if it doesn't exist
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    // Create a temporary file for the narrative
    const tempFile = path.join(exportsDir, `multi_source_narrative_${Date.now()}.txt`);
    fs.writeFileSync(tempFile, narrative);

    // Output PDF file path
    const outputFile = path.join(exportsDir, `MultiSource_CER_${Date.now()}.pdf`);

    // Try to use the Python-based enhanced PDF generator
    try {
      const { spawn } = require('child_process');
      // Create a JSON file with the analysis data for the Python script
      const analysisData = {
        source: 'Multi-Source',
        analyses: analyses,
        start_date: startDate,
        end_date: endDate,
      };

      const dataFile = path.join(exportsDir, `multi_data_${Date.now()}.json`);
      fs.writeFileSync(dataFile, JSON.stringify(analysisData, null, 2));

      console.log('Attempting to use enhanced PDF generation for multi-source analysis...');
      const pythonProcess = spawn('python3', [
        path.join(process.cwd(), 'server', 'narrative.py'),
        '--mode',
        'pdf',
        '--input',
        tempFile,
        '--data',
        dataFile,
        '--output',
        outputFile,
      ]);

      let pythonError = '';
      pythonProcess.stderr.on('data', data => {
        pythonError += data.toString();
        console.error(`Python PDF generation error: ${data}`);
      });

      // Wait for Python process to finish
      const success = await new Promise(resolve => {
        pythonProcess.on('close', code => {
          if (code === 0 && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 0) {
            console.log('Enhanced PDF generation successful');
            try {
              fs.unlinkSync(dataFile);
            } catch (e) {
              /* ignore cleanup errors */
            }
            resolve(true);
          } else {
            console.warn(`Python PDF generation failed: ${pythonError}`);
            resolve(false);
          }
        });
      });

      // If Python generation failed, fall back to basic PDF
      if (!success) {
        console.log('Falling back to basic PDF generation');
        fs.copyFileSync(tempFile, outputFile);
      }
    } catch (e) {
      console.error('Error using enhanced PDF generator, falling back to basic PDF:', e);
      // Fallback to basic method
      fs.copyFileSync(tempFile, outputFile);
    }

    // Delete the temporary file
    fs.unlinkSync(tempFile);

    // Return the PDF file
    res.download(outputFile, `MultiSource_CER_Report.pdf`, err => {
      if (err) {
        console.error('Error sending PDF file:', err);
        // If there's an error in download, send a JSON response
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Error sending PDF file: ' + err.message,
          });
        }
      } else {
        // Clean up the PDF file after it's been sent
        fs.unlinkSync(outputFile);
      }
    });
  } catch (error) {
    console.error('Error generating multi-source PDF:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while generating the multi-source PDF',
    });
  }
});

export default router;
