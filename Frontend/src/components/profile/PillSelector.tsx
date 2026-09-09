import React from 'react';

interface PillSelectorProps<T extends string> {
  label: string;
  options: readonly T[];
  value: string | null | undefined;
  onChange: (value: T) => void;
  name: string;
  hint?: string;
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
}: PillSelectorProps<T>): React.ReactElement => {
  return (
    <fieldset className="w-full flex flex-col mb-4">
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
              className={`cursor-pointer px-4 py-2 rounded-full text-sm font-semibold capitalize transition-all duration-200 select-none border-2 ${
                selected
                  ? 'bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white border-transparent shadow-lg shadow-brand-accent/25'
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
    </fieldset>
  );
};
