// 呼号 → DXCC 实体/中文目的地 —— port 自 qsl-manager backend/app/services/dxcc.py。
// 静态版：构建期把所有前缀展开 + 排序，运行时纯查表。
import prefixesRaw from "../data/callsign_prefixes.json";

interface PrefixRow {
  prefixes: string;
  entity_en: string;
  dest_zh: string | null;
}

interface Bundle {
  _README?: string;
  _dest_zh?: string;
  _notes?: string;
  prefixes: PrefixRow[];
}

const data = prefixesRaw as Bundle;

export function expandRange(token: string): string[] {
  const t = token.trim().toUpperCase();
  if (!t.includes("-")) return [t];
  const [start, end] = t.split("-");
  const stem = start.slice(0, -1);
  const sLast = start.charCodeAt(start.length - 1);
  const eLast = end.charCodeAt(end.length - 1);
  const out: string[] = [];
  for (let c = sLast; c <= eLast; c++) out.push(stem + String.fromCharCode(c));
  return out;
}

// 显式单前缀覆盖区间展开（与 Python 版去重逻辑一致：OY 显式 > OU-OZ 区间）
const ranged = new Map<string, { entity_en: string; dest_zh: string | null }>();
const explicit = new Map<string, { entity_en: string; dest_zh: string | null }>();
for (const row of data.prefixes) {
  for (const token of row.prefixes.split(",")) {
    const target = token.includes("-") ? ranged : explicit;
    for (const pfx of expandRange(token)) {
      target.set(pfx, { entity_en: row.entity_en, dest_zh: row.dest_zh });
    }
  }
}

// 按前缀长度降序排序，最长前缀优先匹配
const sortedPrefixes: Array<[string, { entity_en: string; dest_zh: string | null }]> = [
  ...new Map([...ranged, ...explicit]).entries(),
].sort(([a], [b]) => b.length - a.length);

export function normalizeCall(call: string): string {
  return call.trim().toUpperCase().replace(/\s+/g, "");
}

const COMMON_SUFFIXES = new Set([
  "P", "M", "MM", "AM", "QRP",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A",
]);

export function stripAffixes(call: string): string {
  const c = normalizeCall(call);
  if (!c.includes("/")) return c;
  const parts = c.split("/");
  const cands = parts.filter((p) => !COMMON_SUFFIXES.has(p));
  return cands[0] ?? c;
}

export interface DxccResult {
  call: string;
  prefix: string | null;
  entity_en: string | null;
  dest_zh: string | null;
}

export function resolve(call: string): DxccResult {
  const body = stripAffixes(call);
  for (const [prefix, info] of sortedPrefixes) {
    if (body.startsWith(prefix)) {
      return {
        call,
        prefix,
        entity_en: info.entity_en,
        dest_zh: info.dest_zh,
      };
    }
  }
  return { call, prefix: null, entity_en: null, dest_zh: null };
}
