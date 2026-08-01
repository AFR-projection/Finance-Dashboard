import { createServer } from "http";
import { parse } from "url";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setSocketServer } from "./src/lib/socket-server";

loadEnvConfig(process.cwd());

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || process.env.APP_PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/**
 * The app is served from three hosts (apex, app.*, admin.*) but Socket.io was
 * pinned to a single origin. Accept any subdomain of the configured base so
 * realtime login does not silently die on two of the three.
 */
function buildCorsOrigin() {
  const configured = [process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\/$/, ""));

  if (configured.length === 0) return true;

  const allowed = new Set<string>();
  for (const entry of configured) {
    try {
      const url = new URL(entry);
      allowed.add(url.origin);
      // Same protocol and port, one label deeper: app.example.com, admin.example.com
      for (const sub of ["app", "admin"]) {
        allowed.add(`${url.protocol}//${sub}.${url.host}`);
      }
    } catch {
      // A malformed env value should not take the whole server down.
    }
  }

  return (origin: string | undefined, callback: (err: Error | null, ok?: boolean) => void) => {
    // Same-origin requests and native clients send no Origin header.
    if (!origin) return callback(null, true);
    callback(null, allowed.has(origin));
  };
}

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request", err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: {
      origin: buildCorsOrigin(),
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  setSocketServer(io);

  io.on("connection", (socket) => {
    socket.on("login:join", (sessionId: string) => {
      if (typeof sessionId === "string" && sessionId.length >= 8 && sessionId.length <= 64) {
        socket.join(`login:${sessionId}`);
      }
    });

    socket.on("dashboard:join", (userId: string) => {
      if (typeof userId === "string" && userId.length >= 8 && userId.length <= 64) {
        socket.join(`user:${userId}`);
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ledgerly ready on http://${hostname}:${port} (Socket.io enabled)`);
    // Local-friendly: handle /approve without separate worker process
    import("./src/messaging/start-telegram-bot")
      .then((m) => m.startEmbeddedTelegramBot())
      .catch((err) => console.warn("[telegram] embed skip:", err));
  });
});
