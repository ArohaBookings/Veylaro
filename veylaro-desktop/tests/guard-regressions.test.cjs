const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { checkCwd, checkModelCommand, checkRead, checkWrite } = require("../electron/guard.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "veylaro-guard-"));
  const scope = path.join(root, "project");
  const outside = path.join(root, "outside");
  fs.mkdirSync(path.join(scope, "src"), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(scope, "src", "inside.ts"), "export const inside = true;\n");
  fs.writeFileSync(path.join(outside, "secret.ts"), "export const secret = true;\n");
  fs.symlinkSync(outside, path.join(scope, "escape"), "dir");
  fs.symlinkSync(path.join(scope, "src"), path.join(scope, "inside-link"), "dir");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    scope,
    outside,
    ctx: { scope, scopeKind: "folder", fullDisk: false },
  };
}

test("allows valid in-scope reads, writes, restores, and working directories", (t) => {
  const { scope, ctx } = fixture(t);

  const read = checkRead(path.join(scope, "src", "inside.ts"), ctx);
  assert.equal(read.allow, true);
  assert.equal(read.path, fs.realpathSync(path.join(scope, "src", "inside.ts")));

  const newWrite = checkWrite(path.join(scope, "new", "nested", "file.ts"), ctx);
  assert.equal(newWrite.allow, true);
  assert.equal(newWrite.path, path.join(fs.realpathSync(scope), "new", "nested", "file.ts"));

  const viaInternalSymlink = checkWrite(path.join(scope, "inside-link", "new.ts"), ctx);
  assert.equal(viaInternalSymlink.allow, true);
  assert.equal(viaInternalSymlink.path, path.join(fs.realpathSync(scope), "src", "new.ts"));

  const restore = checkWrite(path.join(scope, "src", "inside.ts"), {
    ...ctx,
    confirmed: true,
    rollback: true,
  });
  assert.equal(restore.allow, true);

  const cwd = checkCwd(path.join(scope, "src"), ctx);
  assert.equal(cwd.allow, true);
  assert.equal(cwd.path, fs.realpathSync(path.join(scope, "src")));
});

test("blocks symlink escapes for reads, writes, and restores", (t) => {
  const { scope, ctx } = fixture(t);

  const read = checkRead(path.join(scope, "escape", "secret.ts"), ctx);
  assert.equal(read.allow, false);
  assert.match(read.reason, /outside this session's scope/);

  // The leaf does not exist, so this exercises nearest-existing-parent
  // resolution through the `escape` symlink.
  const write = checkWrite(path.join(scope, "escape", "new", "file.ts"), ctx);
  assert.equal(write.allow, false);
  assert.match(write.reason, /outside this session's scope/);

  const restore = checkWrite(path.join(scope, "escape", "secret.ts"), {
    ...ctx,
    confirmed: true,
    rollback: true,
  });
  assert.equal(restore.allow, false);
  assert.match(restore.reason, /outside this session's scope/);
});

test("rejects absent, missing, file, and out-of-scope working directories", (t) => {
  const { scope, ctx } = fixture(t);

  const absent = checkCwd("", ctx);
  assert.equal(absent.allow, false);
  assert.match(absent.reason, /required/);

  const missing = checkCwd(path.join(scope, "missing"), ctx);
  assert.equal(missing.allow, false);
  assert.match(missing.reason, /does not exist/);

  const file = checkCwd(path.join(scope, "src", "inside.ts"), ctx);
  assert.equal(file.allow, false);
  assert.match(file.reason, /not a directory/);

  const escaped = checkCwd(path.join(scope, "escape"), ctx);
  assert.equal(escaped.allow, false);
  assert.match(escaped.reason, /outside this session's scope/);
});

test("rejects an unresolved symlink instead of trusting its lexical location", (t) => {
  const { scope, ctx } = fixture(t);
  fs.symlinkSync(path.join(scope, "does-not-exist"), path.join(scope, "broken"), "dir");

  const verdict = checkWrite(path.join(scope, "broken", "file.ts"), ctx);
  assert.equal(verdict.allow, false);
  assert.match(verdict.reason, /unresolved symbolic link/);
});

test("main-process model commands are default-deny and shell-free", () => {
  for (const command of ["npm test", "python3 -m pytest -q", "git diff -- src/cart.ts", "go test ./..."]) {
    const verdict = checkModelCommand(command, { mode: "repair" });
    assert.equal(verdict.allow, true, command);
    assert.ok(Array.isArray(verdict.argv), command);
  }
  for (const command of [
    "npm install", "npm test && true", "rm src/cart.ts", "git checkout main",
    "python3 script.py", "cat ../secret", "curl https://example.com",
  ]) assert.equal(checkModelCommand(command, { mode: "repair" }).allow, false, command);

  assert.equal(checkModelCommand("npm run build", { mode: "repair" }).allow, false);
  assert.equal(checkModelCommand("npm run build", { mode: "build" }).allow, true);
});
