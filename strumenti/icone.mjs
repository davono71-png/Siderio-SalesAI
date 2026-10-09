// Le icone di Sales AI: il segno Siderio, bianco, su quadrato pieno viola.
// Stesso segno e stessa forma delle altre applicazioni Siderio (vedi
// strumenti/icone.mjs della Suite); il colore resta quello di Sales AI, così
// sulla scrivania si riconosce a colpo d'occhio.
//
//   npm i --no-save playwright-core
//   node strumenti/icone.mjs
//
import { chromium } from "playwright-core";

const TRACCIATO = "M 318 90 L 281 108 L 255 125 L 238 139 L 210 167 L 197 185 L 187 206 L 179 234 L 177 245 L 177 255 L 176 256 L 177 267 L 179 272 L 184 276 L 194 275 L 207 270 L 216 265 L 240 257 L 246 257 L 247 256 L 266 257 L 283 264 L 293 274 L 298 285 L 298 292 L 299 293 L 297 310 L 291 328 L 284 343 L 268 369 L 255 386 L 234 409 L 219 423 L 201 437 L 198 438 L 211 432 L 240 414 L 263 397 L 286 377 L 301 362 L 319 341 L 331 324 L 345 298 L 351 277 L 351 270 L 352 269 L 351 259 L 347 249 L 337 238 L 324 231 L 304 226 L 278 226 L 267 228 L 245 229 L 237 226 L 234 223 L 231 215 L 231 206 L 235 188 L 245 165 L 256 148 L 272 129 L 291 110 L 304 99 Z";
// Il riquadro del file originale attorno al solo segno.
const RIQUADRO = "176 90 176 348";

// Il viola delle icone di prima (#6c5ce7) in sfumatura, come il blu della
// Suite: non si cambia il colore dell'applicazione, solo la lettera dentro.
const CHIARO = "#7a6bf0";
const SCURO = "#5e4ed8";

// La quota è l'altezza del segno rispetto al lato. Il segno è alto il doppio di
// quanto è largo, quindi in larghezza ne occupa la metà.
//
// L'icona è un **quadrato pieno**, non un tondo: la forma non la decidiamo noi,
// la decide il telefono, che ritaglia come vuole — tondo, quadrato stondato, a
// goccia. Disegnandoci un tondo dentro si finiva con due icone Siderio di forma
// diversa sulla stessa schermata, perché Siderio 3D il quadrato pieno ce
// l'aveva. Chi ritaglia deve trovare colore fino al bordo.
//
// Per questo la "maskable" tiene il segno più piccolo: di quel quadrato il
// telefono garantisce solo la parte centrale, e il resto se lo può mangiare.
const ICONE = [
  { nome: "public/icons/icon-512.png", lato: 512, quota: 0.7 },
  { nome: "public/icons/icon-192.png", lato: 192, quota: 0.7 },
  { nome: "public/icons/icon-512-maskable.png", lato: 512, quota: 0.52 },
  { nome: "app/icon.png", lato: 512, quota: 0.7 },
  { nome: "app/apple-icon.png", lato: 180, quota: 0.7 },
];

const pagina = (lato, quota) => `<!doctype html><html><body style="margin:0">
<div style="width:${lato}px;height:${lato}px;
            background:linear-gradient(135deg, ${CHIARO}, ${SCURO});
            display:grid;place-items:center">
  <svg viewBox="${RIQUADRO}" style="width:${lato}px;height:${Math.round(lato * quota)}px">
    <path d="${TRACCIATO}" fill="#ffffff" />
  </svg>
</div></body></html>`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
for (const { nome, lato, quota } of ICONE) {
  const p = await browser.newPage({ viewport: { width: lato, height: lato } });
  await p.setContent(pagina(lato, quota));
  await p.screenshot({ path: nome });
  await p.close();
  console.log("scritta", nome, `${lato}×${lato}`);
}
await browser.close();
