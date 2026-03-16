/**
 * CERV2 Section Service
 * 
 * Handles all CRUD operations for FDA 510(k) document sections
 * Provides database-backed section management with version history
 */

class CERV2SectionService {
  constructor() {
    this.baseUrl = '/api/cerv2-sections';
    this.organizationId = null;
  }

  /**
   * Set organization context for all API calls
   */
  setOrganization(orgId) {
    this.organizationId = orgId;
  }

  /**
   * Get headers with organization ID
   */
  getHeaders() {
    // Get organization from localStorage (set by TenantContext)
    const storedOrgId = localStorage.getItem('currentOrganizationId');
    const orgId = this.organizationId || storedOrgId;
    if (!orgId) {
      console.warn('[CERV2SectionService] No organization ID set — API calls may fail');
    }
    return {
      'Content-Type': 'application/json',
      'x-organization-id': orgId || '1',
    };
  }

  /**
   * Get all sections for the organization
   */
  async getAllSections(documentId = null) {
    try {
      const params = new URLSearchParams();
      if (documentId) {
        params.append('document_id', documentId);
      }

      const url = `${this.baseUrl}?${params.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch sections: ${response.statusText}`);
      }

      const data = await response.json();
      return data.sections || [];
    } catch (error) {
      console.error('[CERV2SectionService] Error fetching sections:', error);
      throw error;
    }
  }

  /**
   * Get a single section by ID
   */
  async getSection(sectionId) {
    try {
      const response = await fetch(`${this.baseUrl}/${sectionId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch section: ${response.statusText}`);
      }

      const data = await response.json();
      return data.section;
    } catch (error) {
      console.error('[CERV2SectionService] Error fetching section:', error);
      throw error;
    }
  }

  /**
   * Create a new section
   */
  async createSection(sectionData) {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(sectionData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create section');
      }

      const data = await response.json();
      return data.section;
    } catch (error) {
      console.error('[CERV2SectionService] Error creating section:', error);
      throw error;
    }
  }

  /**
   * Update an existing section
   */
  async updateSection(sectionId, updates) {
    try {
      const response = await fetch(`${this.baseUrl}/${sectionId}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update section');
      }

      const data = await response.json();
      return data.section;
    } catch (error) {
      console.error('[CERV2SectionService] Error updating section:', error);
      throw error;
    }
  }

  /**
   * Delete a section
   */
  async deleteSection(sectionId) {
    try {
      const response = await fetch(`${this.baseUrl}/${sectionId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete section');
      }

      return true;
    } catch (error) {
      console.error('[CERV2SectionService] Error deleting section:', error);
      throw error;
    }
  }

  /**
   * Update section content (rich text HTML)
   */
  async updateSectionContent(sectionId, content) {
    return this.updateSection(sectionId, { content });
  }

  /**
   * Update section status (todo, in-progress, completed)
   */
  async updateSectionStatus(sectionId, status) {
    return this.updateSection(sectionId, { status });
  }

  /**
   * Assign section to a user
   */
  async assignSection(sectionId, userId) {
    return this.updateSection(sectionId, { assigned_to: userId });
  }

  /**
   * Get section version history
   */
  async getSectionVersions(sectionId) {
    try {
      const response = await fetch(`${this.baseUrl}/${sectionId}/versions`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch version history: ${response.statusText}`);
      }

      const data = await response.json();
      return data.versions || [];
    } catch (error) {
      console.error('[CERV2SectionService] Error fetching versions:', error);
      throw error;
    }
  }

  /**
   * Bulk create default FDA 510(k) sections
   */
  async initializeDefaultSections(documentId = null) {
    const defaultSections = [
      {
        section_number: '1.0',
        section_title: 'Medical Device User Fee Cover Sheet',
        section_key: 'user-fee-cover',
        category: 'Administrative',
        level: 1,
        display_order: 1,
        is_required: true,
        icon: 'DollarSign',
        status: 'todo',
        document_id: documentId,
      },
      {
        section_number: '2.0',
        section_title: 'CDRH Premarket Review Submission Cover Sheet',
        section_key: 'cdrh-cover-sheet',
        category: 'Administrative',
        level: 1,
        display_order: 2,
        is_required: true,
        icon: 'FileSignature',
        status: 'todo',
        document_id: documentId,
      },
      {
        section_number: '3.0',
        section_title: 'Executive Summary',
        section_key: 'executive-summary',
        category: 'Administrative',
        level: 1,
        display_order: 3,
        is_required: true,
        icon: 'FileText',
        status: 'todo',
        document_id: documentId,
      },
      {
        section_number: '4.0',
        section_title: 'Indications for Use Statement',
        section_key: 'indications-for-use',
        category: 'Administrative',
        level: 1,
        display_order: 4,
        is_required: true,
        icon: 'Activity',
        status: 'todo',
        document_id: documentId,
      },
      {
        section_number: '5.0',
        section_title: '510(k) Summary or Statement',
        section_key: '510k-summary',
        category: 'Administrative',
        level: 1,
        display_order: 5,
        is_required: true,
        icon: 'FileText',
        status: 'todo',
        document_id: documentId,
      },
      {
        section_number: '6.0',
        section_title: 'Device Description',
        section_key: 'device-description',
        category: 'Device',
        level: 1,
        display_order: 6,
        is_required: true,
        icon: 'Package',
        status: 'todo',
        document_id: documentId,
      },
      {
        section_number: '7.0',
        section_title: 'Substantial Equivalence Discussion',
        section_key: 'substantial-equivalence',
        category: 'Device',
        level: 1,
        display_order: 7,
        is_required: true,
        icon: 'GitCompare',
        status: 'todo',
        document_id: documentId,
      },
      {
        section_number: '8.0',
        section_title: 'Performance Testing',
        section_key: 'performance-testing',
        category: 'Testing',
        level: 1,
        display_order: 8,
        is_required: true,
        icon: 'Beaker',
        status: 'todo',
        document_id: documentId,
      },
      {
        section_number: '9.0',
        section_title: 'Labeling',
        section_key: 'labeling',
        category: 'Additional',
        level: 1,
        display_order: 9,
        is_required: true,
        icon: 'Tag',
        status: 'todo',
        document_id: documentId,
      },
      {
        section_number: '10.0',
        section_title: 'Sterilization and Shelf Life',
        section_key: 'sterilization',
        category: 'Testing',
        level: 1,
        display_order: 10,
        is_required: false,
        icon: 'Shield',
        status: 'todo',
        document_id: documentId,
      },
      {
        section_number: '11.0',
        section_title: 'Biocompatibility',
        section_key: 'biocompatibility',
        category: 'Testing',
        level: 1,
        display_order: 11,
        is_required: false,
        icon: 'ClipboardCheck',
        status: 'todo',
        document_id: documentId,
      },
      {
        section_number: '12.0',
        section_title: 'Software and Cybersecurity',
        section_key: 'software',
        category: 'Software',
        level: 1,
        display_order: 12,
        is_required: false,
        icon: 'Code',
        status: 'todo',
        document_id: documentId,
      },
    ];

    try {
      const createdSections = [];
      for (const sectionData of defaultSections) {
        const section = await this.createSection(sectionData);
        createdSections.push(section);
      }
      return createdSections;
    } catch (error) {
      console.error('[CERV2SectionService] Error initializing default sections:', error);
      throw error;
    }
  }
}

// Export singleton instance
const cerv2SectionService = new CERV2SectionService();
export default cerv2SectionService;
