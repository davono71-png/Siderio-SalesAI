// Le icone delle applicazioni Siderio: due lettere bombate su quadrato colorato.
// La prima è sempre la S sagomata di Siderio, la seconda è l'iniziale
// dell'applicazione in stampatello minuscolo (la Suite ha la S da sola).
// Deciso da Davide il 20 ottobre 2026; ogni applicazione ha questo stesso
// file, cambia solo la parte di impostazioni qui sotto.
//
//   npm i --no-save playwright-core
//   node strumenti/icone.mjs
//
// Tre forme, perché chi mostra l'icona ritaglia in modo diverso:
// - "stondata": angoli stondati e trasparenti (raggio 22% del lato). Windows
//   mette sulla scrivania le icone del manifest così come sono, senza ritagliare.
// - "piena": quadrato pieno, per iPhone, che gli angoli li stonda da sé.
// - "maskable": quadrato pieno con le lettere più piccole, perché Android
//   ritaglia come vuole e del quadrato garantisce solo la parte centrale.
import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";

// ── Impostazioni di questa applicazione ─────────────────────────────────────
// Sales AI: Sa su viola.
const LETTERA = "a";
const CHIARO = "#8a5cff";
const SCURO = "#4b1fc4";
const ICONE = [
  { nome: "public/icons/icon-512.png", lato: 512, forma: "stondata" },
  { nome: "public/icons/icon-192.png", lato: 192, forma: "stondata" },
  { nome: "public/icons/icon-512-maskable.png", lato: 512, forma: "maskable" },
  { nome: "app/icon.png", lato: 512, forma: "stondata" },
  { nome: "app/apple-icon.png", lato: 180, forma: "piena" },
];
const ICO = [
];
// ────────────────────────────────────────────────────────────────────────────

// Il segno Siderio, dal file vettoriale ufficiale del logo.
const TRACCIATO = "M 318 90 L 281 108 L 255 125 L 238 139 L 210 167 L 197 185 L 187 206 L 179 234 L 177 245 L 177 255 L 176 256 L 177 267 L 179 272 L 184 276 L 194 275 L 207 270 L 216 265 L 240 257 L 246 257 L 247 256 L 266 257 L 283 264 L 293 274 L 298 285 L 298 292 L 299 293 L 297 310 L 291 328 L 284 343 L 268 369 L 255 386 L 234 409 L 219 423 L 201 437 L 198 438 L 211 432 L 240 414 L 263 397 L 286 377 L 301 362 L 319 341 L 331 324 L 345 298 L 351 277 L 351 270 L 352 269 L 351 259 L 347 249 L 337 238 L 324 231 L 304 226 L 278 226 L 267 228 L 245 229 L 237 226 L 234 223 L 231 215 L 231 206 L 235 188 L 245 165 L 256 148 L 272 129 L 291 110 L 304 99 Z";
// Il segno originale è sottile accanto a una lettera nera: lo si ingrossa con
// un contorno dello stesso colore, e il riquadro si allarga di conseguenza.
const RIQUADRO = "166 80 196 368";
const SPESSORE = 16;

const disegno = (lato, forma) => {
  const scala = forma === "maskable" ? 0.78 : 1;
  const solo = !LETTERA;
  const sh = lato * scala * (solo ? 0.68 : 0.52);
  const sw = (sh * 196) / 368;
  const raggio = forma === "stondata" ? "22%" : "0";
  return `<!doctype html><html><body style="margin:0;background:transparent">
<div style="position:relative;width:${lato}px;height:${lato}px;border-radius:${raggio};overflow:hidden;
  background:linear-gradient(165deg, ${CHIARO} 0%, ${SCURO} 100%);
  box-shadow: inset 0 ${lato * 0.025}px ${lato * 0.04}px rgba(255,255,255,.45), inset 0 -${lato * 0.035}px ${lato * 0.06}px rgba(0,0,0,.28)">
  <div style="position:absolute;inset:0;background:radial-gradient(120% 70% at 30% 0%, rgba(255,255,255,.35), rgba(255,255,255,0) 60%)"></div>
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:${lato * scala * 0.035}px;
    filter: drop-shadow(0 ${lato * 0.018}px ${lato * 0.02}px rgba(0,0,0,.35))">
    <svg viewBox="${RIQUADRO}" width="${sw}" height="${sh}" style="${solo ? "" : `margin-top:${-lato * scala * 0.02}px`}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#dcdde6"/></linearGradient></defs>
      <path d="${TRACCIATO}" fill="url(#g)" stroke="url(#g)" stroke-width="${SPESSORE}" stroke-linejoin="round"/>
    </svg>
    ${solo ? "" : `<span style="font:900 ${lato * scala * 0.47}px/1 'Inter';letter-spacing:-.02em;margin-top:${lato * scala * 0.06}px;
      background:linear-gradient(180deg,#fff 30%,#dcdde6);-webkit-background-clip:text;color:transparent">${LETTERA}</span>`}
  </div>
</div></body></html>`;
};

// Un .ico è un indice seguito dalle immagini: dal 2007 Windows accetta dentro
// dei PNG così come sono, quindi basta metterli in fila.
const ico = (pngs) => {
  const testa = Buffer.alloc(6 + 16 * pngs.length);
  testa.writeUInt16LE(0, 0);
  testa.writeUInt16LE(1, 2);
  testa.writeUInt16LE(pngs.length, 4);
  let posizione = testa.length;
  pngs.forEach(({ lato, dati }, i) => {
    const o = 6 + 16 * i;
    testa.writeUInt8(lato >= 256 ? 0 : lato, o);
    testa.writeUInt8(lato >= 256 ? 0 : lato, o + 1);
    testa.writeUInt16LE(1, o + 4);
    testa.writeUInt16LE(32, o + 6);
    testa.writeUInt32LE(dati.length, o + 8);
    testa.writeUInt32LE(posizione, o + 12);
    posizione += dati.length;
  });
  return Buffer.concat([testa, ...pngs.map((p) => p.dati)]);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const disegna = async (lato, forma) => {
  const p = await browser.newPage({ viewport: { width: lato, height: lato } });
  await p.setContent(disegno(lato, forma));
  await p.evaluate(() => document.fonts.ready);
  const dati = await p.screenshot({ omitBackground: true });
  await p.close();
  return dati;
};
for (const { nome, lato, forma } of ICONE) {
  await writeFile(nome, await disegna(lato, forma));
  console.log("scritta", nome, `${lato}×${lato}`, forma);
}
for (const { nome, misure, forma } of ICO ?? []) {
  const pngs = [];
  for (const lato of misure) pngs.push({ lato, dati: await disegna(lato, forma) });
  await writeFile(nome, ico(pngs));
  console.log("scritta", nome, misure.join(", "), forma);
}
await browser.close();
