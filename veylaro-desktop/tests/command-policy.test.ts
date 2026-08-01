import assert from "node:assert/strict";
import test from "node:test";

import { classifyModelCommand, isModelCommandAllowed } from "../src/engine/commandPolicy";

function expectDenied(command: string, classification: string, mode: "repair" | "build" = "repair") {
  const decision = classifyModelCommand(command, { mode });
  assert.equal(decision.allowed, false, command);
  assert.equal(decision.classification, classification, command);
}

test("repair mode permits bounded inspection and test commands", () => {
  const commands = [
    "pwd",
    "ls -la src",
    "rg -n 'TODO|FIXME' src",
    "cat src/cart.ts",
    "head -n 40 src/cart.ts",
    "git status --short",
    "git diff -- src/cart.ts",
    "npm test -- --runInBand",
    "npm run test:unit",
    "pnpm run lint",
    "python3 -m pytest tests/test_cart.py",
    "node --test tests/cart.test.js",
    "vitest run tests/cart.test.ts",
    "eslint src",
    "ruff check src",
    "tsc --noEmit",
    "cargo test",
    "go test ./src",
  ];

  for (const command of commands) {
    assert.equal(isModelCommandAllowed(command), true, command);
  }
});

test("build mode adds explicit builds without widening repair mode", () => {
  for (const command of ["npm run build", "pnpm build", "vite build", "cargo build", "go build ./src", "tsc"]) {
    assert.equal(classifyModelCommand(command, { mode: "build" }).allowed, true, command);
    expectDenied(command, "denied-not-allowlisted", "repair");
  }
  expectDenied("npm run dev", "denied-not-allowlisted", "build");
  expectDenied("npm run deploy", "denied-not-allowlisted", "build");
});

test("shell control operators and command composition are rejected", () => {
  for (const command of [
    "npm test && rm -rf .",
    "npm test || true",
    "git diff | cat",
    "npm test &",
    "npm test; git status",
    "npm test\ngit status",
    "(npm test)",
    "# npm test",
  ]) expectDenied(command, "denied-shell-control");
});

test("redirection, substitution, and expansion are rejected", () => {
  for (const command of ["npm test > result.txt", "cat < result.txt", "npm test 2>>errors.log", "cat <(git diff)"]) {
    expectDenied(command, "denied-redirection");
  }
  for (const command of ["echo $(git status)", "echo `git status`"]) {
    expectDenied(command, "denied-command-substitution");
  }
  for (const command of ["cat $HOME/.ssh/config", "ls *.ts", "ls ~/code", "CI=1 npm test"]) {
    expectDenied(command, "denied-shell-expansion");
  }
});

test("file and system mutation commands are rejected", () => {
  for (const command of [
    "rm src/cart.ts",
    "mv src/a.ts src/b.ts",
    "cp src/a.ts src/b.ts",
    "touch src/new.ts",
    "mkdir generated",
    "chmod 755 script.sh",
    "sed -i s/a/b/ src/cart.ts",
    "perl -pi -e s/a/b/ src/cart.ts",
    "find src -delete",
    "tee result.txt",
    "docker build .",
    "kill 1234",
  ]) expectDenied(command, "denied-mutation");
});

test("package installation and dependency mutation are rejected", () => {
  for (const command of [
    "npm install react",
    "npm ci",
    "npm exec vitest",
    "npx vitest run",
    "pnpm add react",
    "yarn install",
    "bun add react",
    "pip install pytest",
    "python3 -m pip install pytest",
    "uv pip install pytest",
    "poetry add pytest",
    "cargo install cargo-audit",
    "go install example.com/tool",
    "brew install ripgrep",
  ]) expectDenied(command, "denied-package-install");
});

test("git mutations are rejected while selected reads remain available", () => {
  for (const command of [
    "git add src/cart.ts",
    "git commit -m fix",
    "git checkout main",
    "git restore src/cart.ts",
    "git reset --hard",
    "git clean -fd",
    "git pull",
    "git fetch",
    "git push",
    "git apply fix.patch",
  ]) expectDenied(command, "denied-git-mutation");

  assert.equal(isModelCommandAllowed("git log -n 5"), true);
  assert.equal(isModelCommandAllowed("git show HEAD:src/cart.ts"), true);
  expectDenied("git diff --output=diff.txt", "denied-not-allowlisted");
});

test("shells and arbitrary interpreter execution are rejected", () => {
  for (const command of [
    "bash -c 'npm test'",
    "sh script.sh",
    "zsh -lc 'git status'",
    "python3 -c 'print(1)'",
    "python3 script.py",
    "node -e 'console.log(1)'",
    "node script.js",
    "ruby -e 'puts 1'",
    "perl -e 'print 1'",
    "osascript -e 'display dialog 1'",
  ]) expectDenied(command, "denied-arbitrary-code");
});

test("unsafe validator flags and unbounded inspection variants are rejected", () => {
  expectDenied("eslint --fix src", "denied-not-allowlisted");
  expectDenied("stylelint --fix 'src/**/*.css'", "denied-not-allowlisted");
  expectDenied("vitest --watch", "denied-not-allowlisted");
  expectDenied("tail -f app.log", "denied-not-allowlisted");
  expectDenied("rg --pre cat TODO src", "denied-not-allowlisted");
  expectDenied("ls -R src", "denied-not-allowlisted");
});

test("scope escapes and path-qualified executables are rejected", () => {
  for (const command of ["cat ../secret.txt", "cat /etc/passwd", "ls src/../../private", "/usr/bin/npm test", "./node_modules/.bin/vitest run"]) {
    expectDenied(command, "denied-path-escape");
  }
});

test("unknown, empty, and malformed model commands default to deny", () => {
  expectDenied("curl https://example.com", "denied-not-allowlisted");
  expectDenied("echo hello", "denied-not-allowlisted");
  expectDenied("find src -type f", "denied-not-allowlisted");
  expectDenied("", "denied-empty");
  expectDenied("rg 'unterminated", "denied-malformed");
});
