import React, { useState } from 'react';

interface AimaLogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'color';
  size?: 'sm' | 'md' | 'lg';
}

export const AimaLogo: React.FC<AimaLogoProps> = ({
  className = '',
  variant = 'light',
  size = 'md',
}) => {
  const [imgError, setImgError] = useState(false);
  const logoHeight = size === 'sm' ? 'h-8' : size === 'lg' ? 'h-12' : 'h-10';
  const textColor = variant === 'dark' ? 'text-slate-900' : 'text-white';
  const subtextColor = variant === 'dark' ? 'text-slate-600' : 'text-slate-300';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Official AIMA Logo Image from https://www.aima.in/img/logo.png */}
      <img
        src={imgError ? '/aima-icrc-logo-standard.png' : 'https://www.aima.in/img/logo.png'}
        alt="All India Management Association"
        onError={() => setImgError(true)}
        className={`${logoHeight} w-auto object-contain shrink-0 bg-white/90 p-1 rounded`}
      />

      {/* Brand Wordmark & Subtitle */}
      <div className="flex flex-col leading-tight">
        <div className="flex items-center gap-2">
          <span className={`font-bold tracking-tight text-base sm:text-lg ${textColor}`}>
            AIMA
          </span>
          <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-amber-500" />
          <span className={`hidden sm:inline-block text-xs uppercase tracking-wider font-semibold ${textColor}`}>
            All India Management Association
          </span>
        </div>
        <span className={`text-[11px] sm:text-xs tracking-tight ${subtextColor}`}>
          Centralized Payment Hub <span className="text-amber-500 font-medium">· Gateway MIS</span>
        </span>
      </div>
    </div>
  );
};
