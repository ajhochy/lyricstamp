// AbleSet Sync — icons (inline SVG, hairline)
import React from 'react';

type IconProps = { name: string; size?: number } & React.SVGAttributes<SVGSVGElement>;

export const Icon: React.FC<IconProps> = ({ name, size = 14, ...rest }) => {
  const s = size;
  const stroke = 'currentColor';
  const sw = 1.5;
  const common: React.SVGAttributes<SVGSVGElement> = {
    width: s,
    height: s,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: sw,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...rest,
  };
  switch (name) {
    case 'play':
      return <svg {...common}><polygon points="7 5 19 12 7 19 7 5" fill="currentColor" stroke="none"/></svg>;
    case 'pause':
      return <svg {...common}><rect x="7" y="5" width="3.5" height="14" fill="currentColor" stroke="none" rx="0.5"/><rect x="13.5" y="5" width="3.5" height="14" fill="currentColor" stroke="none" rx="0.5"/></svg>;
    case 'stop':
      return <svg {...common}><rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none" rx="1"/></svg>;
    case 'chevron-right':
      return <svg {...common}><polyline points="9 6 15 12 9 18"/></svg>;
    case 'chevron-left':
      return <svg {...common}><polyline points="15 6 9 12 15 18"/></svg>;
    case 'chevron-down':
      return <svg {...common}><polyline points="6 9 12 15 18 9"/></svg>;
    case 'x':
      return <svg {...common}><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>;
    case 'check':
      return <svg {...common}><polyline points="5 12 10 17 19 7"/></svg>;
    case 'download':
      return <svg {...common}><path d="M12 4v12"/><polyline points="6 11 12 17 18 11"/><path d="M5 20h14"/></svg>;
    case 'file':
      return <svg {...common}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/></svg>;
    case 'music':
      return <svg {...common}><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>;
    case 'undo':
      return <svg {...common}><polyline points="9 14 4 9 9 4"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>;
    case 'metronome':
      return <svg {...common}><path d="M8 4h8l3 16H5z"/><line x1="12" y1="8" x2="16" y2="14"/></svg>;
    default:
      return null;
  }
};
