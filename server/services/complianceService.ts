import fs from 'fs';
import path from 'path';
import { ai } from '../lib/unified-ai-client';

// Run compliance checks on uploaded documents
export async function runComplianceChecks(submissionId: string) {
  try {
    // Get all document sections from the vault directory
    const vaultDir = path.join(process.cwd(), 'vault');
    if (!fs.existsSync(vaultDir)) {
      return { status: 'error', message: 'No documents found in vault' };
    }

    const files = fs.readdirSync(vaultDir).filter(f => f.endsWith('.json'));

    if (files.length === 0) {
      return { status: 'error', message: 'No documents found for compliance check' };
    }

    // Collect all document sections
    const allSections: any[] = [];
    files.forEach(file => {
      const content = fs.readFileSync(path.join(vaultDir, file), 'utf8');
      const { sections } = JSON.parse(content);
      allSections.push(...sections);
    });

    // Use OpenAI to analyze compliance
    const aiResult = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a regulatory compliance expert for medical device documentation. Analyze the provided document sections and identify any compliance issues or gaps in the documentation.',
        },
        {
          role: 'user',
          content: `Analyze these ${allSections.length} document sections for compliance with FDA medical device regulations. Focus on 510(k) submission requirements. ${allSections
            .map(s => `SECTION ${s.id}: ${s.content.slice(0, 300)}...`)
            .join('\n\n')}`,
        },
      ],
      temperature: 0.2,
    });

    // Parse the compliance analysis
    return {
      status: 'success',
      submissionId,
      timestamp: new Date().toISOString(),
      complianceAnalysis: aiResult.content,
      sections: allSections.length,
      riskLevel: 'medium', // Placeholder for more sophisticated risk scoring
      recommendations: [
        'Ensure all test documentation is complete',
        'Verify predicate device comparison is thorough',
        'Check for consistency across all sections',
      ],
    };
  } catch (error: any) {
    console.error('Compliance check error:', error);
    return {
      status: 'error',
      message: 'Failed to complete compliance check',
      error: error.message,
    };
  }
}
