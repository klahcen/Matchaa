import React from 'react';
import { ShieldCheck, EyeOff, UserX, CheckCircle } from 'lucide-react';

const safetyPillars = [
  {
    icon: ShieldCheck,
    title: 'Verified Member Identity',
    description:
      'Every account must complete email verification before browsing or chatting. No spam scripts, no unverified impersonators — just genuine singles.',
    highlights: ['Email token authentication', 'Account integrity monitoring'],
  },
  {
    icon: EyeOff,
    title: 'Location Privacy Protection',
    description:
      'We protect your personal space. Matcha calculates geographic distance without ever showing your GPS coordinates or exact home street address.',
    highlights: ['Approximate radius only', 'Zero pinpoint location tracking'],
  },
  {
    icon: UserX,
    title: 'Zero-Tolerance Safety Controls',
    description:
      'You are in full control of your dating journey. Block unwanted users with a single tap, report inappropriate behavior, and browse without compromise.',
    highlights: ['Instant 1-click block', 'Proactive safety moderation'],
  },
];

export const SafetySection: React.FC = () => {
  return (
    <section id="safety" className="py-24 sm:py-32 bg-brand-bg relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-brand-surface border border-brand-border text-xs font-bold uppercase tracking-wider text-emerald-700 mb-4 shadow-xs">
            Trust & Security First
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-brand-text tracking-tight">
            Your Safety Is Never an Afterthought
          </h2>
          <p className="mt-4 text-base sm:text-lg text-brand-muted leading-relaxed">
            Dating should be fun, exciting, and above all, safe. We've baked industry-standard security 
            and respectful moderation tools into every corner of Matcha.
          </p>
        </div>

        {/* 3 Safety Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {safetyPillars.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <div
                key={index}
                className="bg-brand-surface rounded-3xl p-8 border border-brand-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mb-6 shadow-sm">
                    <Icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-brand-text mb-3">
                    {pillar.title}
                  </h3>
                  <p className="text-sm text-brand-muted leading-relaxed">
                    {pillar.description}
                  </p>
                </div>

                {/* Highlights */}
                <div className="mt-6 pt-5 border-t border-brand-border space-y-2">
                  {pillar.highlights.map((highlight, hIndex) => (
                    <div key={hIndex} className="flex items-center gap-2 text-xs font-semibold text-brand-text">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{highlight}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Reassurance Footer Banner */}
        <div className="mt-12 bg-brand-surface rounded-2xl p-6 border border-brand-border text-center text-sm text-brand-muted max-w-2xl mx-auto shadow-xs">
          Have questions or noticed something suspicious? Our community guidelines are strictly enforced to 
          guarantee a positive, respectful experience for everyone.
        </div>
      </div>
    </section>
  );
};
