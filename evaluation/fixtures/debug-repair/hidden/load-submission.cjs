const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const FORBIDDEN = /\b(?:require|process|globalThis|global|eval|Function)\b|constructor\s*\.\s*constructor|__proto__/;

module.exports = function loadSubmission(relativePath) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const source = fs.readFileSync(filename, "utf8");
  if (FORBIDDEN.test(source.replace(/module\.exports/g, ""))) {
    throw new Error("Submission uses a forbidden runtime capability");
  }
  const moduleRecord = { exports: {} };
  const context = vm.createContext(
    { module: moduleRecord, exports: moduleRecord.exports },
    { codeGeneration: { strings: false, wasm: false } },
  );
  new vm.Script(source, { filename, timeout: 1000 }).runInContext(context, { timeout: 1000 });
  return moduleRecord.exports;
};
