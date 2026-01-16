import React from 'react';
import { motion } from 'framer-motion';
import { Check, HelpCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function PricingPage() {
  const plans = [
    {
      name: 'Free',
      description: 'Basic access for evaluation',
      price: 0,
      billing: 'per month',
      features: [
        { name: '5 CSR reports per month', included: true },
        { name: 'Basic search capabilities', included: true },
        { name: 'Simple data export (CSV)', included: true },
        { name: 'AI Protocol Generator', included: false },
        { name: 'Study Design Agent', included: false },
        { name: 'Advanced analytics', included: false },
        { name: 'Statistical modeling', included: false },
        { name: 'API access', included: false },
      ],
      cta: 'Get Started',
      variant: 'outline',
      popular: false,
    },
    {
      name: 'Pro',
      description: 'Full platform capabilities',
      price: 149,
      billing: 'per month',
      features: [
        { name: 'Unlimited CSR reports', included: true },
        { name: 'Advanced search & filtering', included: true },
        { name: 'AI Protocol Generator', included: true },
        { name: 'Study Design Agent access', included: true },
        { name: 'Advanced exports (PDF, CSV, Excel)', included: true },
        { name: 'Statistical modeling tools', included: true },
        { name: 'Email support', included: true },
        { name: 'API access', included: false },
      ],
      cta: 'Subscribe Now',
      variant: 'default',
      popular: true,
    },
    {
      name: 'Enterprise',
      description: 'Customized for larger organizations',
      price: 'Custom',
      billing: 'contact for pricing',
      features: [
        { name: 'Everything in Pro', included: true },
        { name: 'White-label options', included: true },
        { name: 'Custom API integrations', included: true },
        { name: 'Dedicated account manager', included: true },
        { name: 'Priority support', included: true },
        { name: 'On-premise deployment option', included: true },
        { name: 'Custom data connectors', included: true },
        { name: 'Training & onboarding', included: true },
      ],
      cta: 'Contact Sales',
      variant: 'outline',
      popular: false,
    },
  ];

  const faqs = [
    {
      question: 'How does the free plan work?',
      answer:
        "Our free plan allows you to explore TrialSage with limited access to features and data. You can view up to 5 CSR reports per month, use basic search capabilities, and export data in CSV format. It's perfect for initial evaluation of the platform.",
    },
    {
      question: 'Can I upgrade or downgrade my plan at any time?',
      answer:
        "Yes, you can upgrade from free to Pro at any time. When upgrading, you'll immediately gain access to all the features included in your new plan. You can also downgrade at the end of your billing cycle.",
    },
    {
      question: 'Do you offer discounts for academic institutions?',
      answer:
        'Yes, we offer special pricing for academic institutions and non-profit research organizations. Please contact our sales team for more information about our academic discounts.',
    },
    {
      question: 'What payment methods do you accept?',
      answer:
        'We accept all major credit cards including Visa, Mastercard, and American Express. For Enterprise plans, we can also accommodate invoicing and purchase orders.',
    },
    {
      question: 'Is there a setup fee?',
      answer:
        'No, there are no setup fees for any of our plans. You only pay the monthly or annual subscription price based on the plan you choose.',
    },
    {
      question: 'How secure is my data on TrialSage?',
      answer:
        'TrialSage employs enterprise-grade security measures to protect your data. We use encryption for data in transit and at rest, implement strict access controls, and regularly conduct security audits. For more details, please review our security documentation.',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-8"
    >
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold md:text-4xl">Simple, Transparent Pricing</h1>
        <p className="text-slate-600 md:text-lg">
          Choose the plan that fits your clinical development needs. All plans include our core CSR
          intelligence features.
        </p>

        <Tabs defaultValue="monthly" className="max-w-xs mx-auto mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="annual">Annual (20% off)</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <TabsContent value="monthly" className="mt-6">
        <div className="grid md:grid-cols-3 gap-8 mt-8">
          {plans.map(plan => (
            <Card
              key={plan.name}
              className={`relative flex flex-col ${plan.popular ? 'border-primary shadow-md' : ''}`}
            >
              {plan.popular && (
                <Badge className="absolute top-0 right-6 transform -translate-y-1/2 bg-primary hover:bg-primary">
                  Most Popular
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <div className="mt-4 flex items-baseline text-slate-900">
                  <span className="text-4xl font-extrabold tracking-tight">
                    {typeof plan.price === 'number' ? `$${plan.price}` : plan.price}
                  </span>
                  <span className="ml-1 text-xl text-slate-500">{plan.billing}</span>
                </div>
                <p className="text-sm text-slate-600 mt-4">{plan.description}</p>
              </CardHeader>
              <CardContent className="flex-grow">
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center">
                      {feature.included ? (
                        <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-slate-300 mr-2 flex-shrink-0" />
                      )}
                      <span className={feature.included ? 'text-slate-800' : 'text-slate-500'}>
                        {feature.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant={plan.variant as any}>
                  {plan.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="annual" className="mt-6">
        <div className="grid md:grid-cols-3 gap-8 mt-8">
          {plans.map(plan => {
            const annualPrice =
              typeof plan.price === 'number' ? Math.round(plan.price * 0.8) * 12 : plan.price;

            return (
              <Card
                key={plan.name}
                className={`relative flex flex-col ${plan.popular ? 'border-primary shadow-md' : ''}`}
              >
                {plan.popular && (
                  <Badge className="absolute top-0 right-6 transform -translate-y-1/2 bg-primary hover:bg-primary">
                    Most Popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <div className="mt-4 flex items-baseline text-slate-900">
                    <span className="text-4xl font-extrabold tracking-tight">
                      {typeof annualPrice === 'number' ? `$${annualPrice}` : annualPrice}
                    </span>
                    <span className="ml-1 text-xl text-slate-500">per year</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-4">{plan.description}</p>
                </CardHeader>
                <CardContent className="flex-grow">
                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center">
                        {feature.included ? (
                          <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-5 w-5 text-slate-300 mr-2 flex-shrink-0" />
                        )}
                        <span className={feature.included ? 'text-slate-800' : 'text-slate-500'}>
                          {feature.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" variant={plan.variant as any}>
                    {plan.cta}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </TabsContent>

      <div className="bg-slate-50 dark:bg-slate-800/50 p-8 rounded-lg border border-slate-200 mt-12">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-6 text-center">Frequently Asked Questions</h2>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>

      <div className="bg-primary/10 p-8 rounded-lg border border-primary/20 mt-12">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">Need a Custom Solution?</h2>
          <p className="text-slate-600 mb-6">
            Our Enterprise plan can be tailored to your organization's specific needs. Get in touch
            with our sales team to discuss your requirements.
          </p>
          <Button size="lg" className="rounded-full px-8">
            Contact Sales
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
