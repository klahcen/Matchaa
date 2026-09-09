import React from 'react';
import { Tag, MessageSquare, ShieldCheck, Heart, Sparkles, CheckCircle2, Lock, MapPin } from 'lucide-react';

export const FeaturesSection: React.FC = () => {
  return (
    <section id="features" className="py-24 sm:py-32 bg-brand-surface overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-brand-bg border border-brand-border text-xs font-bold uppercase tracking-wider text-brand-accent mb-4">
            Designed for Modern Singles
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-brand-text tracking-tight">
            Built for Authentic Chemistry
          </h2>
          <p className="mt-4 text-base sm:text-lg text-brand-muted leading-relaxed">
            Every feature on Matcha is crafted to strip away awkwardness, foster genuine conversation, 
            and help you connect with people who actually match your energy.
          </p>
        </div>

        <div className="space-y-24 sm:space-y-32">
          {/* Feature Block 1: Image Left, Text Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Visual Column */}
            <div className="lg:col-span-6 order-2 lg:order-1">
              <div className="relative group">
                {/* Ambient glow backdrop */}
                <div className="absolute -inset-4 bg-gradient-to-tr from-brand-start/20 to-brand-end/20 rounded-3xl blur-2xl group-hover:opacity-100 opacity-60 transition-opacity" />

                {/* Main Card Container */}
                <div className="relative aspect-[4/3] sm:aspect-[16/11] rounded-3xl overflow-hidden bg-gradient-to-br from-brand-start via-brand-mid to-brand-end p-6 sm:p-8 flex flex-col justify-between shadow-2xl text-white">
                  {/* Subtle Background Shapes */}
                  <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/10 blur-xl pointer-events-none" />
                  
                  {/* Top Header Badge */}
                  <div className="flex items-center justify-between z-10">
                    <span className="px-3 py-1 rounded-full bg-black/20 backdrop-blur-md text-xs font-semibold tracking-wide flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      94% Match Compatibility
                    </span>
                    <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                      <Heart className="w-5 h-5 fill-white text-white" />
                    </div>
                  </div>

                  {/* Profile Mockup Information */}
                  <div className="z-10 bg-black/30 backdrop-blur-md rounded-2xl p-5 border border-white/15">
                    <div className="flex items-baseline justify-between">
                      <h4 className="text-xl sm:text-2xl font-black">
                        Camille, 25
                      </h4>
                      <span className="text-xs font-medium text-rose-200 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> 3 miles away
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-white/90 mt-1 font-light">
                      Architect & specialty coffee enthusiast. Let’s trade playlist favorites.
                    </p>

                    {/* Shared Tags */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                        #MatchaLatte
                      </span>
                      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                        #ModernArt
                      </span>
                      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                        #IndieRock
                      </span>
                      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                        #Bouldering
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Text Column */}
            <div className="lg:col-span-6 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-bg text-xs font-bold uppercase tracking-wider text-brand-accent mb-4 border border-brand-border">
                <Tag className="w-3.5 h-3.5" />
                Interest-Driven Matching
              </div>
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-brand-text tracking-tight leading-tight">
                Spark Connections Around Common Ground
              </h3>
              <p className="mt-4 text-base sm:text-lg text-brand-muted leading-relaxed">
                Never stare at a blank screen again. Matcha pairs you based on shared interest tags, 
                geographic proximity, and authentic community ratings — giving you natural conversation starters 
                before you even say hello.
              </p>

              <div className="mt-6 space-y-3.5 text-sm sm:text-base text-brand-text font-medium">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-accent shrink-0" />
                  <span>Dynamic interest tags that reveal instant mutual passions</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-accent shrink-0" />
                  <span>Configurable distance radius to connect locally or across town</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-accent shrink-0" />
                  <span>Smart fame rating that rewards genuine, active community members</span>
                </div>
              </div>
            </div>
          </div>

          {/* Feature Block 2: Text Left, Image Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Text Column */}
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-bg text-xs font-bold uppercase tracking-wider text-brand-mid mb-4 border border-brand-border">
                <MessageSquare className="w-3.5 h-3.5" />
                Real-Time Messaging
              </div>
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-brand-text tracking-tight leading-tight">
                Conversations That Never Miss a Beat
              </h3>
              <p className="mt-4 text-base sm:text-lg text-brand-muted leading-relaxed">
                When spark hits, momentum is everything. Experience lightning-fast direct messaging 
                with live typing indicators, instant notifications, and active presence status so you can keep the 
                conversation moving forward.
              </p>

              <div className="mt-6 space-y-3.5 text-sm sm:text-base text-brand-text font-medium">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-mid shrink-0" />
                  <span>Real-time instant messaging powered by live WebSockets</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-mid shrink-0" />
                  <span>Live presence status to know when your match is active</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-mid shrink-0" />
                  <span>Instant push alerts when someone views or likes your profile</span>
                </div>
              </div>
            </div>

            {/* Visual Column */}
            <div className="lg:col-span-6">
              <div className="relative group">
                {/* Ambient glow */}
                <div className="absolute -inset-4 bg-gradient-to-br from-brand-mid/20 to-brand-end/20 rounded-3xl blur-2xl group-hover:opacity-100 opacity-60 transition-opacity" />

                {/* Mock Chat Card Container */}
                <div className="relative aspect-[4/3] sm:aspect-[16/11] rounded-3xl overflow-hidden bg-gradient-to-tr from-stone-900 via-neutral-900 to-stone-950 p-6 sm:p-8 flex flex-col justify-between shadow-2xl text-white border border-neutral-800">
                  {/* Chat Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-white/10 z-10">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end flex items-center justify-center font-bold text-sm">
                          L
                        </div>
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-neutral-900" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold">Liam</h4>
                        <span className="text-[11px] text-emerald-400 font-medium">Online now</span>
                      </div>
                    </div>
                    <span className="text-xs text-neutral-400 font-medium">Matched today</span>
                  </div>

                  {/* Chat Message Stream */}
                  <div className="space-y-3 z-10 my-auto py-2">
                    <div className="flex justify-start">
                      <div className="max-w-[80%] bg-neutral-800 text-neutral-100 rounded-2xl rounded-tl-sm px-4 py-2.5 text-xs sm:text-sm">
                        Hey! I noticed you enjoy indie coffee roasters ☕ Have you tried the new spot downtown?
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="max-w-[80%] bg-gradient-to-r from-brand-start to-brand-mid text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs sm:text-sm shadow-md">
                        Yes! Their cold brew is unbelievable. We should definitely grab one sometime!
                      </div>
                    </div>
                    {/* Typing indicator */}
                    <div className="flex items-center gap-1.5 text-neutral-400 text-xs px-2">
                      <span className="italic">Liam is typing</span>
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>

                  {/* Mock Input Field */}
                  <div className="z-10 bg-neutral-800/80 rounded-full px-4 py-2.5 flex items-center justify-between text-xs text-neutral-400 border border-white/5">
                    <span>Type a message...</span>
                    <div className="w-7 h-7 rounded-full bg-gradient-to-r from-brand-start to-brand-mid flex items-center justify-center text-white font-bold">
                      ↑
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature Block 3: Image Left, Text Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Visual Column */}
            <div className="lg:col-span-6 order-2 lg:order-1">
              <div className="relative group">
                {/* Ambient glow */}
                <div className="absolute -inset-4 bg-gradient-to-br from-brand-start/20 via-brand-mid/15 to-brand-end/20 rounded-3xl blur-2xl group-hover:opacity-100 opacity-60 transition-opacity" />

                {/* Safety & Trust Card Container */}
                <div className="relative aspect-[4/3] sm:aspect-[16/11] rounded-3xl overflow-hidden bg-gradient-to-bl from-neutral-900 via-stone-900 to-rose-950 p-6 sm:p-8 flex flex-col justify-between shadow-2xl text-white border border-rose-900/30">
                  <div className="flex items-center justify-between z-10">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-start via-brand-mid to-brand-end flex items-center justify-center shadow-lg shadow-brand-accent/30">
                      <ShieldCheck className="w-6 h-6 text-white" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-brand-accent/20 text-rose-300 border border-brand-accent/30 text-xs font-bold tracking-wide">
                      Safety Protocol
                    </span>
                  </div>

                  {/* Safety Feature Checklist */}
                  <div className="z-10 space-y-3 bg-black/40 backdrop-blur-md rounded-2xl p-5 border border-white/10">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="font-semibold text-white">Email Address Verification</span>
                      </div>
                      <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                        Enforced
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="flex items-center gap-2.5">
                        <Lock className="w-4 h-4 text-rose-400" />
                        <span className="font-semibold text-white">Precise Location Masking</span>
                      </div>
                      <span className="text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md">
                        Protected
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-amber-400" />
                        <span className="font-semibold text-white">Proactive Block & Report</span>
                      </div>
                      <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
                        1-Click
                      </span>
                    </div>
                  </div>

                  <p className="z-10 text-xs text-neutral-400 font-light">
                    Every member joins with confidence. Zero spam, zero fake profiles.
                  </p>
                </div>
              </div>
            </div>

            {/* Text Column */}
            <div className="lg:col-span-6 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-bg text-xs font-bold uppercase tracking-wider text-brand-accent mb-4 border border-brand-border">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified & Protected
              </div>
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-brand-text tracking-tight leading-tight">
                Authentic People. Complete Peace of Mind.
              </h3>
              <p className="mt-4 text-base sm:text-lg text-brand-muted leading-relaxed">
                Online dating should feel thrilling, not stressful. We protect your space with mandatory email 
                activation, strict privacy boundaries that never broadcast your exact location, and zero tolerance 
                for disrespectful conduct.
              </p>

              <div className="mt-6 space-y-3.5 text-sm sm:text-base text-brand-text font-medium">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-accent shrink-0" />
                  <span>Mandatory email verification prevents bot profiles and spam</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-accent shrink-0" />
                  <span>Location privacy ensures only approximate distances are displayed</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand-accent shrink-0" />
                  <span>Instant block and reporting controls at your fingertips anytime</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
