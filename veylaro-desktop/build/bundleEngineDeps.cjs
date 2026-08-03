/* ============================================================
   MAKE THE BUNDLED ENGINE STAND ON ITS OWN.

   Two independent ways the shipped llama.cpp engine died on a stranger's Mac,
   both invisible on the build machine because the build machine has the files:

   1. LC_RPATH pointed at the cmake build directory. dyld then can't find the
      engine's own dylibs sitting right next to it.
        -> dyld: Library not loaded: @rpath/libllama.0.dylib

   2. The binaries link Homebrew's OpenSSL by ABSOLUTE path:
        /opt/homebrew/opt/openssl@3/lib/libssl.3.dylib
        /opt/homebrew/opt/openssl@3/lib/libcrypto.3.dylib
      Anyone without `brew install openssl@3` has no such file, so the engine
      never starts. Measured on this build: 5 of the shipped binaries do this.
        -> dyld: Library not loaded: /opt/homebrew/opt/openssl@3/...

   This script fixes both, in place and idempotently: it copies any absolutely
   linked non-system dependency in beside the binary and rewrites the reference
   to @loader_path, then repoints the rpath. Run it on the engine directory
   before signing (install_name_tool invalidates signatures).

   macOS-only, best-effort: it reports what it changed and never throws, because
   a packaging hook must not be able to break the build. It DOES return a report
   so the caller can fail a release preflight on a still-dangling dependency.
   ============================================================ */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/** Absolute link paths that are safe to leave alone — they exist on every Mac. */
const SYSTEM_PREFIXES = ["/usr/lib/", "/System/"];

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "ignore" });
}

function otoolDeps(file) {
  const out = execFileSync("otool", ["-L", file], { encoding: "utf8" });
  return out
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" ")[0])
    .filter(Boolean);
}

function isSystem(dep) {
  return SYSTEM_PREFIXES.some((p) => dep.startsWith(p));
}

/** An absolute path outside the bundle that we must vendor in. */
function needsVendoring(dep) {
  return dep.startsWith("/") && !isSystem(dep);
}

function engineBinaries(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f === "llama-server" || f === "llama-server.exe" || f.endsWith(".dylib"))
    .map((f) => path.join(dir, f));
}

/**
 * Vendor every absolutely-linked non-system dependency into `dir` and rewrite
 * references to @loader_path. Resolves transitively: a vendored dylib's own
 * absolute dependencies get vendored too.
 */
function vendorDependencies(dir) {
  const copied = [];
  const rewritten = [];
  const queue = engineBinaries(dir);
  const seen = new Set(queue);

  while (queue.length) {
    const file = queue.shift();
    let deps = [];
    try { deps = otoolDeps(file); } catch { continue; }

    for (const dep of deps) {
      if (!needsVendoring(dep)) continue;
      const base = path.basename(dep);
      const local = path.join(dir, base);

      // The dylib's own id line shows up as a dependency of itself; rewriting the
      // id is still required so anything linking it resolves relatively.
      if (path.resolve(file) === path.resolve(local)) {
        try { run("install_name_tool", ["-id", `@loader_path/${base}`, file]); rewritten.push(`${path.basename(file)}: id -> @loader_path/${base}`); } catch { /* already relative */ }
        continue;
      }

      if (!fs.existsSync(local)) {
        if (!fs.existsSync(dep)) {
          // Nothing to vendor from — record it so preflight can refuse the release.
          rewritten.push(`MISSING ${dep} (needed by ${path.basename(file)})`);
          continue;
        }
        fs.copyFileSync(dep, local);
        fs.chmodSync(local, 0o755);
        copied.push(base);
        try { run("install_name_tool", ["-id", `@loader_path/${base}`, local]); } catch { /* best effort */ }
        if (!seen.has(local)) { seen.add(local); queue.push(local); }
      }

      try {
        run("install_name_tool", ["-change", dep, `@loader_path/${base}`, file]);
        rewritten.push(`${path.basename(file)}: ${base}`);
      } catch { /* already rewritten */ }
    }
  }
  return { copied, rewritten };
}

/** Point the rpath at the binary's own directory and drop baked build paths. */
function normalizeRpaths(dir) {
  let patched = 0;
  for (const file of engineBinaries(dir)) {
    try { run("install_name_tool", ["-add_rpath", "@loader_path", file]); } catch { /* already present */ }
    try {
      const out = execFileSync("otool", ["-l", file], { encoding: "utf8" });
      const bad = [...out.matchAll(/\bpath (\/(?:private|Volumes|Users|tmp|opt)\/[^\s(]+)/g)].map((m) => m[1]);
      for (const b of new Set(bad)) {
        try { run("install_name_tool", ["-delete_rpath", b, file]); } catch { /* not present */ }
      }
    } catch { /* otool failed */ }
    patched += 1;
  }
  return patched;
}

/* Apple Silicon REQUIRES a valid signature to execute a binary at all, and
   install_name_tool invalidates whatever signature was there. Skip this and the
   engine dies with no output and no error the user can act on — verified the
   hard way:  codesign -v llama-server
              -> "invalid signature (code or signature have been modified)"
   Ad-hoc is enough to make it runnable; a real distribution signing pass later
   simply replaces it. Every relink MUST be followed by this. */
function adhocSign(dir) {
  let signed = 0;
  for (const file of engineBinaries(dir)) {
    try { run("codesign", ["--force", "--sign", "-", "--timestamp=none", file]); signed += 1; } catch { /* best effort */ }
  }
  return signed;
}

/** Does every binary have a signature macOS will actually load? */
function verifyExecutable(dir) {
  const broken = [];
  for (const file of engineBinaries(dir)) {
    try { run("codesign", ["-v", file]); } catch { broken.push(path.basename(file)); }
  }
  return broken;
}

/** Anything still pointing outside the bundle. Empty means the engine is portable. */
function danglingAbsoluteDeps(dir) {
  const bad = [];
  for (const file of engineBinaries(dir)) {
    let deps = [];
    try { deps = otoolDeps(file); } catch { continue; }
    for (const dep of deps) {
      if (needsVendoring(dep)) bad.push(`${path.basename(file)} -> ${dep}`);
    }
  }
  return bad;
}

/** Make one engine directory self-contained. Returns a report. */
function selfContainEngineDir(dir) {
  if (process.platform !== "darwin") return { skipped: "not macOS" };
  if (!fs.existsSync(dir)) return { skipped: `no such directory: ${dir}` };
  const vendored = vendorDependencies(dir);
  const patched = normalizeRpaths(dir);
  // MUST come after every install_name_tool call — see adhocSign().
  const signed = adhocSign(dir);
  const dangling = danglingAbsoluteDeps(dir);
  const unsigned = verifyExecutable(dir);
  return { ...vendored, patched, signed, dangling, unsigned, ok: dangling.length === 0 && unsigned.length === 0 };
}

/** Every <platform>-<arch> engine directory under a runtime-release root. */
function selfContainRuntimeRelease(runtimeRoot) {
  let subdirs = [];
  try { subdirs = fs.readdirSync(runtimeRoot); } catch { return []; }
  return subdirs
    .map((sub) => path.join(runtimeRoot, sub))
    .filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } })
    .map((d) => ({ dir: d, report: selfContainEngineDir(d) }));
}

module.exports = { selfContainEngineDir, selfContainRuntimeRelease, danglingAbsoluteDeps, verifyExecutable, adhocSign, engineBinaries };

// Runnable directly so the engine in the source tree can be fixed once, and so a
// release can re-verify without a full electron-builder cycle:
//   node build/bundleEngineDeps.cjs runtime-release
if (require.main === module) {
  const root = process.argv[2] || path.join(__dirname, "..", "runtime-release");
  const reports = selfContainRuntimeRelease(path.resolve(root));
  if (!reports.length) {
    console.error(`no engine directories found under ${root}`);
    process.exit(1);
  }
  let failed = false;
  for (const { dir, report } of reports) {
    console.log(`\n${dir}`);
    if (report.skipped) { console.log(`  skipped: ${report.skipped}`); continue; }
    console.log(`  vendored dylibs : ${report.copied.length ? report.copied.join(", ") : "(none needed)"}`);
    console.log(`  rewrote links   : ${report.rewritten.length}`);
    console.log(`  rpaths patched  : ${report.patched}`);
    console.log(`  re-signed       : ${report.signed} (ad-hoc; real signing replaces this)`);
    if (report.unsigned?.length) {
      failed = true;
      console.log(`  UNSIGNED        : ${report.unsigned.join(", ")} — macOS will refuse to execute these`);
    }
    if (report.dangling.length) {
      failed = true;
      console.log(`  STILL DANGLING  :`);
      for (const d of report.dangling) console.log(`    - ${d}`);
    } else {
      console.log(`  portable        : yes — no absolute non-system links remain`);
    }
  }
  process.exit(failed ? 1 : 0);
}
