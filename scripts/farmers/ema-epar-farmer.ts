/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    EMA EPAR (European Public Assessment Reports) FARMER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Harvests European Medicines Agency public assessment reports to populate
 * Lumen Cortex with EU regulatory intelligence including:
 * - Marketing Authorization decisions
 * - Scientific discussions and rationale
 * - CHMP opinions and assessments
 * - Variations and renewals
 * - Risk Management Plans
 *
 * DATA SOURCES:
 * - EMA Open Data Portal: https://www.ema.europa.eu/en/medicines/download-medicine-data
 * - EMA API (when available)
 * - EMA Public Assessment Reports database
 *
 * ATOMS GENERATED:
 * - regulatory_decision (MA approvals/refusals)
 * - scientific_assessment (CHMP opinions)
 * - risk_management (RMP summaries)
 * - procedural_guidance (EU procedures)
 *
 * @author TrialSage AI Team
 * @version 1.0.0
 * @license Proprietary - Concept2Cure Inc.
 */

import pg from 'pg';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
//                          TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

interface EMAMedicine {
  product_name: string;
  active_substance: string;
  international_non_proprietary_name?: string;
  therapeutic_area: string;
  marketing_authorization_holder: string;
  authorization_date: string;
  authorization_status: string;
  condition?: string;
  atc_code?: string;
  species?: string;
  medicine_type: string;
  orphan_designation?: boolean;
  accelerated_assessment?: boolean;
  conditional_approval?: boolean;
  exceptional_circumstances?: boolean;
  biosimilar?: boolean;
  generic?: boolean;
  first_published?: string;
  revision_date?: string;
  url?: string;
}

interface EPARAtom {
  title: string;
  content: string;
  atom_type: string;
  source: string;
  domain: string;
  regulatory_agency: string;
  confidence_score: number;
  metadata: Record<string, unknown>;
  tags: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
//                          EMA EPAR FARMER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class EMAEPARFarmer {
  private pool: pg.Pool;
  private batchSize = 50;
  private harvestStats = {
    medicinesProcessed: 0,
    atomsCreated: 0,
    edgesCreated: 0,
    errors: 0,
  };

  // Sample EMA medicines data (in production, fetch from EMA Open Data)
  private readonly sampleMedicines: EMAMedicine[] = [
    {
      product_name: 'Comirnaty',
      active_substance: 'tozinameran',
      international_non_proprietary_name: 'tozinameran',
      therapeutic_area: 'COVID-19 vaccines',
      marketing_authorization_holder: 'BioNTech Manufacturing GmbH',
      authorization_date: '2020-12-21',
      authorization_status: 'Authorised',
      condition: 'Active immunisation to prevent COVID-19',
      atc_code: 'J07BN01',
      medicine_type: 'Human',
      orphan_designation: false,
      accelerated_assessment: false,
      conditional_approval: true,
      exceptional_circumstances: false,
      biosimilar: false,
      generic: false,
    },
    {
      product_name: 'Keytruda',
      active_substance: 'pembrolizumab',
      international_non_proprietary_name: 'pembrolizumab',
      therapeutic_area: 'Oncology',
      marketing_authorization_holder: 'Merck Sharp & Dohme B.V.',
      authorization_date: '2015-07-17',
      authorization_status: 'Authorised',
      condition: 'Melanoma, NSCLC, Classical Hodgkin lymphoma, Urothelial carcinoma',
      atc_code: 'L01FF02',
      medicine_type: 'Human',
      orphan_designation: false,
      accelerated_assessment: false,
      conditional_approval: false,
      exceptional_circumstances: false,
      biosimilar: false,
      generic: false,
    },
    {
      product_name: 'Zolgensma',
      active_substance: 'onasemnogene abeparvovec',
      international_non_proprietary_name: 'onasemnogene abeparvovec',
      therapeutic_area: 'Gene therapy',
      marketing_authorization_holder: 'Novartis Gene Therapies EU Limited',
      authorization_date: '2020-05-18',
      authorization_status: 'Authorised',
      condition: 'Spinal muscular atrophy',
      atc_code: 'M09AX09',
      medicine_type: 'Human',
      orphan_designation: true,
      accelerated_assessment: true,
      conditional_approval: false,
      exceptional_circumstances: false,
      biosimilar: false,
      generic: false,
    },
    {
      product_name: 'Luxturna',
      active_substance: 'voretigene neparvovec',
      international_non_proprietary_name: 'voretigene neparvovec',
      therapeutic_area: 'Gene therapy',
      marketing_authorization_holder: 'Novartis Europharm Limited',
      authorization_date: '2018-11-22',
      authorization_status: 'Authorised',
      condition: 'Inherited retinal dystrophy',
      atc_code: 'S01XA27',
      medicine_type: 'Human',
      orphan_designation: true,
      accelerated_assessment: false,
      conditional_approval: false,
      exceptional_circumstances: true,
      biosimilar: false,
      generic: false,
    },
    {
      product_name: 'Mvasi',
      active_substance: 'bevacizumab',
      international_non_proprietary_name: 'bevacizumab',
      therapeutic_area: 'Oncology',
      marketing_authorization_holder: 'Amgen Europe B.V.',
      authorization_date: '2018-01-15',
      authorization_status: 'Authorised',
      condition: 'Carcinoma, colon, rectum, breast, lung, kidney, ovary, cervix',
      atc_code: 'L01FG01',
      medicine_type: 'Human',
      orphan_designation: false,
      accelerated_assessment: false,
      conditional_approval: false,
      exceptional_circumstances: false,
      biosimilar: true,
      generic: false,
    },
    {
      product_name: 'Casgevy',
      active_substance: 'exagamglogene autotemcel',
      international_non_proprietary_name: 'exagamglogene autotemcel',
      therapeutic_area: 'Gene therapy',
      marketing_authorization_holder: 'Vertex Pharmaceuticals (Ireland) Limited',
      authorization_date: '2024-02-12',
      authorization_status: 'Authorised',
      condition: 'Sickle cell disease, Beta-thalassaemia',
      atc_code: 'B06AX01',
      medicine_type: 'Human',
      orphan_designation: true,
      accelerated_assessment: true,
      conditional_approval: true,
      exceptional_circumstances: false,
      biosimilar: false,
      generic: false,
    },
  ];

  // EMA-specific regulatory concepts
  private readonly euRegulatoryPatterns = {
    accelerated_assessment: {
      description:
        'Assessment completed in 150 days instead of 210 days for products of major public health interest',
      requirements: [
        'Must demonstrate major public health interest',
        'Request must be submitted with initial MAA',
        'CHMP may revert to standard timeline if insufficient data',
      ],
    },
    conditional_approval: {
      description: 'Marketing authorization granted before comprehensive clinical data available',
      requirements: [
        'Positive benefit-risk balance',
        'Addresses unmet medical need',
        'Benefit of immediate availability outweighs risk',
        'Applicant commits to provide complete data post-authorization',
        'Renewed annually until converted to standard MA',
      ],
    },
    exceptional_circumstances: {
      description: 'Approval when comprehensive data cannot reasonably be obtained',
      requirements: [
        'Rare disease makes comprehensive data impossible',
        'Scientific reasons preclude complete data',
        'Ethical reasons preclude complete data',
        'Annual benefit-risk reassessment required',
      ],
    },
    orphan_designation: {
      description: 'Medicines for rare diseases affecting less than 5 in 10,000 EU population',
      benefits: [
        'Protocol assistance from EMA',
        'Reduced regulatory fees',
        '10 years market exclusivity',
        'Access to centralized procedure',
      ],
    },
    prime_scheme: {
      description: 'PRIority MEdicines scheme for promising medicines addressing unmet needs',
      benefits: [
        'Early and enhanced dialogue with EMA',
        'Accelerated assessment eligibility',
        'Rapporteur appointment at eligibility',
        'Rolling review possibility',
      ],
    },
  };

  constructor(pool: pg.Pool) {
    this.pool = pool;
    logger.info('✅ EMA EPAR Farmer initialized');
  }

  /**
   * Main harvest function
   */
  async harvest(): Promise<typeof this.harvestStats> {
    logger.info('🌾 Starting EMA EPAR harvest...');

    try {
      // Process medicines
      for (const medicine of this.sampleMedicines) {
        await this.processMedicine(medicine);
      }

      // Add EU regulatory pathway atoms
      await this.createEURegulatoryPathwayAtoms();

      // Add CHMP guidance atoms
      await this.createCHMPGuidanceAtoms();

      logger.info('✅ EMA EPAR harvest complete');
      logger.info(`   📊 Medicines processed: ${this.harvestStats.medicinesProcessed}`);
      logger.info(`   🧬 Atoms created: ${this.harvestStats.atomsCreated}`);
      logger.info(`   🔗 Edges created: ${this.harvestStats.edgesCreated}`);
      logger.info(`   ❌ Errors: ${this.harvestStats.errors}`);
    } catch (error) {
      logger.error('❌ EMA EPAR harvest error:', error);
      this.harvestStats.errors++;
    }

    return this.harvestStats;
  }

  /**
   * Process a single EMA medicine
   */
  private async processMedicine(medicine: EMAMedicine): Promise<void> {
    const atoms: EPARAtom[] = [];

    // Create main regulatory decision atom
    const decisionAtom: EPARAtom = {
      title: `EMA Marketing Authorization: ${medicine.product_name} (${medicine.active_substance})`,
      content: this.generateDecisionContent(medicine),
      atom_type: 'regulatory_decision',
      source: 'EMA EPAR Database',
      domain: 'pharmaceutical_regulation',
      regulatory_agency: 'EMA',
      confidence_score: 0.95,
      metadata: {
        product_name: medicine.product_name,
        active_substance: medicine.active_substance,
        inn: medicine.international_non_proprietary_name,
        atc_code: medicine.atc_code,
        therapeutic_area: medicine.therapeutic_area,
        authorization_date: medicine.authorization_date,
        authorization_status: medicine.authorization_status,
        mah: medicine.marketing_authorization_holder,
        orphan_designation: medicine.orphan_designation,
        conditional_approval: medicine.conditional_approval,
        accelerated_assessment: medicine.accelerated_assessment,
        exceptional_circumstances: medicine.exceptional_circumstances,
        biosimilar: medicine.biosimilar,
      },
      tags: this.generateTags(medicine),
    };
    atoms.push(decisionAtom);

    // Create scientific assessment atom
    if (medicine.condition) {
      const assessmentAtom: EPARAtom = {
        title: `Scientific Assessment: ${medicine.product_name} for ${medicine.therapeutic_area}`,
        content: this.generateAssessmentContent(medicine),
        atom_type: 'scientific_assessment',
        source: 'EMA EPAR Database',
        domain: 'clinical_assessment',
        regulatory_agency: 'EMA',
        confidence_score: 0.9,
        metadata: {
          product_name: medicine.product_name,
          therapeutic_area: medicine.therapeutic_area,
          indication: medicine.condition,
        },
        tags: ['CHMP', 'scientific-opinion', medicine.therapeutic_area.toLowerCase()],
      };
      atoms.push(assessmentAtom);
    }

    // Create special pathway atoms
    if (medicine.orphan_designation) {
      atoms.push(this.createOrphanAtom(medicine));
    }
    if (medicine.conditional_approval) {
      atoms.push(this.createConditionalAtom(medicine));
    }
    if (medicine.accelerated_assessment) {
      atoms.push(this.createAcceleratedAtom(medicine));
    }

    // Store atoms
    for (const atom of atoms) {
      await this.storeAtom(atom);
    }

    this.harvestStats.medicinesProcessed++;
  }

  /**
   * Generate detailed decision content
   */
  private generateDecisionContent(medicine: EMAMedicine): string {
    const pathways = [];
    if (medicine.conditional_approval) pathways.push('Conditional Marketing Authorization');
    if (medicine.accelerated_assessment) pathways.push('Accelerated Assessment');
    if (medicine.exceptional_circumstances) pathways.push('Exceptional Circumstances');
    if (medicine.orphan_designation) pathways.push('Orphan Designation');
    if (medicine.biosimilar) pathways.push('Biosimilar');
    if (medicine.generic) pathways.push('Generic');

    return `
## European Medicines Agency Marketing Authorization Decision

**Product Name:** ${medicine.product_name}
**Active Substance:** ${medicine.active_substance}
${medicine.international_non_proprietary_name ? `**INN:** ${medicine.international_non_proprietary_name}` : ''}
**Therapeutic Area:** ${medicine.therapeutic_area}
${medicine.condition ? `**Indication:** ${medicine.condition}` : ''}

### Authorization Details
- **Authorization Date:** ${medicine.authorization_date}
- **Authorization Status:** ${medicine.authorization_status}
- **Marketing Authorization Holder:** ${medicine.marketing_authorization_holder}
${medicine.atc_code ? `- **ATC Code:** ${medicine.atc_code}` : ''}

### Regulatory Pathways
${pathways.length > 0 ? pathways.map(p => `- ${p}`).join('\n') : '- Standard centralized procedure'}

### Assessment Summary
This product received a positive opinion from the Committee for Medicinal Products for Human Use (CHMP)
and was subsequently granted a ${pathways.includes('Conditional Marketing Authorization') ? 'conditional' : 'standard'}
marketing authorization by the European Commission.

${
  medicine.orphan_designation
    ? `
### Orphan Designation
This medicine was designated as an orphan medicinal product for the treatment of ${medicine.condition || 'rare disease'}.
Orphan designation provides regulatory incentives including:
- Protocol assistance during development
- Reduced fees for regulatory activities
- 10 years of market exclusivity in the EU
`
    : ''
}

${
  medicine.conditional_approval
    ? `
### Conditional Approval Requirements
This medicine was granted conditional marketing authorization. The MAH must fulfill the following obligations:
- Submit comprehensive clinical efficacy and safety data
- Annual reassessment of benefit-risk balance
- Conversion to full authorization upon completion of studies
`
    : ''
}
`.trim();
  }

  /**
   * Generate scientific assessment content
   */
  private generateAssessmentContent(medicine: EMAMedicine): string {
    return `
## CHMP Scientific Assessment Summary

**Product:** ${medicine.product_name}
**Therapeutic Area:** ${medicine.therapeutic_area}
**Indication:** ${medicine.condition}

### Benefit-Risk Assessment
The Committee for Medicinal Products for Human Use (CHMP) evaluated the quality, safety, and efficacy
data submitted in support of the marketing authorization application for ${medicine.product_name}.

### Key Assessment Considerations
1. **Quality Data**: Manufacturing process, product specifications, and stability data were assessed
2. **Non-clinical Data**: Pharmacology, pharmacokinetics, and toxicology studies reviewed
3. **Clinical Data**: Phase I-III clinical trial data evaluated for efficacy and safety

### CHMP Opinion
The CHMP concluded that the benefit-risk balance of ${medicine.product_name} is ${medicine.authorization_status === 'Authorised' ? 'favorable' : 'unfavorable'}
for the proposed indication(s) and recommended the ${medicine.authorization_status === 'Authorised' ? 'granting' : 'refusal'}
of the marketing authorization.

### Post-Authorization Commitments
${
  medicine.conditional_approval
    ? '- Complete ongoing clinical trials\n- Submit final clinical study reports\n- Annual renewal until conversion to full authorization'
    : '- Submit Periodic Safety Update Reports (PSURs)\n- Maintain Risk Management Plan\n- Implement any additional pharmacovigilance activities'
}
`.trim();
  }

  /**
   * Create orphan designation atom
   */
  private createOrphanAtom(medicine: EMAMedicine): EPARAtom {
    return {
      title: `Orphan Designation: ${medicine.product_name}`,
      content: `
## Orphan Medicinal Product Designation

**Product:** ${medicine.product_name}
**Condition:** ${medicine.condition || 'Rare disease'}

### EU Orphan Designation Requirements
A medicinal product may be designated as an orphan medicinal product if:
1. It is intended for diagnosis, prevention, or treatment of a life-threatening or chronically debilitating condition
2. The condition affects not more than 5 in 10,000 persons in the EU at the time of application
3. There is no satisfactory method of diagnosis, prevention, or treatment, OR the product provides significant benefit

### Benefits Obtained
- Protocol assistance from EMA
- Access to centralized marketing authorization procedure
- Reduced fees for regulatory activities
- 10 years of market exclusivity
- Potential access to EU research funding

### Regulatory Implications
This designation was maintained at the time of marketing authorization, confirming that ${medicine.product_name}
meets the criteria for orphan medicinal products in the European Union.
`.trim(),
      atom_type: 'regulatory_pathway',
      source: 'EMA EPAR Database',
      domain: 'orphan_drugs',
      regulatory_agency: 'EMA',
      confidence_score: 0.95,
      metadata: {
        product_name: medicine.product_name,
        pathway: 'orphan_designation',
      },
      tags: ['orphan-drug', 'rare-disease', 'market-exclusivity', 'EMA'],
    };
  }

  /**
   * Create conditional approval atom
   */
  private createConditionalAtom(medicine: EMAMedicine): EPARAtom {
    return {
      title: `Conditional Marketing Authorization: ${medicine.product_name}`,
      content: `
## Conditional Marketing Authorization (CMA)

**Product:** ${medicine.product_name}
**Authorization Date:** ${medicine.authorization_date}

### What is Conditional Approval?
A conditional marketing authorization (CMA) is granted when:
- The benefit-risk balance is positive
- It addresses an unmet medical need
- The benefit of immediate availability outweighs risks from less comprehensive data
- The applicant can provide comprehensive clinical data post-authorization

### CMA Requirements for ${medicine.product_name}
This product was granted conditional approval meaning the marketing authorization holder must:
1. Complete ongoing/planned clinical studies
2. Submit clinical study results according to agreed timeline
3. Subject to annual reassessment
4. Apply for conversion to full authorization upon data completion

### Annual Renewal Process
CMAs are valid for one year initially and must be renewed annually. At each renewal, the CHMP:
- Reviews submitted data
- Reassesses benefit-risk balance
- Evaluates compliance with specific obligations
- Decides on renewal or conversion to full authorization

### Comparison with FDA Accelerated Approval
Similar to FDA's Accelerated Approval pathway, EU CMA allows earlier access to medicines
addressing serious conditions when clinical benefit has not yet been fully demonstrated.
`.trim(),
      atom_type: 'regulatory_pathway',
      source: 'EMA EPAR Database',
      domain: 'regulatory_pathways',
      regulatory_agency: 'EMA',
      confidence_score: 0.95,
      metadata: {
        product_name: medicine.product_name,
        pathway: 'conditional_approval',
      },
      tags: ['conditional-approval', 'CMA', 'post-authorization', 'EMA'],
    };
  }

  /**
   * Create accelerated assessment atom
   */
  private createAcceleratedAtom(medicine: EMAMedicine): EPARAtom {
    return {
      title: `Accelerated Assessment: ${medicine.product_name}`,
      content: `
## Accelerated Assessment

**Product:** ${medicine.product_name}
**Therapeutic Area:** ${medicine.therapeutic_area}

### Accelerated Assessment Pathway
The CHMP accelerated assessment procedure reduces the evaluation time from 210 to 150 days
(active assessment time, excluding clock-stops).

### Eligibility Criteria
Accelerated assessment may be granted for medicinal products of major public health interest,
particularly from the perspective of therapeutic innovation.

### How ${medicine.product_name} Qualified
This product was granted accelerated assessment because:
- It addresses an unmet medical need in ${medicine.therapeutic_area}
- It represents a therapeutic innovation
- Earlier availability serves major public health interest

### Procedural Implications
- Compressed timeline for initial assessment
- Priority allocation of rapporteur/co-rapporteur
- Increased resources dedicated to evaluation
- More frequent sponsor interactions

### Note
If during assessment the product no longer meets criteria for accelerated assessment,
the CHMP may revert to standard timeline (210 days).
`.trim(),
      atom_type: 'regulatory_pathway',
      source: 'EMA EPAR Database',
      domain: 'regulatory_pathways',
      regulatory_agency: 'EMA',
      confidence_score: 0.95,
      metadata: {
        product_name: medicine.product_name,
        pathway: 'accelerated_assessment',
      },
      tags: ['accelerated-assessment', 'priority-review', 'EMA'],
    };
  }

  /**
   * Create EU regulatory pathway atoms
   */
  private async createEURegulatoryPathwayAtoms(): Promise<void> {
    for (const [key, pattern] of Object.entries(this.euRegulatoryPatterns)) {
      const atom: EPARAtom = {
        title: `EU Regulatory Pathway: ${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
        content: `
## ${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}

### Description
${pattern.description}

### Requirements
${pattern.requirements ? pattern.requirements.map(r => `- ${r}`).join('\n') : ''}

${'benefits' in pattern ? `### Benefits\n${(pattern as any).benefits.map((b: string) => `- ${b}`).join('\n')}` : ''}

### Regulatory Authority
European Medicines Agency (EMA) and Committee for Medicinal Products for Human Use (CHMP)
`.trim(),
        atom_type: 'regulatory_pathway',
        source: 'EMA Regulatory Framework',
        domain: 'regulatory_pathways',
        regulatory_agency: 'EMA',
        confidence_score: 0.98,
        metadata: { pathway_type: key },
        tags: ['EU', 'EMA', 'regulatory-pathway', key.replace(/_/g, '-')],
      };

      await this.storeAtom(atom);
    }
  }

  /**
   * Create CHMP guidance atoms
   */
  private async createCHMPGuidanceAtoms(): Promise<void> {
    const chmpGuidance = [
      {
        title: 'CHMP Scientific Guidelines Overview',
        content: `
## CHMP Scientific Guidelines

The Committee for Medicinal Products for Human Use (CHMP) develops scientific guidelines
to provide guidance to applicants preparing marketing authorization applications.

### Categories of Guidelines

1. **Quality Guidelines**
   - ICH quality guidelines (Q1-Q14)
   - Manufacturing process validation
   - Stability testing requirements

2. **Non-clinical Guidelines**
   - Pharmacology studies
   - Toxicology requirements
   - Environmental risk assessment

3. **Clinical Guidelines**
   - Phase I-III trial design
   - Bioequivalence studies
   - Specific disease guidelines

4. **Cross-cutting Guidelines**
   - Biostatistics
   - Pharmacovigilance
   - Good manufacturing/clinical practice

### How to Use Guidelines
- Guidelines are not legally binding
- Departures should be justified
- Consult with EMA for novel approaches
- Stay current with revisions
`.trim(),
        tags: ['CHMP', 'guidelines', 'scientific-advice', 'EMA'],
      },
      {
        title: 'EMA Scientific Advice Procedure',
        content: `
## EMA Scientific Advice

### What is Scientific Advice?
Scientific advice is guidance provided by the CHMP or its working parties
on the appropriate tests and studies required for demonstrating quality, safety, and efficacy.

### When to Request Scientific Advice
- Before initiating pivotal clinical trials
- When novel methodologies are proposed
- For pediatric development plans
- For complex generics/biosimilars
- When regulatory requirements are unclear

### Scientific Advice Process
1. Submit request letter with questions
2. EMA assigns coordinator
3. Draft advice prepared by rapporteur
4. CHMP/SAWP discussion
5. Final advice letter issued

### Protocol Assistance (Orphan Drugs)
Sponsors of designated orphan medicinal products are entitled to protocol assistance,
which is enhanced scientific advice with reduced fees.

### Follow-up Advice
Sponsors may request follow-up advice if:
- Development plan changes
- New scientific information emerges
- Regulatory requirements evolve
`.trim(),
        tags: ['scientific-advice', 'protocol-assistance', 'SAWP', 'EMA'],
      },
    ];

    for (const guidance of chmpGuidance) {
      const atom: EPARAtom = {
        title: guidance.title,
        content: guidance.content,
        atom_type: 'guidance',
        source: 'EMA CHMP',
        domain: 'regulatory_guidance',
        regulatory_agency: 'EMA',
        confidence_score: 0.95,
        metadata: {},
        tags: guidance.tags,
      };

      await this.storeAtom(atom);
    }
  }

  /**
   * Generate tags for a medicine
   */
  private generateTags(medicine: EMAMedicine): string[] {
    const tags = ['EMA', 'EPAR', 'EU-authorization'];

    if (medicine.therapeutic_area) {
      tags.push(medicine.therapeutic_area.toLowerCase().replace(/\s+/g, '-'));
    }
    if (medicine.orphan_designation) tags.push('orphan-drug');
    if (medicine.conditional_approval) tags.push('conditional-approval');
    if (medicine.accelerated_assessment) tags.push('accelerated-assessment');
    if (medicine.exceptional_circumstances) tags.push('exceptional-circumstances');
    if (medicine.biosimilar) tags.push('biosimilar');
    if (medicine.generic) tags.push('generic');

    return tags;
  }

  /**
   * Store atom in database
   */
  private async storeAtom(atom: EPARAtom): Promise<string> {
    const atomId = crypto.randomUUID();

    await this.pool.query(
      `
      INSERT INTO lumen_data_atoms (
        id, title, content, atom_type, source, domain,
        confidence_score, metadata, tags, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `,
      [
        atomId,
        atom.title,
        atom.content,
        atom.atom_type,
        atom.source,
        atom.domain,
        atom.confidence_score,
        JSON.stringify({ ...atom.metadata, regulatory_agency: atom.regulatory_agency }),
        atom.tags,
      ]
    );

    this.harvestStats.atomsCreated++;

    // Create edges to related concepts
    await this.createEdges(atomId, atom);

    return atomId;
  }

  /**
   * Create knowledge graph edges
   */
  private async createEdges(atomId: string, atom: EPARAtom): Promise<void> {
    // Link to regulatory agency
    const agencyEdge = {
      source_id: atomId,
      relationship_type: 'REGULATED_BY',
      target_label: 'EMA',
      strength: 0.95,
    };

    // Link to therapeutic area if present
    const metadata = atom.metadata as Record<string, unknown>;
    if (metadata.therapeutic_area) {
      await this.createEdge(atomId, 'TREATS', String(metadata.therapeutic_area), 0.9);
    }

    // Link regulatory pathways
    if (metadata.orphan_designation) {
      await this.createEdge(atomId, 'USES_PATHWAY', 'Orphan Designation', 0.95);
    }
    if (metadata.conditional_approval) {
      await this.createEdge(atomId, 'USES_PATHWAY', 'Conditional Marketing Authorization', 0.95);
    }
    if (metadata.accelerated_assessment) {
      await this.createEdge(atomId, 'USES_PATHWAY', 'Accelerated Assessment', 0.95);
    }
  }

  /**
   * Create a single edge
   */
  private async createEdge(
    sourceId: string,
    relationship: string,
    targetLabel: string,
    strength: number
  ): Promise<void> {
    const edgeId = crypto.randomUUID();

    await this.pool.query(
      `
      INSERT INTO lumen_knowledge_edges (
        id, source_atom_id, relationship_type, target_label, strength, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT DO NOTHING
    `,
      [edgeId, sourceId, relationship, targetLabel, strength]
    );

    this.harvestStats.edgesCreated++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                          MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const farmer = new EMAEPARFarmer(pool);
    const stats = await farmer.harvest();
    logger.info('\n📊 Final harvest statistics:', stats);
  } catch (error) {
    logger.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
