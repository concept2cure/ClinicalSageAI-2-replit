import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  CheckCircle,
  FileCheck,
  Clock,
  Beaker,
  FileText,
  BarChart3,
  ShieldCheck,
  CreditCard,
  BookOpen,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

export default function PremiumDossierLanding() {
  const [activeTab, setActiveTab] = useState('standard');
  const { toast } = useToast();

  return (
    <div className="container max-w-6xl mx-auto py-12 px-4 sm:px-6">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent mb-4">
          Launch Your Trial With Confidence
        </h1>
        <p className="text-xl text-slate-600 max-w-3xl mx-auto mb-8">
          Get a fully structured, precedent-based trial design dossier from 1,900+ CSRs—designed for
          investors, regulators, and real-world success.
        </p>
        <div className="flex items-center justify-center gap-3 mb-8">
          <Badge variant="secondary" className="text-sm py-1 px-3">
            <Clock className="h-3.5 w-3.5 mr-1" /> Delivered in 72 hours
          </Badge>
          <Badge variant="secondary" className="text-sm py-1 px-3">
            <CheckCircle className="h-3.5 w-3.5 mr-1" /> Expert-reviewed
          </Badge>
          <Badge variant="secondary" className="text-sm py-1 px-3">
            <FileCheck className="h-3.5 w-3.5 mr-1" /> Regulatory aligned
          </Badge>
        </div>
        <Button size="lg" className="mb-2">
          <Link href="/dossier-request">Request Your Dossier</Link>
        </Button>
        <p className="text-sm text-slate-500">Starting at $2,500</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16 items-center">
        <div>
          <h2 className="text-3xl font-bold mb-6">What You'll Receive</h2>
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="bg-primary/10 p-2 rounded-md mr-4">
                <Beaker className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Optimized Trial Design</h3>
                <p className="text-slate-600">
                  Phase selection, arm structure, sample size calculations, and primary/secondary
                  endpoint recommendations.
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="bg-primary/10 p-2 rounded-md mr-4">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Matched Precedents</h3>
                <p className="text-slate-600">
                  Similar trials from our database of 1,900+ CSRs with success rates and design
                  rationales.
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="bg-primary/10 p-2 rounded-md mr-4">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Safety Profiles</h3>
                <p className="text-slate-600">
                  Comprehensive safety data from similar trials, including AE rates and severity
                  patterns.
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="bg-primary/10 p-2 rounded-md mr-4">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Risk Analysis</h3>
                <p className="text-slate-600">
                  Detailed assessment with real-world historical comparisons and mitigation
                  strategies.
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="bg-primary/10 p-2 rounded-md mr-4">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Cost & Timeline Estimates</h3>
                <p className="text-slate-600">
                  Realistic budget projections and recruitment timelines based on historical data.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
          <h3 className="font-bold text-2xl mb-4">Who Benefits</h3>
          <div className="space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <div className="flex justify-between mb-1">
                <span className="font-medium">Biotech Founders (Seed–Series B)</span>
                <span className="text-primary font-semibold">$1,500–$5,000</span>
              </div>
              <p className="text-sm text-slate-600">
                Use it for board meetings, investor pitches, and IND preparation
              </p>
            </div>

            <div className="border-b border-slate-200 pb-4">
              <div className="flex justify-between mb-1">
                <span className="font-medium">VC Firms</span>
                <span className="text-primary font-semibold">$10K–$50K/10 companies</span>
              </div>
              <p className="text-sm text-slate-600">
                Use to vet portfolio protocols and assess trial designs
              </p>
            </div>

            <div className="border-b border-slate-200 pb-4">
              <div className="flex justify-between mb-1">
                <span className="font-medium">CROs</span>
                <span className="text-primary font-semibold">$5K per study</span>
              </div>
              <p className="text-sm text-slate-600">
                Use to upsell protocol design services and strengthen bid defense
              </p>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-medium">Mid-tier Pharma</span>
                <span className="text-primary font-semibold">$2K/report or $30K subscription</span>
              </div>
              <p className="text-sm text-slate-600">
                Use to sanity-check study teams and validate design decisions
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-16">
        <h2 className="text-3xl font-bold text-center mb-10">Choose Your Package</h2>

        <Tabs defaultValue="standard" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="standard">Standard Dossier</TabsTrigger>
            <TabsTrigger value="founder">Founder Fast Lane</TabsTrigger>
          </TabsList>

          <TabsContent value="standard">
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-2xl">Standard Dossier</CardTitle>
                    <CardDescription>
                      Complete trial design package with comprehensive analysis
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-primary">$2,500</div>
                    <div className="text-sm text-slate-500">One-time payment</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Complete trial design dossier for your indication</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Safety profile analysis from similar trials</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Regulatory notes and historical outcomes</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Cost and timeline projections</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Risk analysis with mitigation strategies</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" size="lg">
                  <Link href="/dossier-request">Order Standard Dossier</Link>
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="founder">
            <Card className="border-2 border-primary">
              <CardHeader className="bg-primary/5">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge className="mb-2" variant="secondary">
                      MOST POPULAR
                    </Badge>
                    <CardTitle className="text-2xl">Founder Fast Lane</CardTitle>
                    <CardDescription>
                      Premium package with additional services for founders
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-primary">$4,000</div>
                    <div className="text-sm text-slate-500">One-time payment</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Everything in the Standard Dossier package</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>30-minute protocol feedback session with a CRO-backed analyst</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>IND-ready export in regulatory-compliant format</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Investor-friendly "Why This Design Works" slide deck</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>eTMF-compatible summary document</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    <span>Priority processing (48-hour delivery)</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" size="lg" variant="default">
                  <Link href="/dossier-request">Order Founder Fast Lane</Link>
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div className="mb-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-4">How It Works</h2>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            Our streamlined process delivers expert-quality trial design dossiers in just 72 hours
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card>
            <CardContent className="pt-6">
              <div className="mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">1. Submit Your Brief</h3>
              <p className="text-slate-600">
                Upload your asset summary or draft protocol. The more details you provide, the more
                targeted your recommendations will be.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <FileCheck className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">2. Expert Analysis</h3>
              <p className="text-slate-600">
                Our platform analyzes 1,900+ clinical study reports to find precedents and optimal
                design parameters for your specific indication.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">3. Receive Your Dossier</h3>
              <p className="text-slate-600">
                Within 72 hours (or 48 for Fast Lane), receive your comprehensive dossier with all
                recommendations, precedents, and analysis.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-8 border border-slate-200 mb-16">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-2">
              How is the dossier different from an off-the-shelf protocol template?
            </h3>
            <p className="text-slate-600">
              Our dossiers are specifically tailored to your indication and compound, backed by
              real-world data from 1,900+ clinical study reports. We analyze actual outcomes, not
              theoretical designs.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-2">Can I request revisions to my dossier?</h3>
            <p className="text-slate-600">
              Yes, one round of revisions is included with every dossier. Additional revision rounds
              can be purchased for $500 each.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-2">How do you handle confidential information?</h3>
            <p className="text-slate-600">
              All submissions are treated with strict confidentiality. We can sign an NDA upon
              request, and our system is designed with enterprise-grade security.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-2">What format will I receive the dossier in?</h3>
            <p className="text-slate-600">
              Standard dossiers are delivered as PDF and PowerPoint files. Founder Fast Lane
              includes additional formats suitable for regulatory submissions and investor
              presentations.
            </p>
          </div>
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-3xl font-bold mb-6">Ready to optimize your trial design?</h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
          Launch with confidence using data-driven, precedent-based recommendations tailored to your
          specific needs.
        </p>
        <Button size="lg" className="mb-4">
          <Link href="/dossier-request">Request Your Dossier Now</Link>
        </Button>
        <p className="text-sm text-slate-500">Questions? Contact us at support@trialsage.ai</p>
      </div>
    </div>
  );
}
