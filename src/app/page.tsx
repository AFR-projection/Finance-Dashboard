import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  MessageCircle,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  Target,
  Wallet,
  Zap,
} from "lucide-react";
import { AuroraScene } from "@/components/motion/aurora-scene";
import { FaqAccordion, type FaqItem } from "@/components/marketing/faq-accordion";
import { InsightShowcase } from "@/components/marketing/insight-showcase";
import { ProductMockup } from "@/components/marketing/product-mockup";
import { Reveal } from "@/components/marketing/reveal";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  // `absolute` opts out of the layout's `%s · Ledgerly` template — the brand
  // is already at the front of this title.
  title: { absolute: "Ledgerly — Catat Keuangan Otomatis Lewat Chat Telegram" },
  description:
    "Aplikasi catat keuangan berbasis AI. Kirim chat “kopi 32rb pake gopay” ke Telegram — kategori, dompet, budget, dan laporan terurus otomatis. Gratis, tanpa kartu kredit.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Ledgerly — Catat Keuangan Otomatis Lewat Chat Telegram",
    description:
      "Kirim satu chat tiap habis belanja. AI Ledgerly yang mencatat, mengategorikan, dan menyusun laporannya.",
    url: "/",
    siteName: SITE_NAME,
    locale: "id_ID",
    type: "website",
  },
};

/* Single source of truth for the FAQ: rendered UI and FAQPage JSON-LD must
 * never diverge, or the structured data becomes fiction. */
const faqs: FaqItem[] = [
  {
    q: "Perlu email atau password untuk daftar?",
    a: "Tidak. Pendaftaran cukup pilih username lalu tekan Start di bot Telegram — akun langsung aktif. Saat login, bot mengirim konfirmasi ke Telegram kamu sendiri, jadi tidak ada password yang bisa bocor.",
  },
  {
    q: "Bagaimana AI-nya tahu kategori transaksi saya?",
    a: "Kamu menulis dengan bahasa sehari-hari, misalnya “bensin 50rb pake bca”. AI membaca konteksnya: nominal 50.000, dompet BCA, kategori Transportasi. Kalau ragu, dia bertanya dulu, bukan menebak sembarangan.",
  },
  {
    q: "Apa bedanya paket Gratis dan Premium?",
    a: "Pencatatan, dompet, budget, target tabungan, dan dashboard terbuka penuh di paket Gratis, dengan jatah AI untuk pemakaian ringan. Premium (Rp 20.000 per 30 hari) memberi kuota AI jauh lebih besar plus laporan dan insight berkala yang dikirim otomatis ke Telegram.",
  },
  {
    q: "Apakah data keuangan saya aman?",
    a: "Setiap akun terisolasi di level database dan tidak ada koneksi ke rekening bank — kamu yang menentukan apa yang dicatat. Login selalu butuh konfirmasi dari Telegram yang tertaut, jadi orang yang tahu username kamu tetap tidak bisa masuk.",
  },
  {
    q: "Apakah harus bayar pakai kartu kredit?",
    a: "Tidak. Mulai sepenuhnya gratis tanpa data pembayaran. Kalau upgrade ke Premium, pembayaran lewat QRIS, transfer bank, atau e-wallet — sekali bayar berlaku 30 hari, tanpa perpanjangan otomatis.",
  },
  {
    q: "Kalau berhenti langganan, data saya hilang?",
    a: "Tidak hilang. Saat masa Premium habis, akun otomatis turun ke paket Gratis. Semua transaksi, dompet, dan laporan lama tetap bisa dibuka.",
  },
];

const bentoSmall = [
  {
    icon: Wallet,
    title: "Multi-dompet",
    body: "Rekening, e-wallet, dan tunai berdiri sendiri. Saldo bergerak otomatis tiap transaksi.",
  },
  {
    icon: PiggyBank,
    title: "Budget yang menegur",
    body: "Diperingatkan sebelum jebol — bukan setelah tanggal tua.",
  },
  {
    icon: Target,
    title: "Target tabungan",
    body: "Tentukan nominal dan tenggat; progres terhitung sendiri.",
  },
  {
    icon: BarChart3,
    title: "Analisis tren",
    body: "Kategori boros dan pola bulanan terbaca sekali lihat.",
  },
];

const steps = [
  {
    title: "Pilih username",
    body: "Tanpa email, tanpa password, tanpa formulir panjang. Satu nama yang jadi identitasmu.",
  },
  {
    title: "Tekan Start di Telegram",
    body: "Satu ketukan di bot — akun aktif dan langsung tertaut ke Telegram kamu.",
  },
  {
    title: "Catat sambil jalan",
    body: "Kirim pesan biasa tiap habis belanja. Dashboard, budget, dan laporan mengikuti.",
  },
];

const navLinks = [
  { href: "#fitur", label: "Fitur" },
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#harga", label: "Harga" },
  { href: "#faq", label: "FAQ" },
];

function jsonLd() {
  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
  };
  const webApplication = {
    "@type": "WebApplication",
    "@id": `${SITE_URL}/#app`,
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web, Telegram",
    inLanguage: "id",
    description:
      "Aplikasi catat keuangan berbasis AI: catat pengeluaran lewat chat Telegram, kelola budget dan target tabungan dari dashboard.",
    publisher: { "@id": `${SITE_URL}/#organization` },
    offers: [
      { "@type": "Offer", name: "Gratis", price: "0", priceCurrency: "IDR" },
      { "@type": "Offer", name: "Premium 30 hari", price: "20000", priceCurrency: "IDR" },
    ],
  };
  const faqPage = {
    "@type": "FAQPage",
    "@id": `${SITE_URL}/#faq`,
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return { "@context": "https://schema.org", "@graph": [organization, webApplication, faqPage] };
}

export default function LandingPage() {
  return (
    <div className="relative min-h-svh overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />
      <a href="#konten-utama" className="mk-skip-link">
        Langsung ke konten
      </a>

      <AuroraScene />

      <header className="mobile-safe-top sticky top-0 z-50 border-b border-white/50 bg-background/70 backdrop-blur-xl">
        <div className="mk-container flex h-16 items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles aria-hidden className="size-4.5" strokeWidth={2} />
            </span>
            <span className="text-lg font-bold tracking-[-0.03em] text-foreground">
              {SITE_NAME}
            </span>
          </Link>

          <nav aria-label="Navigasi utama" className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex h-11 items-center rounded-xl px-3.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/masuk"
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/60"
            >
              Masuk
            </Link>
            <Link href="/daftar" className="mk-cta mk-cta-primary min-h-11! px-4! text-sm!">
              Daftar
              <ArrowRight aria-hidden className="size-4" strokeWidth={2.2} />
            </Link>
          </div>
        </div>
      </header>

      <main id="konten-utama">
        {/* ============ HERO ============ */}
        <section className="mk-section relative">
          <div className="mk-container grid items-center gap-14 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
            <div>
              <Reveal>
                <p className="mk-eyebrow">
                  <MessageCircle aria-hidden className="size-3.5" strokeWidth={2.4} />
                  Asisten keuangan di Telegram
                </p>
              </Reveal>

              <Reveal index={1}>
                <h1 className="mk-display mt-5 text-foreground">
                  Ngobrol biasa,
                  <br />
                  <span className="mk-serif text-primary">keuangan tercatat.</span>
                </h1>
              </Reveal>

              <Reveal index={2}>
                <p className="mk-lead mt-6 max-w-xl text-muted-foreground">
                  Ketik <em className="not-italic font-semibold text-foreground">“kopi 32rb pake gopay”</em>{" "}
                  seperti chat ke teman. Ledgerly menangkap nominal, kategori, dan dompetnya —
                  lalu merapikan semuanya jadi dashboard, budget, dan laporan.
                </p>
              </Reveal>

              <Reveal index={3}>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link href="/daftar" className="mk-cta mk-cta-primary sheen h-13 px-7">
                    Mulai gratis
                    <ArrowRight aria-hidden className="size-4" strokeWidth={2.2} />
                  </Link>
                  <a href="#cara-kerja" className="mk-cta mk-cta-ghost h-13 px-7">
                    Lihat cara kerjanya
                  </a>
                </div>
              </Reveal>

              <Reveal index={4}>
                <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-muted-foreground">
                  {["Tanpa kartu kredit", "Tanpa password", "Aktif dalam 30 detik"].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check aria-hidden className="size-4 text-primary" strokeWidth={2.6} />
                      {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            <Reveal index={2} className="relative pt-8 sm:pl-8">
              <ProductMockup />
            </Reveal>
          </div>
        </section>

        {/* ============ VALUE STRIP ============ */}
        <section aria-label="Ringkasan nilai" className="border-y border-border/60 bg-card/40">
          <div className="mk-container grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { big: "±5 detik", small: "untuk mencatat satu transaksi" },
              { big: "0 formulir", small: "tidak ada dropdown kategori manual" },
              { big: "24/7", small: "bot siap terima catatan kapan pun" },
            ].map((stat) => (
              <div key={stat.big} className="flex flex-col items-center gap-1 px-6 py-7 text-center">
                <span className="tabular-money text-2xl font-bold tracking-[-0.03em] text-foreground">
                  {stat.big}
                </span>
                <span className="text-sm text-muted-foreground">{stat.small}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ============ FITUR (BENTO) ============ */}
        <section id="fitur" className="mk-section scroll-mt-20">
          <div className="mk-container">
            <Reveal className="max-w-2xl">
              <p className="mk-eyebrow">Fitur</p>
              <h2 className="mk-h2 mt-3 text-foreground">
                Pencatatan yang <span className="mk-serif text-primary">akhirnya konsisten</span>
              </h2>
              <p className="mk-lead mt-4 text-muted-foreground">
                Aplikasi keuangan gagal karena mencatatnya ribet. Ledgerly memangkas ritualnya
                jadi satu chat.
              </p>
            </Reveal>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {/* Big cell */}
              <Reveal className="md:col-span-2 md:row-span-2">
                <div className="mk-card mk-card-hover flex h-full flex-col p-7">
                  <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
                    <MessageCircle aria-hidden className="size-6" strokeWidth={2} />
                  </span>
                  <h3 className="mt-5 text-xl font-bold tracking-[-0.02em] text-foreground">
                    Bahasa sehari-hari, bukan formulir
                  </h3>
                  <p className="mt-2.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                    “beli makan 35 ribu”, “transfer 200rb ke tabungan”, “bulan ini jajan berapa?”
                    — semuanya dimengerti. Salah catat? Bilang saja “yang tadi harusnya 45rb”.
                  </p>
                  <div className="mt-auto space-y-2 pt-6">
                    {[
                      { user: "listrik 402rb dari bca", bot: "Tercatat. Tagihan · BCA" },
                      { user: "minggu ini boros di mana?", bot: "Jajan — Rp 213rb, 38% di atas rata-rata." },
                    ].map((pair) => (
                      <div key={pair.user} className="flex flex-col gap-1.5">
                        <span className="self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[13px] text-primary-foreground">
                          {pair.user}
                        </span>
                        <span className="self-start rounded-2xl rounded-bl-md bg-secondary px-3.5 py-2 text-[13px] text-secondary-foreground">
                          {pair.bot}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>

              {bentoSmall.map((feature, index) => (
                <Reveal key={feature.title} index={index}>
                  <div className="mk-card mk-card-hover h-full p-6">
                    <span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
                      <feature.icon aria-hidden className="size-5" strokeWidth={2} />
                    </span>
                    <h3 className="mt-4 text-base font-bold text-foreground">{feature.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {feature.body}
                    </p>
                  </div>
                </Reveal>
              ))}

              {/* Wide cell */}
              <Reveal className="md:col-span-3">
                <div className="mk-card mk-card-hover flex flex-col gap-5 p-7 sm:flex-row sm:items-center">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground">
                    <Zap aria-hidden className="size-6" strokeWidth={2} />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      Dashboard real-time di web
                    </h3>
                    <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      Semua yang kamu catat lewat chat langsung muncul di dashboard — arus kas,
                      saldo per dompet, progres budget, dan target tabungan. Satu sumber
                      kebenaran, dua pintu masuk.
                    </p>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ============ DARK BAND: AI PROAKTIF ============ */}
        <section aria-labelledby="judul-proaktif" className="mk-ink vault-noise relative overflow-hidden">
          <div className="mk-section relative">
            <div className="mk-container grid items-center gap-12 lg:grid-cols-2">
              <div>
                <Reveal>
                  <p className="mk-eyebrow text-brand-glow!">
                    <BellRing aria-hidden className="size-3.5" strokeWidth={2.4} />
                    Bukan sekadar pencatat
                  </p>
                </Reveal>
                <Reveal index={1}>
                  <h2 id="judul-proaktif" className="mk-h2 mt-4 text-ink-foreground">
                    AI yang <span className="mk-serif text-brand-glow">menyapa duluan</span>,
                    bukan menunggu ditanya
                  </h2>
                </Reveal>
                <Reveal index={2}>
                  <p className="mk-lead mt-5 max-w-xl text-ink-muted">
                    Ledgerly memantau pola keuanganmu di belakang layar. Budget hampir jebol,
                    langganan terlupakan, pengeluaran tak wajar — kamu diberi tahu lewat
                    Telegram sebelum jadi masalah.
                  </p>
                </Reveal>
                <Reveal index={3}>
                  <ul className="mt-7 space-y-3 text-sm">
                    {[
                      "Laporan mingguan & bulanan otomatis",
                      "Peringatan dini sebelum budget jebol",
                      "Deteksi pengeluaran tidak biasa",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2.5 text-ink-foreground">
                        <Check aria-hidden className="size-4 shrink-0 text-brand-glow" strokeWidth={2.6} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </Reveal>
              </div>

              <InsightShowcase />
            </div>
          </div>
        </section>

        {/* ============ CARA KERJA ============ */}
        <section id="cara-kerja" className="mk-section scroll-mt-20">
          <div className="mk-container">
            <Reveal className="max-w-2xl">
              <p className="mk-eyebrow">Cara kerja</p>
              <h2 className="mk-h2 mt-3 text-foreground">
                Dari nol ke tercatat <span className="mk-serif text-primary">dalam 30 detik</span>
              </h2>
            </Reveal>

            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {steps.map((step, index) => (
                <Reveal as="li" key={step.title} index={index}>
                  <div className="mk-card relative h-full p-7">
                    <span
                      aria-hidden
                      className="font-[family-name:var(--font-display)] text-5xl text-primary/25"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-3 text-base font-bold text-foreground">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                    {index < steps.length - 1 && (
                      <ArrowRight
                        aria-hidden
                        className="absolute -right-4 top-1/2 hidden size-4 -translate-y-1/2 text-border md:block"
                        strokeWidth={2.4}
                      />
                    )}
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ============ HARGA ============ */}
        <section id="harga" className="mk-section scroll-mt-20">
          <div className="mk-container">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="mk-eyebrow justify-center">Harga</p>
              <h2 className="mk-h2 mt-3 text-foreground">
                Mulai gratis, <span className="mk-serif text-primary">naik kalau butuh</span>
              </h2>
              <p className="mk-lead mt-4 text-muted-foreground">
                Pencatatan dan dashboard tidak pernah dikunci. Yang berbayar hanya kapasitas
                AI-nya.
              </p>
            </Reveal>

            <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
              <Reveal>
                <div className="mk-card flex h-full flex-col p-8">
                  <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Gratis
                  </h3>
                  <p className="mt-4 flex items-baseline gap-1.5">
                    <span className="tabular-money text-[2.6rem] leading-none font-bold text-foreground">
                      Rp 0
                    </span>
                    <span className="text-sm text-muted-foreground">/bulan</span>
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Cukup untuk merapikan keuangan pribadi, selamanya.
                  </p>
                  <ul className="mt-7 space-y-3.5 text-sm">
                    {[
                      "Transaksi & dompet tanpa batas",
                      "Dashboard, budget, target tabungan",
                      "Catat lewat chat Telegram",
                      "Jatah AI untuk pemakaian ringan",
                    ].map((item) => (
                      <li key={item} className="flex gap-2.5 text-foreground">
                        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.6} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link href="/daftar" className="mk-cta mk-cta-ghost mt-8 w-full">
                    Daftar gratis
                  </Link>
                </div>
              </Reveal>

              <Reveal index={1}>
                <div className="mk-ink vault-noise relative flex h-full flex-col overflow-hidden rounded-3xl p-8 shadow-[0_36px_90px_-46px_oklch(0.16_0.03_190/.9)]">
                  <span aria-hidden className="sheen pointer-events-none absolute inset-0" />
                  <div className="relative flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-muted">
                      Premium
                    </h3>
                    <span className="rounded-full border border-ink-border bg-ink-soft px-3 py-1 text-[11px] font-bold text-brand-glow">
                      Paling lengkap
                    </span>
                  </div>
                  <p className="relative mt-4 flex items-baseline gap-1.5">
                    <span className="tabular-money text-[2.6rem] leading-none font-bold text-ink-foreground">
                      Rp 20.000
                    </span>
                    <span className="text-sm text-ink-muted">/30 hari</span>
                  </p>
                  <p className="relative mt-3 text-sm leading-relaxed text-ink-muted">
                    Buat yang tiap hari mengandalkan AI-nya. Tanpa perpanjangan otomatis.
                  </p>
                  <ul className="relative mt-7 space-y-3.5 text-sm">
                    {[
                      "Semua fitur paket Gratis",
                      "Kuota AI jauh lebih besar",
                      "Laporan berkala otomatis ke Telegram",
                      "Insight proaktif saat ada anomali",
                    ].map((item) => (
                      <li key={item} className="flex gap-2.5 text-ink-foreground">
                        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-glow" strokeWidth={2.6} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link href="/daftar" className="mk-cta mk-cta-inverse relative mt-8 w-full">
                    Mulai dari gratis
                    <ArrowRight aria-hidden className="size-4" strokeWidth={2.2} />
                  </Link>
                  <p className="relative mt-3 text-center text-xs text-ink-muted">
                    Upgrade kapan saja dari dashboard
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section id="faq" className="mk-section scroll-mt-20">
          <div className="mk-container max-w-3xl">
            <Reveal>
              <p className="mk-eyebrow">FAQ</p>
              <h2 className="mk-h2 mt-3 text-foreground">Pertanyaan yang sering muncul</h2>
            </Reveal>
            <Reveal index={1} className="mt-8">
              <FaqAccordion items={faqs} />
            </Reveal>
          </div>
        </section>

        {/* ============ CTA AKHIR ============ */}
        <section aria-labelledby="judul-cta" className="pb-24">
          <div className="mk-container">
            <Reveal>
              <div className="mk-ink vault-noise relative overflow-hidden rounded-[2.2rem] px-7 py-16 text-center shadow-[0_40px_100px_-50px_oklch(0.16_0.03_190/.9)] sm:px-12 sm:py-20">
                <span aria-hidden className="sheen pointer-events-none absolute inset-0" />
                <div
                  aria-hidden
                  className="absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.6_0.13_175/.3),transparent_65%)] blur-3xl"
                />
                <div className="relative mx-auto max-w-2xl">
                  <p className="mk-eyebrow justify-center text-brand-glow!">
                    <ShieldCheck aria-hidden className="size-3.5" strokeWidth={2.4} />
                    Tanpa password · konfirmasi via Telegram
                  </p>
                  <h2 id="judul-cta" className="mk-h2 mt-5 text-ink-foreground">
                    Transaksi berikutnya,{" "}
                    <span className="mk-serif text-brand-glow">coba catat lewat chat</span>
                  </h2>
                  <p className="mk-lead mt-5 text-ink-muted">
                    Akun aktif dalam hitungan detik — tidak ada email verifikasi, tidak ada
                    kartu kredit.
                  </p>
                  <Link href="/daftar" className="mk-cta mk-cta-inverse mt-9 h-13 px-8">
                    Buat akun gratis
                    <ArrowRight aria-hidden className="size-4" strokeWidth={2.2} />
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="mobile-safe-bottom border-t border-border/70 bg-card/50 backdrop-blur">
        <div className="mk-container grid gap-10 py-12 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles aria-hidden className="size-4" strokeWidth={2} />
              </span>
              <span className="text-sm font-bold tracking-[-0.02em] text-foreground">
                {SITE_NAME}
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Asisten keuangan pribadi berbasis AI. Catat lewat Telegram, pantau lewat
              dashboard.
            </p>
          </div>

          <nav aria-label="Produk">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Produk
            </h3>
            <ul className="mt-4 space-y-1">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="inline-flex min-h-9 items-center rounded-lg text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Akun">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Akun
            </h3>
            <ul className="mt-4 space-y-1">
              <li>
                <Link
                  href="/daftar"
                  className="inline-flex min-h-9 items-center rounded-lg text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  Daftar
                </Link>
              </li>
              <li>
                <Link
                  href="/masuk"
                  className="inline-flex min-h-9 items-center rounded-lg text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  Masuk
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-border/60">
          <div className="mk-container flex flex-col items-center gap-2 py-5 text-center sm:flex-row sm:justify-between">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} {SITE_NAME}. Semua hak dilindungi.
            </p>
            <p className="text-xs text-muted-foreground">Dibuat untuk yang capek nyatet manual.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
