import type { Server as SocketIOServer } from "socket.io";

declare global {
  // eslint-disable-next-line no-var
  var __ledgerlyIO: SocketIOServer | undefined;
}

export function setSocketServer(io: SocketIOServer) {
  globalThis.__ledgerlyIO = io;
}

export function getSocketServer(): SocketIOServer | null {
  return globalThis.__ledgerlyIO ?? null;
}

export function emitLoginConfirmed(sessionId: string, payload: {
  ticket: string;
  userId: string;
}) {
  getSocketServer()?.to(`login:${sessionId}`).emit("login:confirmed", payload);
}

export function emitLoginRejected(sessionId: string, reason: string) {
  getSocketServer()?.to(`login:${sessionId}`).emit("login:rejected", { reason });
}

export function emitLoginNeedsRevalidation(sessionId: string, reason: string) {
  getSocketServer()?.to(`login:${sessionId}`).emit("login:revalidate", { reason });
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  getSocketServer()?.to(`user:${userId}`).emit(event, payload);
}
