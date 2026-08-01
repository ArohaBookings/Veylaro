/* ============================================================
   Launch switches — one place to flip when it's go time.
   ============================================================ */

/** false = download buttons are ghosted (visible, not clickable)
 *  and the Register Interest flow is shown instead.
 *  Flip to true to arm the real downloads. */
export const DOWNLOADS_ENABLED = false;

/** Hard release fuse. Remote admin switches cannot expose an artifact until a
 *  clean-machine, signed/notarized, self-contained build has passed release QA. */
export const PUBLIC_ARTIFACTS_READY = false;

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
