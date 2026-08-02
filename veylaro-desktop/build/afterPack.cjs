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
const fs = require("node:fs");
const path = require("path");

/* Make the bundled llama.cpp engine relocation-safe. cmake bakes the absolute
 * build directory into the binary's LC_RPATH, so once bundled it can't find its
 * dylibs on any other machine (dyld: "Library not loaded: @rpath/…"). Rewrite the
 * rpath to @loader_path (dylibs sit next to the binary) and strip the absolute
 * build path. Idempotent + best-effort. This is the difference between a working
 * download and a dead engine on every stranger's Mac. */
function patchEngineRpath(appPath) {
  const root = path.join(appPath, "Contents", "Resources", "runtime-release");
  let subdirs = [];
  try { subdirs = fs.readdirSync(root); } catch { return; }
  let patched = 0;
  for (const sub of subdirs) {
    const dir = path.join(root, sub);
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f === "llama-server" || f.endsWith(".dylib")); } catch { continue; }
    for (const f of files) {
      const fp = path.join(dir, f);
      try { execFileSync("install_name_tool", ["-add_rpath", "@loader_path", fp], { stdio: "ignore" }); } catch { /* already present */ }
      try {
        const out = execFileSync("otool", ["-l", fp], { encoding: "utf8" });
        const bad = [...out.matchAll(/\bpath (\/(?:private|Volumes|Users|tmp)\/[^\s(]+)/g)].map((m) => m[1]);
        for (const b of new Set(bad)) { try { execFileSync("install_name_tool", ["-delete_rpath", b, fp], { stdio: "ignore" }); } catch { /* not present */ } }
      } catch { /* otool failed — skip */ }
      patched += 1;
    }
  }
  if (patched) console.log(`  [afterPack] engine rpath -> @loader_path on ${patched} file(s)`);
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.VEYLARO_LOCAL_ADHOC !== "1") return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  patchEngineRpath(appPath); // must run BEFORE signing (install_name_tool invalidates sigs)
  try {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
    console.log(`  [afterPack] ad-hoc signed local-only ${appName}`);
  } catch (e) {
    console.warn(`  [afterPack] ad-hoc signing skipped: ${e.message}`);
  }
};
