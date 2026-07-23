import fs from "fs";
import path from "path";
import pino from "pino";

const LOG_DIR = process.env.SECURITY_LOG_DIR || path.join(process.cwd(), "logs");

function ensureDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

ensureDir();

const streams: pino.StreamEntry[] = [
  { level: "info", stream: process.stdout },
];

try {
  const dest = pino.destination({
    dest: path.join(LOG_DIR, "security.log"),
    sync: false,
    mkdir: true,
  });
  streams.push({ level: "info", stream: dest });
} catch {
  // file logging optional
}

export const securityLog = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: { service: "ledgerly-security" },
  },
  pino.multistream(streams),
);

export function logSuspiciousLogin(event: {
  type: string;
  userId?: string;
  email?: string;
  ip?: string;
  fingerprintId?: string;
  country?: string | null;
  reason?: string;
  meta?: Record<string, unknown>;
}) {
  securityLog.warn({ ...event, at: new Date().toISOString() }, `security:${event.type}`);
}
