/* ============================================================
   Launch switches — one place to flip when it's go time.
   ============================================================ */

/** false = download buttons are ghosted (visible, not clickable)
 *  and the Register Interest flow is shown instead.
 *  Flip to true to arm the real downloads. */
export const DOWNLOADS_ENABLED = true;

/** Release fuse. The macOS Apple-Silicon build is self-contained (bundles the
 *  llama.cpp engine, pulls verified GGUF weights on first run) and has passed a
 *  clean, dev-env-hidden launch test. It ships ad-hoc signed (right-click → Open
 *  on first launch); a notarized Mac App Store build is in progress. Windows and
 *  Intel-Mac builds are not self-contained yet and remain gated. */
export const PUBLIC_ARTIFACTS_READY = true;

/** Candidate artifact locations. PUBLIC_ARTIFACTS_READY must remain false for
    the legacy v1.0.0 shell because it is not notarized or self-contained. */
const REL = "https://github.com/ArohaBookings/Veylaro/releases/download/v1.0.0";
export const BUILDS = {
  macArm: `${REL}/VeylaroCode-1.0.0-arm64-mac.zip`,
  macIntel: `${REL}/VeylaroCode-1.0.0-x64-mac.zip`,
  win: `${REL}/VeylaroCode-Setup-1.0.0.exe`,
  winPortable: `${REL}/VeylaroCode-1.0.0-win-portable.exe`,
  checksums: `${REL}/SHA256SUMS.txt`,
  releasePage: "https://github.com/ArohaBookings/Veylaro/releases/tag/v1.0.0",
} as const;

/** Back-compat alias. */
export const MAC_BUILD = BUILDS.macArm;

/** Where the GitHub release will live once Leo sets it up. */
export const GITHUB_REPO = "https://github.com/ArohaBookings/Veylaro";

/** Stripe hosted checkout (live) — USD with NZD localization built in. */
export const STRIPE_LINKS = {
  proMonthly: "https://buy.stripe.com/5kQ8wH5cnfkRfN7576aR200",
  proAnnual: "https://buy.stripe.com/bJe9ALgV55Kh9oJbvuaR201",
  teamMonthly: "https://buy.stripe.com/14A3cn5cnc8F30ldDCaR202",
  teamAnnual: "https://buy.stripe.com/28E14f7kvb4B58tdDCaR203",
} as const;
