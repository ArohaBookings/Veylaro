// Compact inline icon set. All icons inherit currentColor.
type P = { size?: number; className?: string };
const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const Check = ({ size, className }: P) => (
  <svg {...base(size ?? 15)} className={className} strokeWidth={2.4}><path d="M20 6 9 17l-5-5" /></svg>
);
export const ArrowRight = ({ size, className }: P) => (
  <svg {...base(size ?? 16)} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const Shield = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 2 4 5.5v5.2c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8V5.5L12 2Z" /><path d="m9 11.5 2.2 2.2L15.5 9" /></svg>
);
export const Lock = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" /><circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" /></svg>
);
export const Bolt = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z" /></svg>
);
export const Cpu = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="6" y="6" width="12" height="12" rx="2.5" /><rect x="10" y="10" width="4" height="4" rx="1" /><path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3" /></svg>
);
export const InfinityIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M8 8.5c-2.2 0-4 1.6-4 3.5s1.8 3.5 4 3.5c3.5 0 4.5-7 8-7 2.2 0 4 1.6 4 3.5S18.2 15.5 16 15.5c-3.5 0-4.5-7-8-7Z" /></svg>
);
export const WifiOff = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="m3 3 18 18" /><path d="M7.2 11.2A9.4 9.4 0 0 1 12 9.8c2.1 0 4 .7 5.6 1.9" opacity=".5" /><path d="M4 8a13.4 13.4 0 0 1 5.3-2.6M14.5 5.4A13.4 13.4 0 0 1 20 8" opacity=".5" /><path d="M9.8 14.5a5.4 5.4 0 0 1 4.9-.5" /><circle cx="12" cy="18.5" r="1.3" fill="currentColor" stroke="none" /></svg>
);
export const TerminalIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="m7 9.5 3 3-3 3M12.5 15.5H17" /></svg>
);
export const Brain = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 4a3 3 0 0 0-3 3 3.2 3.2 0 0 0-2.8 4.6A3.2 3.2 0 0 0 7 17.5a3 3 0 0 0 5 1.6V4Z" /><path d="M12 4a3 3 0 0 1 3 3 3.2 3.2 0 0 1 2.8 4.6A3.2 3.2 0 0 1 17 17.5a3 3 0 0 1-5 1.6" /></svg>
);
export const GitBranch = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="6.5" cy="6" r="2.5" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="8" r="2.5" /><path d="M6.5 8.5v7M17.5 10.5a6 6 0 0 1-6 5.5" /></svg>
);
export const Folder = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.6L12 7h6a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5V7Z" /></svg>
);
export const Eye = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const DownloadIcon = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3v11m0 0 4.5-4.5M12 14l-4.5-4.5" /><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" /></svg>
);
export const Sparkle = ({ size, className }: P) => (
  <svg width={size ?? 16} height={size ?? 16} viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M12 2c.7 4.6 1.5 6.1 4.5 7.4l3.5 1.6-3.5 1.6c-3 1.3-3.8 2.8-4.5 7.4-.7-4.6-1.5-6.1-4.5-7.4L4 11l3.5-1.6C10.5 8.1 11.3 6.6 12 2Z" /></svg>
);
export const Memory = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5v-7Z" /><path d="M8 6V3.5M12 6V3.5M16 6V3.5M8 20.5V18M12 20.5V18M16 20.5V18" /><rect x="8" y="10" width="8" height="4" rx="1" /></svg>
);
export const Globe = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" /></svg>
);
export const Users = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5" /><path d="M16 5a3.5 3.5 0 0 1 0 6.7M17.5 14.8c2 .7 3.2 2.4 3.5 5.2" /></svg>
);
export const Gauge = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4.5 19a9 9 0 1 1 15 0" /><path d="m12 14 4-5.5" /><circle cx="12" cy="14" r="1.6" fill="currentColor" stroke="none" /></svg>
);
export const Layers = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m4.5 12.8 7.5 4.2 7.5-4.2M4.5 16.8 12 21l7.5-4.2" opacity=".65" /></svg>
);
export const Refresh = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M20 5v5h-5" /><path d="M20 10a8 8 0 1 0 1.5 6.5" /></svg>
);
export const Plus = ({ size, className }: P) => (
  <svg {...base(size ?? 18)} className={className} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>
);
export const Menu = ({ size, className }: P) => (
  <svg {...base(size ?? 20)} className={className}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const Close = ({ size, className }: P) => (
  <svg {...base(size ?? 20)} className={className}><path d="m6 6 12 12M18 6 6 18" /></svg>
);

/* ---------- OS logos (filled) ---------- */
export const Apple = ({ size, className }: P) => (
  <svg width={size ?? 22} height={size ?? 22} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.05 12.54c-.03-2.34 1.91-3.46 2-3.52-1.09-1.59-2.78-1.81-3.38-1.83-1.44-.15-2.81.85-3.54.85-.73 0-1.86-.83-3.05-.81-1.57.02-3.02.91-3.83 2.32-1.63 2.83-.42 7.02 1.17 9.32.78 1.13 1.7 2.39 2.92 2.34 1.17-.05 1.61-.76 3.03-.76s1.81.76 3.05.74c1.26-.02 2.06-1.15 2.83-2.28.89-1.31 1.26-2.57 1.28-2.64-.03-.01-2.45-.94-2.48-3.73ZM14.7 5.67c.65-.78 1.08-1.87.96-2.96-.93.04-2.06.62-2.72 1.4-.6.69-1.12 1.8-.98 2.86 1.04.08 2.1-.53 2.74-1.3Z" />
  </svg>
);
export const Windows = ({ size, className }: P) => (
  <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M3 5.5 10.5 4.4v7.1H3V5.5Zm0 13 7.5 1.1v-7H3v5.9ZM11.5 4.25 21 3v8.5h-9.5v-7.25Zm0 15.5L21 21v-8.5h-9.5v7.25Z" />
  </svg>
);
export const Linux = ({ size, className }: P) => (
  <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2c-2.4 0-3.6 1.9-3.6 4 0 1.5.2 2.6-.6 4-1 1.6-2.4 3.4-2.4 5.4 0 .6.1 1.2.3 1.7-.5.3-.9.8-.9 1.5 0 1.2 1.1 1.6 2.2 1.8.7.2 1.5.9 2.4 1.2.6.2 1.2.4 2.6.4s2-.2 2.6-.4c.9-.3 1.7-1 2.4-1.2 1.1-.2 2.2-.6 2.2-1.8 0-.7-.4-1.2-.9-1.5.2-.5.3-1.1.3-1.7 0-2-1.4-3.8-2.4-5.4-.8-1.4-.6-2.5-.6-4 0-2.1-1.2-4-3.6-4Zm-2 5.2c.5 0 .8.5.8 1.1 0 .4-.2.8-.4 1l-.6-.3c.1-.1.2-.3.2-.6 0-.4-.2-.6-.4-.6-.2 0-.4.3-.4.7h-.6c0-.7.5-1.3 1.4-1.3Zm4 0c.9 0 1.4.6 1.4 1.4h-.7c0-.5-.3-.8-.7-.8-.3 0-.5.3-.5.8 0 .3.1.5.2.7l-.7.3c-.2-.3-.4-.7-.4-1.1 0-.7.5-1.3 1.4-1.3Zm-3.7 2.2c.4.3 1.2.8 1.7.8s1.2-.4 1.7-.8c.3-.2.7.1.5.4-.5.6-1.4 1.2-2.2 1.2-.8 0-1.7-.6-2.2-1.2-.2-.3.2-.6.5-.4Z" />
  </svg>
);
export const Android = ({ size, className }: P) => (
  <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.6 9.5c.5-.9 1.1-1.9 1.6-2.8.3-.5-.5-1-.8-.5l-1.7 2.9a9.6 9.6 0 0 0-9.4 0L5.6 6.2c-.3-.5-1.1 0-.8.5.5.9 1.1 1.9 1.6 2.8A8.4 8.4 0 0 0 2 16.5h20a8.4 8.4 0 0 0-4.4-7ZM7.5 14.2a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm9 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
  </svg>
);

/* ---------- AI lab marks (stylized, geometric) ---------- */
export const ClaudeMark = ({ size, className }: P) => (
  <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" fill="#D97757" className={className}>
    <path d="M12 2.5 13.9 8a1 1 0 0 0 .6.6l5.6 1.5-4.5 3.4a1 1 0 0 0-.4.9l.6 5.8-4.9-3.1a1 1 0 0 0-1 0l-4.9 3.1.6-5.8a1 1 0 0 0-.4-.9L3.9 10l5.6-1.5a1 1 0 0 0 .6-.6L12 2.5Z" />
  </svg>
);
export const OpenAIMark = ({ size, className }: P) => (
  <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" fill="none" stroke="#f0ebe2" strokeWidth="1.7" className={className}>
    <path d="M12 4.2a4 4 0 0 1 3.9 2.4M12 4.2a4 4 0 0 0-3.5 2M12 4.2V2.6M15.9 6.6l1.4-.8M15.9 6.6a4 4 0 0 1 2 3.4v3.9a4 4 0 0 1-.4 1.8M8.5 6.2 7 5.4M8.5 6.2a4 4 0 0 0-2.4 3.7v4a4 4 0 0 0 .4 1.7M17.5 15.7l1.4.8M6.5 15.6l-1.4.9M6.5 15.6a4 4 0 0 0 3.6 2.2M17.5 15.7a4 4 0 0 1-3.6 2.1M10.1 17.8 10 19.4M13.9 17.8l.1 1.6" />
    <circle cx="12" cy="11.9" r="3" />
  </svg>
);
export const GeminiMark = ({ size, className }: P) => (
  <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" className={className}>
    <defs><linearGradient id="gemgrad" x1="0" y1="0" x2="24" y2="24"><stop offset="0" stopColor="#4E82EE" /><stop offset="1" stopColor="#B573F1" /></linearGradient></defs>
    <path fill="url(#gemgrad)" d="M12 1.5c.9 5.6 4.9 9.6 10.5 10.5C16.9 12.9 12.9 16.9 12 22.5 11.1 16.9 7.1 12.9 1.5 12 7.1 11.1 11.1 7.1 12 1.5Z" />
  </svg>
);
export const GrokMark = ({ size, className }: P) => (
  <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" fill="none" stroke="#f0ebe2" strokeWidth="2.1" strokeLinecap="round" className={className}>
    <path d="M4.2 4.5 19.5 19.8M19.8 4.2 12.9 11M4.5 19.5l4.2-4.2" />
  </svg>
);
