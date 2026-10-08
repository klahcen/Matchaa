import React from 'react';

interface FormSelectOption {
  value: string;
  label: string;
}

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  id: string;
  options: FormSelectOption[];
  /** Disabled first option shown while nothing is chosen, e.g. "Select...". */
  placeholder?: string;
  error?: string | null;
  hint?: string;
}

/**
 * Native <select> styled exactly like FormInput (label row, rounded field,
 * error line), so mixed forms stay visually consistent.
 */
export const FormSelect: React.FC<FormSelectProps> = ({
  label,
  id,
  options,
  placeholder,
  error,
  hint,
  className = '',
  ...props
}) => {
  const errorId = `${id}-error`;

  return (
    <div className="w-full flex flex-col mb-4">
      <div className="flex justify-between items-center mb-1.5">
        <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-brand-text">
          {label}
        </label>
        {hint && <span className="text-xs text-brand-muted">{hint}</span>}
      </div>

      <div className="relative flex items-center">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`w-full min-h-[46px] appearance-none pl-4 pr-10 py-2.5 text-sm bg-brand-bg/80 border ${
            error
              ? 'border-brand-error-text/60 focus:border-brand-error-text focus:ring-brand-error-bg'
              : 'border-brand-border focus:border-brand-accent focus:ring-brand-accent/20'
          } rounded-xl text-brand-text outline-none transition-all duration-150 focus:bg-brand-surface focus:ring-3 disabled:bg-gray-100 disabled:cursor-not-allowed cursor-pointer ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          className="w-4 h-4 absolute right-4 text-brand-muted pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {error && (
        <p id={errorId} className="text-xs text-brand-error-text font-medium mt-1.5 flex items-center gap-1 transition-opacity duration-200">
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
    </div>
  );
};
