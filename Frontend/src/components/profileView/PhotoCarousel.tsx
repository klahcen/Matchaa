import React, { useRef, useState } from 'react';
import { resolveMediaUrl } from '../../api/profile';
import type { PublicPhoto } from '../../types/users';

interface PhotoCarouselProps {
  photos: PublicPhoto[];
  fullName: string;
}

/** Horizontal swipe distance (px) that flips to the next/previous photo. */
const SWIPE_THRESHOLD_PX = 40;

/**
 * Photo gallery for the public profile view — the profile picture first
 * (backend already sorts photos that way), with arrow buttons on desktop and
 * touch swipe on mobile. Falls back to an initials tile when there are no
 * photos, matching the SuggestionCard placeholder style.
 */
export const PhotoCarousel: React.FC<PhotoCarouselProps> = ({ photos, fullName }) => {
  const [rawIndex, setRawIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  // Derived, not synced via effect: clamps the cursor if the photo list ever
  // changes underneath us without triggering a cascading render.
  const index = photos.length > 0 ? Math.min(rawIndex, photos.length - 1) : 0;

  const goPrev = () => setRawIndex((index - 1 + photos.length) % photos.length);
  const goNext = () => setRawIndex((index + 1) % photos.length);

  const initials =
    fullName
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  if (photos.length === 0) {
    return (
      <div className="relative w-full aspect-[4/5] rounded-3xl overflow-hidden bg-gradient-to-br from-brand-start/15 via-brand-mid/15 to-brand-end/15 flex items-center justify-center">
        <span className="text-7xl font-black text-brand-accent/50">{initials}</span>
        <p className="absolute bottom-4 left-0 right-0 text-center text-xs font-semibold text-brand-muted">
          No photos yet
        </p>
      </div>
    );
  }

  const hasMany = photos.length > 1;

  return (
    <div
      className="relative w-full aspect-[4/5] rounded-3xl overflow-hidden bg-brand-bg select-none"
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null || !hasMany) return;
        const delta = event.changedTouches[0].clientX - touchStartX.current;
        if (delta <= -SWIPE_THRESHOLD_PX) goNext();
        else if (delta >= SWIPE_THRESHOLD_PX) goPrev();
        touchStartX.current = null;
      }}
    >
      {/* Sliding track */}
      <div
        className="flex h-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {photos.map((photo, photoIndex) => (
          <img
            key={photo.id}
            src={resolveMediaUrl(photo.url) ?? ''}
            alt={`${fullName}'s photo ${photoIndex + 1} of ${photos.length}`}
            draggable={false}
            className="w-full h-full shrink-0 object-cover"
          />
        ))}
      </div>

      {/* Counter */}
      {hasMany && (
        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white text-[11px] font-black tracking-wide">
          {index + 1} / {photos.length}
        </div>
      )}

      {/* Profile picture marker */}
      {photos[index]?.is_profile_picture && (
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white text-[10px] font-black uppercase tracking-wider shadow-md">
          Main photo
        </div>
      )}

      {hasMany && (
        <>
          {/* Arrows */}
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Dots */}
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {photos.map((photo, dotIndex) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setRawIndex(dotIndex)}
                aria-label={`Go to photo ${dotIndex + 1}`}
                className={`h-2 rounded-full transition-all duration-200 ${
                  dotIndex === index ? 'w-5 bg-white' : 'w-2 bg-white/55 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
