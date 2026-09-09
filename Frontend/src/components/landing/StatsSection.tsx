import React from 'react';

/**
 * NOTE: The metrics below are placeholder/example numbers for the Matcha landing demonstration.
 * In production, these can be hooked up to dynamic backend aggregation endpoints.
 */
const stats = [
  {
    value: '250K+',
    label: 'Mutual Matches Made',
    description: 'Real connections sparked across the platform',
  },
  {
    value: '99.4%',
    label: 'Verified Member Profiles',
    description: 'Safe community backed by email confirmation',
  },
  {
    value: '15M+',
    label: 'Messages Exchanged',
    description: 'Real-time conversations that break the ice',
  },
  {
    value: '4.9 ★',
    label: 'Community Satisfaction',
    description: 'Rated for authentic experience and clean design',
  },
];

export const StatsSection: React.FC = () => {
  return (
    <section className="relative py-16 sm:py-24 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white shadow-inner overflow-hidden">
      {/* Subtle background decorative shapes */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <span className="text-xs uppercase tracking-widest font-extrabold text-white/80 bg-white/15 px-3 py-1 rounded-full backdrop-blur-xs">
            Community Milestones
          </span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black mt-3 tracking-tight">
            Real Impact, Real People
          </h2>
        </div>

        {/* 2 columns on mobile, 4 columns on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="bg-white/10 backdrop-blur-md rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-white/20 text-center hover:bg-white/15 hover:scale-105 transition-all duration-300 flex flex-col justify-center"
            >
              <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-sm">
                {stat.value}
              </div>
              <div className="mt-2 sm:mt-3 text-xs sm:text-sm md:text-base font-bold text-white/95 leading-snug">
                {stat.label}
              </div>
              <p className="mt-1 text-[11px] sm:text-xs text-white/80 hidden sm:block">
                {stat.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
