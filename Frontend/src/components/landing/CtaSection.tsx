import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';

export const CtaSection: React.FC = () => {
  return (
    <section className="relative py-24 sm:py-32 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white overflow-hidden text-center">
      {/* Background Decorative Rings */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full border border-white/10" />
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-[950px] h-[950px] rounded-full border border-white/5" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center">
        {/* Sparkle Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-xs sm:text-sm font-bold uppercase tracking-wider mb-6 shadow-xs">
          <Sparkles className="w-4 h-4 text-amber-200" />
          <span>Start Your Story Today</span>
        </div>

        {/* Headline */}
        <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight leading-tight max-w-3xl">
          Ready to Find Someone Who Matches Your Energy?
        </h2>

        {/* Subtitle */}
        <p className="mt-6 text-base sm:text-xl text-white/90 max-w-2xl leading-relaxed font-normal">
          Join a growing community of real people looking for genuine chemistry. Setting up your profile 
          takes less than two minutes.
        </p>

        {/* Primary Pill Button */}
        <div className="mt-10">
          <Link
            to="/register"
            className="inline-flex items-center gap-3 px-10 py-4.5 rounded-full font-black text-base sm:text-lg text-brand-text bg-white shadow-2xl hover:bg-neutral-50 hover:scale-105 active:scale-95 transition-all duration-200 select-none group"
          >
            <span>Create Your Free Account</span>
            <ArrowRight className="w-5 h-5 text-brand-accent group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Micro-assurances */}
        <p className="mt-6 text-xs sm:text-sm text-white/80 font-medium">
          Free Forever • Verified Profiles • Cancel Anytime
        </p>
      </div>
    </section>
  );
};
