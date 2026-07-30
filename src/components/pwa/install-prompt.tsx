"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Share, Plus, Smartphone, X } from "lucide-react";

const DISMISS_KEY = "ledgerly:install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

const noopSubscribe = () => () => {};

/** iOS eligibility is read from the browser, not from an event, so it is a
 *  render-time snapshot rather than effect state. */
function useIosHintEligible() {
  return useSyncExternalStore(
    noopSubscribe,
    () => !isStandalone() && isIosSafari() && localStorage.getItem(DISMISS_KEY) !== "1",
    () => false,
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const iosEligible = useIosHintEligible();

  useEffect(() => {
    const handler = (event: Event) => {
      if (isStandalone() || localStorage.getItem(DISMISS_KEY) === "1") return;
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDeferred(null);
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") localStorage.setItem(DISMISS_KEY, "1");
    setDeferred(null);
  }

  const showIosHint = iosEligible && !dismissed;
  const visible = Boolean(deferred) || showIosHint;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-3xl border border-border/60 bg-card/95 p-4 shadow-[0_28px_60px_-32px_rgba(15,45,38,.45)] backdrop-blur-xl lg:inset-x-auto lg:right-6 lg:bottom-6"
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="Tutup"
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="size-4" />
          </button>

          <div className="flex items-start gap-3 pr-8">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Smartphone className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-[-0.02em]">Pasang Ledgerly</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {showIosHint
                  ? "Buka menu Bagikan, lalu pilih “Tambahkan ke Layar Utama”."
                  : "Jalankan seperti aplikasi: layar penuh, buka lebih cepat, bisa dapat notifikasi."}
              </p>
            </div>
          </div>

          {showIosHint ? (
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-muted/60 px-3 py-2.5 text-[12px] font-medium text-muted-foreground">
              <Share className="size-4 shrink-0" />
              <span>Bagikan</span>
              <span className="text-border">→</span>
              <Plus className="size-4 shrink-0" />
              <span>Layar Utama</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void install()}
              className="mt-4 h-11 w-full rounded-2xl bg-primary text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              Pasang sekarang
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
