/* electron-builder afterPack hook.
 *
 * Two jobs, and only the second one is optional:
 *
 * 1. MAKE THE BUNDLED ENGINE PORTABLE — always, every build, every channel.
 *    The engine is linked against its cmake build directory (@rpath) and against
 *    Homebrew's OpenSSL by absolute path. Neither exists on a stranger's Mac, so
 *    without this the downloaded app has a dead engine and the user just sees
 *    "Laro's engine did not become ready". This previously ran ONLY when
 *    VEYLARO_LOCAL_ADHOC=1 — i.e. never on the artifact we actually ship, which
 *    is the worst possible place for a fix to be conditional. It is now
 *    unconditional and its result is reported; a still-dangling dependency fails
 *    the build rather than shipping a dead engine.
 *
 * 2. AD-HOC SIGNING — local development artifacts only. Not trusted distribution
 *    signing; it does not prevent Gatekeeper's warning after download.
 *
 * Order matters: install_name_tool invalidates code signatures, so relinking must
 * happen BEFORE any signing pass.
 */
const { execFileSync } = require("node:child_process");
const path = require("path");
const { selfContainEngineDir } = require("./bundleEngineDeps.cjs");
const fs = require("node:fs");

function makeEnginePortable(appPath) {
  const root = path.join(appPath, "Contents", "Resources", "runtime-release");
  let subdirs = [];
  try { subdirs = fs.readdirSync(root); } catch { return { skipped: true }; }
  const problems = [];
  for (const sub of subdirs) {
    const dir = path.join(root, sub);
    try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }
    const report = selfContainEngineDir(dir);
    if (report.skipped) continue;
    console.log(
      `  [afterPack] engine ${sub}: vendored ${report.copied.length}, relinked ${report.rewritten.length}, ` +
      `rpath ${report.patched}, re-signed ${report.signed}`,
    );
    for (const d of report.dangling || []) problems.push(`${sub}: dangling ${d}`);
    for (const u of report.unsigned || []) problems.push(`${sub}: unsigned ${u}`);
  }
  return { problems };
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  // ALWAYS — this is the difference between a working download and a dead engine.
  const { problems = [] } = makeEnginePortable(appPath);
  if (problems.length) {
    // Fail loudly. Shipping this produces an app that installs fine and then
    // never answers a single message.
    throw new Error(
      `Bundled engine is not self-contained; refusing to package:\n  - ${problems.join("\n  - ")}`,
    );
  }

  // Local-only convenience signing.
  if (process.env.VEYLARO_LOCAL_ADHOC !== "1") return;
  try {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
    console.log(`  [afterPack] ad-hoc signed local-only ${appName}`);
  } catch (e) {
    console.warn(`  [afterPack] ad-hoc signing skipped: ${e.message}`);
  }
};
