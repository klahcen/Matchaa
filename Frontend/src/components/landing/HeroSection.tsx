import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Sparkles, Shield, Heart } from 'lucide-react';

/**
 * Hero Headline Variations:
 * Option 1 (Selected): "Where Chemistry Begins"
 * Option 2: "Spark Something Real"
 * Option 3: "Real People. Genuine Sparks."
 */

export const HeroSection: React.FC = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-neutral-950 text-white pt-20 pb-16">
      {/* Background Decorative Gradients & Mesh Glow */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        {/* Top-right vibrant glow */}
        <div className="absolute -top-32 -right-32 w-[550px] h-[550px] rounded-full bg-gradient-to-br from-brand-start/30 via-brand-mid/25 to-transparent blur-3xl" />
        
        {/* Bottom-left warm coral glow */}
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-brand-end/25 via-brand-start/20 to-transparent blur-3xl" />
        
        {/* Center ambient halo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-radial from-brand-start/15 via-transparent to-transparent blur-2xl" />

        {/* Subtle grid pattern overlay for modern tech feel */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
        {/* Subtle top pill badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-rose-200 text-xs sm:text-sm font-semibold tracking-wide uppercase mb-8 shadow-inner animate-pulse">
          <Sparkles className="w-4 h-4 text-brand-mid" />
          <span>The Modern Way to Connect</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[1.08] max-w-4xl text-white">
          Where{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-start via-brand-mid to-brand-end">
            Chemistry
          </span>{' '}
          Begins.
        </h1>

        {/* Subheadline */}
        <p className="mt-6 text-lg sm:text-xl md:text-2xl text-neutral-300 font-normal max-w-2xl mx-auto leading-relaxed">
          Break the ice with people who share your vibe, your passions, and your energy. 
          Real matches. Real people. Zero guessing games.
        </p>

        {/* Dual Call-to-Action Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
          {/* Primary Pill Button */}
          <Link
            to="/register"
            className="w-full sm:w-auto px-9 py-4 rounded-full font-extrabold text-base sm:text-lg text-white bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-xl shadow-brand-accent/30 hover:shadow-2xl hover:shadow-brand-accent/45 hover:scale-105 active:scale-95 transition-all duration-200 text-center select-none"
          >
            Create Account
          </Link>

          {/* Secondary Pill Button */}
          <Link
            to="/login"
            className="w-full sm:w-auto px-9 py-4 rounded-full font-extrabold text-base sm:text-lg text-white border-2 border-white/70 hover:border-white hover:bg-white/10 active:scale-95 transition-all duration-200 text-center select-none"
          >
            Log In
          </Link>
        </div>

        {/* Trust Badges */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs sm:text-sm text-neutral-400 font-medium">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand-mid" />
            <span>Verified Profiles Only</span>
          </div>
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-brand-start" />
            <span>Mutual Likes Only</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-end" />
            <span>Free to Join</span>
          </div>
        </div>
      </div>

      {/* Subtle Scroll-Down Indicator */}
      <a
        href="#how-it-works"
        aria-label="Scroll down to How It Works"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-neutral-400 hover:text-white transition-colors duration-200 group"
      >
        <span className="text-xs uppercase tracking-widest font-semibold opacity-70 group-hover:opacity-100 transition-opacity">
          Explore
        </span>
        <ChevronDown className="w-5 h-5 animate-bounce text-brand-mid" />
      </a>
    </section>
  );
};
