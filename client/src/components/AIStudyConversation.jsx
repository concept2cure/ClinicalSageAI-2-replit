import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Send, Plus, FileText, BarChart, Code, ThumbsUp, ThumbsDown } from 'lucide-react'
import { apiRequest } from '@/lib/queryClient';

const MessageTypes = {
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant',
  ERROR: 'error',
  LOADING: 'loading',
};

const AIStudyConversation = ({ study, studies, searchQuery }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const scrollAreaRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const initialPrompt = getInitialPrompt();
    const systemMessage = {
      type: MessageTypes.SYSTEM,
      content:
        'I can help you analyze clinical trial data and answer questions about study design, endpoints, outcomes, and methodology.',
      timestamp: new Date(),
    };
    setMessages([systemMessage]);
    setSuggestedQuestions(getDefaultSuggestedQuestions());

    // If there's a specific study or results from a search, generate an initial analysis
    if (study || (studies && studies.length > 0) || searchQuery) {
      setIsLoading(true);
      generateInitialAnalysis()
        .then(response => {
          setMessages(prevMessages => [
            ...prevMessages,
            {
              type: MessageTypes.ASSISTANT,
              content: response.analysis,
              timestamp: new Date(),
            },
          ]);

          if (response.suggestedQuestions) {
            setSuggestedQuestions(response.suggestedQuestions);
          }
        })
        .catch(error => {
          setMessages(prevMessages => [
            ...prevMessages,
            {
              type: MessageTypes.ERROR,
              content:
                'Sorry, I encountered an error generating the initial analysis. Please try asking a specific question.',
              timestamp: new Date(),
            },
          ]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [study, studies, searchQuery]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        '[data-radix-scroll-area-viewport]'
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const getInitialPrompt = () => {
    if (study) {
      return `Analyze the following clinical study: "${study.title}" (Phase ${study.phase}) for ${study.indication}`;
    } else if (studies && studies.length > 0) {
      return `Analyze these ${studies.length} clinical studies related to ${studies[0].indication || 'the search query'}`;
    } else if (searchQuery) {
      return `Analyze clinical studies related to: "${searchQuery}"`;
    } else {
      return 'How can I help you analyze clinical trial data?';
    }
  };

  const getDefaultSuggestedQuestions = () => {
    if (study) {
      return [
        `What are the key endpoints in this ${study.phase} trial for ${study.indication}?`,
        `What's the average sample size for similar trials?`,
        `How does this trial design compare to industry standards?`,
        `What are typical challenges in ${study.indication} trials?`,
      ];
    } else if (studies && studies.length > 0) {
      return [
        `What are common primary endpoints across these studies?`,
        `What's the average sample size for these trials?`,
        `How do enrollment criteria compare across these studies?`,
        `What are the key differences in methodology?`,
      ];
    } else {
      return [
        'What types of endpoints are most common in oncology trials?',
        'How do sample size calculations differ between superiority and non-inferiority trials?',
        'What statistical methods are typically used for rare disease trials?',
        'How can I optimize patient recruitment for my clinical trial?',
      ];
    }
  };

  const generateInitialAnalysis = async () => {
    // We would normally call the API here, but for now we'll simulate a response
    try {
      if (study) {
        const response = await apiRequest('POST', '/api/study-analysis', {
          studyId: study.id,
        });
        return await response.json();
      } else if (studies && studies.length > 0) {
        const response = await apiRequest('POST', '/api/multi-study-analysis', {
          studyIds: studies.map(s => s.id),
          searchQuery,
        });
        return await response.json();
      } else if (searchQuery) {
        const response = await apiRequest('POST', '/api/query-analysis', {
          query: searchQuery,
        });
        return await response.json();
      }

      // Fallback for demo purposes
      return {
        analysis: getInitialAnalysis(),
        suggestedQuestions: getDefaultSuggestedQuestions(),
      };
    } catch (error) {
      console.error('Error generating initial analysis:', error);
      throw error;
    }
  };

  const getInitialAnalysis = () => {
    if (study) {
      return `
I've analyzed this Phase ${study.phase} study for ${study.indication}.

**Key Details:**
- **Title:** ${study.title}
- **Sponsor:** ${study.sponsor || 'Not specified'}
- **Sample Size:** ${study.sampleSize || 'Not specified'} participants
- **Phase:** ${study.phase || 'Not specified'}

**Primary Endpoints:**
${study.primaryEndpoints ? formatEndpoints(study.primaryEndpoints) : '- Not specified in the data provided'}

**Secondary Endpoints:**
${study.secondaryEndpoints ? formatEndpoints(study.secondaryEndpoints) : '- Not specified in the data provided'}

This appears to be a ${study.phase} study investigating treatments for ${study.indication}. The design aligns with standard approaches for this indication and phase.

I can provide more specific analysis if you have particular aspects of the study you'd like to explore. For example, I can compare this study's endpoints with typical endpoints for similar trials, analyze the sample size methodology, or examine the statistical approach.
`;
    } else if (studies && studies.length > 0) {
      return `
I've analyzed the ${studies.length} studies related to your search.

**Study Overview:**
- **Indication Focus:** ${studies[0].indication || 'Various indications'}
- **Phase Distribution:** ${getPhaseDistribution(studies)}
- **Average Sample Size:** ${getAverageSampleSize(studies)} participants
- **Date Range:** ${getDateRange(studies)}
- **Sponsors:** ${getTopSponsors(studies)}

**Common Primary Endpoints:**
${getCommonEndpoints(studies, 'primaryEndpoints')}

**Common Secondary Endpoints:**
${getCommonEndpoints(studies, 'secondaryEndpoints')}

These studies represent a range of clinical research in ${studies[0].indication || 'this therapeutic area'}. I can analyze specific aspects in greater detail if you have particular interests or questions.
`;
    } else if (searchQuery) {
      return `
I don't have specific study data to analyze for "${searchQuery}", but I can provide general insights based on this query.

Clinical studies focused on ${searchQuery} typically follow established protocols within their respective therapeutic areas. Different phases (I-IV) would have varying endpoints, sample sizes, and study designs.

To provide more specific analysis, I would need information about particular studies or aspects of clinical trials you're interested in. You can ask me questions about study design, statistical approaches, endpoint selection, or regulatory considerations related to ${searchQuery}.
`;
    } else {
      return `
Welcome to the Study Analysis Assistant. I can help answer questions about clinical trial design, statistics, endpoints, regulatory considerations, and more.

Please let me know what specific aspects of clinical trial research you'd like to explore, and I'll provide evidence-based insights to assist you.
`;
    }
  };

  const formatEndpoints = endpoints => {
    if (!endpoints) return '- None specified';
    if (typeof endpoints === 'string') return `- ${endpoints}`;

    return endpoints.map(endpoint => `- ${endpoint}`).join('\n');
  };

  const getPhaseDistribution = studies => {
    const phases = {};
    studies.forEach(study => {
      if (study.phase) {
        phases[study.phase] = (phases[study.phase] || 0) + 1;
      }
    });

    return Object.entries(phases)
      .map(
        ([phase, count]) =>
          `${phase}: ${count} studies (${Math.round((count / studies.length) * 100)}%)`
      )
      .join(', ');
  };

  const getAverageSampleSize = studies => {
    const validSizes = studies
      .filter(study => study.sampleSize)
      .map(study => Number(study.sampleSize));

    if (validSizes.length === 0) return 'Unknown';

    const average = validSizes.reduce((sum, size) => sum + size, 0) / validSizes.length;
    return Math.round(average);
  };

  const getDateRange = studies => {
    const validDates = studies.filter(study => study.date).map(study => new Date(study.date));

    if (validDates.length === 0) return 'Unknown timeframe';

    const earliest = new Date(Math.min(...validDates.map(d => d.getTime())));
    const latest = new Date(Math.max(...validDates.map(d => d.getTime())));

    return `${earliest.getFullYear()} - ${latest.getFullYear()}`;
  };

  const getTopSponsors = studies => {
    const sponsors = {};
    studies.forEach(study => {
      if (study.sponsor) {
        sponsors[study.sponsor] = (sponsors[study.sponsor] || 0) + 1;
      }
    });

    return Object.entries(sponsors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sponsor]) => sponsor)
      .join(', ');
  };

  const getCommonEndpoints = (studies, endpointType) => {
    const endpointCounts = {};
    let totalEndpoints = 0;

    studies.forEach(study => {
      if (study[endpointType] && Array.isArray(study[endpointType])) {
        study[endpointType].forEach(endpoint => {
          endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + 1;
          totalEndpoints++;
        });
      } else if (study[endpointType] && typeof study[endpointType] === 'string') {
        endpointCounts[study[endpointType]] = (endpointCounts[study[endpointType]] || 0) + 1;
        totalEndpoints++;
      }
    });

    const sortedEndpoints = Object.entries(endpointCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (sortedEndpoints.length === 0) return '- No common endpoints identified';

    return sortedEndpoints
      .map(
        ([endpoint, count]) =>
          `- ${endpoint} (${Math.round((count / studies.length) * 100)}% of studies)`
      )
      .join('\n');
  };

  const handleSubmit = async e => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const userMessage = {
      type: MessageTypes.USER,
      content: input.trim(),
      timestamp: new Date(),
    };

    const loadingMessage = {
      type: MessageTypes.LOADING,
      content: 'Thinking...',
      timestamp: new Date(),
    };

    setMessages(prevMessages => [...prevMessages, userMessage, loadingMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // In a real implementation, this would call your backend API
      const response = await sendMessageToBackend(userMessage.content);

      // Remove the loading message and add the real response
      setMessages(prevMessages =>
        prevMessages
          .filter(msg => msg !== loadingMessage)
          .concat({
            type: MessageTypes.ASSISTANT,
            content: response.message,
            timestamp: new Date(),
          })
      );

      if (response.suggestedQuestions) {
        setSuggestedQuestions(response.suggestedQuestions);
      }
    } catch (error) {
      console.error('Error communicating with assistant:', error);

      // Remove the loading message and add an error message
      setMessages(prevMessages =>
        prevMessages
          .filter(msg => msg !== loadingMessage)
          .concat({
            type: MessageTypes.ERROR,
            content: 'Sorry, I encountered an error processing your request. Please try again.',
            timestamp: new Date(),
          })
      );
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessageToBackend = async message => {
    try {
      const payload = {
        message,
        studyId: study?.id,
        studyIds: studies?.map(s => s.id),
        searchQuery,
      };

      const response = await apiRequest('POST', '/api/study-chat', payload);
      return await response.json();
    } catch (error) {
      console.error('Error sending message to backend:', error);

      // Demo mode fallback
      return {
        message: simulateResponse(message),
        suggestedQuestions: getRandomSuggestedQuestions(),
      };
    }
  };

  const simulateResponse = message => {
    // This is just a placeholder for demonstration purposes
    // In a real implementation, this would be handled by your backend
    const lowercaseMessage = message.toLowerCase();

    if (lowercaseMessage.includes('endpoint') || lowercaseMessage.includes('outcome')) {
      return `
Endpoints are critical measures used to evaluate the efficacy and safety of interventions in clinical trials.

**Primary endpoints** typically focus on the main objective of the study and determine the sample size. Common examples include:
- Survival metrics (overall survival, progression-free survival)
- Response rates
- Change in disease-specific measures
- Quality of life scores

**Secondary endpoints** provide supporting evidence and explore additional effects. These might include:
- Additional efficacy measures
- Safety and tolerability metrics
- Patient-reported outcomes
- Pharmacokinetic/pharmacodynamic parameters

When selecting endpoints, researchers should consider:
1. Regulatory acceptance
2. Clinical relevance
3. Statistical power
4. Feasibility of measurement
5. Alignment with previous research

Composite endpoints can increase statistical efficiency but may complicate interpretation. Surrogate endpoints can accelerate development but require validation against definitive clinical outcomes.

Would you like more specific information about endpoints for a particular therapeutic area or phase of development?
`;
    } else if (lowercaseMessage.includes('sample size') || lowercaseMessage.includes('power')) {
      return `
Sample size determination is a critical aspect of clinical trial design that balances statistical power with practical constraints.

**Key factors affecting sample size:**
- Expected effect size
- Desired statistical power (typically 80-90%)
- Significance level (usually α=0.05)
- Variability in the outcome measure
- Study design (parallel, crossover, etc.)
- Anticipated dropout rate

**Common approaches:**
1. **Power analyses** - Calculate the required sample size to detect a specified difference with given power
2. **Adaptive designs** - Allow for sample size re-estimation based on interim analyses
3. **Precision-based** - Determine sample size based on confidence interval width

For rare diseases or specialized populations, alternative approaches may be necessary:
- Bayesian methods
- Single-arm studies with historical controls
- Crossover designs
- N-of-1 trials

It's important to balance statistical requirements with practical constraints like budget, timeline, and patient availability. Oversized trials waste resources, while underpowered studies risk missing important effects.

Would you like me to elaborate on any specific aspect of sample size calculation?
`;
    } else if (
      lowercaseMessage.includes('challenge') ||
      lowercaseMessage.includes('problem') ||
      lowercaseMessage.includes('issue')
    ) {
      return `
Clinical trials face numerous challenges that can impact their success, timeline, and cost. Here are some common challenges and potential solutions:

**Recruitment and Retention:**
- Slow enrollment (solution: site selection optimization, digital recruitment)
- High dropout rates (solution: minimize participant burden, engagement strategies)
- Diversity issues (solution: targeted outreach, inclusive eligibility criteria)

**Operational Challenges:**
- Protocol complexity (solution: streamlined design, input from sites)
- Data quality issues (solution: EDC systems, thorough training)
- Site performance variability (solution: careful selection, ongoing monitoring)

**Design Challenges:**
- Endpoint selection and validation
- Appropriate control group determination
- Balancing scientific rigor with feasibility

**Regulatory Challenges:**
- Evolving requirements across regions
- Differences in regulatory perspectives
- Post-approval commitments

**Emerging Solutions:**
- Decentralized trial approaches
- Real-world evidence integration
- Adaptive trial designs
- Master protocols

The specific challenges vary by therapeutic area, phase, and geography. Addressing them requires an integrated approach combining scientific expertise, operational excellence, and innovative methodologies.

Would you like more specific information about challenges in a particular type of trial?
`;
    } else {
      return `
Thank you for your question. To provide a more specific answer, I would need additional context about the particular aspect of clinical trials you're interested in.

Clinical trials are complex research studies that involve multiple phases, diverse methodologies, and specialized considerations depending on the therapeutic area, patient population, and regulatory context.

I can help with information about:
- Study design optimization
- Statistical considerations
- Endpoint selection and validation
- Regulatory requirements
- Operational best practices
- Specific therapeutic areas
- Interpretation of results

Please feel free to ask a more specific question, and I'll provide targeted information to assist with your clinical research needs.
`;
    }
  };

  const getRandomSuggestedQuestions = () => {
    const questionSets = [
      [
        'How do adaptive trial designs compare to traditional designs?',
        'What are the advantages of Bayesian statistics in clinical trials?',
        'How can we reduce placebo response in clinical trials?',
        'What are the best practices for handling missing data?',
      ],
      [
        'How do regulatory requirements differ between FDA and EMA?',
        'What metrics best measure quality of life in clinical trials?',
        'How can digital biomarkers improve clinical trial efficiency?',
        'What are the latest innovations in patient-reported outcomes?',
      ],
      [
        'How do you determine appropriate non-inferiority margins?',
        'What are the key considerations for pediatric clinical trials?',
        'How should we approach trials for rare diseases?',
        'What statistical approaches work best for small sample sizes?',
      ],
    ];

    return questionSets[Math.floor(Math.random() * questionSets.length)];
  };

  const handleSuggestedQuestion = question => {
    setInput(question);
    inputRef.current?.focus();
  };

  const formatMessageContent = content => {
    // Simple markdown-like formatting
    return content.split('\n').map((line, i) => {
      // Headers
      if (line.startsWith('# ')) {
        return (
          <h1 key={i} className="text-xl font-bold mt-3 mb-2">
            {line.substring(2)}
          </h1>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h2 key={i} className="text-lg font-bold mt-3 mb-2">
            {line.substring(3)}
          </h2>
        );
      }
      if (line.startsWith('### ')) {
        return (
          <h3 key={i} className="text-md font-bold mt-2 mb-1">
            {line.substring(4)}
          </h3>
        );
      }

      // Bold text
      if (line.includes('**')) {
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <p key={i} className="my-1">
            {parts.map((part, j) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j}>{part.substring(2, part.length - 2)}</strong>;
              }
              return <span key={j}>{part}</span>;
            })}
          </p>
        );
      }

      // Lists
      if (line.startsWith('- ')) {
        return (
          <li key={i} className="ml-4">
            {line.substring(2)}
          </li>
        );
      }

      // Empty lines
      if (line.trim() === '') {
        return <div key={i} className="h-2"></div>;
      }

      // Default paragraph
      return (
        <p key={i} className="my-1">
          {line}
        </p>
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message, index) => {
            if (message.type === MessageTypes.LOADING) {
              return (
                <div key={index} className="flex items-start gap-3">
                  <Avatar>
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      AI
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{message.content}</span>
                  </div>
                </div>
              );
            }

            if (message.type === MessageTypes.ERROR) {
              return (
                <div key={index} className="flex items-start gap-3">
                  <Avatar>
                    <AvatarFallback className="bg-destructive text-destructive-foreground">
                      !
                    </AvatarFallback>
                  </Avatar>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-sm text-destructive">{message.content}</p>
                  </div>
                </div>
              );
            }

            if (message.type === MessageTypes.USER) {
              return (
                <div key={index} className="flex items-start gap-3 justify-end">
                  <div className="rounded-lg bg-primary p-3 text-primary-foreground">
                    <p className="text-sm">{message.content}</p>
                  </div>
                  <Avatar>
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                </div>
              );
            }

            if (message.type === MessageTypes.SYSTEM) {
              return (
                <div key={index} className="flex items-center justify-center">
                  <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {message.content}
                  </div>
                </div>
              );
            }

            // Assistant message (default)
            return (
              <div key={index} className="flex items-start gap-3">
                <Avatar>
                  <AvatarFallback className="bg-primary text-primary-foreground">AI</AvatarFallback>
                </Avatar>
                <div className="rounded-lg bg-muted p-3">
                  <div className="text-sm space-y-2">{formatMessageContent(message.content)}</div>
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md">
                      <ThumbsUp className="h-3 w-3 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md">
                      <ThumbsDown className="h-3 w-3 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md">
                      <Code className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {suggestedQuestions.length > 0 && (
        <div className="px-4 py-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((question, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="text-xs h-auto py-1.5"
                onClick={() => handleSuggestedQuestion(question)}
              >
                {question}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            placeholder="Ask a question about study design, endpoints, statistics..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default AIStudyConversation;
