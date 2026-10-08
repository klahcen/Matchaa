import React from 'react';

interface PillSelectorProps<T extends string> {
  label: string;
  options: readonly T[];
  value: string | null | undefined;
  onChange: (value: T) => void;
  name: string;
  hint?: string;
  /** Validation message shown under the pills (same style as FormInput). */
  error?: string | null;
}

/**
 * Pill-shaped single-select control, matching the app's rounded/gradient style.
 * Used for the fixed value sets (gender, sexual preference).
 */
export const PillSelector = <T extends string>({
  label,
  options,
  value,
  onChange,
  name,
  hint,
  error,
}: PillSelectorProps<T>): React.ReactElement => {
  const errorId = `${name}-error`;

  return (
    <fieldset className="w-full flex flex-col mb-4" aria-describedby={error ? errorId : undefined}>
      <div className="flex justify-between items-center mb-1.5">
        <legend className="text-xs font-semibold uppercase tracking-wider text-brand-text float-left">
          {label}
        </legend>
        {hint && <span className="text-xs text-brand-muted">{hint}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option;
          return (
            <label
              key={option}
              className={`cursor-pointer px-4 py-2 rounded-full text-sm font-semibold capitalize transition-all duration-200 select-none border-2 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand-accent/30 ${
                selected
                  ? 'bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white border-transparent shadow-lg shadow-brand-accent/25'
                  : error
                    ? 'bg-brand-bg text-brand-muted border-brand-error-text/60 hover:border-brand-accent hover:text-brand-accent'
                    : 'bg-brand-bg text-brand-muted border-brand-border hover:border-brand-accent hover:text-brand-accent'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={selected}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              {option}
            </label>
          );
        })}
      </div>

      {error && (
        <p id={errorId} className="text-xs text-brand-error-text font-medium mt-1.5 flex items-center gap-1">
          <svg className="w-3.5 h-3.5 shrink-0 fill-current" viewBox="0 0 20 20" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  );
};
