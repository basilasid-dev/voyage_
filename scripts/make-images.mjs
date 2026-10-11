// Generates the simple illustrations used for destinations and places: node scripts/make-images.mjs
// They are original artwork made from basic shapes (no photographs, no third-party images), kept small and static.
// To use real photographs instead, put licensed files in public/img and change the `image` paths in
// src/lib/voyage/content.ts.
import fs from "node:fs";
import path from "node:path";

const W = 640;
const H = 400;
const out = path.join(process.cwd(), "public", "img");

const wrap = (inner, defs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-hidden="true">${defs}${inner}</svg>\n`;
const grad = (id, a, b) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const sky = (a, b) => ({ defs: grad("sky", a, b), body: `<rect width="${W}" height="${H}" fill="url(#sky)"/>` });
const sun = (x, y, r, c = "#ffe7a3") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity=".95"/>`;
const sea = (y, c1, c2) =>
  `<rect y="${y}" width="${W}" height="${H - y}" fill="${c1}"/>` +
  [0, 1, 2, 3].map((i) => `<path d="M0 ${y + 24 + i * 26} q40 -12 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0" fill="none" stroke="${c2}" stroke-width="3" opacity=".7"/>`).join("");
const palm = (x, y, s = 1, c = "#1f6b3a") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 q6 -70 -4 -130" stroke="#6b4a2b" stroke-width="9" fill="none" stroke-linecap="round"/>` +
  [[-60, -120], [-30, -150], [20, -150], [60, -118], [-70, -98], [70, -96]].map(([dx, dy]) => `<path d="M-4 -130 q${dx / 2} ${dy / 2 - 30} ${dx} ${dy + 20}" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round"/>`).join("") +
  `</g>`;
const hill = (y, c, amp = 40) => `<path d="M0 ${y} q${W / 4} -${amp} ${W / 2} 0 t${W / 2} 0 V${H} H0z" fill="${c}"/>`;
const tree = (x, y, s = 1, c = "#2f8f4e") => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-5" y="0" width="10" height="38" fill="#6b4a2b"/><circle cx="0" cy="-6" r="30" fill="${c}"/><circle cx="-18" cy="10" r="20" fill="${c}"/><circle cx="18" cy="10" r="20" fill="${c}"/></g>`;
const dome = (cx, cy, r, c) => `<path d="M${cx - r} ${cy} a${r} ${r} 0 0 1 ${2 * r} 0z" fill="${c}"/>`;
const minaret = (x, base, h, c = "#e8e2d6", cap = "#8f98a8") =>
  `<rect x="${x - 7}" y="${base - h}" width="14" height="${h}" fill="${c}"/><rect x="${x - 11}" y="${base - h * 0.62}" width="22" height="6" fill="${c}"/><path d="M${x - 8} ${base - h} l8 -34 l8 34z" fill="${cap}"/>`;
const plate = (cx, cy, r, c = "#ffffff") => `<ellipse cx="${cx}" cy="${cy + r * 0.12}" rx="${r}" ry="${r * 0.42}" fill="#00000022"/><ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.42}" fill="${c}"/><ellipse cx="${cx}" cy="${cy}" rx="${r * 0.82}" ry="${r * 0.32}" fill="#f1ece4"/>`;

const scenes = {};

scenes["destinations/kozhikode"] = () => {
  const s = sky("#ffb46b", "#ff7a8a");
  return wrap(s.body + sun(420, 170, 56, "#fff0b8") + sea(230, "#1d6f8f", "#8fd3e8") + `<path d="M470 232 h16 l-3 -78 h-10z" fill="#f5efe6"/><rect x="466" y="140" width="24" height="14" fill="#c0392b"/><path d="M462 140 l16 -22 l16 22z" fill="#2c3e50"/>` + `<path d="M0 300 q160 -30 330 -4 t310 -4 V400 H0z" fill="#e9c98a"/>` + palm(90, 330, 1.1) + palm(170, 340, 0.8), s.defs);
};
scenes["destinations/istanbul"] = () => {
  const s = sky("#3b3f7a", "#e98f6b");
  return wrap(s.body + sun(520, 120, 36, "#ffe3b3") + sea(290, "#27456b", "#6f93bd") + dome(320, 250, 90, "#cbd2dc") + dome(235, 258, 48, "#b9c1cc") + dome(405, 258, 48, "#b9c1cc") + `<rect x="230" y="252" width="180" height="40" fill="#d9dde3"/>` + minaret(170, 292, 150) + minaret(470, 292, 150) + minaret(120, 292, 120) + minaret(520, 292, 120), s.defs);
};

scenes["places/kozhikode-beach"] = () => {
  const s = sky("#ffcf8a", "#ff8f7a");
  return wrap(s.body + sun(160, 190, 48) + sea(220, "#2b86a8", "#9fdcec") + `<path d="M0 310 q200 -40 400 -6 t240 -4 V400 H0z" fill="#ecd29b"/>` + palm(520, 340, 1) + palm(580, 350, 0.75), s.defs);
};
scenes["places/mananchira-square"] = () => {
  const s = sky("#a9dcf5", "#e6f6ff");
  return wrap(s.body + `<rect y="230" width="${W}" height="170" fill="#7cc27a"/><ellipse cx="320" cy="300" rx="190" ry="48" fill="#3f9bc4"/><ellipse cx="320" cy="296" rx="150" ry="34" fill="#6cc0e0"/><path d="M150 360 q170 40 340 0" stroke="#e5d6a8" stroke-width="14" fill="none"/>` + tree(90, 190, 1.2) + tree(540, 195, 1.1) + tree(180, 215, 0.8, "#38a05c") + tree(470, 220, 0.8, "#38a05c"), s.defs);
};
scenes["places/mishkal-mosque"] = () => {
  const s = sky("#cfe6f5", "#f4efe2");
  return wrap(s.body + `<rect y="320" width="${W}" height="80" fill="#a8c98a"/><rect x="170" y="230" width="300" height="100" fill="#d8c3a0"/><path d="M150 232 L490 232 L450 190 L190 190z" fill="#7a4a2b"/><path d="M190 190 L450 190 L410 152 L230 152z" fill="#8a5632"/><path d="M230 152 L410 152 L370 118 L270 118z" fill="#9a6338"/><rect x="305" y="268" width="30" height="62" rx="15" fill="#5a3a22"/>` + tree(90, 300, 1) + tree(560, 300, 1), s.defs);
};
scenes["places/kappad-beach"] = () => {
  const s = sky("#9bd0ee", "#e8f6ff");
  return wrap(s.body + sea(210, "#2f89b5", "#a8dff0") + `<path d="M0 320 L120 270 L200 330 L290 280 L380 340 L470 290 L640 350 V400 H0z" fill="#7d6a58"/><path d="M0 350 q300 -30 640 0 V400 H0z" fill="#e6cf9c"/><rect x="540" y="250" width="22" height="70" fill="#e9e2d2"/><path d="M533 250 h36 l-18 -22z" fill="#b5502d"/>`, s.defs);
};
scenes["places/beypore-port"] = () => {
  const s = sky("#bfe3f2", "#f6efe0");
  return wrap(s.body + sea(250, "#3a8aa6", "#a4dbe9") + `<path d="M130 250 q190 70 380 0 l-30 -40 h-320z" fill="#7a4a2b"/><rect x="160" y="200" width="320" height="14" fill="#5f391f"/><rect x="318" y="90" width="8" height="120" fill="#4c2f19"/><path d="M326 96 l110 78 h-110z" fill="#f4ead2"/><path d="M318 110 l-84 62 h84z" fill="#eadfc2"/>`, s.defs);
};
scenes["places/thusharagiri-falls"] = () => {
  const s = sky("#cfe9d9", "#f1f8ee");
  return wrap(s.body + hill(190, "#4f9a6a", 50) + `<path d="M250 100 L390 100 L420 320 L220 320z" fill="#6b6a62"/><path d="M290 100 h60 l12 220 h-84z" fill="#ffffff" opacity=".92"/><path d="M300 100 h8 l-3 220 h-10z M326 100 h8 l1 220 h-10z" fill="#d8eef7"/><ellipse cx="320" cy="334" rx="130" ry="34" fill="#5fb6d3"/><ellipse cx="320" cy="330" rx="90" ry="20" fill="#d9f1f8"/>` + tree(90, 270, 1, "#2f7d4d") + tree(560, 270, 1.1, "#2f7d4d"), s.defs);
};
scenes["places/paragon-restaurant"] = () =>
  wrap(`<rect width="${W}" height="${H}" fill="#f6e3c3"/><rect y="270" width="${W}" height="130" fill="#b9854f"/>` + plate(320, 250, 210, "#ffffff") + `<path d="M190 240 q130 -150 260 0 q-130 40 -260 0z" fill="#f4e4b0"/><circle cx="260" cy="214" r="9" fill="#c2662d"/><circle cx="330" cy="196" r="9" fill="#c2662d"/><circle cx="380" cy="226" r="9" fill="#a85420"/><circle cx="300" cy="232" r="7" fill="#5f8f3a"/><circle cx="360" cy="240" r="7" fill="#5f8f3a"/><path d="M470 250 q30 -30 60 0 q-30 28 -60 0z" fill="#f5d94a"/>`);
scenes["places/sm-street"] = () =>
  wrap(`<rect width="${W}" height="${H}" fill="#f7ead2"/><rect x="90" y="90" width="460" height="230" rx="18" fill="#c99a62"/>` + ["#b4521f", "#e6a23c", "#7a3b1d", "#d9822b", "#9a5a2a", "#c9792f"].map((c, i) => `<rect x="${120 + (i % 3) * 140}" y="${120 + Math.floor(i / 3) * 100}" width="120" height="80" rx="8" fill="${c}"/><rect x="${130 + (i % 3) * 140}" y="${128 + Math.floor(i / 3) * 100}" width="100" height="14" rx="7" fill="#ffffff" opacity=".25"/>`).join(""));
scenes["places/beach-food-stalls"] = () => {
  const s = sky("#ffc58b", "#ff9a8a");
  return wrap(s.body + sea(250, "#2b7f9f", "#9fdcec") + `<rect x="170" y="190" width="300" height="100" fill="#c9915a"/>` + [0, 1, 2, 3, 4, 5].map((i) => `<path d="M${150 + i * 55} 130 h55 v60 q-27 20 -55 0z" fill="${i % 2 ? "#ffffff" : "#d64545"}"/>`).join("") + `<circle cx="215" cy="310" r="24" fill="#3a3a3a"/><circle cx="425" cy="310" r="24" fill="#3a3a3a"/><rect x="200" y="240" width="240" height="14" fill="#8a5a2e"/>`, s.defs);
};

scenes["places/hagia-sophia"] = () => {
  const s = sky("#7a86c4", "#f3b58a");
  return wrap(s.body + `<rect y="320" width="${W}" height="80" fill="#6c7b9a"/>` + dome(320, 240, 95, "#c7ced9") + dome(220, 262, 52, "#b6bfcc") + dome(420, 262, 52, "#b6bfcc") + `<rect x="170" y="258" width="300" height="70" fill="#d8c9a8"/>` + minaret(130, 328, 170) + minaret(510, 328, 170) + `<rect x="300" y="282" width="40" height="46" rx="20" fill="#7a6a4e"/>`, s.defs);
};
scenes["places/blue-mosque"] = () => {
  const s = sky("#6aa0d8", "#dcebf7");
  return wrap(s.body + `<rect y="330" width="${W}" height="70" fill="#8aa89a"/>` + dome(320, 240, 80, "#5b7fb8") + dome(240, 262, 48, "#6b8cc2") + dome(400, 262, 48, "#6b8cc2") + dome(190, 290, 30, "#7d9acb") + dome(450, 290, 30, "#7d9acb") + `<rect x="170" y="280" width="300" height="56" fill="#d9d4c7"/>` + minaret(110, 336, 190) + minaret(530, 336, 190) + minaret(150, 336, 150) + minaret(490, 336, 150), s.defs);
};
scenes["places/topkapi-palace"] = () => {
  const s = sky("#9cc6e8", "#f6ecd8");
  return wrap(s.body + `<rect y="330" width="${W}" height="70" fill="#9bb487"/><rect x="170" y="190" width="300" height="150" fill="#e4cfa2"/><rect x="130" y="130" width="86" height="210" fill="#d7bf8c"/><path d="M122 130 l51 -62 l51 62z" fill="#8c4a3a"/><rect x="424" y="130" width="86" height="210" fill="#d7bf8c"/><path d="M416 130 l51 -62 l51 62z" fill="#8c4a3a"/><path d="M270 340 v-90 a50 50 0 0 1 100 0 v90z" fill="#5a4630"/>`, s.defs);
};
scenes["places/galata-tower"] = () => {
  const s = sky("#f7b27a", "#9a8fd0");
  return wrap(s.body + sun(500, 160, 40, "#fff0c2") + `<rect y="340" width="${W}" height="60" fill="#4b4f78"/><rect x="280" y="110" width="80" height="240" fill="#cdbba0"/><rect x="270" y="150" width="100" height="22" fill="#b9a688"/><path d="M262 110 h116 l-58 -82z" fill="#7a5a4a"/>` + [0, 1, 2].map((i) => `<rect x="312" y="${190 + i * 44}" width="16" height="28" rx="8" fill="#4a3a30"/>`).join(""), s.defs);
};
scenes["places/grand-bazaar"] = () =>
  wrap(`<rect width="${W}" height="${H}" fill="#e7c98f"/><path d="M0 400 V190 q100 -120 200 0 V400z" fill="#c9a064"/><path d="M200 400 V190 q120 -150 240 0 V400z" fill="#d9b574"/><path d="M440 400 V190 q100 -120 200 0 V400z" fill="#c9a064"/>` + [120, 320, 520].map((x) => `<line x1="${x}" y1="60" x2="${x}" y2="150" stroke="#6b4a2b" stroke-width="3"/><path d="M${x - 22} 150 h44 l-8 36 h-28z" fill="#d6492b"/><circle cx="${x}" cy="192" r="6" fill="#ffd36b"/>`).join("") + `<rect y="330" width="${W}" height="70" fill="#8c6a42"/>`);
scenes["places/karakoy-gulluoglu"] = () =>
  wrap(`<rect width="${W}" height="${H}" fill="#f6e8cf"/>` + plate(320, 270, 220, "#ffffff") + [0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<path d="M${200 + c * 66 + r * 22} ${200 + r * 30} l30 -22 l30 22 l-30 22z" fill="${(r + c) % 2 ? "#d9a441" : "#e6b95c"}"/><circle cx="${230 + c * 66 + r * 22}" cy="${200 + r * 30}" r="5" fill="#7aa83a"/>`).join("")).join(""));
scenes["places/ciya-sofrasi"] = () =>
  wrap(`<rect width="${W}" height="${H}" fill="#efe1c9"/><rect y="260" width="${W}" height="140" fill="#a8683a"/>` + [[160, 230, "#d96b3a"], [320, 210, "#6aa84f"], [480, 230, "#d9a23a"], [240, 300, "#b4442d"], [400, 300, "#5a7fb0"]].map(([x, y, c]) => plate(x, y, 70, "#ffffff") + `<ellipse cx="${x}" cy="${y}" rx="40" ry="14" fill="${c}"/>`).join(""));
scenes["places/balik-ekmek-eminonu"] = () => {
  const s = sky("#a8d6f0", "#eef7fb");
  return wrap(s.body + sea(280, "#3a7fa6", "#a4d6ea") + `<path d="M120 230 q200 -110 400 0 q-30 60 -200 60 q-170 0 -200 -60z" fill="#e0b274"/><path d="M150 232 q170 -60 340 0 q-170 38 -340 0z" fill="#fff6e0"/><path d="M200 222 q120 -34 240 0" stroke="#7aa83a" stroke-width="14" fill="none" stroke-linecap="round"/><path d="M230 232 q90 -16 190 0 q-30 16 -95 16 q-65 0 -95 -16z" fill="#c98a5a"/><circle cx="270" cy="228" r="6" fill="#ffffff"/>`, s.defs);
};

for (const [name, make] of Object.entries(scenes)) {
  const file = path.join(out, `${name}.svg`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, make());
}
console.log(`Wrote ${Object.keys(scenes).length} images to public/img`);
