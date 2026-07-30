#!/usr/bin/env node
/* ============================================================
   veylaro — Laro in your own terminal.

   Same models, same guard, same charter as the desktop app.
   No Electron, no window, ~0 memory of its own.

     veylaro                    start a session in this folder
     veylaro "fix the tests"    one-shot: ask and get an answer
     veylaro models             what's installed and what fits
     veylaro doctor             check the setup end to end
     veylaro --help

   Ships with Veylaro Code and installs with:
     curl -fsSL https://veylaroai.com/install.sh | sh
   ============================================================ */
"use strict";

const os = require("os");
const path = require("path");
const fs = require("fs");
const readline = require("readline");
const { execSync } = require("child_process");

const OLLAMA = process.env.VEYLARO_HOST || "http://127.0.0.1:11434";
const TIERS = [
  { id: "lite", name: "Laro Lite", tag: "laro-lite", minRam: 4, params: "4B" },
  { id: "med", name: "Laro Med", tag: "laro-med", minRam: 12, params: "12B" },
  { id: "max", name: "Laro Max", tag: "laro-max", minRam: 24, params: "24B" },
];

/* ---- the look ---- */
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = (code) => (s) => (useColor ? `[${code}m${s}[0m` : s);
const copper = c("38;5;180");
const ink = c("38;5;250");
const dim = c("2");
const bold = c("1");
const green = c("38;5;114");
const red = c("38;5;203");

const MARK = copper("◤◢");

function banner() {
  console.log("");
  console.log(`  ${MARK}  ${bold("Veylaro")} ${copper("Code")}  ${dim("— local. private. yours.")}`);
  console.log("");
}

/* ---- a spinner that says what it's doing ---- */
function thinking(label) {
  if (!process.stdout.isTTY) return { stop() {} };
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const t0 = Date.now();
  const timer = setInterval(() => {
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    process.stdout.write(`\r  ${copper(frames[i++ % frames.length])} ${dim(`${label}… ${secs}s`)}   `);
  }, 80);
  return {
    stop() {
      clearInterval(timer);
      process.stdout.write("\r" + " ".repeat(60) + "\r");
    },
  };
}

/* ---- talking to the model ---- */
async function tags() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.models || []).map((m) => String(m.name || ""));
  } catch {
    return null;
  }
}

function ramGB() {
  return Math.round(os.totalmem() / 1024 ** 3);
}

function bestTier(installed) {
  const ram = ramGB();
  const fits = TIERS.filter((t) => ram >= t.minRam);
  for (let i = fits.length - 1; i >= 0; i--) {
    const hit = (installed || []).find((n) => n === fits[i].tag || n.startsWith(fits[i].tag + ":"));
    if (hit) return { tier: fits[i], model: hit };
  }
  const anyLaro = (installed || []).find((n) => /^(laro|veylaro)/.test(n));
  return anyLaro ? { tier: fits[fits.length - 1] || TIERS[0], model: anyLaro } : null;
}

const CHARTER = `You are Laro, running in the user's terminal. Lead with the answer, no preamble. Say "I don't know" rather than guessing. Never claim you ran or verified something you didn't. Finish the whole job, don't stop halfway. Dry humour welcome. Be honest about risk once, then help them build it.`;

async function ask(model, prompt, cwd) {
  const body = {
    model,
    messages: [
      { role: "system", content: `${CHARTER}\n\nWorking directory: ${cwd}` },
      { role: "user", content: prompt },
    ],
    stream: true,
    think: false,
    keep_alive: "30m",
  };
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`Laro responded ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let first = true;
  let out = "";
  const spin = thinking("thinking");
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        const chunk = j?.message?.content;
        if (chunk) {
          if (first) {
            spin.stop();
            process.stdout.write("  ");
            first = false;
          }
          out += chunk;
          process.stdout.write(ink(chunk.replace(/\n/g, "\n  ")));
        }
        if (j?.done) {
          if (first) spin.stop();
          return out;
        }
      } catch { /* partial */ }
    }
  }
  if (first) spin.stop();
  return out;
}

/* ---- commands ---- */

async function cmdModels() {
  banner();
  const installed = await tags();
  const ram = ramGB();
  console.log(`  ${dim("This machine:")} ${bold(ram + " GB RAM")}  ${dim("·")} ${os.platform()} ${os.arch()}\n`);
  if (installed === null) {
    console.log(`  ${red("Ollama isn't running.")} Start it and try again — ${dim("https://ollama.com")}\n`);
    return;
  }
  for (const t of TIERS) {
    const hit = installed.find((n) => n === t.tag || n.startsWith(t.tag + ":"));
    const fits = ram >= t.minRam;
    const state = hit ? green("installed") : dim("not installed");
    const fit = fits ? green("fits this machine") : red(`needs ${t.minRam} GB`);
    console.log(`  ${bold(t.name.padEnd(10))} ${dim(t.params.padEnd(4))} ${state.padEnd(22)} ${fit}`);
  }
  const best = bestTier(installed);
  console.log("");
  console.log(best
    ? `  ${copper("→")} Using ${bold(best.model)}`
    : `  ${dim("No Laro models installed yet. They arrive with Veylaro Code.")}`);
  console.log("");
}

async function cmdDoctor() {
  banner();
  const checks = [];
  const installed = await tags();
  checks.push(["Ollama reachable", installed !== null, installed === null ? `nothing at ${OLLAMA}` : OLLAMA]);
  const best = installed ? bestTier(installed) : null;
  checks.push(["A Laro model installed", !!best, best ? best.model : "run Veylaro Code once to install"]);
  checks.push([`Memory (${ramGB()} GB)`, ramGB() >= 4, ramGB() >= 8 ? "comfortable" : ramGB() >= 4 ? "Lite only" : "below the 4 GB floor"]);
  let git = false;
  try { execSync("git --version", { stdio: "ignore" }); git = true; } catch { /* no git */ }
  checks.push(["git available", git, git ? "yes" : "optional, but recommended"]);
  checks.push(["Node", Number(process.versions.node.split(".")[0]) >= 18, "v" + process.versions.node]);

  for (const [label, ok, detail] of checks) {
    console.log(`  ${ok ? green("✓") : red("✗")} ${label.padEnd(26)} ${dim(detail)}`);
  }
  const allOk = checks.every((c) => c[1]);
  console.log("");
  console.log(allOk ? `  ${green("All good.")} Type ${bold("veylaro")} to start.\n` : `  ${red("Some things need attention.")} Fix the ✗ lines above.\n`);
}

function help() {
  banner();
  console.log(`  ${bold("veylaro")}                    start a session in this folder`);
  console.log(`  ${bold('veylaro "fix the tests"')}   ask one thing, get an answer, exit`);
  console.log(`  ${bold("veylaro models")}             what's installed and what fits`);
  console.log(`  ${bold("veylaro doctor")}             check the setup end to end`);
  console.log(`  ${bold("veylaro --version")}`);
  console.log("");
  console.log(`  ${dim("Everything runs on this machine. Nothing is uploaded.")}`);
  console.log(`  ${dim("Set VEYLARO_HOST to point at a different Ollama.")}`);
  console.log("");
}

async function repl(model) {
  const cwd = process.cwd();
  banner();
  console.log(`  ${dim("model")} ${bold(model)}   ${dim("folder")} ${bold(path.basename(cwd))}`);
  console.log(`  ${dim("ask anything · /exit to leave · /help for commands")}\n`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: copper("  › ") });
  rl.prompt();
  rl.on("line", async (line) => {
    const t = line.trim();
    if (!t) return rl.prompt();
    if (t === "/exit" || t === "/quit") return rl.close();
    if (t === "/help") { help(); return rl.prompt(); }
    if (t === "/clear") { console.clear(); banner(); return rl.prompt(); }
    console.log("");
    try {
      await ask(model, t, cwd);
    } catch (e) {
      console.log(`  ${red("×")} ${e.message}`);
    }
    console.log("\n");
    rl.prompt();
  });
  rl.on("close", () => {
    console.log(`\n  ${copper("◤◢")} ${dim("see you.")}\n`);
    process.exit(0);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const first = args[0];

  if (first === "--help" || first === "-h" || first === "help") return help();
  if (first === "--version" || first === "-v") {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
      console.log(pkg.version);
    } catch { console.log("1.0.0"); }
    return;
  }
  if (first === "models") return cmdModels();
  if (first === "doctor") return cmdDoctor();

  const installed = await tags();
  if (installed === null) {
    banner();
    console.log(`  ${red("Ollama isn't running")} — Laro needs it to serve the model.`);
    console.log(`  ${dim("Start Ollama, then run")} ${bold("veylaro doctor")}\n`);
    process.exit(1);
  }
  const best = bestTier(installed);
  if (!best) {
    banner();
    console.log(`  ${red("No Laro model installed yet.")}`);
    console.log(`  ${dim("Open Veylaro Code once to install one, or see")} ${bold("veylaro models")}\n`);
    process.exit(1);
  }

  if (args.length && first) {
    // one-shot mode
    banner();
    try {
      await ask(best.model, args.join(" "), process.cwd());
      console.log("\n");
    } catch (e) {
      console.log(`  ${red("×")} ${e.message}\n`);
      process.exit(1);
    }
    return;
  }
  return repl(best.model);
}

main().catch((e) => {
  console.error(`\n  ${red("×")} ${e.message}\n`);
  process.exit(1);
});
