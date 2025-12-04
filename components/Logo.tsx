import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-10 h-10" }) => {
  return (
    <div className={`flex items-center justify-center rounded-full bg-gradient-to-br from-brand-700 to-brand-500 text-white font-bold shadow-lg ${className}`}>
      <span className="tracking-tighter" style={{ fontSize: 'inherit' }}>AG</span>
    </div>
  );
};