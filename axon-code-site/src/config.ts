/* ============================================================
   Launch switches — one place to flip when it's go time.
   ============================================================ */

/** false = download buttons are ghosted (visible, not clickable)
 *  and the Register Interest flow is shown instead.
 *  Flip to true to arm the real downloads. */
export const DOWNLOADS_ENABLED = false;

/** The packaged desktop app artifact (served from /public/downloads). */
export const MAC_BUILD = "/downloads/VeylaroCode-1.0.0-arm64-mac.zip";

/** Where the GitHub release will live once Leo sets it up. */
export const GITHUB_REPO = "https://github.com/ArohaBookings/Veylaro";

/** Stripe hosted checkout (live) — USD with NZD localization built in. */
export const STRIPE_LINKS = {
  proMonthly: "https://buy.stripe.com/5kQ8wH5cnfkRfN7576aR200",
  proAnnual: "https://buy.stripe.com/bJe9ALgV55Kh9oJbvuaR201",
  teamMonthly: "https://buy.stripe.com/14A3cn5cnc8F30ldDCaR202",
  teamAnnual: "https://buy.stripe.com/28E14f7kvb4B58tdDCaR203",
} as const;
