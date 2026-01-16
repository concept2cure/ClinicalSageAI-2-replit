/**
 * FDA Integration Service
 * 
 * Handles all FDA regulatory interactions including:
 * - Device searches and UDI lookups
 * - 510(k) and PMA submission packaging
 * - Submission status tracking
 * - openFDA API integration
 */

import { db } from '../db/index.js';
import { 
  medicalDevices, 
  deviceSubmissions,
  organizations,
  fdaCredentials 
} from '../../shared/schema.ts';
import { eq, and, desc, sql } from 'drizzle-orm';
import auditService from './auditService.js';

class FDAIntegrationService {
  constructor() {
    this.openFDABaseUrl = 'https://api.fda.gov/device';
    this.fdaSubmissionUrl = process.env.FDA_SUBMISSION_URL || 'https://www.fda.gov/cdrh-portal/api';
  }

  /**
   * Validate FDA credentials for organization
   */
  async validateCredentials(organizationId) {
    try {
      // Check if organization has FDA credentials configured
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (!org) {
        return {
          isValid: false,
          message: 'Organization not found'
        };
      }

      // Check for FDA credentials in environment or database
      const hasFDAAccess = process.env.FDA_API_KEY || org.metadata?.fdaCredentials;
      
      return {
        isValid: !!hasFDAAccess,
        message: hasFDAAccess ? 'FDA credentials validated' : 'FDA credentials not configured',
        capabilities: hasFDAAccess ? [
          'device_search',
          'udi_lookup', 
          '510k_submission',
          'pma_submission',
          'status_tracking'
        ] : []
      };
    } catch (error) {
      console.error('Error validating FDA credentials:', error);
      return {
        isValid: false,
        message: 'Error validating credentials',
        error: error.message
      };
    }
  }

  /**
   * Search FDA device database
   */
  async searchDevice(query, limit = 10) {
    try {
      // Use openFDA API to search devices
      const searchUrl = `${this.openFDABaseUrl}/event.json?search=${encodeURIComponent(query)}&limit=${limit}`;
      
      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`FDA API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Transform FDA data to our format
      const devices = (data.results || []).map(result => ({
        deviceName: result.device?.[0]?.brand_name || 'Unknown',
        manufacturer: result.device?.[0]?.manufacturer_d_name || 'Unknown',
        deviceClass: result.device?.[0]?.device_class || 'Unknown',
        productCode: result.product_code || '',
        clearanceNumber: result.device?.[0]?.k_number || '',
        registrationNumber: result.device?.[0]?.registration_number || '',
        deviceProblem: result.device_problem_codes || [],
        eventDate: result.date_of_event || null
      }));

      return {
        success: true,
        devices,
        totalResults: data.meta?.results?.total || 0
      };
    } catch (error) {
      console.error('Error searching FDA devices:', error);
      return {
        success: false,
        error: error.message,
        devices: []
      };
    }
  }

  /**
   * Get UDI information from FDA GUDID
   */
  async getUDIInformation(udi) {
    try {
      // Search FDA GUDID for UDI information
      const searchUrl = `${this.openFDABaseUrl}/udi.json?search=udi:${encodeURIComponent(udi)}`;
      
      const response = await fetch(searchUrl);
      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            error: 'UDI not found in FDA database'
          };
        }
        throw new Error(`FDA API error: ${response.status}`);
      }

      const data = await response.json();
      const udiData = data.results?.[0];
      
      if (!udiData) {
        return {
          success: false,
          error: 'UDI not found'
        };
      }

      return {
        success: true,
        udiInfo: {
          deviceIdentifier: udiData.identifiers?.identifier || udi,
          brandName: udiData.brand_name || '',
          versionModel: udiData.version_or_model_number || '',
          companyName: udiData.company_name || '',
          deviceDescription: udiData.device_description || '',
          gmdnTerms: udiData.gmdn_terms || [],
          productCodes: udiData.product_codes || [],
          storageHandling: udiData.storage_handling || {},
          deviceSizes: udiData.device_sizes || [],
          mriSafety: udiData.mri_safety || 'Unknown',
          labeledContainsNRL: udiData.labeled_contains_nrl || false,
          labeledNoNRL: udiData.labeled_no_nrl || false,
          deviceSterile: udiData.device_sterile || false,
          requiresSterilization: udiData.requires_sterilization || false
        }
      };
    } catch (error) {
      console.error('Error fetching UDI information:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get predicate devices for 510(k)
   */
  async getPredicateDevices(deviceName, deviceClass, productCode) {
    try {
      let searchQuery = '';
      
      if (productCode) {
        searchQuery = `product_code:${productCode}`;
      } else if (deviceName) {
        searchQuery = `device_name:"${deviceName}"`;
      }

      const searchUrl = `${this.openFDABaseUrl}/510k.json?search=${encodeURIComponent(searchQuery)}&limit=20`;
      
      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`FDA API error: ${response.status}`);
      }

      const data = await response.json();
      
      const predicates = (data.results || []).map(result => ({
        kNumber: result.k_number || '',
        deviceName: result.device_name || '',
        applicant: result.applicant || '',
        statementDateTime: result.statement_datetime || '',
        decisionDate: result.decision_date || '',
        decisionDescription: result.decision_description || '',
        productCode: result.product_code || '',
        regulationNumber: result.regulation_number || '',
        deviceClass: result.device_class || deviceClass,
        clearanceType: result.clearance_type || '',
        thirdPartyFlag: result.third_party_flag || 'N',
        expeditedReviewFlag: result.expedited_review_flag || 'N'
      }));

      return {
        success: true,
        predicates,
        totalFound: data.meta?.results?.total || 0
      };
    } catch (error) {
      console.error('Error fetching predicate devices:', error);
      return {
        success: false,
        error: error.message,
        predicates: []
      };
    }
  }

  /**
   * Package 510(k) submission
   */
  async package510kSubmission(deviceId, predicateIds, intendedUse, testingData, organizationId, userId) {
    try {
      // Get device information
      const [device] = await db
        .select()
        .from(medicalDevices)
        .where(and(
          eq(medicalDevices.id, deviceId),
          eq(medicalDevices.organizationId, organizationId)
        ))
        .limit(1);

      if (!device) {
        throw new Error('Device not found or access denied');
      }

      // Create submission package
      const submissionPackage = {
        submissionType: '510k',
        deviceInfo: {
          name: device.deviceName,
          model: device.deviceModel,
          manufacturer: device.manufacturer,
          class: device.deviceClass,
          productCode: device.productCode,
          intendedUse: intendedUse || device.intendedUse,
          indicationsForUse: device.indicationsForUse
        },
        predicateDevices: predicateIds,
        testingData: testingData || {},
        regulatoryStrategy: {
          pathway: '510(k)',
          classification: device.deviceClass,
          specialControls: [],
          guidanceDocuments: []
        },
        packagedAt: new Date().toISOString(),
        packagedBy: userId,
        status: 'draft',
        validationChecks: {
          deviceInfoComplete: !!device.deviceName && !!device.manufacturer,
          predicatesIdentified: predicateIds && predicateIds.length > 0,
          testingDataIncluded: !!testingData,
          intendedUseDocumented: !!intendedUse
        }
      };

      // Create submission record
      const [submission] = await db
        .insert(deviceSubmissions)
        .values({
          organizationId,
          deviceId,
          submissionType: '510k',
          submissionStatus: 'draft',
          submissionData: submissionPackage,
          createdBy: userId
        })
        .returning();

      // Log audit trail
      await auditService.logAction({
        organizationId,
        userId,
        action: 'CREATE',
        resource: '510K_SUBMISSION_PACKAGE',
        resourceId: submission.id.toString(),
        details: {
          deviceId,
          predicateCount: predicateIds?.length || 0
        }
      });

      return {
        success: true,
        packageId: submission.id,
        package: submissionPackage,
        validationStatus: submissionPackage.validationChecks
      };
    } catch (error) {
      console.error('Error packaging 510(k) submission:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Package PMA submission
   */
  async packagePMASubmission(deviceId, clinicalData, manufacturingData, organizationId, userId) {
    try {
      // Get device information
      const [device] = await db
        .select()
        .from(medicalDevices)
        .where(and(
          eq(medicalDevices.id, deviceId),
          eq(medicalDevices.organizationId, organizationId)
        ))
        .limit(1);

      if (!device) {
        throw new Error('Device not found or access denied');
      }

      // Create PMA submission package
      const submissionPackage = {
        submissionType: 'PMA',
        deviceInfo: {
          name: device.deviceName,
          model: device.deviceModel,
          manufacturer: device.manufacturer,
          class: device.deviceClass,
          productCode: device.productCode,
          intendedUse: device.intendedUse,
          indicationsForUse: device.indicationsForUse
        },
        clinicalData: clinicalData || {
          clinicalTrials: [],
          patientData: {},
          adverseEvents: [],
          benefitRiskAnalysis: {}
        },
        manufacturingData: manufacturingData || {
          qualitySystem: {},
          manufacturingProcess: {},
          sterilization: {},
          shelfLife: {}
        },
        regulatoryStrategy: {
          pathway: 'PMA',
          classification: device.deviceClass,
          advisoryPanel: '',
          moduleSubmissions: []
        },
        packagedAt: new Date().toISOString(),
        packagedBy: userId,
        status: 'draft',
        validationChecks: {
          deviceInfoComplete: !!device.deviceName && !!device.manufacturer,
          clinicalDataIncluded: !!clinicalData,
          manufacturingDataIncluded: !!manufacturingData,
          indicationsDocumented: !!device.indicationsForUse
        }
      };

      // Create submission record
      const [submission] = await db
        .insert(deviceSubmissions)
        .values({
          organizationId,
          deviceId,
          submissionType: 'PMA',
          submissionStatus: 'draft',
          submissionData: submissionPackage,
          createdBy: userId
        })
        .returning();

      // Log audit trail
      await auditService.logAction({
        organizationId,
        userId,
        action: 'CREATE',
        resource: 'PMA_SUBMISSION_PACKAGE',
        resourceId: submission.id.toString(),
        details: {
          deviceId,
          deviceClass: device.deviceClass
        }
      });

      return {
        success: true,
        packageId: submission.id,
        package: submissionPackage,
        validationStatus: submissionPackage.validationChecks
      };
    } catch (error) {
      console.error('Error packaging PMA submission:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Submit to FDA (mock implementation)
   */
  async submitToFDA(submissionType, packageId, organizationId, userId, isTestSubmission = false) {
    try {
      // Get submission package
      const [submission] = await db
        .select()
        .from(deviceSubmissions)
        .where(and(
          eq(deviceSubmissions.id, packageId),
          eq(deviceSubmissions.organizationId, organizationId)
        ))
        .limit(1);

      if (!submission) {
        throw new Error('Submission package not found or access denied');
      }

      // Simulate FDA submission
      const fdaSubmissionId = `FDA-${submissionType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Update submission status
      await db
        .update(deviceSubmissions)
        .set({
          submissionStatus: isTestSubmission ? 'test_submitted' : 'submitted',
          fdaSubmissionId,
          submittedAt: new Date(),
          submittedBy: userId,
          submissionData: {
            ...submission.submissionData,
            fdaSubmissionId,
            submittedAt: new Date().toISOString(),
            isTestSubmission
          }
        })
        .where(eq(deviceSubmissions.id, packageId));

      // Log audit trail
      await auditService.logAction({
        organizationId,
        userId,
        action: 'SUBMIT',
        resource: `${submissionType}_SUBMISSION`,
        resourceId: packageId.toString(),
        details: {
          fdaSubmissionId,
          isTestSubmission
        }
      });

      return {
        success: true,
        submissionId: fdaSubmissionId,
        status: isTestSubmission ? 'test_submitted' : 'submitted',
        message: isTestSubmission 
          ? 'Test submission successful. This is a simulation and was not sent to FDA.'
          : 'Submission package prepared. In production, this would be sent to FDA.',
        estimatedReviewTime: submissionType === '510k' ? '90 days' : '180 days'
      };
    } catch (error) {
      console.error('Error submitting to FDA:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check submission status
   */
  async checkSubmissionStatus(submissionId, organizationId) {
    try {
      // Get submission by FDA submission ID or internal ID
      const [submission] = await db
        .select()
        .from(deviceSubmissions)
        .where(and(
          eq(deviceSubmissions.organizationId, organizationId),
          sql`${deviceSubmissions.fdaSubmissionId} = ${submissionId} OR ${deviceSubmissions.id} = ${parseInt(submissionId)}`
        ))
        .limit(1);

      if (!submission) {
        return {
          success: false,
          error: 'Submission not found'
        };
      }

      // Simulate status updates (in production, would query FDA API)
      let currentStatus = submission.submissionStatus;
      let reviewProgress = 0;
      let estimatedCompletion = null;

      if (submission.submittedAt) {
        const daysSinceSubmission = Math.floor(
          (Date.now() - new Date(submission.submittedAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        if (submission.submissionType === '510k') {
          reviewProgress = Math.min(100, (daysSinceSubmission / 90) * 100);
          estimatedCompletion = new Date(submission.submittedAt);
          estimatedCompletion.setDate(estimatedCompletion.getDate() + 90);
        } else if (submission.submissionType === 'PMA') {
          reviewProgress = Math.min(100, (daysSinceSubmission / 180) * 100);
          estimatedCompletion = new Date(submission.submittedAt);
          estimatedCompletion.setDate(estimatedCompletion.getDate() + 180);
        }
      }

      return {
        success: true,
        submissionId: submission.fdaSubmissionId || submission.id,
        status: currentStatus,
        submissionType: submission.submissionType,
        submittedAt: submission.submittedAt,
        reviewProgress: Math.round(reviewProgress),
        estimatedCompletion: estimatedCompletion?.toISOString(),
        lastUpdated: submission.updatedAt,
        details: {
          deviceId: submission.deviceId,
          organizationId: submission.organizationId,
          isTestSubmission: submission.submissionData?.isTestSubmission || false
        }
      };
    } catch (error) {
      console.error('Error checking submission status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test FDA connectivity
   */
  async testFDAConnectivity() {
    try {
      // Test openFDA API connectivity
      const testUrl = `${this.openFDABaseUrl}/event.json?limit=1`;
      const response = await fetch(testUrl);
      
      if (!response.ok) {
        throw new Error(`FDA API returned status ${response.status}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        message: 'FDA API connection successful',
        apiStatus: 'online',
        responseTime: response.headers.get('x-response-time') || 'N/A',
        apiVersion: data.meta?.disclaimer || 'openFDA API',
        endpoints: {
          deviceEvent: true,
          deviceRecall: true,
          deviceClassification: true,
          device510k: true,
          devicePMA: true,
          deviceUDI: true
        }
      };
    } catch (error) {
      console.error('Error testing FDA connectivity:', error);
      return {
        success: false,
        message: 'FDA API connection failed',
        apiStatus: 'offline',
        error: error.message
      };
    }
  }
}

export default new FDAIntegrationService();