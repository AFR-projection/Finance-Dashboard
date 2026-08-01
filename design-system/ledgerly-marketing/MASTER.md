# Ledgerly Marketing — Design System MASTER

Sumber kebenaran untuk semua halaman marketing (`/`, `/daftar`, `/masuk`).
Halaman app (`/dashboard/*`) TIDAK memakai dokumen ini — mereka punya konvensi sendiri.

## 1. Arsitektur Token (3 layer)

```
Primitive  (globals.css :root)   --ink, --brand-glow, --primary, --accent, --radius
     ↓
Semantic   (globals.css @theme)  --color-ink-*, --color-primary, --radius-2xl
     ↓
Component  (utility .mk-*)       .mk-cta-primary, .mk-card, .mk-ink, .mk-display
```

Aturan: **komponen marketing tidak boleh menulis nilai OKLCH/hex mentah.**
Satu-satunya pengecualian: gradien dekoratif `aria-hidden` (aurora, glow) yang
tidak membawa informasi.

### Primitive baru (marketing)

| Token | Nilai | Kegunaan |
|---|---|---|
| `--ink` | `oklch(0.16 0.03 190)` | Dasar surface gelap |
| `--ink-soft` | `oklch(0.21 0.032 188)` | Card di atas ink |
| `--ink-foreground` | `oklch(0.96 0.008 175)` | Teks utama di ink (≈13:1) |
| `--ink-muted` | `oklch(0.72 0.02 180)` | Teks sekunder di ink (≈7:1) |
| `--ink-border` | `oklch(0.32 0.025 185)` | Border di ink (non-teks, 3:1 cukup) |
| `--brand-glow` | `oklch(0.78 0.12 175)` | Teal terang untuk ikon/link di ink (≈4.9:1) |

## 2. Kontras (WCAG AA)

| Pasangan | Rasio | Status |
|---|---|---|
| `foreground` di `background` | ≈ 14:1 | AAA |
| `muted-foreground` di `background` | ≈ 5.5:1 | AA |
| `primary-foreground` di `primary` | ≈ 9:1 | AAA |
| `ink-foreground` di `ink` | ≈ 13:1 | AAA |
| `ink-muted` di `ink` | ≈ 7:1 | AAA |
| `brand-glow` di `ink` | ≈ 4.9:1 | AA |

Larangan: `text-white/45`, `text-white/60` dan sejenisnya untuk teks bermakna di
surface gelap — selalu `text-ink-muted` / `text-ink-foreground`. Opacity putih
hanya untuk elemen dekoratif `aria-hidden`.

## 3. Typography

Dua keluarga, tidak lebih: **Manrope** (semua UI/body/heading) + **Instrument
Serif** (aksen italic, maksimal satu frasa per heading).

| Utility | Ukuran (fluid 375→1440) | Pakai untuk |
|---|---|---|
| `.mk-display` | 2.6rem → 4.6rem, lh 1.02 | H1 hero, satu per halaman |
| `.mk-h2` | 1.9rem → 2.8rem, lh 1.08 | Judul section |
| `.mk-lead` | 1.05rem → 1.25rem, lh 1.6 | Paragraf pembuka section |
| `.mk-serif` | inherit | Frasa aksen italic dalam heading |
| `.mk-eyebrow` | 11px, tracking 0.2em | Label kecil di atas judul section |
| body | 16px (`text-base`), lh 1.5+ | Default |

Angka uang selalu `tabular-money`.

## 4. Spacing & Rhythm

- Section: `.mk-section` — `clamp(4rem, 2.5rem + 6vw, 7.5rem)` vertikal. Semua
  section pakai ini; tidak ada py-16/py-20 lepas.
- Container: `.mk-container` — max 72rem, padding-inline fluid.
- Grid gap: 1rem (kartu rapat, mis. bento), 1.25rem (default), 2rem (kolom hero).
- Radius: kartu `rounded-3xl`, CTA `rounded-2xl`, chip `rounded-full`.

## 5. Surface Rhythm (kunci "premium")

Halaman bergantian terang–gelap supaya scroll punya irama, bukan satu warna
panjang:

```
Header (light, blur)
Hero (light + aurora)          ← produk diperlihatkan, bukan diceritakan
Logo/stat strip (light, tipis)
Fitur bento (light)
Dark band: AI proaktif (mk-ink) ← momen "wow", satu saja di tengah
Cara kerja (light)
Pricing (light + 1 kartu ink)  ← kartu Premium memakai mk-ink
FAQ (light)
CTA akhir (mk-ink)
Footer (light)
```

Aturan: **maksimal 3 blok ink per halaman** (band tengah, kartu premium, CTA
akhir). Lebih dari itu efeknya hilang.

## 6. Spesifikasi Komponen

### CTA
| Varian | Class | Konteks |
|---|---|---|
| Primary | `.mk-cta .mk-cta-primary` | Aksi utama di surface terang |
| Ghost | `.mk-cta .mk-cta-ghost` | Aksi sekunder di surface terang |
| Inverse | `.mk-cta .mk-cta-inverse` | Aksi utama di surface ink |

Semua: min-h 48px (≥44px touch), focus ring 3px + offset, hover -translate-y-0.5,
active kembali 0. Ikon lucide 16px, `strokeWidth` 2–2.4. **Tanpa emoji.**

### Card
`.mk-card` (+ `.mk-card-hover` bila klikabel/di-grid). Di ink: `bg-ink-soft/60
border-ink-border`.

### Bento grid fitur
6 sel: 1 besar (2×2 berisi mini-visual), 4 kecil, 1 lebar. `md:grid-cols-3`,
mobile jadi satu kolom urut prioritas.

### Mockup produk (hero)
Dashboard mini digambar dengan komponen nyata (bukan screenshot berat):
stat cards + bar chart CSS + overlay chat bubble Telegram. Semua data contoh
konsisten (angka di chat = angka di dashboard).

## 7. Motion

- Reveal on scroll: fade + translateY 24px, 0.55s, easing `[0.22,1,0.36,1]`,
  stagger 70ms, `viewport once`.
- Hover: 200–300ms. Loop dekoratif hanya aurora/sheen yang sudah ada.
- `prefers-reduced-motion` sudah dimatikan global di globals.css — komponen
  framer-motion wajib cek `useReducedMotion()`.

## 8. Aksesibilitas (checklist per halaman)

- [ ] `.mk-skip-link` sebagai anak pertama body-level page
- [ ] Satu `<h1>`, hierarchy tanpa lompat
- [ ] `<main id="konten-utama">` + landmark header/footer/nav
- [ ] Focus ring terlihat di SEMUA interaktif (termasuk di ink)
- [ ] Touch target ≥ 44px
- [ ] Ikon dekoratif `aria-hidden`; ikon bermakna diberi label
- [ ] Kontras sesuai tabel §2
- [ ] Form: label terikat, error `role="alert"`, helper `aria-describedby`

## 9. SEO (halaman marketing)

- `metadataBase` + title template di root layout
- Canonical per halaman via `alternates.canonical`
- JSON-LD di `/`: Organization, WebApplication, FAQPage (isi FAQPage = persis
  FAQ yang terlihat, jangan mengarang)
- `robots.ts` + `sitemap.ts` hanya memuat halaman publik (`/`, `/daftar`, `/masuk`)
- OG image via `opengraph-image.tsx` (ImageResponse, 1200×630)
