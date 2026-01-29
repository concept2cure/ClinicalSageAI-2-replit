import { useState } from 'react';
import { PageContainer, HeaderSection, ContentSection } from '@/components/layout';
import Navbar from '@/components/navbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { ChevronRight, BarChart4, FileText, MessageCircle } from 'lucide-react';
import UseCaseLibraryComponent from '@/components/use-case-library/UseCaseLibrary';

export default function UseCaseLibrary() {
  const [showContactForm, setShowContactForm] = useState(false);

  return (
    <PageContainer>
      <HeaderSection>
        <Navbar />
        <div className="container px-4 md:px-6 flex flex-col items-center text-center space-y-4 py-8 md:py-12">
          <div className="space-y-2">
            <Badge variant="outline" className="text-primary border-primary px-3 py-1">
              Strategic Intelligence Launcher
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tighter">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                More Than Use Cases, Real Solutions
              </span>
            </h1>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Interactive scenario simulations with downloadable assets and pre-built workflows
            </p>
          </div>
        </div>
      </HeaderSection>

      <ContentSection>
        <div className="container px-4 md:px-6 py-8 md:py-12">
          {/* New Strategic Intelligence Launcher */}
          <UseCaseLibraryComponent />

          {/* Contact Form Section */}
          <div className="mt-16 text-center">
            <div className="space-y-2 max-w-2xl mx-auto mb-8">
              <h2 className="text-2xl md:text-3xl font-bold">Need a Custom Strategic Solution?</h2>
              <p className="text-muted-foreground">
                Our team can help you apply TrialSage to your specific clinical development
                challenges
              </p>
            </div>

            {!showContactForm ? (
              <Button onClick={() => setShowContactForm(true)} size="lg" className="px-8">
                Request Custom Solution
              </Button>
            ) : (
              <>
                <div className="max-w-md mx-auto p-6 bg-card rounded-lg border shadow-sm">
                  <h3 className="text-xl font-semibold mb-4">Contact Us</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Complete this form and our team will reach out within 24 hours to discuss your
                    specific use case
                  </p>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="firstName" className="text-sm font-medium">
                          First Name
                        </label>
                        <input
                          type="text"
                          id="firstName"
                          className="w-full p-2 rounded-md border bg-background"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="lastName" className="text-sm font-medium">
                          Last Name
                        </label>
                        <input
                          type="text"
                          id="lastName"
                          className="w-full p-2 rounded-md border bg-background"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium">
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="email"
                        className="w-full p-2 rounded-md border bg-background"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="company" className="text-sm font-medium">
                        Company
                      </label>
                      <input
                        type="text"
                        id="company"
                        className="w-full p-2 rounded-md border bg-background"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="description" className="text-sm font-medium">
                        Describe Your Strategic Need
                      </label>
                      <textarea
                        id="description"
                        rows={4}
                        className="w-full p-2 rounded-md border bg-background resize-none"
                      ></textarea>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between">
                    <Button variant="outline" onClick={() => setShowContactForm(false)}>
                      Cancel
                    </Button>
                    <Button>Request Strategic Solution</Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Additional Value Propositions */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-6">
              <div className="mb-4">
                <BarChart4 className="h-10 w-10 text-slate-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Data-Backed Decisions</h3>
              <p className="text-muted-foreground">
                Turn thousands of CSRs into actionable intelligence for your clinical development
                strategy.
              </p>
            </div>

            <div className="bg-gradient-to-br from-slate-50/70 to-slate-100/70 rounded-lg p-6">
              <div className="mb-4">
                <FileText className="h-10 w-10 text-slate-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Downloadable Assets</h3>
              <p className="text-muted-foreground">
                Get instant access to reports, protocol sections, and statistical analyses from our
                strategic intelligence engine.
              </p>
            </div>

            <div className="bg-gradient-to-br from-slate-50 to-slate-100/80 rounded-lg p-6">
              <div className="mb-4">
                <MessageCircle className="h-10 w-10 text-slate-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Expert Support</h3>
              <p className="text-muted-foreground">
                Our team of clinical trial experts can help customize solutions for your specific
                therapeutic area and development stage.
              </p>
            </div>
          </div>
        </div>
      </ContentSection>
    </PageContainer>
  );
}
