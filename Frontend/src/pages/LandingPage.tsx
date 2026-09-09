import React from 'react';
import { Navbar } from '../components/landing/Navbar';
import { HeroSection } from '../components/landing/HeroSection';
import { HowItWorksSection } from '../components/landing/HowItWorksSection';
import { FeaturesSection } from '../components/landing/FeaturesSection';
import { StatsSection } from '../components/landing/StatsSection';
import { SafetySection } from '../components/landing/SafetySection';
import { CtaSection } from '../components/landing/CtaSection';
import { Footer } from '../components/landing/Footer';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-brand-surface text-brand-text selection:bg-brand-accent selection:text-white flex flex-col overflow-x-hidden">
      {/* Sticky / Blur Header */}
      <Navbar />

      {/* Main Landing Flow */}
      <main className="flex-1">
        {/* Hero Section */}
        <HeroSection />

        {/* How Matcha Works */}
        <HowItWorksSection />

        {/* Feature Highlights with Alternating Blocks */}
        <FeaturesSection />

        {/* Community Stats Full-Width Band */}
        <StatsSection />

        {/* Safety & Trust Foundation */}
        <SafetySection />

        {/* Final Conversion CTA */}
        <CtaSection />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};
