/**
 * PM2 ecosystem — loads .env automatically so secrets & DB URL are correct.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fileEnv = loadEnvFile();
const port = fileEnv.APP_PORT || process.env.APP_PORT || "3000";

const sharedEnv = {
  ...fileEnv,
  NODE_ENV: "production",
  PORT: port,
  HOSTNAME: fileEnv.HOSTNAME || "0.0.0.0",
};

const apps = [
  {
    name: "ledgerly-web",
    script: "server.ts",
    interpreter: "node",
    interpreterArgs: "--import tsx",
    cwd: __dirname,
    instances: 1,
    exec_mode: "fork",
    watch: false,
    max_memory_restart: "768M",
    kill_timeout: 5000,
    // The dedicated worker is the only Telegram long-polling process.
    env: { ...sharedEnv, TELEGRAM_EMBEDDED: "0" },
    error_file: "logs/pm2-web-error.log",
    out_file: "logs/pm2-web-out.log",
    merge_logs: true,
    time: true,
  },
];

// Always start the receiver. It waits for a token from .env or AppConfig, so
// configuring Telegram through /setup does not require changing PM2 topology.
apps.push({
  name: "ledgerly-telegram",
  script: "workers/telegram/index.ts",
  interpreter: "node",
  interpreterArgs: "--import tsx",
  cwd: __dirname,
  instances: 1,
  exec_mode: "fork",
  watch: false,
  autorestart: true,
  max_restarts: 50,
  restart_delay: 3000,
  env: sharedEnv,
  error_file: "logs/pm2-telegram-error.log",
  out_file: "logs/pm2-telegram-out.log",
  merge_logs: true,
  time: true,
});

module.exports = { apps };
