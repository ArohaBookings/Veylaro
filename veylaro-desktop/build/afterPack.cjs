/* electron-builder afterPack hook.
 *
 * Ad-hoc signing exists only for an explicitly requested local development
 * artifact. It is not trusted distribution signing and does not prevent the
 * Gatekeeper malware/damaged-app warning after download.
 *
 * Safe + best-effort: any failure is logged and ignored so it can never break
 * the build. macOS-only.
 */
const { execFileSync } = require("node:child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.VEYLARO_LOCAL_ADHOC !== "1") return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  try {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
    console.log(`  [afterPack] ad-hoc signed local-only ${appName}`);
  } catch (e) {
    console.warn(`  [afterPack] ad-hoc signing skipped: ${e.message}`);
  }
};
