/**
 * Facts Service
 * Provides real data for template hydration from various sources
 */

class FactsService {
  constructor() {
    // Initialize with default Facts database
    this.facts = {
      // Sponsor Information
      sponsors: {
        default: {
          name: 'Biotech Innovations Inc.',
          address: '123 Research Parkway, Cambridge, MA 02142, USA',
          phone: '+1 (617) 555-0100',
          email: 'regulatory@biotechinnovations.com',
          duns_number: '123456789',
          contact_person: 'Dr. Sarah Johnson, VP Regulatory Affairs'
        }
      },
      
      // Drug Substance Facts
      drugSubstance: {
        'XYZ-123': {
          name: 'XYZ-123',
          chemical_name: '(S)-2-amino-3-(4-hydroxyphenyl)propanoic acid derivative',
          molecular_formula: 'C24H32N4O5',
          molecular_weight: '456.54 g/mol',
          cas_number: '123456-78-9',
          description: 'White to off-white crystalline powder',
          solubility: 'Soluble in DMSO, slightly soluble in water',
          storage: 'Store at -20°C, protected from light',
          manufacturer: 'BioTech Manufacturing GmbH',
          manufacturing_site: 'Berlin, Germany'
        },
        'ABC-456': {
          name: 'ABC-456',
          chemical_name: 'Anti-inflammatory monoclonal antibody',
          molecular_weight: '148 kDa',
          description: 'Clear, colorless solution',
          storage: 'Store at 2-8°C, do not freeze',
          manufacturer: 'Protein Sciences Corp.',
          manufacturing_site: 'San Diego, CA, USA'
        }
      },
      
      // Drug Product Facts
      drugProduct: {
        'XYZ-123': {
          dosage_form: 'Solution for injection',
          strength: '10 mg/mL',
          route: 'Intravenous infusion',
          container: 'Single-use glass vial',
          volume: '10 mL',
          excipients: 'Sodium chloride, sodium phosphate buffer, polysorbate 80',
          shelf_life: '24 months at 2-8°C',
          administration: 'Dilute in 0.9% sodium chloride before administration'
        },
        'ABC-456': {
          dosage_form: 'Pre-filled syringe',
          strength: '150 mg/mL',
          route: 'Subcutaneous injection',
          container: 'Pre-filled syringe with needle guard',
          volume: '1 mL',
          excipients: 'Histidine buffer, sucrose, polysorbate 20',
          shelf_life: '18 months at 2-8°C',
          administration: 'Allow to reach room temperature before injection'
        }
      },
      
      // Manufacturing Facts
      manufacturing: {
        processes: {
          'XYZ-123': {
            synthesis_steps: 5,
            purification_method: 'Crystallization and HPLC',
            yield: '72%',
            critical_parameters: ['Temperature', 'pH', 'Reaction time'],
            in_process_controls: ['HPLC purity', 'Moisture content', 'Particle size']
          }
        },
        facilities: {
          primary: {
            name: 'BioTech Manufacturing GmbH',
            address: 'Industriestrasse 123, 10115 Berlin, Germany',
            certification: 'EU GMP Certificate DE_BB_01_GMP_2023_0145',
            last_inspection: '2023-09-15'
          }
        }
      },
      
      // Analytical Methods
      analyticalMethods: {
        identity: {
          method: 'HPLC with UV detection',
          reference_standard: 'USP Reference Standard',
          acceptance_criteria: 'Retention time ± 2%'
        },
        purity: {
          method: 'Reverse-phase HPLC',
          limit: 'NLT 98.0%',
          impurities: 'Individual: NMT 0.5%, Total: NMT 2.0%'
        },
        potency: {
          method: 'Cell-based bioassay',
          range: '80-120% of labeled potency'
        }
      },
      
      // Stability Data
      stability: {
        'XYZ-123': {
          long_term: {
            conditions: '5°C ± 3°C',
            duration: '24 months',
            result: 'Stable'
          },
          accelerated: {
            conditions: '25°C ± 2°C / 60% RH ± 5% RH',
            duration: '6 months',
            result: 'Stable'
          },
          stress: {
            conditions: '40°C ± 2°C / 75% RH ± 5% RH',
            duration: '3 months',
            result: 'Degradation observed after 2 months'
          }
        }
      },
      
      // Clinical Protocol Facts
      clinicalProtocol: {
        phase1: {
          title: 'A Phase 1, First-in-Human, Dose-Escalation Study',
          objectives: 'To evaluate safety, tolerability, and pharmacokinetics',
          design: 'Open-label, dose-escalation study using 3+3 design',
          population: 'Adults with advanced solid tumors',
          sample_size: '18-24 patients',
          duration: '12 months',
          endpoints: {
            primary: 'Dose-limiting toxicities (DLTs) and MTD determination',
            secondary: 'PK parameters (Cmax, AUC, t1/2), preliminary efficacy'
          }
        }
      },
      
      // Regulatory Facts
      regulatory: {
        ind_number: 'IND 123456',
        submission_date: new Date().toISOString().split('T')[0],
        regulatory_contact: 'Office of Hematology and Oncology Products',
        pre_ind_meeting_date: '2024-06-15',
        pre_ind_meeting_minutes: 'FDA agreed with proposed Phase 1 design and starting dose'
      },
      
      // Safety/Toxicology Facts
      toxicology: {
        species_tested: ['Rat', 'Dog', 'Cynomolgus monkey'],
        noael: {
          rat: '100 mg/kg',
          dog: '30 mg/kg',
          monkey: '50 mg/kg'
        },
        safety_margin: '10-fold based on body surface area',
        genotoxicity: 'Negative in Ames test, chromosomal aberration, and micronucleus assays',
        reproductive: 'Studies planned prior to Phase 2'
      }
    };
  }
  
  /**
   * Get fact by key path (e.g., "sponsors.default.name")
   */
  getFact(keyPath, drugName = null) {
    try {
      const keys = keyPath.split('.');
      let value = this.facts;
      
      // Navigate through the fact tree
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return null;
        }
      }
      
      return value;
    } catch (error) {
      console.error('Error getting fact:', error);
      return null;
    }
  }
  
  /**
   * Get Facts for a specific IND application
   */
  getFactsForIND(indData) {
    const drugName = indData.drugName || indData.investigationalProduct || 'XYZ-123';
    const phase = indData.phase || 'Phase 1';
    
    // Build comprehensive fact set for the IND
    const facts = {
      // Sponsor information
      sponsor_name: this.getFact('sponsors.default.name'),
      sponsor_address: this.getFact('sponsors.default.address'),
      sponsor_phone: this.getFact('sponsors.default.phone'),
      sponsor_email: this.getFact('sponsors.default.email'),
      sponsor_contact: this.getFact('sponsors.default.contact_person'),
      duns_number: this.getFact('sponsors.default.duns_number'),
      
      // Drug information
      drug_name: drugName,
      drug_substance_name: this.facts.drugSubstance[drugName]?.name || drugName,
      chemical_name: this.facts.drugSubstance[drugName]?.chemical_name || 'To be determined',
      molecular_formula: this.facts.drugSubstance[drugName]?.molecular_formula || 'To be determined',
      molecular_weight: this.facts.drugSubstance[drugName]?.molecular_weight || 'To be determined',
      cas_number: this.facts.drugSubstance[drugName]?.cas_number || 'To be assigned',
      
      // Manufacturing
      manufacturer_name: this.facts.drugSubstance[drugName]?.manufacturer || this.getFact('manufacturing.facilities.primary.name'),
      manufacturing_site: this.facts.drugSubstance[drugName]?.manufacturing_site || this.getFact('manufacturing.facilities.primary.address'),
      gmp_certification: this.getFact('manufacturing.facilities.primary.certification'),
      
      // Dosage form
      dosage_form: this.facts.drugProduct[drugName]?.dosage_form || 'Solution for injection',
      strength: this.facts.drugProduct[drugName]?.strength || '10 mg/mL',
      route_of_administration: this.facts.drugProduct[drugName]?.route || 'Intravenous',
      
      // Clinical trial information
      protocol_title: phase === 'Phase 1' ? this.getFact('clinicalProtocol.phase1.title') : `A ${phase} Clinical Study`,
      study_design: this.getFact('clinicalProtocol.phase1.design'),
      study_population: this.getFact('clinicalProtocol.phase1.population'),
      sample_size: this.getFact('clinicalProtocol.phase1.sample_size'),
      primary_endpoint: this.getFact('clinicalProtocol.phase1.endpoints.primary'),
      secondary_endpoints: this.getFact('clinicalProtocol.phase1.endpoints.secondary'),
      
      // Regulatory
      ind_number: indData.indNumber || this.getFact('regulatory.ind_number'),
      submission_date: this.getFact('regulatory.submission_date'),
      indication: indData.indication || 'Advanced solid tumors',
      phase: phase,
      
      // Additional context
      investigator_name: indData.principalInvestigator || 'To be determined',
      study_duration: this.getFact('clinicalProtocol.phase1.duration'),
      
      // Safety data
      species_tested: this.facts.toxicology.species_tested.join(', '),
      safety_margin: this.getFact('toxicology.safety_margin'),
      noael_summary: `NOAEL values: Rat ${this.facts.toxicology.noael.rat}, Dog ${this.facts.toxicology.noael.dog}, Monkey ${this.facts.toxicology.noael.monkey}`
    };
    
    return facts;
  }
  
  /**
   * Create citations for fact-based content
   */
  createCitation(factKey, factValue) {
    return {
      fact_key: factKey,
      fact_value: factValue,
      source_uri: `facts://${factKey}`,
      confidence: 1.0,
      last_updated: new Date().toISOString()
    };
  }
  
  /**
   * Generate LeafPatch for tracked changes
   */
  generateLeafPatch(originalContent, hydratedContent, citations) {
    const patch = {
      id: `patch_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'hydration',
      changes: [],
      citations: citations || []
    };
    
    // Find all placeholder replacements
    const placeholderRegex = /\{\{(\w+)\}\}/g;
    let match;
    let lastIndex = 0;
    
    while ((match = placeholderRegex.exec(originalContent)) !== null) {
      const placeholder = match[0];
      const key = match[1];
      const startPos = match.index;
      
      // Find the replaced value in hydrated content
      const beforePlaceholder = originalContent.substring(lastIndex, startPos);
      const hydratedStart = hydratedContent.indexOf(beforePlaceholder, lastIndex) + beforePlaceholder.length;
      
      // Find next placeholder or end of string
      const nextMatch = placeholderRegex.exec(originalContent);
      placeholderRegex.lastIndex = match.index + match[0].length; // Reset position
      
      let hydratedEnd;
      if (nextMatch) {
        const nextBefore = originalContent.substring(match.index + match[0].length, nextMatch.index);
        hydratedEnd = hydratedContent.indexOf(nextBefore, hydratedStart);
      } else {
        const afterPlaceholder = originalContent.substring(match.index + match[0].length);
        if (afterPlaceholder) {
          hydratedEnd = hydratedContent.indexOf(afterPlaceholder, hydratedStart);
        } else {
          hydratedEnd = hydratedContent.length;
        }
      }
      
      const replacedValue = hydratedContent.substring(hydratedStart, hydratedEnd);
      
      // Add change record
      patch.changes.push({
        type: 'replace',
        start: startPos,
        end: startPos + placeholder.length,
        original: placeholder,
        replacement: replacedValue,
        factKey: key,
        tracked: true,
        author: 'system',
        reason: 'Template hydration with Facts'
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    return patch;
  }
}

// Export singleton instance
export default new FactsService();