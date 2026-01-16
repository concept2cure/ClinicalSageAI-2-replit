import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose, } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger, } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info, HelpCircle, BookOpen } from 'lucide-react'

function About510kDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="flex items-center gap-1.5">
          <Info className="h-4 w-4" />
          <span>About 510(k)</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">510(k) Generator</DialogTitle>
          <DialogDescription>
            Comprehensive tools for efficient medical device 510(k) submissions
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[70vh] px-1">
          <Tabs defaultValue="overview">
            <TabsList className="mb-4">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="faq" className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4" />
                FAQ
              </TabsTrigger>
              <TabsTrigger value="howto" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                How To Use
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">510(k) Submission Generator</h3>
                <p>
                  The 510(k) Generator is an intelligent tool that streamlines the preparation of
                  FDA 510(k) submissions for medical devices. It provides comprehensive
                  functionality for predicate device discovery, literature review across multiple
                  sources, document preparation, and AI-assisted drafting.
                </p>

                <h4 className="text-md font-medium mt-4">Key Features</h4>
                <ul className="list-disc list-inside space-y-2">
                  <li>
                    <strong>Predicate Device Finder:</strong> Identify and compare potential
                    predicate devices for your submission
                  </li>
                  <li>
                    <strong>Multi-Source Literature Review:</strong> Search and analyze literature
                    from 7 different sources
                  </li>
                  <li>
                    <strong>PDF Processing:</strong> Upload and analyze PDFs with AI-powered
                    summarization
                  </li>
                  <li>
                    <strong>AI Assistance:</strong> Get intelligent suggestions and guidance
                    throughout your submission
                  </li>
                </ul>

                <h4 className="text-md font-medium mt-4">Supported Data Sources</h4>
                <ul className="list-disc list-inside space-y-2">
                  <li>
                    <strong>PubMed:</strong> Medical research publications
                  </li>
                  <li>
                    <strong>FAERS:</strong> FDA Adverse Event Reporting System
                  </li>
                  <li>
                    <strong>PDF Documents:</strong> Your own literature and research
                  </li>
                  <li>
                    <strong>Semantic Scholar:</strong> Academic research papers
                  </li>
                  <li>
                    <strong>ClinicalTrials.gov:</strong> Clinical trial registrations
                  </li>
                  <li>
                    <strong>IEEE Xplore:</strong> Technical and engineering literature
                  </li>
                  <li>
                    <strong>DOAJ:</strong> Directory of Open Access Journals
                  </li>
                </ul>
              </div>
            </TabsContent>

            {/* FAQ Tab */}
            <TabsContent value="faq">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>What is a 510(k) submission?</AccordionTrigger>
                  <AccordionContent>
                    A 510(k) is a premarket submission made to the FDA to demonstrate that a device
                    is as safe and effective (substantially equivalent) to a legally marketed
                    device. Manufacturers must submit a 510(k) if they intend to market a device
                    that requires a 510(k) submission as per FDA regulations, or when making
                    significant modifications to an existing device.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-2">
                  <AccordionTrigger>How does the Predicate Finder work?</AccordionTrigger>
                  <AccordionContent>
                    The Predicate Finder searches a comprehensive database of previously cleared
                    510(k) devices to find potential predicates for your device. It uses device
                    characteristics, classifications, and intended use to identify similar devices.
                    The tool provides a similarity score to help you evaluate the best predicates
                    for your submission.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-3">
                  <AccordionTrigger>
                    What data sources are available for literature review?
                  </AccordionTrigger>
                  <AccordionContent>
                    The 510(k) Generator includes seven integrated data sources:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>PubMed for medical literature</li>
                      <li>FAERS for adverse event data</li>
                      <li>PDF Upload for analyzing your own documents</li>
                      <li>Semantic Scholar for academic research</li>
                      <li>ClinicalTrials.gov for clinical studies</li>
                      <li>IEEE Xplore for engineering and technical papers</li>
                      <li>DOAJ for open access journal articles</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-4">
                  <AccordionTrigger>Can I upload my own documents for analysis?</AccordionTrigger>
                  <AccordionContent>
                    Yes, the PDF Upload feature allows you to upload your own literature, research,
                    or documentation in PDF format. The system will extract the text content and
                    provide an AI-generated summary. You can then incorporate this information into
                    your 510(k) submission.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-5">
                  <AccordionTrigger>
                    What are the limitations of the literature search?
                  </AccordionTrigger>
                  <AccordionContent>
                    While our multi-source literature review is comprehensive, some limitations
                    include:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Rate limits on certain APIs (like IEEE Xplore)</li>
                      <li>Search queries are limited to text (not structured database queries)</li>
                      <li>Some sources may return a maximum number of results per query</li>
                      <li>
                        PDF processing has a file size limit and works best with text-based PDFs
                      </li>
                    </ul>
                    For extremely specialized searches, consider supplementing with manual
                    literature review.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-6">
                  <AccordionTrigger>How does AI summarization work?</AccordionTrigger>
                  <AccordionContent>
                    The AI summarization feature uses advanced large language models to analyze text
                    content and generate concise, relevant summaries. For PDF documents and
                    literature search results, the AI focuses on extracting key regulatory and
                    scientific information relevant to medical device submissions, helping you
                    quickly identify the most important points.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-7">
                  <AccordionTrigger>Can I export my literature review results?</AccordionTrigger>
                  <AccordionContent>
                    Currently, you can view and analyze results within the application. We're
                    working on an export feature that will allow you to export your literature
                    review findings to PDF, Word, or CSV formats for inclusion in your 510(k)
                    submission package.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-8">
                  <AccordionTrigger>
                    Does this replace the need for a regulatory consultant?
                  </AccordionTrigger>
                  <AccordionContent>
                    The 510(k) Generator is a powerful tool to streamline and enhance your
                    submission process, but it's designed to complement, not replace, regulatory
                    expertise. While it provides guidance and automates many aspects of submission
                    preparation, regulatory strategy, risk assessment, and final submission review
                    should still involve qualified regulatory professionals.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>

            {/* How To Use Tab */}
            <TabsContent value="howto" className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-3">Using the Predicate Finder</h3>
                <ol className="list-decimal list-inside space-y-2">
                  <li>Navigate to the Predicate Finder tab in the 510(k) section</li>
                  <li>Enter your device's characteristics (classification, intended use, etc.)</li>
                  <li>Click "Find Predicates" to search for potential predicate devices</li>
                  <li>Review the list of potential predicates and their similarity scores</li>
                  <li>Select a predicate to view detailed comparison information</li>
                  <li>
                    Use the "Add to Submission" button to include the predicate in your 510(k)
                    documentation
                  </li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-3">
                  Conducting a Multi-Source Literature Review
                </h3>
                <ol className="list-decimal list-inside space-y-2">
                  <li>Navigate to the Literature Review tab in the 510(k) section</li>
                  <li>Choose your desired data source from the tab menu (PubMed, FAERS, etc.)</li>
                  <li>Enter your search query in the search field</li>
                  <li>For date-sensitive searches, use the date range selectors</li>
                  <li>Click the search button to retrieve results</li>
                  <li>Review the results and click on titles to expand information</li>
                  <li>Use the "View Full Article" links to access source documents</li>
                  <li>Switch between tabs to conduct searches across multiple sources</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-3">Uploading and Analyzing PDFs</h3>
                <ol className="list-decimal list-inside space-y-2">
                  <li>Navigate to the "Upload PDF" tab in the Literature Review section</li>
                  <li>Click the file input field or "Browse" to select a PDF from your computer</li>
                  <li>Click "Upload & Extract" to process the PDF</li>
                  <li>Once extraction is complete, review the extracted text</li>
                  <li>Click "Summarize" to generate an AI-powered summary of the PDF content</li>
                  <li>Review the summary for key points relevant to your submission</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-3">IEEE Xplore Search</h3>
                <ol className="list-decimal list-inside space-y-2">
                  <li>Navigate to the "IEEE Xplore" tab in the Literature Review section</li>
                  <li>Enter technical or engineering-related search terms</li>
                  <li>
                    Click "Search" to retrieve results from IEEE's technical literature database
                  </li>
                  <li>
                    Review the results, focusing on technical specifications and engineering data
                  </li>
                  <li>Use the article links to access full papers when needed</li>
                </ol>
                <p className="text-sm text-gray-600 mt-2">
                  Note: IEEE Xplore access is rate-limited. Use specific, targeted searches for best
                  results.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-3">Tips for Effective Use</h3>
                <ul className="list-disc list-inside space-y-2">
                  <li>Use specific, focused search terms for more relevant results</li>
                  <li>
                    Combine searches across multiple sources for comprehensive literature review
                  </li>
                  <li>For medical device terms, include both generic and specific terminology</li>
                  <li>
                    When uploading PDFs, ensure they are text-based (not scanned images) for best
                    results
                  </li>
                  <li>Use the date range filters to focus on recent literature when appropriate</li>
                  <li>Save important findings throughout your research process</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>

        <div className="flex justify-end mt-4">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default About510kDialog;
