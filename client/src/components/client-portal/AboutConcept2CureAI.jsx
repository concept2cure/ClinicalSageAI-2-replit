import React, { useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { lumen } from '@/api/lumen';
import { Bot, CheckCircle2, ChevronDown, ChevronUp, ShieldCheck, Sparkles, Zap } from 'lucide-react';

function safeTenantId(currentOrganization) {
  const orgId = currentOrganization?.id;
  if (orgId != null) return String(orgId);
  const fallback = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
  return String(fallback || '1');
}

function clampText(s, max = 5000) {
  const str = String(s || '');
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

const DEFAULT_QUESTIONS = [
  'How do you ensure accuracy and defensibility in regulatory content?',
  'How does Concept2Cure keep documents in sync with changing evidence?',
  'What makes Concept2Cure different from content-management platforms?',
  'Can you explain how AI assists across IND, eCTD, CMC, CSR, and CER/510(k)?',
];

export default function AboutConcept2CureAI({ currentOrganization, currentClientWorkspace }) {
  const tenantId = useMemo(() => safeTenantId(currentOrganization), [currentOrganization]);

  const [activeTab, setActiveTab] = useState('overview');
  const [expanded, setExpanded] = useState(false);

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Ask me anything about Concept2Cure’s AI — how it works, how it stays accurate, and how it accelerates submissions across modules.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const ask = useCallback(
    async (question) => {
      const q = String(question || '').trim();
      if (!q) return;

      const next = [...messages, { role: 'user', content: q }];
      setMessages(next);
      setInput('');

      try {
        setBusy(true);

        const workspaceName = currentClientWorkspace?.name ? String(currentClientWorkspace.name) : null;
        const orgName = currentOrganization?.name ? String(currentOrganization.name) : null;

        const prompt = clampText(`You are Concept2Cure’s AI product specialist for the Client Portal “About Concept2Cure’s AI” page.

Goal:
- Build extreme confidence in the platform.
- Explain unique value and how AI assists across modules/workflows.
- Be specific and concrete, without leaking internal code or secrets.
- If asked to compare with competitors, provide a fair, high-level comparison and position Concept2Cure strongly.

      Strategic positioning (high-level narrative):
      - ClinicalSage is positioned as “the Palantir for Regulatory Affairs” — an intelligence platform, not a text editor.
      - Describe the platform as three layers: The Cortex (Lumen router), The Agents (specialized workforce), and The Fabric (Evidence Fabric / truth layer).

Key differentiators to emphasize:
- Evidence-linked authoring: traceable, auditable links between doc statements and underlying evidence.
- Freshness/staleness: detect when upstream evidence changes; refresh updates the dossier.
- Regulated-workflow design: governance, audit trails, and structured outputs.
- Module-native intelligence: IND, eCTD CoAuthor, CSR intelligence, CMC workflows, CER/510(k) document workflows, risk/quality checks.
- Practical speed: draft fast, verify fast, iterate safely.

Constraints:
- Do not claim “guaranteed” regulatory acceptance.
- If you’re uncertain, say what you can do and what you need.

User organization: ${orgName || 'Unknown'}
User workspace: ${workspaceName || 'Unknown'}

User question:
${q}`);

        const result = await lumen.ask(tenantId, 'protocol', prompt, {
          stage: 'client-portal-about',
          workspace: workspaceName || undefined,
        });

        const text =
          result?.response?.text ||
          result?.text ||
          result?.reply ||
          'Thanks — I can help with that. What area (IND, eCTD, CMC, CSR, CER/510k) do you want to focus on?';

        setMessages((prev) => [...prev, { role: 'assistant', content: String(text) }]);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              'I’m having trouble reaching the AI service right now. If you want, ask your question again and I’ll retry — or use “Ask Lumen” in the header as a fallback.',
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [currentClientWorkspace, currentOrganization, messages, tenantId]
  );

  const competitorRows = useMemo(
    () => [
      {
        company: 'Weave.bio (formatting-first document platforms)',
        typicalStrength: 'Polished document editing and formatting workflows for regulatory teams.',
        c2cDifference:
          'ClinicalSage is built as an intelligence platform: intent routing (Cortex), specialized agents (Workforce), and Evidence Fabric that links text to underlying data with staleness detection and refresh loops.',
      },
      {
        company: 'Veeva / enterprise RIM stacks',
        typicalStrength: 'Strong content management + enterprise workflows.',
        c2cDifference:
          'Concept2Cure is AI-native for authoring + evidence linkage: structured generation, traceable SmartTags, freshness detection, and one-click refresh across dossier artifacts.',
      },
      {
        company: 'Yseop / NLG-first tools',
        typicalStrength: 'High-quality narrative generation from structured inputs.',
        c2cDifference:
          'Concept2Cure focuses on regulated submission workflows end-to-end (not just text): verification hooks, audit trails, module orchestration, and evidence-linked updates.',
      },
      {
        company: 'IQVIA / large service + platform',
        typicalStrength: 'Scale, global ops, and established regulatory intelligence services.',
        c2cDifference:
          'Concept2Cure differentiates with productized, repeatable automation inside the workspace: faster drafting, structured checklists, and evidence refresh loops at the document level.',
      },
      {
        company: 'RegDesk / regulatory intelligence platforms',
        typicalStrength: 'Broad global requirements intelligence.',
        c2cDifference:
          'Concept2Cure pairs intelligence with production authoring + submission packaging workflows, emphasizing traceability, versioning, and defensible outputs across modules.',
      },
      {
        company: 'RegHero / device compliance tools',
        typicalStrength: 'Device-focused compliance workflows.',
        c2cDifference:
          'Concept2Cure supports device + biotech/pharma workflows and connects authoring to evidence freshness and auditability—critical for cross-functional submissions.',
      },
      {
        company: 'Peer AI / agentic writing tools',
        typicalStrength: 'Automated drafting and document iteration.',
        c2cDifference:
          'Concept2Cure emphasizes “evidence-aware” authoring: traceable bindings, stale detection, refresh, and module-governed outputs rather than freeform chat drafting alone.',
      },
    ],
    []
  );

  return (
    <Card className="border border-gray-200/60 shadow-md overflow-hidden">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-xl flex items-center gap-2">
                <Sparkles className="h-5 w-5" /> About Concept2Cure’s AI
              </CardTitle>
              <CardDescription className="text-blue-100 mt-1">
                Concept2Cure: Leading the Way in AI-Powered Regulatory Tools – Boost Accuracy, Speed, and Smart Decision-Making in Compliance
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-white/10 text-white border border-white/20">AI-native</Badge>
              <Badge className="bg-white/10 text-white border border-white/20">Evidence-linked</Badge>
              <Badge className="bg-white/10 text-white border border-white/20">Audit-ready</Badge>
              <CollapsibleTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20"
                >
                  {expanded ? (
                    <span className="flex items-center gap-1">
                      Hide <ChevronUp className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      Expand <ChevronDown className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {/* Compact preview (always visible) */}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <div className="text-sm text-slate-700 leading-relaxed">
                We’re building the <span className="font-semibold text-slate-900">“Palantir for Regulatory Affairs”</span>: an intelligence platform that turns regulatory work into prediction, strategy, and defensible execution — not just document formatting.
              </div>
              <div className="mt-2 text-sm text-slate-600">
                The platform is organized into three layers: <span className="font-medium text-slate-800">The Cortex (Lumen Router)</span>, <span className="font-medium text-slate-800">The Agents (Workforce)</span>, and <span className="font-medium text-slate-800">The Fabric (Evidence Truth Layer)</span>.
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-900">Quick positioning</div>
              <div className="mt-2 space-y-2 text-xs text-slate-700">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                  <span>Evidence-linked authoring with one-click refresh loops</span>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-700 mt-0.5" />
                  <span>Defensible outputs (audit-ready, reviewable)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Zap className="h-4 w-4 text-amber-600 mt-0.5" />
                  <span>Proactive risk surfacing, not reactive editing</span>
                </div>
              </div>
            </div>
          </div>

          <CollapsibleContent className="mt-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 w-full">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="manifesto">Manifesto</TabsTrigger>
                <TabsTrigger value="design">Design</TabsTrigger>
                <TabsTrigger value="modules">Across Modules</TabsTrigger>
                <TabsTrigger value="comparison">Comparison</TabsTrigger>
                <TabsTrigger value="ask">Ask AI</TabsTrigger>
              </TabsList>

          <TabsContent value="overview" className="mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="text-lg font-semibold text-slate-900">
                  ClinicalSage: An Intelligence Platform for Regulatory Affairs
                </div>
                <p className="text-slate-700 leading-relaxed">
                  The market has no shortage of tools that improve formatting. ClinicalSage is different: it is designed to improve <span className="font-medium">regulatory outcomes</span> by combining workflow-native authoring, evidence-linked truth, and proactive review simulation.
                </p>
                <p className="text-slate-700 leading-relaxed">
                  In other words: not a better typewriter — a better brain.
                </p>

                <div className="text-sm font-semibold text-slate-900">Why Concept2Cure? A Clear Overview</div>
                <p className="text-slate-700 leading-relaxed">
                  In today's complex regulatory world—with rules like the EU AI Act, FDA's flexible change plans, and shifting global standards—Concept2Cure is your essential partner. Our AI-driven system acts as a smart co-writer for eCTD documents and a generator for 510(k), PMA, CER, IND/NDA/BLA, and MDR filings.
                </p>
                <p className="text-slate-700 leading-relaxed">
                  Powered by an AI layer that can leverage a large collection of Clinical Study Reports (CSRs) plus live public regulatory signals, the system helps teams draft faster, validate sooner, and maintain clarity on what changed and why.
                </p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                    <div>
                      <div className="font-medium text-slate-900">Evidence-linked authoring</div>
                      <div className="text-sm text-slate-600">
                        Key statements can be bound to structured evidence sources, making review and QA measurable.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="h-5 w-5 text-blue-700 mt-0.5" />
                    <div>
                      <div className="font-medium text-slate-900">Governance + audit readiness</div>
                      <div className="text-sm text-slate-600">
                        Designed for regulated environments: stable outputs, audit trails, and consistent behavior.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Zap className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <div className="font-medium text-slate-900">Speed without chaos</div>
                      <div className="text-sm text-slate-600">
                        Draft, iterate, and refresh sections quickly while preserving the structure regulators expect.
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />
                <div className="text-sm font-semibold text-slate-900">Key Features: Cutting-Edge AI + Tech</div>
                <ul className="text-sm text-slate-700 space-y-2 list-disc pl-5">
                  <li>
                    <span className="font-medium">Smart automated document creation:</span> Quickly build eCTD files, 510(k)/PMA plans, CER reports, and more using NLP plus structured/graph-based intelligence.
                  </li>
                  <li>
                    <span className="font-medium">Agentic AI coordination:</span> Purpose-built agents can draft, validate against rules, and surface gaps—while humans steer the final decisions.
                  </li>
                  <li>
                    <span className="font-medium">Predictive analysis & scenario testing:</span> Forecast timelines, surface likely FDA/EMA questions, and test "what-if" regulatory changes.
                  </li>
                  <li>
                    <span className="font-medium">Institutional memory:</span> Optional private indexing of your internal documents so teams can ask “what did we promise?” and get a citation-backed answer.
                  </li>
                  <li>
                    <span className="font-medium">Global alignment expertise:</span> Helps teams align across agencies and regions while supporting modern requirements.
                  </li>
                  <li>
                    <span className="font-medium">Transparent AI + strong security framework:</span> Built for auditability and modern privacy/compliance expectations (HIPAA/GDPR/EU AI Act-aligned patterns).
                  </li>
                  <li>
                    <span className="font-medium">Integrations + collaboration:</span> Connect with tools like Veeva, IQVIA, Salesforce, or custom systems via APIs—plus real-time co-authoring workflows.
                  </li>
                </ul>

                <Separator />
                <div className="text-sm font-semibold text-slate-900">Outstanding Benefits and ROI</div>
                <div className="text-xs text-slate-500 mt-1">
                  Impact varies by data readiness, scope, and process maturity; use these as directional outcomes.
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-600">
                        <th className="py-2 pr-4 font-semibold">Benefit</th>
                        <th className="py-2 font-semibold">Key impact</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      <tr className="border-t">
                        <td className="py-2 pr-4 font-medium">Faster Market Entry</td>
                        <td className="py-2">Reduce cycle time via structured drafting + faster gap discovery and targeted remediation.</td>
                      </tr>
                      <tr className="border-t">
                        <td className="py-2 pr-4 font-medium">Major Cost Savings</td>
                        <td className="py-2">Lower rework through evidence-linked content and refresh loops when source data changes.</td>
                      </tr>
                      <tr className="border-t">
                        <td className="py-2 pr-4 font-medium">Solid Risk Protection</td>
                        <td className="py-2">Proactive risk surfacing (public signals + deterministic checks) to reduce surprises in review.</td>
                      </tr>
                      <tr className="border-t">
                        <td className="py-2 pr-4 font-medium">Endless Growth Potential</td>
                        <td className="py-2">Scale from small programs to enterprise portfolios—without losing control.</td>
                      </tr>
                      <tr className="border-t">
                        <td className="py-2 pr-4 font-medium">Spark for Innovation</td>
                        <td className="py-2">Supports cutting-edge modalities with forward-looking regulatory alignment for 2026 and beyond.</td>
                      </tr>
                      <tr className="border-t">
                        <td className="py-2 pr-4 font-medium">Sustainability & Ethics Lift</td>
                        <td className="py-2">Integrates ESG-minded workflows and responsible AI governance patterns.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">What users feel on day one</div>
                <div className="mt-3 grid gap-3">
                  <div className="rounded-lg bg-white border border-slate-200 p-3">
                    <div className="text-sm font-medium text-slate-900">Confidence</div>
                    <div className="text-sm text-slate-600">Less guesswork: the AI stays anchored to evidence and workflow context.</div>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-200 p-3">
                    <div className="text-sm font-medium text-slate-900">Control</div>
                    <div className="text-sm text-slate-600">You decide what’s final. The system helps you prove why.</div>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-200 p-3">
                    <div className="text-sm font-medium text-slate-900">Momentum</div>
                    <div className="text-sm text-slate-600">Drafts appear fast, gaps become obvious, and refresh loops keep you current.</div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="manifesto" className="mt-6">
            <div className="space-y-6">
              <div>
                <div className="text-lg font-semibold text-slate-900">The ClinicalSage Intelligence Platform: A Strategic Manifesto</div>
                <p className="text-slate-700 mt-2 leading-relaxed">
                  The thesis is simple: many tools improve <span className="font-medium">formatting</span>. ClinicalSage is built to improve <span className="font-medium">prediction, strategy, and profit</span> — while staying defensible in regulated workflows.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className="bg-slate-900 text-white">Cortex</Badge>
                  <Badge className="bg-blue-700 text-white">Agents</Badge>
                  <Badge className="bg-emerald-700 text-white">Fabric</Badge>
                </div>
              </div>

              <Separator />

              <div className="grid lg:grid-cols-3 gap-4">
                <Card className="border border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-base">I. The Cortex: Lumen (the OS)</CardTitle>
                    <CardDescription>Not a chatbot — a stateful regulatory router.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-700 space-y-3">
                    <div>
                      <div className="font-medium text-slate-900">Intelligent triage</div>
                      <div>Routes intent to the right capability (risk simulation, authoring, retrieval) instead of treating every question the same.</div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">Enterprise memory (cache)</div>
                      <div>Remembers prior tenant questions and results to reduce repeated model calls, improving latency and cost efficiency.</div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">Compliance shield</div>
                      <div>Designed so actions can be logged and reviewed; the goal is to prove how outputs were produced and what inputs were used.</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-base">II. The Agents: The Workforce</CardTitle>
                    <CardDescription>Specialized workers that replace manual labor.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-700 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">Shadow Review (War Game)</div>
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">Available</Badge>
                    </div>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Deterministic checks against guidance patterns</li>
                      <li>Public-signal risk radar (e.g., MAUDE) to anticipate likely reviewer focus areas</li>
                      <li>Deficiency learnings (when available) to forecast subjective questions</li>
                    </ul>

                    <div className="flex items-center justify-between gap-3 pt-2">
                      <div className="font-medium text-slate-900">Broker (Money Maker)</div>
                      <Badge className="bg-amber-50 text-amber-700 border border-amber-200">Roadmap</Badge>
                    </div>
                    <div>
                      Turns public regulatory enforcement signals into actionable business intelligence — e.g., surfacing “distressed assets” (recalls, warning letters, abandoned clearances) that can inform acquisition and competitive strategy.
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2">
                      <div className="font-medium text-slate-900">Co-Author with Active Learning (Style Engine)</div>
                      <Badge className="bg-amber-50 text-amber-700 border border-amber-200">Roadmap</Badge>
                    </div>
                    <div>
                      Learns tenant-specific writing preferences over time via feedback loops so drafts converge toward your voice and reduce senior-writer rewrite cycles.
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2">
                      <div className="font-medium text-slate-900">Private RAG (Institutional Memory)</div>
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">Available</Badge>
                    </div>
                    <div>Index internal artifacts (protocols, minutes, prior submissions) so teams can query “what did we commit to?” with citations.</div>
                  </CardContent>
                </Card>

                <Card className="border border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-base">III. The Fabric: Evidence Truth Layer</CardTitle>
                    <CardDescription>The technical knockout: text linked to truth.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-700 space-y-3">
                    <div>
                      <div className="font-medium text-slate-900">Smart Tags</div>
                      <div>
                        Replace brittle numbers with bindings like{' '}
                        <span className="font-mono">{'{{clinical_data.study_001.primary_endpoint}}'}</span>.
                      </div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">Red-light protocol</div>
                      <div>If upstream evidence changes, the document can mark content stale and support refresh to resync the dossier.</div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">Auditability</div>
                      <div>Track what changed, when, and why — critical for QA and defensible review.</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <Card className="border border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-base">IV. The Moat: Why it’s hard to copy</CardTitle>
                    <CardDescription>Data + workflow compounding advantages.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-700 space-y-2">
                    <div>
                      <div className="font-medium text-slate-900">Deficiency Bank (give-to-get)</div>
                      <div>A strategy to build a private, growing dataset of reviewer feedback patterns that compounds with each client.</div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">MAUDE inference chain</div>
                      <div>Public adverse-event signals mapped to likely reviewer lines of questioning to anticipate focus areas.</div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">Active learning lock-in</div>
                      <div>
                        A roadmap to learn tenant-specific style preferences over time via feedback loops, reducing rewriting and increasing consistency.
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-base">V. The Comparison: Strategy vs. Editing</CardTitle>
                    <CardDescription>Positioning summary for decks and enterprise sales.</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-slate-700">
                    <div className="overflow-x-auto">
                      <table className="min-w-full border border-slate-200 bg-white rounded-lg overflow-hidden">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="text-left text-xs font-semibold text-slate-600 px-3 py-2 border-b border-slate-200">Feature</th>
                            <th className="text-left text-xs font-semibold text-slate-600 px-3 py-2 border-b border-slate-200">Formatting-first tools</th>
                            <th className="text-left text-xs font-semibold text-slate-600 px-3 py-2 border-b border-slate-200">ClinicalSage</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-200">
                            <td className="px-3 py-3 font-medium text-slate-900">Primary function</td>
                            <td className="px-3 py-3">Document editing</td>
                            <td className="px-3 py-3">Regulatory intelligence + execution</td>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="px-3 py-3 font-medium text-slate-900">Intelligence level</td>
                            <td className="px-3 py-3">Reactive (polish content)</td>
                            <td className="px-3 py-3">Proactive (predict questions, surface gaps)</td>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="px-3 py-3 font-medium text-slate-900">Data integrity</td>
                            <td className="px-3 py-3">Static text</td>
                            <td className="px-3 py-3">Evidence Fabric (live bindings + staleness + refresh)</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-3 font-medium text-slate-900">ROI</td>
                            <td className="px-3 py-3">Saves time</td>
                            <td className="px-3 py-3">Saves time + reduces surprise risk via simulation patterns</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      Framing is strategic positioning; capabilities vary by configuration and available data.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="design" className="mt-6">
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-base">Intelligence you can audit</CardTitle>
                  <CardDescription>Outputs shaped for regulated review.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-slate-700">
                  The system favors structured, reviewable answers: clear assumptions, explicit gaps, and consistent formatting.
                </CardContent>
              </Card>
              <Card className="border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-base">Evidence Fabric mindset</CardTitle>
                  <CardDescription>Documents stay “alive” to evidence changes.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-slate-700">
                  When upstream numbers or facts change, the document can surface staleness and support a one-click refresh to resync.
                </CardContent>
              </Card>
              <Card className="border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-base">Module-native agents</CardTitle>
                  <CardDescription>Each workflow has the right assistant.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-slate-700">
                  Different tasks (CSR extraction, protocol design, CER/510(k) drafting, eCTD assembly) require different reasoning patterns.
                </CardContent>
              </Card>
            </div>

            <Separator className="my-6" />

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="text-lg font-semibold text-slate-900">Accuracy philosophy</div>
                <p className="text-slate-700 mt-2">
                  We optimize for correctness and defensibility: the platform is designed to keep outputs tied to source evidence,
                  highlight missing inputs, and reduce the risk of silent drift.
                </p>
                <div className="mt-3 text-sm text-slate-600">
                  Tip: Use Evidence Fabric patterns (SmartTags / bindings) for the highest-confidence, always-up-to-date documents.
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Built to support how teams actually work</div>
                <ul className="mt-3 space-y-2 text-sm text-slate-700 list-disc pl-5">
                  <li>Write fast, then verify what matters.</li>
                  <li>Make gaps explicit (no hidden assumptions).</li>
                  <li>Track change impact across the dossier.</li>
                  <li>Support reviewers with a consistent, structured output style.</li>
                </ul>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="modules" className="mt-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="font-semibold text-slate-900">eCTD CoAuthor</div>
                <div className="text-sm text-slate-600 mt-1">
                  Evidence-linked authoring with SmartTags, structured drafting, and review-ready formatting.
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="font-semibold text-slate-900">CER / 510(k) (CERV2)</div>
                <div className="text-sm text-slate-600 mt-1">
                  Section-by-section generation, consistency checks, and Evidence Fabric staleness + refresh.
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="font-semibold text-slate-900">CSR Intelligence</div>
                <div className="text-sm text-slate-600 mt-1">
                  Extract and normalize CSR signals; accelerate downstream narrative and evidence reuse.
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="font-semibold text-slate-900">CMC Workflows</div>
                <div className="text-sm text-slate-600 mt-1">
                  Guided drafting and checklists for completeness, alignment, and submission quality.
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Bot className="h-5 w-5 text-blue-700 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900">The unifying layer: Lumen</div>
                  <div className="text-sm text-slate-700 mt-1">
                    Lumen powers assistance across modules: answers questions in context, supports drafting, surfaces gaps,
                    and helps teams stay aligned as evidence evolves.
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="comparison" className="mt-6">
            <div className="text-lg font-semibold text-slate-900">Where Concept2Cure fits — and how we differ</div>
            <p className="text-slate-700 mt-2">
              Many platforms do either content management or AI writing. Concept2Cure is built around regulated workflows with
              evidence linkage and refresh loops — so your dossier stays reviewable and current.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border border-slate-200 bg-white rounded-lg overflow-hidden">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left text-xs font-semibold text-slate-600 px-3 py-2 border-b border-slate-200">Competitor</th>
                    <th className="text-left text-xs font-semibold text-slate-600 px-3 py-2 border-b border-slate-200">Typical strengths</th>
                    <th className="text-left text-xs font-semibold text-slate-600 px-3 py-2 border-b border-slate-200">How Concept2Cure differentiates</th>
                  </tr>
                </thead>
                <tbody>
                  {competitorRows.map((row) => (
                    <tr key={row.company} className="border-b border-slate-200 last:border-b-0">
                      <td className="px-3 py-3 text-sm font-medium text-slate-900 align-top">{row.company}</td>
                      <td className="px-3 py-3 text-sm text-slate-700 align-top">{row.typicalStrength}</td>
                      <td className="px-3 py-3 text-sm text-slate-700 align-top">{row.c2cDifference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-xs text-slate-500">
              Note: Comparisons are high-level and meant for positioning; exact capabilities vary by configuration and use case.
            </div>
          </TabsContent>

          <TabsContent value="ask" className="mt-6">
            <div className="grid lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3">
                <div className="rounded-xl border border-slate-200 bg-white">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-blue-700" />
                      <div className="font-semibold text-slate-900">Ask Concept2Cure AI</div>
                      {busy ? <Badge className="bg-blue-50 text-blue-700 border border-blue-200">Thinking…</Badge> : null}
                    </div>
                    <div className="text-xs text-slate-500">Tenant: {tenantId}</div>
                  </div>

                  <div className="p-4 space-y-3 max-h-[360px] overflow-auto">
                    {messages.map((m, idx) => (
                      <div key={idx} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                        <div
                          className={`inline-block max-w-[92%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-50 border border-slate-200 text-slate-800'
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 border-t border-slate-200">
                    <Textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask about accuracy, evidence traceability, modules, security, or comparisons…"
                      className="min-h-[90px]"
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        Tip: ask “How do SmartTags keep numbers current?”
                      </div>
                      <Button
                        onClick={() => ask(input)}
                        disabled={busy || !String(input || '').trim()}
                        className="bg-blue-700 hover:bg-blue-800"
                      >
                        Ask
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="font-semibold text-slate-900">Suggested questions</div>
                  <div className="mt-3 grid gap-2">
                    {DEFAULT_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={busy}
                        onClick={() => ask(q)}
                        className="text-left text-sm rounded-lg border border-slate-200 hover:border-blue-200 hover:bg-blue-50 px-3 py-2 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  <Separator className="my-4" />

                  <div className="text-sm font-semibold text-slate-900">What to say in the meeting</div>
                  <ul className="mt-2 space-y-2 text-sm text-slate-700 list-disc pl-5">
                    <li>“We don’t just generate text — we bind it to evidence.”</li>
                    <li>“If upstream evidence changes, the dossier turns stale and refreshes in one click.”</li>
                    <li>“Each module has a purpose-built assistant, not a generic chat box.”</li>
                    <li>“We optimize for defensibility: structured outputs and audit-ready behaviors.”</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>
            </Tabs>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
