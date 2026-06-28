// 构建期：把所有目的地中文名 → 全拼 + 首字母，写入 src/data/destination_pinyin.json。
// 运行时只查这份静态表，bundle 不打包 pinyin-pro。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pinyin } from "pinyin-pro";

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(here, "../src/data/postage_seed.json");
const parcelPath = resolve(here, "../src/data/parcel_rates.json");
const outPath = resolve(here, "../src/data/destination_pinyin.json");

const seed = JSON.parse(readFileSync(seedPath, "utf-8"));
const parcels = JSON.parse(readFileSync(parcelPath, "utf-8"));

const dests = new Set();
for (const r of parcels) dests.add(r.destination);
for (const grouping of ["letter_air", "printed_air", "letter_surface_special"]) {
  for (const list of Object.values(seed.dest_groups[grouping])) {
    for (const d of list) dests.add(d);
  }
}

const out = {};
for (const d of dests) {
  // 全拼：去空格小写；首字母同样
  const full = pinyin(d, { toneType: "none", type: "array", nonZh: "removed" })
    .join("")
    .toLowerCase();
  const initials = pinyin(d, {
    pattern: "first",
    toneType: "none",
    type: "array",
    nonZh: "removed",
  })
    .join("")
    .toLowerCase();
  out[d] = { full, initials };
}

writeFileSync(outPath, JSON.stringify(out, null, 0), "utf-8");
console.log(`gen-pinyin: wrote ${Object.keys(out).length} entries → ${outPath}`);
console.log("  sample:", {
  日本: out["日本"],
  美国: out["美国"],
  香港: out["香港"],
  澳门: out["澳门"],
  台湾: out["台湾"],
  巴布亚新几内亚: out["巴布亚新几内亚"],
});
