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
