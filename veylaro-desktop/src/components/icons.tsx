import { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const I = ({ size = 16, children, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children}
  </svg>
);

export const Send = (p: P) => <I {...p}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></I>;
export const Mic = (p: P) => <I {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1" /><path d="M12 18v4" /></I>;
export const ImageIc = (p: P) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-4.5-4.5L6 21" /></I>;
export const Plus = (p: P) => <I {...p}><path d="M12 5v14M5 12h14" /></I>;
export const Gear = (p: P) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" /></I>;
export const X = (p: P) => <I {...p}><path d="M18 6 6 18M6 6l12 12" /></I>;
export const Check = (p: P) => <I {...p}><path d="M20 6 9 17l-5-5" /></I>;
export const Shield = (p: P) => <I {...p}><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z" /></I>;
export const FileIc = (p: P) => <I {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></I>;
export const FolderIc = (p: P) => <I {...p}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" /></I>;
export const Clock = (p: P) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></I>;
export const Bolt = (p: P) => <I {...p}><path d="M13 2 3 14h7l-1 8 11-13h-7l0-7z" /></I>;
export const Wifi0 = (p: P) => <I {...p}><path d="m2 7 20 0" opacity={0} /><path d="M1.5 8.5C7 3.5 17 3.5 22.5 8.5" /><path d="M5 12.5c4-3.5 10-3.5 14 0" /><path d="M8.5 16.5c2-1.8 5-1.8 7 0" /><circle cx="12" cy="20" r="1" fill="currentColor" /></I>;
export const Rewind = (p: P) => <I {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></I>;
export const Sparkle = (p: P) => <I {...p}><path d="M12 2c.9 5.5 2.6 7.2 8 8-5.4.8-7.1 2.5-8 8-.9-5.5-2.6-7.2-8-8 5.4-.8 7.1-2.5 8-8z" fill="currentColor" stroke="none" /></I>;
export const Copy = (p: P) => <I {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></I>;
export const LogOut = (p: P) => <I {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></I>;
export const User = (p: P) => <I {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></I>;
export const Lock = (p: P) => <I {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></I>;
export const Cpu = (p: P) => <I {...p}><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></I>;
export const Eye = (p: P) => <I {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></I>;
export const Warn = (p: P) => <I {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></I>;
export const Globe = (p: P) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></I>;
export const TerminalIc = (p: P) => <I {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m6 9 3 3-3 3" /><path d="M12 15h6" /></I>;
export const ChatIc = (p: P) => <I {...p}><path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12z" /></I>;
export const Users = (p: P) => <I {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.3 3.3-5 6.5-5s5.9 1.7 6.5 5" /><circle cx="17" cy="9" r="2.6" /><path d="M16.4 15.2c2.5.3 4.4 1.8 5 4.3" /></I>;
export const Map = (p: P) => <I {...p}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14" /><path d="M15 6v14" /></I>;
export const Compress = (p: P) => <I {...p}><path d="M8 3v4a1 1 0 0 1-1 1H3" /><path d="M16 3v4a1 1 0 0 0 1 1h4" /><path d="M8 21v-4a1 1 0 0 0-1-1H3" /><path d="M16 21v-4a1 1 0 0 1 1-1h4" /></I>;
