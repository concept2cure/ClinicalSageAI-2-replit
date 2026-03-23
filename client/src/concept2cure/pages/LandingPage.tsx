/**
 * @fileoverview Landing Page — slim orchestrator
 * @module concept2cure/pages/LandingPage
 *
 * Composes section components. No data, no icons, no 1500-line monolith.
 */
import React from 'react';
import {
  NavHeader,
  HeroSection,
  PlatformSection,
  FeaturesSection,
  HowItWorksSection,
  SocialProofSection,
  SecuritySection,
  PricingSection,
  CtaSection,
  Footer,
} from './landing';

export const LandingPage: React.FC = () => (
  <div className="min-h-screen bg-[#FAFAF9]">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg">
      Skip to main content
    </a>
    <NavHeader />
    <main id="main-content">
      <HeroSection />
      <PlatformSection />
      <FeaturesSection />
      <HowItWorksSection />
      <SocialProofSection />
      <SecuritySection />
      <PricingSection />
      <CtaSection />
    </main>
    <Footer />
  </div>
);

export default LandingPage;
