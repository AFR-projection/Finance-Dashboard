"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { AnimatePresence, motion } from "framer-motion";
import { Fingerprint, Loader2, Radio, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TiltCard } from "@/components/motion/tilt-card";
import { getBrowserFingerprint } from "@/lib/fingerprint-client";

type Phase = "checking" | "ready" | "waiting" | "denied";

export default function AccessPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState("Memeriksa setup…");
  const [confirmCode, setConfirmCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const complete = useCallback(
    async (sid: string) => {
      const fingerprintId = await getBrowserFingerprint();
      const res = await fetch("/api/access/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, fingerprintId }),
      });
      const json = await res.json();
      if (!json.ok) {
        if (json.error?.code === "REVALIDATE") {
          setMessage(json.error.message);
          setPhase("denied");
          setError(json.error.message);
          return;
        }
        setError(json.error?.message || "Gagal membuka sesi");
        setPhase("denied");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    async function boot() {
      const st = await fetch("/api/setup").then((r) => r.json());
      if (!st.data?.setupCompleted || !st.data?.isReady) {
        router.replace("/setup");
        return;
      }
      setPhase("ready");
      setMessage("Siap meminta izin akses ke bot owner.");
    }
    void boot();
  }, [router]);

  useEffect(() => {
    if (phase !== "waiting" || !sessionId) return;

    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.emit("login:join", sessionId);

    socket.on("access:approved", () => {
      void complete(sessionId);
    });
    socket.on("access:rejected", (p: { reason?: string }) => {
      setError(p.reason || "Akses ditolak");
      setPhase("denied");
    });

    const poll = setInterval(async () => {
      const res = await fetch(`/api/access?sessionId=${sessionId}`);
      const json = await res.json();
      if (json.data?.status === "approved") {
        clearInterval(poll);
        void complete(sessionId);
      } else if (json.data?.status === "rejected" || json.data?.status === "expired") {
        clearInterval(poll);
        setError(json.data.status === "rejected" ? "Akses ditolak" : "Sesi kedaluwarsa");
        setPhase("denied");
      }
    }, 2500);

    return () => {
      clearInterval(poll);
      socket.disconnect();
    };
  }, [phase, sessionId, complete]);

  async function requestAccess() {
    setError(null);
    setSubmitting(true);
    try {
      const fingerprintId = await getBrowserFingerprint();
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprintId }),
      });
      const json = await res.json();
      if (!json.ok) {
        if (json.error?.code === "SETUP_REQUIRED") {
          router.replace("/setup");
          return;
        }
        setError(json.error?.message || "Gagal meminta akses");
        return;
      }
      setSessionId(json.data.sessionId);
      setConfirmCode(json.data.confirmCode);
      setMessage(json.data.message);
      setPhase("waiting");
    } finally {
      setSubmitting(false);
    }
  }

  const denied = phase === "denied";

  return (
    <div className="vault-shell vault-noise scene-3d relative flex min-h-svh items-center justify-center overflow-hidden px-5 py-14">
      <VaultBackdrop denied={denied} />

      <motion.main
        initial={{ opacity: 0, y: 34, rotateX: 14 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="preserve-3d relative w-full max-w-[26rem]"
      >
        <div className="preserve-3d mb-9 flex flex-col items-center text-center">
          <VaultSeal phase={phase} />

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 font-[family-name:var(--font-display)] text-[2.7rem] leading-[1.05] text-white depth-2 sm:text-[3.1rem]"
          >
            Akses Ledgerly{" "}
            <span
              className={`transition-colors duration-500 ${denied ? "text-rose-400" : "text-white/25"}`}
            >
              denied
            </span>
          </motion.h1>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 h-px w-28 origin-center bg-gradient-to-r from-transparent via-white/35 to-transparent"
          />
        </div>

        <TiltCard
          intensity={6}
          className="rounded-[1.9rem] border border-white/12 bg-white/[0.055] p-6 shadow-[0_46px_100px_-46px_oklch(0.05_0_0/.95)] backdrop-blur-2xl sm:p-7"
        >
          <span
            aria-hidden
            className="sheen pointer-events-none absolute inset-0 rounded-[1.9rem]"
          />
          <div className="preserve-3d relative min-h-[9.5rem] depth-1">
            <AnimatePresence mode="wait">
              {phase === "checking" && (
                <PhaseBlock key="checking">
                  <StatusLine tone="idle" label="Memeriksa" />
                  <p className="mt-4 text-sm text-white/55">{message}</p>
                  <div className="mt-6 space-y-2.5">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
                      <motion.div
                        animate={{ x: ["-100%", "220%"] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                        className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-teal-300 to-transparent"
                      />
                    </div>
                  </div>
                </PhaseBlock>
              )}

              {phase === "ready" && (
                <PhaseBlock key="ready">
                  <StatusLine tone="idle" label="Terkunci" />
                  <p className="mt-4 text-sm leading-relaxed text-white/60">
                    Verifikasi perangkat diperlukan untuk membuka sesi ini.
                  </p>
                  <Button
                    className="mt-7 h-13 w-full cursor-pointer rounded-2xl bg-white text-sm font-semibold text-[oklch(0.16_0.03_190)] shadow-[0_20px_44px_-20px_oklch(0.9_0.05_175/.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/90 active:translate-y-0 disabled:opacity-70"
                    disabled={submitting}
                    onClick={() => void requestAccess()}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Mengirim…
                      </>
                    ) : (
                      <>
                        <Fingerprint className="size-4" strokeWidth={2} /> Buka kunci
                      </>
                    )}
                  </Button>
                </PhaseBlock>
              )}

              {phase === "waiting" && (
                <PhaseBlock key="waiting">
                  <StatusLine tone="live" label="Menunggu owner" />
                  <p className="mt-4 text-sm text-white/60">{message}</p>

                  {confirmCode && (
                    <div className="preserve-3d mt-6 flex justify-center gap-2.5">
                      {confirmCode.split("").map((char, index) => (
                        <motion.span
                          key={`${char}-${index}`}
                          initial={{ opacity: 0, rotateX: -90, y: 14 }}
                          animate={{ opacity: 1, rotateX: 0, y: 0 }}
                          transition={{
                            delay: index * 0.08,
                            duration: 0.55,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="grid size-12 place-items-center rounded-xl border border-white/12 bg-white/[0.07] font-[family-name:var(--font-display)] text-2xl text-white shadow-[inset_0_1px_0_oklch(1_0_0/.15)]"
                        >
                          {char}
                        </motion.span>
                      ))}
                    </div>
                  )}

                  <p className="mt-6 flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/35">
                    <Radio className="size-3.5" />
                    {confirmCode ? "Menunggu approve dari bot" : "Menunggu Izinkan di Telegram"}
                  </p>
                </PhaseBlock>
              )}

              {phase === "denied" && (
                <PhaseBlock key="denied">
                  <StatusLine tone="denied" label="Ditolak" />
                  <p className="mt-4 text-sm leading-relaxed text-rose-200/85">
                    {error || "Akses ditolak"}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-7 h-13 w-full cursor-pointer rounded-2xl border-white/15 bg-white/[0.04] text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/10 hover:text-white"
                    onClick={() => {
                      setError(null);
                      setConfirmCode(null);
                      setSessionId(null);
                      setPhase("ready");
                    }}
                  >
                    <RotateCcw className="size-4" strokeWidth={2} /> Coba lagi
                  </Button>
                </PhaseBlock>
              )}
            </AnimatePresence>
          </div>

          {error && phase !== "denied" && (
            <p className="mt-4 text-sm text-rose-300">{error}</p>
          )}
        </TiltCard>
      </motion.main>
    </div>
  );
}

function VaultBackdrop({ denied }: { denied: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        animate={{ opacity: denied ? 0.5 : 0 }}
        transition={{ duration: 0.8 }}
        className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,oklch(0.45_0.18_20/.45),transparent_70%)]"
      />
      <div className="absolute inset-0 scene-3d">
        <div className="grid-floor opacity-45" />
      </div>
      <div className="breathe absolute left-1/2 top-[34%] size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.6_0.13_175/.3),transparent_66%)] blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/45 to-transparent" />
    </div>
  );
}

function VaultSeal({ phase }: { phase: Phase }) {
  const denied = phase === "denied";
  const Icon = denied ? ShieldAlert : phase === "waiting" ? Radio : ShieldCheck;
  const tint = denied ? "oklch(0.65 0.2 20)" : "oklch(0.78 0.12 175)";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6, rotateX: 40 }}
      animate={{ opacity: 1, scale: 1, rotateX: 0 }}
      transition={{ delay: 0.12, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
      className="preserve-3d relative grid size-36 place-items-center depth-3"
    >
      <span
        aria-hidden
        className="breathe absolute inset-0 rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, ${tint}, transparent 68%)`, opacity: 0.55 }}
      />
      <span
        aria-hidden
        className="ring-orbit absolute inset-0 rounded-full border border-dashed"
        style={{ borderColor: `color-mix(in oklch, ${tint} 40%, transparent)` }}
      />
      <span
        aria-hidden
        className="ring-orbit-reverse absolute inset-[14%] rounded-full border"
        style={{ borderColor: `color-mix(in oklch, ${tint} 26%, transparent)` }}
      />
      <span
        aria-hidden
        className="ring-orbit absolute inset-[14%] rounded-full"
        style={{ "--orbit-dur": "12s" } as React.CSSProperties}
      >
        <span
          className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full"
          style={{ background: tint, boxShadow: `0 0 12px ${tint}` }}
        />
      </span>

      <motion.span
        animate={
          denied
            ? { x: [0, -7, 6, -4, 0] }
            : { y: [0, -6, 0] }
        }
        transition={
          denied
            ? { duration: 0.45, ease: "easeOut" }
            : { duration: 5.5, repeat: Infinity, ease: "easeInOut" }
        }
        className="scan-sweep relative grid size-[4.6rem] place-items-center overflow-hidden rounded-[1.5rem] border border-white/15 bg-white/[0.07] backdrop-blur-xl"
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={phase}
            initial={{ opacity: 0, scale: 0.7, rotate: -25 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.7, rotate: 25 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <Icon
              className={`size-8 ${denied ? "text-rose-300" : "text-teal-200"}`}
              strokeWidth={1.6}
            />
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </motion.div>
  );
}

function StatusLine({ tone, label }: { tone: "idle" | "live" | "denied"; label: string }) {
  const dot =
    tone === "denied" ? "bg-rose-400" : tone === "live" ? "bg-teal-300" : "bg-white/40";
  return (
    <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
      <span className="relative flex size-1.5">
        {tone === "live" && (
          <span className={`absolute inline-flex size-full animate-ping rounded-full ${dot}`} />
        )}
        <span className={`relative inline-flex size-1.5 rounded-full ${dot}`} />
      </span>
      {label}
    </div>
  );
}

function PhaseBlock({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -14, filter: "blur(8px)" }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
