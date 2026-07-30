/// <reference types="vite/client" />

// SVGs are imported as URL strings (used as CSS mask sources for brand marks).
declare module "*.svg" {
  const src: string;
  export default src;
}
