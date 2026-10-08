import React from 'react';

interface BrandMarkProps {
  /** 'light' = white wordmark (on gradients / dark), 'gradient' = gradient wordmark (on white). */
  tone?: 'light' | 'gradient';
  size?: 'sm' | 'md';
}

/** The flame badge + "matcha" wordmark used by the landing navbar, reused by the shared layouts. */
export const BrandMark: React.FC<BrandMarkProps> = ({ tone = 'light', size = 'md' }) => {
  const badge = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const flame = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const word = size === 'sm' ? 'text-xl' : 'text-2xl';

  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        className={`${badge} rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end flex items-center justify-center shadow-md shadow-brand-accent/25 ${
          tone === 'light' ? 'ring-2 ring-white/40' : ''
        }`}
      >
        <svg className={`${flame} text-white fill-current`} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12.784 1.442c-.224-.59-1.077-.59-1.301 0C10.024 5.3 4.28 10.457 4.28 15.228 4.28 19.52 7.74 23 12 23s7.72-3.48 7.72-7.772c0-4.77-5.744-9.928-6.936-13.786zm-1.03 18.067c-2.348 0-4.252-1.904-4.252-4.252 0-2.228 2.37-5.064 3.864-7.22.18-.26.596-.26.776 0 1.494 2.156 3.864 4.992 3.864 7.22 0 2.348-1.904 4.252-4.252 4.252z" />
        </svg>
      </span>
      <span
        className={`${word} font-black tracking-tight ${
          tone === 'light'
            ? 'text-white'
            : 'text-transparent bg-clip-text bg-gradient-to-r from-brand-start to-brand-end'
        }`}
      >
        matcha
      </span>
    </span>
  );
};
