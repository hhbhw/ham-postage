// 资费数据装载与索引 —— 全部来自 src/data/*.json，构建期固化进 bundle。
import seedRaw from "../data/postage_seed.json";
import parcelRaw from "../data/parcel_rates.json";
import type { LetterRate, ParcelRate, PostageSeed, Surcharge } from "./types";

export const seed = seedRaw as PostageSeed;
export const parcelRates = parcelRaw as ParcelRate[];

const letterByKey = new Map<string, LetterRate>();
for (const r of seed.letter_rates) {
  letterByKey.set(`${r.category}|${r.service}|${r.grp}`, r);
}

const parcelByDest = new Map<string, ParcelRate[]>();
for (const p of parcelRates) {
  const arr = parcelByDest.get(p.destination) ?? [];
  arr.push(p);
  parcelByDest.set(p.destination, arr);
}

const surchargeByCode = new Map<string, Surcharge>();
for (const s of seed.surcharges) surchargeByCode.set(s.code, s);

export function letterRate(
  category: LetterRate["category"],
  service: LetterRate["service"],
  grp: string,
): LetterRate | undefined {
  return letterByKey.get(`${category}|${service}|${grp}`);
}

export function parcelRatesFor(destination: string): ParcelRate[] {
  return parcelByDest.get(destination) ?? [];
}

export function surcharge(code: string): number {
  return surchargeByCode.get(code)?.price ?? 0;
}

export function lookupGroup(
  grouping: keyof PostageSeed["dest_groups"],
  destination: string,
): string | null {
  const table = seed.dest_groups[grouping];
  for (const [grp, list] of Object.entries(table)) {
    if (list.includes(destination)) return grp;
  }
  return null;
}

// 所有作为目的地能查到的国家/地区名集合 —— 给 UI 自动补全用。
export function allDestinations(): string[] {
  const set = new Set<string>(parcelByDest.keys());
  // letter_air 与 printed_air 分组里有些目的地没在包裹表里（如部分小岛/地区）也允许出现
  for (const grouping of [
    "letter_air",
    "printed_air",
    "letter_surface_special",
  ] as const) {
    for (const list of Object.values(seed.dest_groups[grouping])) {
      for (const dest of list) set.add(dest);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "zh"));
}
