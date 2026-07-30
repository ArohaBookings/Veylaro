/* electron-builder afterPack hook.
 *
 * We don't have (and aren't paying for yet) an Apple Developer ID, so the app
 * ships UNSIGNED by default — which on modern macOS triggers the scary
 * "app is damaged / malware" dialog and many users bail.
 *
 * An AD-HOC signature (codesign -s -) is free, needs no certificate, and
 * downgrades that to the milder, expected "unidentified developer" prompt that
 * the download page walks the user through (right-click → Open). It is NOT a
 * substitute for real notarization — it just makes the free, go-live-today path
 * clean instead of frightening.
 *
 * Safe + best-effort: any failure is logged and ignored so it can never break
 * the build. macOS-only.
 */
const { execSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  try {
    execSync(`codesign --force --deep --sign - ${JSON.stringify(appPath)}`, { stdio: "inherit" });
    console.log(`  [afterPack] ad-hoc signed ${appName} (free; milder Gatekeeper prompt)`);
  } catch (e) {
    console.warn(`  [afterPack] ad-hoc signing skipped: ${e.message}`);
  }
};
