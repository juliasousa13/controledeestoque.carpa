import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-10 h-10" }) => {
  return (
    <svg 
      className={`drop-shadow-md ${className}`} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="logoGradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e3a8a" /> {/* Azul Escuro Profissional */}
          <stop offset="100%" stopColor="#3b82f6" /> {/* Azul Vibrante */}
        </linearGradient>
      </defs>
      
      {/* Fundo com cantos arredondados */}
      <rect x="0" y="0" width="100" height="100" rx="22" fill="url(#logoGradient)" />
      
      {/* Iniciais AG Centralizadas e Claras */}
      <text 
        x="50" 
        y="68" 
        fontSize="52" 
        fontWeight="800" 
        fontFamily="Arial, Helvetica, sans-serif" 
        textAnchor="middle" 
        fill="white"
        letterSpacing="-2"
        style={{ textShadow: '0px 2px 4px rgba(0,0,0,0.2)' }}
      >
        AG
      </text>
      
      {/* Detalhe sutil de brilho no topo */}
      <path 
        d="M10 20 Q 50 5 90 20" 
        stroke="white" 
        strokeWidth="2" 
        strokeOpacity="0.2" 
        fill="none" 
      />
    </svg>
  );
};