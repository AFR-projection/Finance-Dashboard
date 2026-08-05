# Dark Field

> Filosofi visual untuk permukaan kendali yang mengamati sistem hidup.
> Ditulis lebih dulu, sebelum satu komponen pun disentuh, supaya setiap keputusan
> kecil di kanvas punya alasan yang sama.

---

## I. Manifesto

Dalam mikroskopi medan gelap, spesimen tidak disinari dari depan. Latar dibiarkan
tanpa cahaya sama sekali, dan yang terlihat hanyalah apa yang benar-benar
memancar sendiri. Struktur yang mati tetap gelap. Struktur yang hidup bercahaya.
Itu seluruh gagasan gerakan ini: **permukaan tidak menerangi dirinya sendiri —
ia hanya membiarkan sinyal yang hidup terlihat.** Segala sesuatu yang tidak
sedang terjadi harus mundur ke dalam kegelapan dengan sukarela, dan segala
sesuatu yang sedang terjadi tidak butuh dekorasi apa pun untuk menonjol. Sebuah
karya yang dibangun dengan disiplin ini terbaca seolah disusun berbulan-bulan
oleh seseorang yang sudah lama berhenti mencoba mengesankan siapa pun.

Ruang di sini bukan latar, melainkan bahan. Kegelapan diberi kedalaman berlapis
— bidang paling bawah nyaris hitam kebiruan, bidang kerja satu tingkat di
atasnya, kartu satu tingkat lagi — sehingga mata membaca hierarki sebagai jarak
fisik, bukan sebagai garis kotak. Batas dijaga setipis mungkin dan nyaris tidak
pernah putih; ia hadir untuk menyatakan tepi, bukan untuk menarik perhatian.
Bidang-bidang ini disusun dengan ketelitian yang menyakitkan: satu kartu yang
melayang setengah tingkat terlalu tinggi akan merusak seluruh ilusi kedalaman,
dan mata akan menyadarinya jauh sebelum pikiran bisa menjelaskan kenapa.

Warna adalah mata uang paling mahal di ruangan ini, dan karena itu dibelanjakan
paling hemat. Sembilan puluh persen permukaan tidak berwarna — hanya derajat
kegelapan. Warna disimpan untuk tiga hal saja: kategori, keadaan, dan bahaya.
Satu aksen dingin menandai apa yang sehat dan sedang bekerja; satu aksen hangat
menandai apa yang sedang menunggu; satu aksen merah menandai apa yang gagal, dan
tidak pernah dipakai untuk hal lain — sekali merah dipakai sebagai hiasan, ia
kehilangan hak untuk berteriak. Warna tidak pernah menjadi satu-satunya pembeda:
setiap keadaan juga membawa bentuk, ikon, dan kata, sehingga karyanya tetap utuh
bagi mata yang tidak membedakan warna. Kalibrasi ini dikerjakan berulang-ulang,
nilai demi nilai, sampai tidak ada satu pun rona yang hadir karena kebetulan.

Ritme dibangun dari kepadatan yang jujur. Ini permukaan kerja, bukan halaman
pemasaran: jarak dipendekkan, tinggi baris dipadatkan, angka disejajarkan pada
lebar digit yang sama supaya kolom bisa dibaca menurun tanpa berpindah mata.
Justru karena rapat, setiap ruang kosong yang tersisa menjadi keputusan yang
harus dipertahankan — jeda hanya diberikan di tempat yang memisahkan dua gagasan
berbeda, tidak pernah sebagai kebiasaan. Tipografi berbicara pelan: satu keluarga
huruf, tiga ukuran, dua bobot. Huruf besar renggang dipakai hanya untuk label
kategori yang harus dikenali tanpa dibaca. Teks panjang tidak punya tempat di
sini; apa pun yang butuh paragraf untuk dijelaskan berarti belum selesai
dirancang.

Gerak adalah alat ukur, bukan hiburan. Satu-satunya hal yang boleh bergerak
terus-menerus adalah hal yang memang sedang berjalan sekarang — sisanya diam
sepenuhnya. Transisi dijaga pendek dan melambat di ujung, seperti benda bermassa
yang berhenti sendiri, dan setiap animasi punya kewajiban menjelaskan sesuatu:
dari mana sebuah elemen datang, ke mana ia pergi, berapa lama sesuatu berlangsung.
Ketika seseorang menyatakan tidak ingin ada gerak, seluruh gerak berhenti dan
karyanya harus tetap terbaca utuh — kalau informasinya hilang bersama animasinya,
informasi itu tidak pernah benar-benar ada di sana. Kehalusan seperti ini tidak
datang dari satu lintasan; ia hasil dari perbaikan berulang oleh orang yang tahu
persis kapan harus berhenti menambah.

Terakhir, dan ini yang mengikat semuanya: **data yang ditampilkan harus data yang
benar-benar terjadi.** Tidak ada grafik dekoratif, tidak ada angka contoh, tidak
ada indikator yang selalu hijau. Sebuah permukaan pengamatan yang berbohong satu
kali kehilangan seluruh nilainya, dan kepercayaan itu tidak bisa dikembalikan
dengan desain. Estetika medan gelap pada akhirnya adalah etika: yang bercahaya
bercahaya karena hidup, dan yang gelap gelap karena memang tidak ada apa-apa di
sana.

---

## II. Terjemahan ke permukaan

| Prinsip | Wujud konkret |
|---|---|
| Latar tidak menerangi diri | Kanvas paling gelap; kartu node hanya sedikit lebih terang; cahaya sungguhan hanya dari node yang sedang berjalan |
| Kedalaman berlapis | Tiga tingkat elevasi: bidang halaman → panel → kartu. Tidak ada tingkat keempat |
| Warna sebagai mata uang | Enam aksen kategori, tiga aksen keadaan. Merah tidak pernah dekoratif |
| Kepadatan jujur | Skala jarak 4/8/12/16/24. Baris log setinggi 28–32px. Angka `tabular-nums` |
| Gerak sebagai ukuran | Hanya elemen yang sedang berjalan yang beranimasi. Durasi 160–280ms, easing keluar-melambat |
| Data yang jujur | Setiap angka punya sumber tabel/buffer yang bisa ditunjuk. Kosong ditampilkan sebagai kosong |

## III. Yang dilarang

- Gradien dekoratif pada permukaan kerja.
- Animasi yang berjalan saat tidak ada yang terjadi.
- Warna sebagai satu-satunya pembawa makna.
- Angka tanpa sumber, indikator yang tidak pernah merah.
- Paragraf penjelasan di dalam permukaan kendali.
- Tingkat elevasi keempat, atau bayangan yang tidak menyatakan jarak.
