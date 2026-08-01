const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { loadReleaseManifest, verifyEnginePayload } = require("./releaseBundle.cjs");

function fail(message) {
  console.error(`\nRelease blocked: ${message}\n`);
  process.exit(1);
}

function verifyPackagedRuntime() {
  const root = path.resolve(__dirname, "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const resources = Array.isArray(packageJson?.build?.extraResources)
    ? packageJson.build.extraResources
    : [];
  const runtimeResource = resources.find((entry) => {
    const from = typeof entry === "string" ? entry : entry?.from;
    return from === "runtime-release";
  });

  if (!runtimeResource) {
    fail("build.extraResources does not include runtime-release. The current package would depend on a developer Python environment and model cache, so it is not a self-contained product.");
  }

  const runtimeRoot = path.join(root, "runtime-release");
  try {
    const validated = loadReleaseManifest(runtimeRoot);
    verifyEnginePayload(runtimeRoot, validated);
  } catch (error) {
    fail(error.message);
  }
}

verifyPackagedRuntime();

if (process.platform === "darwin") {
  let identities = "";
  try {
    identities = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
  } catch (error) {
    identities = String(error?.stdout || error?.message || "");
  }
  const hasDeveloperId = /Developer ID Application:/i.test(identities) || !!process.env.CSC_LINK;
  if (!hasDeveloperId) {
    fail("no Developer ID Application identity (or CSC_LINK) is available. An ad-hoc signature is not distributable and triggers Gatekeeper malware/damaged-app warnings.");
  }

  const hasApiCredentials = !!(process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER);
  const hasAppleIdCredentials = !!(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID);
  const hasKeychainProfile = !!process.env.APPLE_KEYCHAIN_PROFILE;
  if (!hasApiCredentials && !hasAppleIdCredentials && !hasKeychainProfile) {
    fail("Apple notarization credentials are missing. Configure an App Store Connect API key, Apple ID + app-specific password + team ID, or a notarytool keychain profile.");
  }
}

console.log("Release preflight passed: runtime payload, model manifests, signing, and notarization inputs are available.");
