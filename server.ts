import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setSocketServer } from "./src/lib/socket-server";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || process.env.APP_PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

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
      origin: process.env.NEXT_PUBLIC_APP_URL || true,
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
  });
});
