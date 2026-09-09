import React from 'react';
import { UserCheck, Compass, HeartHandshake, MessageCircle } from 'lucide-react';

const steps = [
  {
    step: '01',
    icon: UserCheck,
    title: 'Create Your Profile',
    description:
      'Curate your personal photos, craft a bio that speaks your language, and highlight your passions with interest tags.',
  },
  {
    step: '02',
    icon: Compass,
    title: 'Discover People Nearby',
    description:
      'Explore profiles in your local radius filtered by distance, age, shared interests, and popularity score in real time.',
  },
  {
    step: '03',
    icon: HeartHandshake,
    title: 'Match & Connect',
    description:
      'Spark mutual interest. When you both like each other, it’s an instant match — no unsolicited cold messages or spam.',
  },
  {
    step: '04',
    icon: MessageCircle,
    title: 'Start Chatting',
    description:
      'Break the ice with effortless real-time chat, live typing indicators, and instant notifications to keep the chemistry flowing.',
  },
];

export const HowItWorksSection: React.FC = () => {
  return (
    <section id="how-it-works" className="py-24 sm:py-32 bg-brand-bg relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-brand-surface border border-brand-border text-xs font-bold uppercase tracking-wider text-brand-accent mb-4 shadow-xs">
            Simple & Seamless
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-brand-text tracking-tight">
            How Matcha Works
          </h2>
          <p className="mt-4 text-base sm:text-lg text-brand-muted leading-relaxed">
            Finding meaningful connections shouldn't be complicated. Here is how four simple 
            steps bring you closer to people who match your frequency.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {steps.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="group relative bg-brand-surface rounded-3xl p-7 sm:p-8 border border-brand-border shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  {/* Top Row: Icon & Step Badge */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-start via-brand-mid to-brand-end flex items-center justify-center text-white shadow-md shadow-brand-accent/20 group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-7 h-7" />
                    </div>
                    <span className="text-3xl font-black text-brand-border group-hover:text-brand-accent/40 transition-colors">
                      {item.step}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-xl font-bold text-brand-text group-hover:text-brand-accent transition-colors mb-3">
                    {item.title}
                  </h3>
                  <p className="text-sm text-brand-muted leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {/* Subtle bottom indicator line */}
                <div className="mt-6 pt-4 border-t border-brand-border/60 flex items-center gap-2 text-xs font-semibold text-brand-muted group-hover:text-brand-mid transition-colors">
                  <span>Step {index + 1} of 4</span>
                  <div className="h-0.5 flex-1 bg-brand-border group-hover:bg-gradient-to-r group-hover:from-brand-start group-hover:to-brand-end transition-all rounded-full" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
