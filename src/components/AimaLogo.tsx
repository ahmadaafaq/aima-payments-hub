import React from 'react';

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
  const iconSize = size === 'sm' ? 32 : size === 'lg' ? 52 : 42;

  const textColor = variant === 'dark' ? 'text-slate-900' : 'text-white';
  const subtextColor = variant === 'dark' ? 'text-slate-600' : 'text-slate-300';
  const emblemBg = variant === 'dark' ? '#002b49' : '#ffffff';
  const emblemText = variant === 'dark' ? '#ffffff' : '#002b49';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Official AIMA Emblem Icon */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-sm"
        aria-label="AIMA Emblem"
      >
        {/* Outer Circular Ring with Gear/Sun Rays */}
        <circle cx="50" cy="50" r="47" stroke="#e88b00" strokeWidth="3.5" fill={emblemBg} />
        <circle cx="50" cy="50" r="42" stroke={variant === 'dark' ? '#002b49' : '#003366'} strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
        
        {/* Inner Shield / Hexagonal crest */}
        <path
          d="M50 15 L78 28 V56 C78 72 50 85 50 85 C50 85 22 72 22 56 V28 Z"
          fill={variant === 'dark' ? '#002b49' : '#0a4b78'}
        />

        {/* Tricolor Accent Lines */}
        <path d="M30 38 L50 38 L70 38" stroke="#ff9933" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M32 43 L50 43 L68 43" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M34 48 L50 48 L66 48" stroke="#138808" strokeWidth="2.5" strokeLinecap="round" />

        {/* Open Book / Torch Motif representing Management Wisdom */}
        <path
          d="M40 68 C45 66 49 67 50 71 C51 67 55 66 60 68 V57 C55 55 51 56 50 59 C49 56 45 55 40 57 Z"
          fill="#ffb703"
        />
        <circle cx="50" cy="54" r="3" fill="#ffb703" />

        {/* Text 'AIMA' in center crest */}
        <text
          x="50"
          y="32"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="11"
          fontWeight="800"
          fontFamily="system-ui, sans-serif"
          letterSpacing="1.5"
        >
          AIMA
        </text>

        {/* Established 1957 badge */}
        <text
          x="50"
          y="80"
          textAnchor="middle"
          fill="#ffb703"
          fontSize="6.5"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          ESTD 1957
        </text>
      </svg>

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
