import React from 'react';

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'gradient' | 'outline' | 'ghost';
  children: React.ReactNode;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  loading = false,
  variant = 'gradient',
  disabled,
  children,
  className = '',
  ...props
}) => {
  const isDisabled = disabled || loading;

  const baseStyles =
    'w-full min-h-[48px] px-6 py-3.5 rounded-full font-bold text-sm tracking-wider uppercase transition-all duration-200 flex items-center justify-center gap-2 select-none';

  let variantStyles = '';
  if (variant === 'gradient') {
    variantStyles =
      'text-white bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-lg shadow-brand-accent/25 hover:shadow-xl hover:shadow-brand-accent/35 hover:brightness-105 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none';
  } else if (variant === 'outline') {
    variantStyles =
      'border-2 border-brand-accent text-brand-accent hover:bg-brand-bg active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';
  } else {
    variantStyles =
      'text-brand-muted hover:text-brand-text hover:bg-brand-bg active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';
  }

  return (
    <button
      disabled={isDisabled}
      className={`${baseStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Processing...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};
