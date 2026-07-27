import { spawn, type ChildProcess } from "node:child_process";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type ManagedProcess = {
  name: string;
  required: boolean;
  child: ChildProcess;
};

const processes: ManagedProcess[] = [];
let shuttingDown = false;

function start(
  name: string,
  entrypoint: string,
  options: { required?: boolean; env?: Record<string, string | undefined> } = {},
) {
  const child = spawn(process.execPath, ["--import", "tsx", entrypoint], {
    cwd: process.cwd(),
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });

  const managed = { name, required: options.required ?? false, child };
  processes.push(managed);
  console.log(`[dev] ${name} started (pid ${child.pid ?? "?"})`);

  child.on("error", (error) => {
    console.error(`[dev] ${name} failed to start:`, error);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.warn(`[dev] ${name} stopped (${signal || `code ${code ?? "unknown"}`})`);
    if (managed.required) {
      void shutdown(code && code !== 0 ? code : 1);
    } else {
      console.warn(`[dev] Web tetap berjalan. Restart stack untuk menyalakan kembali ${name}.`);
    }
  });
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const processInfo of processes) {
    if (processInfo.child.exitCode === null && processInfo.child.signalCode === null) {
      processInfo.child.kill("SIGTERM");
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));

// The dedicated worker owns Telegram polling. Disabling the embedded bot keeps
// local development to exactly one getUpdates consumer.
start("web", "server.ts", { required: true, env: { TELEGRAM_EMBEDDED: "0" } });
start("telegram-worker", "workers/telegram/index.ts");
start("whatsapp-worker", "workers/whatsapp/index.ts");
