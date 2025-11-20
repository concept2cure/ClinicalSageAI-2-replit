import { Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export function registerSmartProtocolRoutes(app: any) {
  // Create necessary directories if they don't exist
  const exportsDir = path.join(process.cwd(), 'data/exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  // API endpoint to get CSR benchmark metrics
  app.get('/api/csr/benchmark', async (req: Request, res: Response) => {
    try {
      const { indication, phase } = req.query;

      if (!indication || !phase) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: indication and phase are required',
        });
      }

      // Run the Python benchmark script with the provided parameters
      const pythonScript = exec(
        `python3 -c "import csr_benchmark_api; csr_benchmark_api.get_benchmark_metrics('${indication}', '${phase}')"`,
        { timeout: 60000 }
      );

      let stdout = '';
      let stderr = '';

      pythonScript.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      pythonScript.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      pythonScript.on('close', code => {
        if (code !== 0) {
          console.error(`Python benchmark script exited with code ${code}`);
          console.error(`stderr: ${stderr}`);
          return res.status(500).json({
            success: false,
            message: 'Failed to run CSR benchmark analysis',
            error: stderr,
          });
        }

        try {
          const result = JSON.parse(stdout);

          if (result.metrics && result.metrics.total_trials > 0) {
            return res.json({
              success: true,
              message: `Found ${result.metrics.total_trials} matching trial(s)`,
              metrics: result.metrics,
            });
          } else {
            return res.json({
              success: false,
              message: 'No matches found',
              metrics: null,
            });
          }
        } catch (error) {
          console.error('Error parsing benchmark results:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to parse benchmark results',
            error: error.toString(),
          });
        }
      });
    } catch (error) {
      console.error('Error in CSR benchmark endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.toString(),
      });
    }
  });

  // API endpoint to generate smart protocol draft
  app.post('/api/protocol/smart-draft', async (req: Request, res: Response) => {
    try {
      const { indication, phase, top_endpoints, sample_size, dropout } = req.body;

      if (!indication || !phase) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: indication and phase are required',
        });
      }

      // Prepare CLI arguments as a JSON string to pass to the Python script
      const args = JSON.stringify({
        indication,
        phase,
        top_endpoints: top_endpoints || [],
        sample_size: sample_size || 0,
        dropout: dropout || 0,
      });

      // Run the Python protocol generation script
      const pythonScript = exec(
        `python3 -c "import csr_benchmark_api; csr_benchmark_api.generate_protocol_draft('${args.replace(/'/g, "\\'")}')"`,
        { timeout: 120000 }
      );

      let stdout = '';
      let stderr = '';

      pythonScript.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      pythonScript.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      pythonScript.on('close', code => {
        if (code !== 0) {
          console.error(`Python protocol draft script exited with code ${code}`);
          console.error(`stderr: ${stderr}`);
          return res.status(500).json({
            success: false,
            message: 'Failed to generate smart protocol draft',
            error: stderr,
          });
        }

        try {
          const result = JSON.parse(stdout);

          return res.json({
            success: true,
            protocol_draft: result.protocol_draft,
            protocol_id: result.protocol_id,
          });
        } catch (error) {
          console.error('Error parsing protocol draft results:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to parse protocol draft results',
            error: error.toString(),
          });
        }
      });
    } catch (error) {
      console.error('Error in smart protocol draft endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.toString(),
      });
    }
  });

  // API endpoint to export protocol draft as PDF
  app.post('/api/protocol/export-smart-pdf', async (req: Request, res: Response) => {
    try {
      const { protocol_text, protocol_id } = req.body;

      if (!protocol_text) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameter: protocol_text is required',
        });
      }

      const filename = `protocol_${protocol_id || uuidv4()}_${Date.now()}.pdf`;
      const outputPath = path.join(exportsDir, filename);

      // Write protocol text to a temporary file
      const tempFilePath = path.join(process.cwd(), 'temp_protocol.txt');
      fs.writeFileSync(tempFilePath, protocol_text);

      // Run the Python PDF generation script
      const pythonScript = exec(
        `python3 -c "import report_pdf_generator; report_pdf_generator.generate_protocol_pdf('${tempFilePath}', '${outputPath}')"`,
        { timeout: 60000 }
      );

      let stderr = '';

      pythonScript.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      pythonScript.on('close', code => {
        // Remove the temporary file
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }

        if (code !== 0) {
          console.error(`Python PDF generation script exited with code ${code}`);
          console.error(`stderr: ${stderr}`);
          return res.status(500).json({
            success: false,
            message: 'Failed to generate PDF',
            error: stderr,
          });
        }

        // Check if the PDF was created
        if (fs.existsSync(outputPath)) {
          return res.json({
            success: true,
            message: 'PDF generated successfully',
            download_url: `/download/${filename}`,
          });
        } else {
          return res.status(500).json({
            success: false,
            message: 'PDF file was not created',
          });
        }
      });
    } catch (error) {
      console.error('Error in protocol PDF export endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.toString(),
      });
    }
  });

  // API endpoint to export full bundle (Protocol + Strategic + SAP)
  app.post('/api/export/full-bundle', async (req: Request, res: Response) => {
    try {
      const { indication, phase, protocol_draft, strategic_summary, sap_section } = req.body;

      if (!protocol_draft || !strategic_summary || !sap_section) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: all three document components are required',
        });
      }

      const bundleId = uuidv4();
      const filename = `protocol_bundle_${indication.replace(/\s+/g, '_')}_${phase.replace(/\s+/g, '_')}_${bundleId}.pdf`;
      const outputPath = path.join(exportsDir, filename);

      // Create temporary files for each component
      const protocolFilePath = path.join(process.cwd(), `temp_protocol_${bundleId}.txt`);
      const strategicFilePath = path.join(process.cwd(), `temp_strategic_${bundleId}.txt`);
      const sapFilePath = path.join(process.cwd(), `temp_sap_${bundleId}.txt`);

      fs.writeFileSync(protocolFilePath, protocol_draft);
      fs.writeFileSync(strategicFilePath, strategic_summary);
      fs.writeFileSync(sapFilePath, sap_section);

      // Run the Python bundle generation script
      const pythonScript = exec(
        `python3 -c "import report_pdf_generator; report_pdf_generator.generate_full_bundle('${protocolFilePath}', '${strategicFilePath}', '${sapFilePath}', '${outputPath}', '${indication}', '${phase}')"`,
        { timeout: 120000 }
      );

      let stderr = '';

      pythonScript.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      pythonScript.on('close', code => {
        // Clean up temporary files
        [protocolFilePath, strategicFilePath, sapFilePath].forEach(tempFile => {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
        });

        if (code !== 0) {
          console.error(`Python bundle generation script exited with code ${code}`);
          console.error(`stderr: ${stderr}`);
          return res.status(500).json({
            success: false,
            message: 'Failed to generate bundle PDF',
            error: stderr,
          });
        }

        // Check if the PDF was created
        if (fs.existsSync(outputPath)) {
          return res.json({
            success: true,
            message: 'Bundle PDF generated successfully',
            pdf_url: `/download/${filename}`,
          });
        } else {
          return res.status(500).json({
            success: false,
            message: 'Bundle PDF file was not created',
          });
        }
      });
    } catch (error) {
      console.error('Error in bundle export endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.toString(),
      });
    }
  });
}
