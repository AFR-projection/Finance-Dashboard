/**
 * Menonaktifkan jeda backoff sungguhan selama test.
 *
 * Beberapa test sengaja memaksa kegagalan sementara agar percobaan ulangnya
 * ikut teruji. Dengan jeda asli, tiap test seperti itu menambah satu setengah
 * detik nyata ke suite tanpa membuktikan apa pun — yang diuji adalah berapa
 * kali penyedia dipanggil, bukan berapa lama ditunggu. Jeda itu sendiri diuji
 * terpisah di `src/ai/openrouter.test.ts`, yang memasang perekamnya sendiri.
 */

import { setRetrySleeper } from "@/ai/openrouter";

setRetrySleeper(async () => {});
