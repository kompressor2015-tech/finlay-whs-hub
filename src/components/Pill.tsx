import type { ReactNode } from 'react';
import type { Tone } from '../utils/attention.ts';

const TONES: Record<Tone, string> = {
  red: 'bg-[#FBE3E4] text-[#8E0F15]',
  amber: 'bg-[#FFF1D6] text-[#7A4A00]',
  blue: 'bg-[#E3EEFB] text-[#1D4E89]',
  green: 'bg-[#E3F3E8] text-[#1E6B3A]',
  grey: 'bg-[#EEEBE6] text-[#3F444B]',
};

export function Pill({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}
