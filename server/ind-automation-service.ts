import axios from 'axios';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import logger from './utils/logger';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// In ESM, we need to create __dirname ourselves
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Type definitions for the API
export interface SpecificationData {
  parameter: string;
  limit: string;
  result: string;
}

export interface StabilityData {
  timepoint: string;
  result: string;
}

export interface Module3Data {
  drug_name: string;
  manufacturing_site: string;
  batch_number: string;
  specifications: SpecificationData[];
  stability_data: StabilityData[];
}

export interface ProjectInfo {
  id: string;
  name: string;
}

export interface ProjectMetadata {
  sponsor_name?: string;
  sponsor_address?: string;
  sponsor_phone?: string;
  ind_number?: string;
  drug_name?: string;
  indication?: string;
  protocol_number?: string;
  protocol_title?: string;
  phase?: string;
  submission_date?: string;
  nct_number?: string;
  principal_investigator_name?: string;
  investigator_address?: string;
  investigator_phone?: string;
  irb_name?: string;
  irb_address?: string;
  clinical_lab_name?: string;
  clinical_lab_address?: string;
  research_facility_name?: string;
  research_facility_address?: string;
  subinvestigators?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  authorizer_name?: string;
  authorizer_title?: string;
  certifier_name?: string;
  certifier_title?: string;
  certifier_address?: string;
  certifier_email?: string;
  certifier_phone?: string;
  certifier_fax?: string;
  serial_number?: string;
}

/**
 * Service for interfacing with the IND Automation Python microservice
 */
export class INDAutomationService {
  private pythonServiceProcess: any = null;
  private serviceUrl: string = 'http://localhost:8001';
  private servicePath: string = path.join(__dirname, '..', 'ind_automation');

  constructor() {
    logger.info('Initializing IND Automation Service');
  }

  /**
   * Start the Python FastAPI microservice
   */
  async startService(): Promise<boolean> {
    try {
      // Check if service is already running
      try {
        const response = await axios.get(`${this.serviceUrl}/status`);
        if (response.status === 200) {
          logger.info('IND Automation service is already running');
          return true;
        }
      } catch (error) {
        // Service is not running, we'll start it
        logger.info('IND Automation service is not running, starting it now');
      }

      // Make sure Python is installed and the required packages are available
      const startScriptPath = path.join(__dirname, '..', 'start_ind_automation_api.py');
      if (
        !fs.existsSync(startScriptPath) ||
        !fs.existsSync(path.join(this.servicePath, 'main.py'))
      ) {
        logger.error('IND Automation service files not found');
        return false;
      }

      // Start the Python service using the starter script
      this.pythonServiceProcess = spawn(
        'python3',
        [path.join(__dirname, '..', 'start_ind_automation_api.py')],
        {
          cwd: path.join(__dirname, '..'),
          stdio: 'pipe',
        }
      );

      // Handle process events
      this.pythonServiceProcess.stdout.on('data', (data: Buffer) => {
        logger.info(`IND Automation service: ${data.toString().trim()}`);
      });

      this.pythonServiceProcess.stderr.on('data', (data: Buffer) => {
        logger.error(`IND Automation service error: ${data.toString().trim()}`);
      });

      this.pythonServiceProcess.on('close', (code: number) => {
        logger.info(`IND Automation service exited with code ${code}`);
        this.pythonServiceProcess = null;
      });

      // Wait for service to start
      let retries = 10;
      while (retries > 0) {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const response = await axios.get(`${this.serviceUrl}/health`);
          if (response.status === 200 && response.data.status === 'healthy') {
            logger.info('IND Automation service started successfully');
            return true;
          }
        } catch (error) {
          retries--;
          if (retries === 0) {
            logger.error('Failed to start IND Automation service after multiple retries');
            return false;
          }
        }
      }

      return false;
    } catch (error) {
      logger.error(`Error starting IND Automation service: ${error.message}`);
      return false;
    }
  }

  /**
   * Stop the Python FastAPI microservice
   */
  stopService(): void {
    if (this.pythonServiceProcess) {
      logger.info('Stopping IND Automation service');
      this.pythonServiceProcess.kill();
      this.pythonServiceProcess = null;
    }
  }

  /**
   * Check if the service is running
   */
  async isServiceRunning(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.serviceUrl}/health`);
      return response.status === 200 && response.data.status === 'healthy';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available projects from Benchling
   */
  async listProjects(): Promise<ProjectInfo[]> {
    try {
      // Make sure the service is running
      const serviceRunning = await this.isServiceRunning();
      if (!serviceRunning) {
        await this.startService();
      }

      const response = await axios.get(`${this.serviceUrl}/projects`);
      return response.data.projects;
    } catch (error) {
      logger.error(`Error listing projects: ${error.message}`);
      throw new Error(`Failed to list projects: ${error.message}`);
    }
  }

  /**
   * Generate Module 3 document for a project
   * @param projectId The ID of the project
   * @returns The URL to download the generated document
   */
  async generateModule3Document(projectId: string): Promise<string> {
    try {
      // Make sure the service is running
      const serviceRunning = await this.isServiceRunning();
      if (!serviceRunning) {
        await this.startService();
      }

      // Return the URL to the document (the front-end will handle the actual download)
      return `${this.serviceUrl}/${projectId}/module3`;
    } catch (error) {
      logger.error(`Error generating Module 3 document: ${error.message}`);
      throw new Error(`Failed to generate Module 3 document: ${error.message}`);
    }
  }

  /**
   * Generate Module 3 document from provided data
   * @param data The Module 3 data
   * @returns Buffer containing the generated document
   */
  async generateModule3FromData(data: Module3Data): Promise<Buffer> {
    try {
      // Make sure the service is running
      const serviceRunning = await this.isServiceRunning();
      if (!serviceRunning) {
        await this.startService();
      }

      const response = await axios.post(`${this.serviceUrl}/generate/module3`, data, {
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error) {
      logger.error(`Error generating Module 3 document from data: ${error.message}`);
      throw new Error(`Failed to generate Module 3 document: ${error.message}`);
    }
  }

  /**
   * Generate multiple Module 3 documents in batch mode
   * @param projectIds Array of project IDs
   * @returns Batch processing results
   */
  async batchGenerateModule3(projectIds: string[]): Promise<any> {
    try {
      // Make sure the service is running
      const serviceRunning = await this.isServiceRunning();
      if (!serviceRunning) {
        await this.startService();
      }

      const response = await axios.post(`${this.serviceUrl}/batch/module3`, {
        project_ids: projectIds,
      });

      return response.data;
    } catch (error) {
      logger.error(`Error in batch generation: ${error.message}`);
      throw new Error(`Failed to generate batch documents: ${error.message}`);
    }
  }

  /**
   * Get service information
   */
  async getServiceInfo(): Promise<any> {
    try {
      // Make sure the service is running
      const serviceRunning = await this.isServiceRunning();
      if (!serviceRunning) {
        await this.startService();
      }

      const response = await axios.get(`${this.serviceUrl}/`);
      return response.data;
    } catch (error) {
      logger.error(`Error getting service info: ${error.message}`);
      throw new Error(`Failed to get service info: ${error.message}`);
    }
  }

  /**
   * Generate FDA Form 1571 (Investigational New Drug Application)
   * @param data The form data
   * @returns Buffer containing the generated document
   */
  async generateForm1571(data: ProjectMetadata): Promise<Buffer> {
    try {
      // Make sure the service is running
      const serviceRunning = await this.isServiceRunning();
      if (!serviceRunning) {
        await this.startService();
      }

      const response = await axios.post(`${this.serviceUrl}/api/ind/form1571`, data, {
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error) {
      logger.error(`Error generating Form 1571: ${error.message}`);
      throw new Error(`Failed to generate Form 1571: ${error.message}`);
    }
  }

  /**
   * Generate FDA Form 1572 (Statement of Investigator)
   * @param data The form data
   * @returns Buffer containing the generated document
   */
  async generateForm1572(data: ProjectMetadata): Promise<Buffer> {
    try {
      // Make sure the service is running
      const serviceRunning = await this.isServiceRunning();
      if (!serviceRunning) {
        await this.startService();
      }

      const response = await axios.post(`${this.serviceUrl}/api/ind/form1572`, data, {
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error) {
      logger.error(`Error generating Form 1572: ${error.message}`);
      throw new Error(`Failed to generate Form 1572: ${error.message}`);
    }
  }

  /**
   * Generate FDA Form 3674 (Certification of Compliance with ClinicalTrials.gov)
   * @param data The form data
   * @returns Buffer containing the generated document
   */
  async generateForm3674(data: ProjectMetadata): Promise<Buffer> {
    try {
      // Make sure the service is running
      const serviceRunning = await this.isServiceRunning();
      if (!serviceRunning) {
        await this.startService();
      }

      const response = await axios.post(`${this.serviceUrl}/api/ind/form3674`, data, {
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error) {
      logger.error(`Error generating Form 3674: ${error.message}`);
      throw new Error(`Failed to generate Form 3674: ${error.message}`);
    }
  }

  /**
   * Generate a cover letter for IND submission
   * @param data The cover letter data
   * @returns Buffer containing the generated document
   */
  async generateCoverLetter(data: ProjectMetadata): Promise<Buffer> {
    try {
      // Make sure the service is running
      const serviceRunning = await this.isServiceRunning();
      if (!serviceRunning) {
        await this.startService();
      }

      const response = await axios.post(`${this.serviceUrl}/api/ind/cover-letter`, data, {
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error) {
      logger.error(`Error generating cover letter: ${error.message}`);
      throw new Error(`Failed to generate cover letter: ${error.message}`);
    }
  }
}

// Singleton instance
export const indAutomationService = new INDAutomationService();
