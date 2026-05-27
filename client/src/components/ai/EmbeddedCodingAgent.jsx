import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { toast } from '@/hooks/use-toast';
import {
  FileText,
  Brain,
  FileUp,
  Upload,
  Download,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Code,
} from 'lucide-react';

const EmbeddedCodingAgent = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      type: 'assistant',
      content:
        "Welcome. I'm AnA — your regulatory intelligence partner with advanced Relation Extraction Intelligence.\n\nI can assist you with:\n\n• **CSR Intelligence Engine**: Access to 3,021 real clinical study reports from Canada, EMA, and FDA\n• **Relation Extraction**: Extract regulatory relationships, compliance obligations, and cross-document connections\n• **Knowledge Graph Construction**: Build regulatory knowledge graphs for dependency analysis\n• **Inconsistency Detection**: Identify conflicts across multiple regulatory documents\n• **FDA submission guidance** (IND, NDA, 510(k), PMA)\n• **Medical device protocols** and clinical evaluation reports\n• **Pharmaceutical regulatory documentation**\n• **Clinical trial protocols** and study designs with real data access\n• **Regulatory compliance analysis** with relationship mapping\n• **Medical writing best practices** with cross-reference validation\n\nWhat are we working on?",
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentProject, setCurrentProject] = useState(null);
  const [selectedModel, setSelectedModel] = useState('openai');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [analyzingFile, setAnalyzingFile] = useState(false);
  const [extractingRelationships, setExtractingRelationships] = useState(false);
  const [knowledgeGraph, setKnowledgeGraph] = useState(null);
  const [extractedRelationships, setExtractedRelationships] = useState(null);
  const [saveFilePaths, setSaveFilePaths] = useState({});
  const fileInputRef = useRef(null);

  const handleFileUpload = async event => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setAnalyzingFile(true);
    const newFiles = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileInfo = {
        name: file.name,
        size: file.size,
        type: file.type,
        id: Date.now() + i,
      };

      // Read file content for text-based files
      if (file.type.includes('text') || file.type.includes('pdf') || file.type.includes('doc')) {
        const formData = new FormData();
        formData.append('file', file);

        try {
          // Upload and analyze file
          const response = await fetch('/api/regulatory/analyze-document', {
            method: 'POST',
            body: formData,
          });

          const result = await response.json();
          fileInfo.analysis = result;
          newFiles.push(fileInfo);

          // Add analysis result to messages
          setMessages(prev => [
            ...prev,
            {
              type: 'assistant',
              content: `📄 Document Analysis Complete: ${file.name}\n\n${result.summary}\n\nKey findings:\n${result.keyFindings?.join('\n') || 'Processing...'}`,
              timestamp: new Date().toISOString(),
            },
          ]);
        } catch (error) {
          console.error('Error analyzing file:', error);
          setMessages(prev => [
            ...prev,
            {
              type: 'assistant',
              content: `❌ Error analyzing ${file.name}. Please try again.`,
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      }
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);
    setAnalyzingFile(false);
  };

  const sendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = {
      type: 'user',
      content: inputValue,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    const originalQuery = inputValue;
    setInputValue('');
    setIsLoading(true);

    // Detect analysis type and submission type from user input
    const isDocumentAnalysis =
      originalQuery.toLowerCase().includes('analyze') ||
      originalQuery.toLowerCase().includes('review document');
    const isSubmissionAudit =
      originalQuery.toLowerCase().includes('audit') ||
      originalQuery.toLowerCase().includes('submission packet');
    const submissionType = detectSubmissionType(originalQuery);

    try {
      // Get current project context
      const projectContext = await getProjectContext();

      // Enhanced: Use BOTH endpoints intelligently
      // Use ask-lumen for document parsing and regulatory consultation for CSR/audit
      let endpoint = '/api/ask-lumen';
      let requestBody = {
        query: originalQuery,
        context: projectContext || 'regulatory-analysis',
        module: 'ectd-coauthor',
        documentContent: uploadedFiles.length > 0 ? uploadedFiles[0].content : null,
        documentType: uploadedFiles.length > 0 ? uploadedFiles[0].type : null,
      };

      // Switch to regulatory consultation for specific features
      if (
        originalQuery.toLowerCase().includes('csr') ||
        originalQuery.toLowerCase().includes('clinical study report') ||
        originalQuery.toLowerCase().includes('3021') ||
        originalQuery.toLowerCase().includes('database')
      ) {
        endpoint = '/api/regulatory/consultation';
        requestBody = {
          query: originalQuery,
          context: projectContext || 'Regulatory affairs and medical writing consultation',
          model: selectedModel,
        };
      }

      // Enhanced request for document analysis with NLP/ML capabilities
      if (isDocumentAnalysis) {
        requestBody.documents = uploadedFiles || [];
        requestBody.submissionType = submissionType;
        console.log('Activating document analysis with NLP/ML capabilities...');
      }

      // Enhanced request for submission audit with CSR Intelligence Engine
      if (isSubmissionAudit) {
        endpoint = '/api/regulatory/audit-submission';
        requestBody = {
          submissionType: submissionType || 'IND',
          modules: [
            {
              moduleNumber: 1,
              name: 'Administrative Information',
              type: 'administrative',
              status: 'draft',
            },
            { moduleNumber: 2, name: 'Quality Overall Summary', type: 'quality', status: 'review' },
            {
              moduleNumber: 3,
              name: 'Nonclinical Study Reports',
              type: 'nonclinical',
              status: 'draft',
            },
            { moduleNumber: 4, name: 'Clinical Study Reports', type: 'CSR', status: 'pending' },
            { moduleNumber: 5, name: 'Clinical Study Reports', type: 'clinical', status: 'draft' },
          ],
          auditLevel: 'comprehensive',
          focusAreas: ['compliance', 'quality', 'completeness', 'CSR_analysis'],
        };
        console.log('Activating CSR Intelligence Engine for submission audit...');
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('API Response:', data);

      // Enhanced response handling for Lumen API with Universal Document Parser
      let responseContent = data.response || data.auditResults || data.message || '';
      let enhancedMetadata = {
        confidence: data.confidence_level || 'High - Based on current regulatory guidelines',
        model: 'gpt-4o-lumen-enhanced',
        specialization: 'regulatory_affairs_with_document_parser',
        timestamp: data.analysis_timestamp || new Date().toISOString(),
        regulatory_sources: data.regulatory_sources || [],
        document_analysis: data.document_analysis || null,
        parser_capabilities: data.parser_capabilities || {},
        expert_credentials: data.expert_credentials || {},
      };

      // Add document analysis results if available
      if (data.document_analysis) {
        const docAnalysis = data.document_analysis;
        responseContent += `\n\n📄 **Universal Document Parser Analysis:**`;
        responseContent += `\n• Document Type: ${docAnalysis.document_type || 'Unknown'}`;
        responseContent += `\n• Jurisdiction: ${docAnalysis.jurisdiction || 'Not specified'}`;
        responseContent += `\n• Regulatory Tags: ${docAnalysis.regulatory_tags?.join(', ') || 'None detected'}`;
        responseContent += `\n• Medical Terms: ${docAnalysis.medical_terms?.join(', ') || 'None detected'}`;
        responseContent += `\n• Parser Used: ${docAnalysis.parser_used || 'Universal Document Parser v2.0'}`;
      }

      // Add parser capabilities information
      if (data.parser_capabilities) {
        const capabilities = data.parser_capabilities;
        responseContent += `\n\n🚀 **Enhanced Processing Capabilities:**`;
        responseContent += `\n• Formats Supported: ${capabilities.formats_supported?.join(', ') || 'Multiple'}`;
        responseContent += `\n• Document Types: ${capabilities.document_types?.join(', ') || 'Various'}`;
        responseContent += `\n• AI Enhanced: ${capabilities.ai_enhanced ? 'Yes' : 'No'}`;
        responseContent += `\n• Processing Speed: ${capabilities.processing_speed || 'High-speed processing'}`;

        if (capabilities.extraction_features && capabilities.extraction_features.length > 0) {
          responseContent += `\n• Key Features: ${capabilities.extraction_features.slice(0, 3).join(', ')}`;
        }
      }

      // Add regulatory sources
      if (data.regulatory_sources && data.regulatory_sources.length > 0) {
        responseContent += `\n\n📚 **Regulatory Sources Consulted:**`;
        data.regulatory_sources.forEach(source => {
          responseContent += `\n• ${source}`;
        });
      }

      // Add CSR Intelligence Engine results if available
      if (data.csrIntelligenceResults) {
        enhancedMetadata.csrIntelligence = data.csrIntelligenceResults;
        responseContent += `\n\n🧠 **CSR Intelligence Engine Analysis:**\n- Compliance Score: ${(data.csrIntelligenceResults.complianceScore * 100).toFixed(1)}%\n- Risk Level: ${data.csrIntelligenceResults.riskLevel}\n- Critical Findings: ${data.csrIntelligenceResults.criticalFindings?.join(', ') || 'None identified'}`;
      }

      // Add CSR database results if available
      if (data.csrDatabaseResults !== undefined && data.csrDatabaseResults > 0) {
        responseContent += `\n\n📊 **CSR Database Results:** ${data.csrDatabaseResults} real CSR reports found`;

        // Add download links for CSR reports if specific CSR IDs are provided
        if (data.csrReports && data.csrReports.length > 0) {
          responseContent += `\n\n📥 **Download CSR Reports (PDF):**`;
          data.csrReports.forEach(report => {
            const downloadUrl = `${window.location.origin}/api/regulatory/csr-pdf/${report.id}`;
            responseContent += `\n• [📄 ${report.title}](${downloadUrl})`;
            responseContent += `\n  *${report.drug_name} | ${report.phase} | ${report.indication}*`;
          });
          responseContent += `\n\n*Click any link above to download the full CSR PDF report.*`;
        }
      }

      // Add Relation Extraction results if available
      if (data.relationExtractionResults) {
        const relData = data.relationExtractionResults;
        if (relData.totalRelationships > 0) {
          responseContent += `\n\n🔗 **Advanced Regulatory Knowledge Extraction Analysis:**`;

          if (relData.csrAnalyzed) {
            responseContent += `\n📊 Deep analysis of ${relData.csrAnalyzed} Clinical Study Reports revealed ${relData.totalRelationships} regulatory relationships across 8 key categories`;
          }

          if (relData.relationships && relData.relationships.length > 0) {
            // Group relationships by category
            const categories = {};
            relData.relationships.forEach(rel => {
              const cat = rel.category || 'other';
              if (!categories[cat]) categories[cat] = [];
              categories[cat].push(rel);
            });

            // 1. Drug-Indication & Efficacy Analysis
            if (categories.drug_indication || categories.efficacy) {
              responseContent += `\n\n💊 **Drug-Indication & Efficacy Mapping:**`;
              const drugRels = [
                ...(categories.drug_indication || []),
                ...(categories.efficacy || []),
              ];
              drugRels.slice(0, 4).forEach(rel => {
                responseContent += `\n• ${rel.subject} → ${rel.predicate.replace(/_/g, ' ').toLowerCase()} → ${rel.object}`;
                if (rel.source) responseContent += ` [${rel.source}]`;
              });
            }

            // 2. Safety & Risk Profile Analysis
            if (categories.safety || categories.safety_statistics || categories.tolerability) {
              responseContent += `\n\n⚠️ **Comprehensive Safety & Risk Profile:**`;
              const safetyRels = [
                ...(categories.safety || []),
                ...(categories.safety_statistics || []),
                ...(categories.tolerability || []),
              ];

              // Group by drug for better visualization
              const drugSafety = {};
              safetyRels.forEach(rel => {
                if (!drugSafety[rel.subject]) drugSafety[rel.subject] = [];
                drugSafety[rel.subject].push(rel);
              });

              Object.entries(drugSafety)
                .slice(0, 3)
                .forEach(([drug, rels]) => {
                  responseContent += `\n\n${drug}:`;
                  rels.slice(0, 4).forEach(rel => {
                    if (rel.predicate.includes('RATE')) {
                      responseContent += `\n  • ${rel.predicate.replace(/_/g, ' ').toLowerCase()}: ${rel.object}`;
                    } else {
                      responseContent += `\n  • ${rel.object}`;
                    }
                  });
                });
            }

            // 3. Trial Design & Methodology Intelligence
            if (categories.methodology || categories.enrollment || categories.demographics) {
              responseContent += `\n\n🔬 **Study Design & Population Analysis:**`;
              const methodRels = [
                ...(categories.methodology || []),
                ...(categories.enrollment || []),
                ...(categories.demographics || []),
              ];
              methodRels.slice(0, 5).forEach(rel => {
                responseContent += `\n• ${rel.subject}: ${rel.predicate.replace(/_/g, ' ').toLowerCase()} → ${rel.object}`;
              });
            }

            // 4. Trial Performance & Quality Metrics
            if (categories.trial_performance || categories.trial_quality) {
              responseContent += `\n\n📈 **Trial Performance & Quality Indicators:**`;
              const perfRels = [
                ...(categories.trial_performance || []),
                ...(categories.trial_quality || []),
              ];
              perfRels.slice(0, 4).forEach(rel => {
                responseContent += `\n• ${rel.subject}: ${rel.object}`;
                if (rel.predicate === 'COMPLETION_CATEGORY') {
                  responseContent += ` (${rel.predicate.replace(/_/g, ' ').toLowerCase()})`;
                }
              });
            }

            // 5. Regulatory Submission & Compliance
            if (
              categories.regulatory_submission ||
              categories.regulatory_outcome ||
              categories.regulatory_compliance
            ) {
              responseContent += `\n\n📋 **Regulatory Pathway & Compliance Status:**`;
              const regRels = [
                ...(categories.regulatory_submission || []),
                ...(categories.regulatory_outcome || []),
                ...(categories.regulatory_compliance || []),
              ];
              regRels.slice(0, 5).forEach(rel => {
                responseContent += `\n• ${rel.subject} → ${rel.predicate.replace(/_/g, ' ').toLowerCase()} → ${rel.object}`;
              });
            }

            // 6. Temporal & Timeline Analysis
            if (categories.temporal) {
              responseContent += `\n\n📅 **Timeline & Duration Intelligence:**`;
              categories.temporal.slice(0, 4).forEach(rel => {
                responseContent += `\n• ${rel.subject}: ${rel.predicate.replace(/_/g, ' ').toLowerCase()} → ${rel.object}`;
              });
            }

            // 7. Cross-Trial Comparative Analysis
            const sponsors = new Set();
            const drugs = new Set();
            const phases = new Set();
            relData.relationships.forEach(rel => {
              if (rel.predicate === 'CONDUCTED_PHASE' && rel.subject) sponsors.add(rel.subject);
              if (rel.category === 'drug_indication' && rel.subject) drugs.add(rel.subject);
              if (rel.predicate === 'CONDUCTED_PHASE' && rel.object) phases.add(rel.object);
            });

            if (sponsors.size > 1 || drugs.size > 1) {
              responseContent += `\n\n🔄 **Cross-Trial Comparative Intelligence:**`;
              if (sponsors.size > 1)
                responseContent += `\n• Comparing ${sponsors.size} different sponsors: ${Array.from(sponsors).slice(0, 3).join(', ')}`;
              if (drugs.size > 1)
                responseContent += `\n• Analyzing ${drugs.size} different drugs: ${Array.from(drugs).slice(0, 3).join(', ')}`;
              if (phases.size > 1)
                responseContent += `\n• Across ${phases.size} trial phases: ${Array.from(phases).join(', ')}`;
            }

            // 8. Knowledge Graph Statistics
            responseContent += `\n\n📊 **Knowledge Graph Construction Summary:**`;
            responseContent += `\n• Total Relationships: ${relData.totalRelationships}`;
            responseContent += `\n• Unique Entities: ${relData.entities?.length || 'Multiple'}`;
            responseContent += `\n• Relationship Categories: ${Object.keys(categories).length}`;
            responseContent += `\n• CSR Reports Analyzed: ${relData.csrAnalyzed}`;

            // Add predictive insights
            responseContent += `\n\n🎯 **Regulatory Intelligence Insights:**`;

            // Safety signal detection
            const highRiskDrugs = relData.relationships.filter(
              r => r.predicate === 'SERIOUS_ADVERSE_EVENT_RATE' && parseFloat(r.object) > 5
            );
            if (highRiskDrugs.length > 0) {
              responseContent += `\n• ⚠️ Safety Signal: ${highRiskDrugs.length} drug(s) with >5% SAE rate detected`;
            }

            // Trial quality assessment
            const excellentTrials = relData.relationships.filter(
              r => r.object === 'excellent retention'
            );
            if (excellentTrials.length > 0) {
              responseContent += `\n• ✅ Trial Quality: ${excellentTrials.length} studies achieved excellent retention (>90%)`;
            }

            // Regulatory trends
            const recentSubmissions = relData.relationships.filter(
              r => r.predicate === 'SUBMITTED_IN_YEAR' && parseInt(r.object) >= 2023
            );
            if (recentSubmissions.length > 0) {
              responseContent += `\n• 📈 Recent Activity: ${recentSubmissions.length} submissions since 2023`;
            }
          }

          // 9. Comparative Analysis Insights
          if (relData.comparativeAnalysis && relData.comparativeAnalysis.insights) {
            responseContent += `\n\n🎯 **Cross-CSR Comparative Intelligence:**`;

            if (relData.comparativeAnalysis.drugCount > 0) {
              responseContent += `\n• Analyzed ${relData.comparativeAnalysis.drugCount} unique drugs across ${relData.csrAnalyzed} CSR reports`;
            }

            if (relData.comparativeAnalysis.sponsorCount > 0) {
              responseContent += `\n• Tracked ${relData.comparativeAnalysis.sponsorCount} different sponsors`;
            }

            if (
              relData.comparativeAnalysis.topDrugs &&
              relData.comparativeAnalysis.topDrugs.length > 0
            ) {
              responseContent += `\n\n💊 **Top Analyzed Drugs:**`;
              relData.comparativeAnalysis.topDrugs.forEach(drug => {
                responseContent += `\n• ${drug.name}: ${drug.indications.length} indication(s), ${drug.trialCount} trial(s), ${drug.safetyEvents} safety events`;
              });
            }

            if (relData.comparativeAnalysis.insights.length > 0) {
              responseContent += `\n\n🔍 **Key Comparative Findings:**`;
              relData.comparativeAnalysis.insights.forEach(insight => {
                if (insight.type === 'multi_indication') {
                  responseContent += `\n• 🎯 ${insight.subject} has ${insight.value} (${insight.details.join(', ')})`;
                } else if (insight.type === 'active_sponsor') {
                  responseContent += `\n• 🏢 ${insight.subject}: ${insight.value} in ${insight.regions.join(', ')}`;
                } else if (insight.type === 'safety_signal') {
                  responseContent += `\n• ⚠️ Safety Alert - ${insight.subject}: ${insight.value}`;
                }
              });
            }

            if (
              relData.comparativeAnalysis.phaseDistribution &&
              Object.keys(relData.comparativeAnalysis.phaseDistribution).length > 0
            ) {
              responseContent += `\n\n📊 **Phase Distribution:**`;
              Object.entries(relData.comparativeAnalysis.phaseDistribution).forEach(
                ([phase, count]) => {
                  responseContent += `\n• ${phase}: ${count} trial(s)`;
                }
              );
            }
          }

          responseContent += `\n\n💡 **Regulatory Value:** This advanced relationship extraction creates a comprehensive regulatory knowledge graph with comparative analysis across multiple CSRs, enabling pattern recognition, risk assessment, compliance tracking, and cross-study insights that traditional search cannot provide.`;
        }
      }

      // Add audit summary if available
      if (data.auditSummary) {
        enhancedMetadata.auditSummary = data.auditSummary;
        responseContent += `\n\n📊 **Submission Audit Summary:**\n- Overall Score: ${(data.auditSummary.overallScore * 100).toFixed(1)}%\n- Submission Readiness: ${data.auditSummary.submissionReadiness}\n- Regulatory Risk: ${data.auditSummary.regulatoryRisk}\n- Time to Resolution: ${data.auditSummary.estimatedTimeToResolution}`;
      }

      // Add vector search results if available
      if (data.vectorSearchResults && data.vectorSearchResults.length > 0) {
        enhancedMetadata.vectorSearch = data.vectorSearchResults;
        responseContent += `\n\n🔍 **Semantic Search Results:** Found ${data.vectorSearchResults.length} relevant regulatory documents`;
      }

      // Add analysis metrics if available
      if (data.analysisMetrics) {
        enhancedMetadata.analysisMetrics = data.analysisMetrics;
        const engines = data.analysisMetrics.intelligenceEngines || {};
        const activeEngines = Object.entries(engines)
          .filter(([_, status]) => status === 'active')
          .map(([name, _]) => name);
        if (activeEngines.length > 0) {
          responseContent += `\n\n⚙️ **Active Intelligence Engines:** ${activeEngines.join(', ')}`;
        }
      }

      const assistantMessage = {
        type: 'assistant',
        content: responseContent,
        ...enhancedMetadata,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [
        ...prev,
        {
          type: 'assistant',
          content: '❌ Sorry, I encountered an error. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to detect submission type from query
  const detectSubmissionType = queryText => {
    const text = queryText.toLowerCase();
    if (text.includes('ind')) return 'IND';
    if (text.includes('nda')) return 'NDA';
    if (text.includes('bla')) return 'BLA';
    if (text.includes('csr')) return 'CSR';
    if (text.includes('510k') || text.includes('510(k)')) return '510K';
    if (text.includes('clinical')) return 'clinical';
    return 'general';
  };

  const getProjectContext = async () => {
    try {
      // Get regulatory context
      return {
        type: 'regulatory-consultation',
        domain: 'Medical devices and pharmaceuticals',
        expertise: [
          'FDA submissions',
          'Clinical trials',
          'Medical writing',
          'Regulatory compliance',
        ],
        regulations: ['FDA 21 CFR', 'EU MDR', 'ISO 13485', 'ICH GCP'],
        documentTypes: ['IND', 'NDA', '510(k)', 'PMA', 'CER', 'CSR'],
      };
    } catch (error) {
      console.warn('Could not get regulatory context:', error);
      return null;
    }
  };

  const executeAction = async (action, data) => {
    try {
      switch (action.type) {
        case 'create_file':
          await createFile(data.filePath, data.content);
          break;
        case 'update_file':
          await updateFile(data.filePath, data.content);
          break;
        case 'execute_command':
          await executeCommand(data.command, data.workingDirectory);
          break;
        default:
          console.warn('Unknown action type:', action.type);
      }
    } catch (error) {
      console.error('Error executing action:', error);
      setMessages(prev => [
        ...prev,
        {
          type: 'assistant',
          content: `❌ Error executing ${action.type}: ${error.message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const createFile = async (filePath, content) => {
    try {
      const response = await fetch('/api/agent/files/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, content }),
      });

      const result = await response.json();

      if (result.success) {
        setMessages(prev => [
          ...prev,
          {
            type: 'assistant',
            content: `✅ File created successfully: ${filePath}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to create file: ${error.message}`);
    }
  };

  const updateFile = async (filePath, content) => {
    try {
      const response = await fetch('/api/agent/files/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, content }),
      });

      const result = await response.json();

      if (result.success) {
        setMessages(prev => [
          ...prev,
          {
            type: 'assistant',
            content: `✅ File updated successfully: ${filePath}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to update file: ${error.message}`);
    }
  };

  const executeCommand = async (command, workingDirectory) => {
    try {
      setMessages(prev => [
        ...prev,
        {
          type: 'assistant',
          content: `🔄 Executing: \`${command}\``,
          timestamp: new Date().toISOString(),
        },
      ]);

      const response = await fetch('/api/agent/commands/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, workingDirectory }),
      });

      const result = await response.json();

      if (result.success) {
        setMessages(prev => [
          ...prev,
          {
            type: 'assistant',
            content: `✅ Command completed successfully:\n\`\`\`\n${result.stdout}\n\`\`\``,
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            type: 'assistant',
            content: `❌ Command failed (exit code ${result.exitCode}):\n\`\`\`\n${result.stderr || result.stdout}\n\`\`\``,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (error) {
      throw new Error(`Failed to execute command: ${error.message}`);
    }
  };

  // Helper function to render content with clickable links
  const renderContentWithLinks = content => {
    if (!content) return content;

    // Split content by lines to preserve formatting
    const lines = content.split('\n');

    return lines.map((line, lineIndex) => {
      // Check if line contains markdown links
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = linkRegex.exec(line)) !== null) {
        // Add text before the link
        if (match.index > lastIndex) {
          parts.push(line.substring(lastIndex, match.index));
        }

        // Add the link
        const linkText = match[1];
        const linkUrl = match[2];
        parts.push(
          <a
            key={`${lineIndex}-${match.index}`}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline font-medium inline-block cursor-pointer"
            onClick={async e => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Downloading PDF:', linkUrl);

              try {
                // Fetch the PDF as a blob
                const response = await fetch(linkUrl);
                if (!response.ok) throw new Error('Failed to fetch PDF');

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);

                // Create a temporary anchor element to force download
                const link = document.createElement('a');
                link.href = url;
                link.download = linkText.replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
                document.body.appendChild(link);
                link.click();

                // Cleanup
                setTimeout(() => {
                  document.body.removeChild(link);
                  window.URL.revokeObjectURL(url);
                }, 100);
              } catch (error) {
                console.error('PDF download failed:', error);
                toast({ title: 'Failed to download PDF. Please try again.' });
              }
            }}
          >
            {linkText}
          </a>
        );

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text
      if (lastIndex < line.length) {
        parts.push(line.substring(lastIndex));
      }

      // If no links found, return the line as is
      if (parts.length === 0) {
        return (
          <span key={lineIndex}>
            {line}
            {lineIndex < lines.length - 1 && '\n'}
          </span>
        );
      }

      // Return the line with links
      return (
        <span key={lineIndex}>
          {parts}
          {lineIndex < lines.length - 1 && '\n'}
        </span>
      );
    });
  };

  const renderMessage = (message, index) => {
    const isUser = message.type === 'user';

    return (
      <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
        <div
          className={`max-w-[90%] rounded-lg p-3 ${
            isUser ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-800 border border-gray-200'
          }`}
        >
          <div className="text-sm">
            {isUser ? (
              <div className="whitespace-pre-wrap">{message.content}</div>
            ) : (
              <div className="space-y-2">
                {typeof renderContentWithLinks(message.content) === 'string' ? (
                  <div className="whitespace-pre-wrap">
                    {renderContentWithLinks(message.content)}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">
                    {renderContentWithLinks(message.content)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Show command execution results */}
          {!isUser && message.command && (
            <div className="mt-3 bg-gray-900 text-green-400 p-3 rounded-lg">
              <div className="text-xs text-gray-400 mb-2">Command: {message.command}</div>
              {message.commandOutput && (
                <div className="mb-2">
                  <div className="text-xs text-gray-400">Output:</div>
                  <pre className="text-green-400 text-xs overflow-x-auto">
                    {message.commandOutput}
                  </pre>
                </div>
              )}
              {message.commandError && (
                <div>
                  <div className="text-xs text-red-400">Error:</div>
                  <pre className="text-red-400 text-xs overflow-x-auto">{message.commandError}</pre>
                </div>
              )}
            </div>
          )}

          {/* Show file creation/edit results */}
          {!isUser && message.file && (
            <div className="mt-3 bg-blue-50 border border-blue-200 p-3 rounded-lg">
              <div className="text-xs text-blue-600 font-medium">
                {message.action} {message.file}
              </div>
            </div>
          )}

          {/* Show model used */}
          {!isUser && message.modelUsed && (
            <div className="mt-2 text-xs text-gray-500">Powered by {message.modelUsed}</div>
          )}

          {/* Render code blocks */}
          {!isUser && message.files && message.files.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.files.map((file, fileIndex) => (
                <div
                  key={fileIndex}
                  className="bg-gray-900 text-green-400 p-3 rounded text-xs font-mono overflow-x-auto"
                >
                  <pre>{file.content}</pre>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                      onClick={() => copyToClipboard(file.content)}
                    >
                      📋 Copy Code
                    </button>
                    {saveFilePaths[fileIndex] !== undefined ? (
                      <span className="flex gap-1 items-center">
                        <input
                          className="px-1 py-0.5 text-xs border border-blue-300 rounded"
                          placeholder="file path…"
                          value={saveFilePaths[fileIndex]}
                          onChange={e => setSaveFilePaths(p => ({ ...p, [fileIndex]: e.target.value }))}
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Escape') setSaveFilePaths(p => { const n = { ...p }; delete n[fileIndex]; return n; });
                            if (e.key === 'Enter') {
                              const fp = saveFilePaths[fileIndex].trim();
                              if (fp) executeAction({ type: 'create_file' }, { filePath: fp, content: file.content });
                              setSaveFilePaths(p => { const n = { ...p }; delete n[fileIndex]; return n; });
                            }
                          }}
                        />
                        <button
                          className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                          onClick={() => {
                            const fp = saveFilePaths[fileIndex].trim();
                            if (fp) executeAction({ type: 'create_file' }, { filePath: fp, content: file.content });
                            setSaveFilePaths(p => { const n = { ...p }; delete n[fileIndex]; return n; });
                          }}
                        >Save</button>
                      </span>
                    ) : (
                      <button
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        onClick={() => setSaveFilePaths(p => ({ ...p, [fileIndex]: '' }))}
                      >
                        💾 Save as File
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Command execution buttons */}
          {!isUser && message.commands && message.commands.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-xs font-semibold text-gray-600 mb-1">Suggested Commands:</div>
              {message.commands.map((command, cmdIndex) => (
                <div
                  key={cmdIndex}
                  className="flex items-center gap-2 bg-gray-800 text-gray-100 p-2 rounded text-xs"
                >
                  <code className="flex-1">{command}</code>
                  <button
                    className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                    onClick={() => executeCommand(command)}
                  >
                    ▶️ Run
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action suggestions */}
          {!isUser && message.suggestions && message.suggestions.length > 0 && (
            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded">
              <div className="text-xs font-semibold text-blue-700 mb-1">💡 Available Actions:</div>
              {message.suggestions.map((suggestion, sugIndex) => (
                <div key={sugIndex} className="text-xs text-blue-600">
                  • {suggestion}
                </div>
              ))}
            </div>
          )}

          {/* Timestamp */}
          {message.timestamp && (
            <div className="mt-2 text-xs text-gray-400">
              {new Date(message.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    );
  };

  const copyToClipboard = async text => {
    try {
      await navigator.clipboard.writeText(text);
      setMessages(prev => [
        ...prev,
        {
          type: 'assistant',
          content: '📋 Code copied to clipboard!',
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (!isOpen) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all"
          title="Open AI Assistant"
        >
          <Code size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-4 z-50 bg-white border border-gray-200 rounded-lg shadow-2xl flex">
      {/* Left Panel - Conversation */}
      <div className="flex-1 flex flex-col border-r border-gray-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 rounded-tl-lg">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-lg flex items-center">
                <Brain className="mr-2 h-5 w-5" />
                Lumen Regulatory Affairs AI Expert
              </h3>
              <p className="text-sm opacity-90">
                Enhanced with NLP/ML • CSR Intelligence Engine • Vector Search • Document Auditing
              </p>
              <div className="flex items-center space-x-2 mt-2">
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-500 bg-opacity-20 text-white border border-blue-300">
                  🧠 NLP/ML Analysis
                </span>
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-500 bg-opacity-20 text-white border border-purple-300">
                  ⚙️ CSR Intelligence
                </span>
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-500 bg-opacity-20 text-white border border-green-300">
                  🔍 Vector Search
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                console.log('Close button clicked');
                setIsOpen(false);
              }}
              className="text-white hover:text-white bg-red-500 hover:bg-red-600 p-2 rounded-lg transition-all duration-200 flex items-center justify-center w-10 h-10 text-2xl font-bold shadow-lg"
              title="Close Assistant"
              aria-label="Close AnA Assistant"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Model Selector */}
        <div className="bg-gray-50 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Model:</span>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1"
            >
              <option value="openai">OpenAI Pro (GPT-4o)</option>
              <option value="gemini">Gemini Pro</option>
            </select>
          </div>
        </div>

        {/* Chat History */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          style={{ height: 'calc(100% - 180px)' }}
        >
          {messages.map(renderMessage)}

          {isLoading && (
            <div className="text-left mb-2">
              <div className="inline-block p-3 rounded bg-gray-200 text-sm">
                <div className="flex items-center space-x-2">
                  <RefreshCw className="animate-spin" size={14} />
                  <span>Analyzing your request...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t bg-white p-3 rounded-bl-lg">
          <div className="flex gap-2 mb-2">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <label
              htmlFor="file-upload"
              className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded flex items-center space-x-1 cursor-pointer"
            >
              <Upload size={12} />
              <span>Add File</span>
            </label>
          </div>

          <div className="flex gap-2">
            <textarea
              className="flex-1 border border-gray-300 rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="2"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyPress={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask about FDA submissions, clinical protocols, regulatory compliance, or upload documents for analysis..."
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !inputValue.trim()}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              {isLoading ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel - Results and Suggestions */}
      <div className="w-96 flex flex-col bg-gray-50">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-tr-lg">
          <h3 className="font-bold text-lg flex items-center">
            <Sparkles className="mr-2 h-5 w-5" />
            Analysis & Suggestions
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {uploadedFiles.length > 0 && (
            <div className="mb-4">
              <h4 className="font-semibold text-sm mb-2">Uploaded Documents</h4>
              <div className="space-y-2">
                {uploadedFiles.map(file => (
                  <div key={file.id} className="bg-white p-3 rounded border border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{file.name}</span>
                      <FileText className="h-4 w-4 text-gray-400" />
                    </div>
                    {file.analysis && (
                      <div className="mt-2 text-xs text-gray-600">{file.analysis.summary}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white p-4 rounded border border-gray-200">
            <h4 className="font-semibold text-sm mb-2 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1 text-blue-500" />
              Quick Actions
            </h4>
            <div className="space-y-2 text-sm">
              <button className="w-full text-left hover:bg-gray-50 p-2 rounded">
                📋 Generate FDA Cover Letter
              </button>
              <button className="w-full text-left hover:bg-gray-50 p-2 rounded">
                📊 Analyze Clinical Protocol
              </button>
              <button className="w-full text-left hover:bg-gray-50 p-2 rounded">
                ✅ Check Regulatory Compliance
              </button>
              <button className="w-full text-left hover:bg-gray-50 p-2 rounded">
                📝 Draft Medical Writing Section
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmbeddedCodingAgent;
