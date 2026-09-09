import React from 'react';

interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  id: string;
  error?: string | null;
  hint?: string;
  maxLength?: number;
}

/**
 * Multiline counterpart to FormInput, sharing its exact styling so forms stay
 * visually consistent. Used for the profile biography.
 */
export const FormTextarea: React.FC<FormTextareaProps> = ({
  label,
  id,
  error,
  hint,
  className = '',
  disabled,
  maxLength,
  value,
  ...props
}) => {
  const currentLength = typeof value === 'string' ? value.length : 0;

  return (
    <div className="w-full flex flex-col mb-4">
      <div className="flex justify-between items-center mb-1.5">
        <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-brand-text">
          {label}
        </label>
        {hint && <span className="text-xs text-brand-muted">{hint}</span>}
      </div>

      <textarea
        id={id}
        disabled={disabled}
        maxLength={maxLength}
        value={value}
        className={`w-full min-h-[120px] px-4 py-3 text-sm bg-brand-bg/80 border ${
          error
            ? 'border-brand-error-text/60 focus:border-brand-error-text focus:ring-brand-error-bg'
            : 'border-brand-border focus:border-brand-accent focus:ring-brand-accent/20'
        } rounded-xl text-brand-text placeholder-brand-muted/70 outline-none transition-all duration-150 focus:bg-brand-surface focus:ring-3 disabled:bg-gray-100 disabled:cursor-not-allowed resize-y ${className}`}
        {...props}
      />

      <div className="flex justify-between items-center mt-1.5">
        {error ? (
          <p className="text-xs text-brand-error-text font-medium flex items-center gap-1">
            <svg className="w-3.5 h-3.5 shrink-0 fill-current" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </p>
        ) : (
          <span />
        )}
        {maxLength && (
          <span
            className={`text-xs ${
              currentLength >= maxLength ? 'text-brand-error-text font-semibold' : 'text-brand-muted'
            }`}
          >
            {currentLength}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
};
