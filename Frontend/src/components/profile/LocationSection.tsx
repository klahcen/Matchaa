import React, { useRef, useState } from 'react';
import { PrimaryButton } from '../common/PrimaryButton';

interface LocationSectionProps {
  /** Currently stored readable location, e.g. "Casablanca, Morocco". */
  savedText: string | null;
  /** True when precise GPS coordinates are stored (i.e. the user consented). */
  hasGps: boolean;
  /** Persists GPS coordinates; the backend reverse-geocodes them into text. */
  onSaveGps: (lat: number, lng: number) => Promise<string>;
  /** Persists a manually typed approximate location. */
  onSaveManual: (text: string) => Promise<string>;
  onError: (message: string) => void;
}

const MAX_LOCATION_LENGTH = 255;

/**
 * Location capture with EXPLICIT consent.
 *
 * The explanatory card is rendered first and the browser's native permission
 * prompt is only triggered after the user actively clicks "Share my location" —
 * geolocation is never requested silently on mount.
 *
 * A manual text input is always visible as the fallback, because an approximate
 * location is required for Matcha to work: if the user declines GPS or their
 * device cannot provide it, they must type a city or neighborhood instead.
 *
 * After a successful GPS share the resolved, coarse location_text is shown back
 * to the user so they can see exactly what becomes public. Precise lat/lng are
 * never displayed and never exposed to other users.
 */
export const LocationSection: React.FC<LocationSectionProps> = ({
  savedText,
  hasGps,
  onSaveGps,
  onSaveManual,
  onError,
}) => {
  const [consentStep, setConsentStep] = useState<'explain' | 'locating'>('explain');
  const [manualText, setManualText] = useState(savedText ?? '');
  const [syncedSavedText, setSyncedSavedText] = useState(savedText);
  const [savingManual, setSavingManual] = useState(false);
  const [resolvedText, setResolvedText] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [gpsUnsupported, setGpsUnsupported] = useState(false);

  const manualInputRef = useRef<HTMLInputElement>(null);

  // Keep the manual field in step with the stored value when it changes from
  // elsewhere (e.g. right after a GPS share). Uses React's render-phase
  // adjustment pattern rather than an effect, so there is no extra render pass.
  if (savedText !== syncedSavedText) {
    setSyncedSavedText(savedText);
    setManualText(savedText ?? '');
  }

  const focusManualInput = () => {
    setConsentStep('explain');
    // Defer so the focus lands after any re-render triggered by the click.
    setTimeout(() => manualInputRef.current?.focus(), 0);
  };

  /**
   * Triggers the browser permission prompt — only ever from an explicit click.
   */
  const handleShareLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsUnsupported(true);
      onError(
        'Geolocation is not available in this browser. Please enter your city or neighborhood manually below.'
      );
      focusManualInput();
      return;
    }

    setConsentStep('locating');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const text = await onSaveGps(position.coords.latitude, position.coords.longitude);
          setResolvedText(text);
        } catch (err: any) {
          onError(err?.message || 'Could not resolve your location. Please enter it manually.');
          focusManualInput();
        } finally {
          setConsentStep('explain');
        }
      },
      (error) => {
        setConsentStep('explain');
        if (error.code === error.PERMISSION_DENIED) {
          onError(
            'Location access was denied. Matcha still needs an approximate location — please type your city or neighborhood below.'
          );
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          onError('Your position is unavailable right now. Please enter your location manually below.');
        } else {
          onError('Locating timed out. Please try again or enter your location manually below.');
        }
        focusManualInput();
      },
      // Low accuracy is enough for neighborhood level, and is the most
      // privacy-respecting option that still satisfies the feature.
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  };

  const handleManualSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = manualText.trim();

    if (trimmed.length < 2) {
      setManualError('Please enter at least 2 characters, e.g. "Casablanca" or "Maârif".');
      return;
    }
    if (trimmed.length > MAX_LOCATION_LENGTH) {
      setManualError(`Location must not exceed ${MAX_LOCATION_LENGTH} characters.`);
      return;
    }

    setManualError(null);
    setSavingManual(true);
    try {
      const text = await onSaveManual(trimmed);
      setResolvedText(text);
    } catch (err: any) {
      setManualError(err?.message || 'Failed to save your location');
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <div>
      {/* Current public location */}
      <div className="flex flex-wrap items-center gap-3 mb-4 p-4 rounded-2xl bg-brand-bg border border-brand-border">
        <div className="w-10 h-10 shrink-0 rounded-full bg-brand-accent/10 flex items-center justify-center text-brand-accent">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">
            {hasGps ? 'Public location (from GPS)' : 'Public location'}
          </p>
          <p className="text-sm font-bold text-brand-text truncate">
            {savedText || 'Not set yet — required to find matches near you'}
          </p>
        </div>
      </div>

      {/* Consent card — shown BEFORE any browser permission prompt */}
      <div className="rounded-2xl border-2 border-brand-accent/20 bg-brand-accent/5 p-4 sm:p-5 mb-5">
        <p className="text-sm text-brand-text leading-relaxed">
          <span className="font-bold">Matcha uses your location to help you find matches nearby.</span>{' '}
          We only use this to show your general neighborhood, never your exact address.
        </p>
        <p className="text-xs text-brand-muted mt-2">
          Your precise coordinates stay private. Other members only ever see the resolved
          neighborhood/city text.
        </p>

        {resolvedText && (
          <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 mt-3">
            Visible to other members: <span className="font-black">{resolvedText}</span>
          </p>
        )}

        {gpsUnsupported && (
          <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3">
            This browser cannot share GPS position. Please use the manual field below.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
          <PrimaryButton
            type="button"
            onClick={handleShareLocation}
            loading={consentStep === 'locating'}
            disabled={consentStep === 'locating'}
            className="sm:flex-1"
          >
            {consentStep === 'locating' ? 'Locating...' : 'Share my location'}
          </PrimaryButton>
          <PrimaryButton
            type="button"
            variant="outline"
            onClick={focusManualInput}
            disabled={consentStep === 'locating'}
            className="sm:flex-1"
          >
            Enter manually instead
          </PrimaryButton>
        </div>
      </div>

      {/* Manual fallback — always visible */}
      <form onSubmit={handleManualSave} noValidate>
        <div className="flex justify-between items-center mb-1.5">
          <label
            htmlFor="location-manual"
            className="text-xs font-semibold uppercase tracking-wider text-brand-text"
          >
            Approximate location
          </label>
          <span className="text-xs text-brand-muted">Required</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            ref={manualInputRef}
            id="location-manual"
            type="text"
            value={manualText}
            maxLength={MAX_LOCATION_LENGTH}
            onChange={(e) => {
              setManualText(e.target.value);
              if (manualError) setManualError(null);
            }}
            placeholder="e.g. Casablanca, or Maârif"
            autoComplete="off"
            aria-invalid={Boolean(manualError)}
            aria-describedby={manualError ? 'location-manual-error' : undefined}
            className={`flex-1 min-h-[46px] px-4 py-2.5 text-sm bg-brand-bg/80 border rounded-xl text-brand-text placeholder-brand-muted/70 outline-none transition-all duration-150 focus:bg-brand-surface focus:ring-3 ${
              manualError
                ? 'border-brand-error-text/60 focus:border-brand-error-text focus:ring-brand-error-bg'
                : 'border-brand-border focus:border-brand-accent focus:ring-brand-accent/20'
            }`}
          />
          <PrimaryButton
            type="submit"
            variant="outline"
            loading={savingManual}
            disabled={savingManual || manualText.trim().length < 2}
            className="sm:w-auto sm:px-7"
          >
            Save location
          </PrimaryButton>
        </div>

        {manualError ? (
          <p
            id="location-manual-error"
            className="text-xs text-brand-error-text font-medium mt-2 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5 shrink-0 fill-current" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{manualError}</span>
          </p>
        ) : (
          <p className="text-xs text-brand-muted mt-2">
            Used when you decline GPS or your device cannot provide a position. You can change it at
            any time.
          </p>
        )}
      </form>
    </div>
  );
};
