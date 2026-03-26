import { useState } from 'react';
import DOMPurify from 'dompurify';
import FDA510kService from '@/services/FDA510kService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toaster';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';

export default function LiteratureReviewPanel() {
  // Common state
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('2018-01-01');
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const { toast } = useToast();

  // Source-specific states
  const [pubmedLoading, setPubmedLoading] = useState(false);
  const [pubmedResults, setPubmedResults] = useState([]);

  const [faersLoading, setFaersLoading] = useState(false);
  const [faersResults, setFaersResults] = useState([]);

  const [pdfFile, setPdfFile] = useState(null);
  const [pdfText, setPdfText] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfSummary, setPdfSummary] = useState('');

  const [ssLoading, setSsLoading] = useState(false);
  const [ssResults, setSsResults] = useState([]);

  const [ctLoading, setCtLoading] = useState(false);
  const [ctResults, setCtResults] = useState([]);

  const [ieeeLoading, setIeeeLoading] = useState(false);
  const [ieeeResults, setIeeeResults] = useState([]);

  const [doajLoading, setDoajLoading] = useState(false);
  const [doajResults, setDoajResults] = useState([]);

  // PubMed literature review
  const runPubMedReview = async () => {
    if (!query.trim()) return;
    setPubmedLoading(true);
    try {
      const results = await FDA510kService.instance.literatureReview(query, fromDate, toDate);
      setPubmedResults(results);
      toast({ title: 'PubMed Review ✓', description: `${results.length} papers summarized` });
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch PubMed literature',
      });
    } finally {
      setPubmedLoading(false);
    }
  };

  // FAERS search
  const runFaersSearch = async () => {
    if (!query.trim()) return;
    setFaersLoading(true);
    try {
      // Placeholder for FAERS search - replace with actual implementation
      const results = [
        {
          id: 'faers-1',
          title: 'Adverse Event Reports for ' + query,
          summary: 'FDA Adverse Event Reporting System (FAERS) data for the search term.',
          date: new Date().toISOString().slice(0, 10),
          link: 'https://www.fda.gov/drugs/questions-and-answers-fdas-adverse-event-reporting-system-faers/fda-adverse-event-reporting-system-faers-public-dashboard',
        },
      ];
      setFaersResults(results);
      toast({ title: 'FAERS Search ✓', description: 'Adverse event data retrieved' });
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to fetch FAERS data' });
    } finally {
      setFaersLoading(false);
    }
  };

  // PDF Upload and Processing
  const handleFileChange = e => {
    if (e.target.files && e.target.files[0]) {
      setPdfFile(e.target.files[0]);
    }
  };

  const uploadPdf = async () => {
    if (!pdfFile) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a PDF file' });
      return;
    }

    setPdfLoading(true);
    try {
      const result = await FDA510kService.instance.uploadLiterature(pdfFile);
      if (result.success) {
        setPdfText(result.text);
        toast({
          title: 'PDF Upload ✓',
          description: `${result.fileName} processed (${result.pageCount} pages)`,
        });
      } else {
        throw new Error(result.message || 'PDF processing failed');
      }
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to process PDF' });
    } finally {
      setPdfLoading(false);
    }
  };

  const summarizePdf = async () => {
    if (!pdfText) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please upload a PDF first' });
      return;
    }

    setPdfLoading(true);
    try {
      const response = await fetch('/api/fda510k/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pdfText }),
      });

      const data = await response.json();
      if (data.success) {
        setPdfSummary(data.summary);
        toast({ title: 'Summary Generated ✓', description: 'PDF content has been summarized' });
      } else {
        throw new Error(data.message || 'Summarization failed');
      }
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to summarize PDF' });
    } finally {
      setPdfLoading(false);
    }
  };

  // Semantic Scholar search
  const doSemanticScholar = async () => {
    if (!query.trim()) return;
    setSsLoading(true);
    try {
      const results = await FDA510kService.instance.semanticScholar(query);
      setSsResults(results);
      toast({ title: 'Semantic Scholar ✓', description: `${results.length} papers found` });
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to search Semantic Scholar',
      });
    } finally {
      setSsLoading(false);
    }
  };

  // ClinicalTrials.gov search
  const doClinicalTrials = async () => {
    if (!query.trim()) return;
    setCtLoading(true);
    try {
      const results = await FDA510kService.instance.clinicalTrials(query);
      setCtResults(results);
      toast({ title: 'ClinicalTrials.gov ✓', description: `${results.length} studies found` });
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to search ClinicalTrials.gov',
      });
    } finally {
      setCtLoading(false);
    }
  };

  // IEEE Xplore search
  const doIEEEXplore = async () => {
    if (!query.trim()) return;
    setIeeeLoading(true);
    try {
      const results = await FDA510kService.instance.ieeeXplore(query);
      setIeeeResults(results);
      toast({ title: 'IEEE Xplore ✓', description: `${results.length} articles found` });
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to search IEEE Xplore',
      });
    } finally {
      setIeeeLoading(false);
    }
  };

  // DOAJ search
  const doDOAJ = async () => {
    if (!query.trim()) return;
    setDoajLoading(true);
    try {
      const results = await FDA510kService.instance.doajSearch(query);
      setDoajResults(results);
      toast({ title: 'DOAJ ✓', description: `${results.length} articles found` });
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to search DOAJ' });
    } finally {
      setDoajLoading(false);
    }
  };

  return (
    <div className="my-6">
      <h3 className="text-lg font-semibold">📚 Enterprise-Grade Literature Review</h3>

      <Tabs defaultValue="pubmed" className="mt-4">
        <TabsList className="mb-4">
          <TabsTrigger value="pubmed">PubMed</TabsTrigger>
          <TabsTrigger value="faers">FAERS</TabsTrigger>
          <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
          <TabsTrigger value="semantic">Semantic Scholar</TabsTrigger>
          <TabsTrigger value="clinical">ClinicalTrials.gov</TabsTrigger>
          <TabsTrigger value="ieee">IEEE Xplore</TabsTrigger>
          <TabsTrigger value="doaj">DOAJ</TabsTrigger>
        </TabsList>

        {/* PubMed Tab */}
        <TabsContent value="pubmed">
          <div className="flex flex-wrap gap-2">
            <Input
              className="flex-1 min-w-[200px]"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Enter medical device keywords..."
            />
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
            <Button onClick={runPubMedReview} disabled={pubmedLoading}>
              {pubmedLoading ? <Spinner className="mr-2 h-4 w-4 animate-spin" /> : 'Search PubMed'}
            </Button>
          </div>
          <div className="mt-4 space-y-4 max-h-[50vh] overflow-auto">
            {pubmedResults.map((paper, i) => (
              <Card key={i} className="p-4">
                <div className="flex justify-between">
                  <h4 className="font-medium">{paper.title}</h4>
                  <span className="text-xs text-gray-500">{paper.date}</span>
                </div>
                <p className="mt-2 text-sm text-gray-700">{paper.summary}</p>
                <a
                  href={paper.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline mt-1 block"
                >
                  View Full Article
                </a>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* FAERS Tab */}
        <TabsContent value="faers">
          <div className="flex flex-wrap gap-2">
            <Input
              className="flex-1 min-w-[200px]"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Enter product name or adverse event..."
            />
            <Button onClick={runFaersSearch} disabled={faersLoading}>
              {faersLoading ? <Spinner className="mr-2 h-4 w-4 animate-spin" /> : 'Search FAERS'}
            </Button>
          </div>
          <div className="mt-4 space-y-4 max-h-[50vh] overflow-auto">
            {faersResults.map((report, i) => (
              <Card key={i} className="p-4">
                <div className="flex justify-between">
                  <h4 className="font-medium">{report.title}</h4>
                  <span className="text-xs text-gray-500">{report.date}</span>
                </div>
                <p className="mt-2 text-sm text-gray-700">{report.summary}</p>
                <a
                  href={report.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline mt-1 block"
                >
                  View FAERS Dashboard
                </a>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* PDF Upload Tab */}
        <TabsContent value="pdf">
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pdf-file">Upload Literature PDF</Label>
              <div className="flex gap-2">
                <Input id="pdf-file" type="file" accept=".pdf" onChange={handleFileChange} />
                <Button onClick={uploadPdf} disabled={pdfLoading || !pdfFile}>
                  {pdfLoading ? (
                    <Spinner className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    'Upload & Extract'
                  )}
                </Button>
              </div>
            </div>

            {pdfText && (
              <div className="mt-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Extracted PDF Text</h4>
                  <Button onClick={summarizePdf} disabled={pdfLoading} size="sm">
                    {pdfLoading ? <Spinner className="mr-2 h-4 w-4 animate-spin" /> : 'Summarize'}
                  </Button>
                </div>
                <Card className="p-4 mt-2">
                  <div className="max-h-[200px] overflow-auto text-sm text-gray-700">
                    {pdfText.substring(0, 1000)}
                    {pdfText.length > 1000 && '...'}
                  </div>
                </Card>

                {pdfSummary && (
                  <div className="mt-4">
                    <h4 className="font-medium">AI-Generated Summary</h4>
                    <Card className="p-4 mt-2">
                      <div
                        className="text-sm text-gray-700"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(pdfSummary.replace(/\n/g, '<br>')),
                        }}
                      />
                    </Card>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Semantic Scholar Tab */}
        <TabsContent value="semantic">
          <div className="flex flex-wrap gap-2">
            <Input
              className="flex-1 min-w-[200px]"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search Semantic Scholar..."
            />
            <Button onClick={doSemanticScholar} disabled={ssLoading}>
              {ssLoading ? <Spinner className="mr-2 h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
          <div className="mt-4 space-y-4 max-h-[50vh] overflow-auto">
            {ssResults.map((paper, i) => (
              <Card key={i} className="p-4">
                <div className="flex justify-between">
                  <h4 className="font-medium">{paper.title}</h4>
                  <span className="text-xs text-gray-500">{paper.year}</span>
                </div>
                <p className="mt-2 text-sm text-gray-700">
                  {paper.abstract?.substring(0, 200) || 'No abstract available'}
                  {paper.abstract && paper.abstract.length > 200 && '...'}
                </p>
                {paper.url && (
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline mt-1 block"
                  >
                    View on Semantic Scholar
                  </a>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ClinicalTrials.gov Tab */}
        <TabsContent value="clinical">
          <div className="flex flex-wrap gap-2">
            <Input
              className="flex-1 min-w-[200px]"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search clinical trials..."
            />
            <Button onClick={doClinicalTrials} disabled={ctLoading}>
              {ctLoading ? <Spinner className="mr-2 h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
          <div className="mt-4 space-y-4 max-h-[50vh] overflow-auto">
            {ctResults.map((trial, i) => (
              <Card key={i} className="p-4">
                <h4 className="font-medium">{trial.title}</h4>
                <p className="mt-2 text-sm text-gray-700">
                  {trial.abstract?.substring(0, 200) || 'No summary available'}
                  {trial.abstract && trial.abstract.length > 200 && '...'}
                </p>
                {trial.url && (
                  <a
                    href={trial.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline mt-1 block"
                  >
                    View on ClinicalTrials.gov
                  </a>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* IEEE Xplore Tab */}
        <TabsContent value="ieee">
          <div className="flex flex-wrap gap-2">
            <Input
              className="flex-1 min-w-[200px]"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search IEEE Xplore..."
            />
            <Button onClick={doIEEEXplore} disabled={ieeeLoading}>
              {ieeeLoading ? <Spinner className="mr-2 h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
          <div className="mt-4 space-y-4 max-h-[50vh] overflow-auto">
            {ieeeResults.map((article, i) => (
              <Card key={i} className="p-4">
                <div className="flex justify-between">
                  <h4 className="font-medium">{article.title}</h4>
                  <span className="text-xs text-gray-500">{article.year}</span>
                </div>
                <p className="mt-2 text-sm text-gray-700">
                  {article.abstract?.substring(0, 200) || 'No abstract available'}
                  {article.abstract && article.abstract.length > 200 && '...'}
                </p>
                {article.url && (
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline mt-1 block"
                  >
                    View on IEEE Xplore
                  </a>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* DOAJ Tab */}
        <TabsContent value="doaj">
          <div className="flex flex-wrap gap-2">
            <Input
              className="flex-1 min-w-[200px]"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search open access journals..."
            />
            <Button onClick={doDOAJ} disabled={doajLoading}>
              {doajLoading ? <Spinner className="mr-2 h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
          <div className="mt-4 space-y-4 max-h-[50vh] overflow-auto">
            {doajResults.map((article, i) => (
              <Card key={i} className="p-4">
                <div className="flex justify-between">
                  <h4 className="font-medium">{article.title}</h4>
                  <span className="text-xs text-gray-500">{article.year}</span>
                </div>
                <p className="mt-2 text-sm text-gray-700">
                  {article.abstract?.substring(0, 200) || 'No abstract available'}
                  {article.abstract && article.abstract.length > 200 && '...'}
                </p>
                {article.url && (
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline mt-1 block"
                  >
                    View Full Article
                  </a>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
