// 构建期把 postage_parcel_rates.csv 转成 parcel_rates.json，前端按 import 用。
// 数据来自 QSL Manager 项目，结构保留，前端只读。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = resolve(here, "../src/data-raw/postage_parcel_rates.csv");
const outPath = resolve(here, "../src/data/parcel_rates.json");

const text = readFileSync(csvPath, "utf-8");
const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
const header = lines.shift().split(",");

const rows = lines.map((line) => {
  const cells = line.split(",");
  const row = {};
  header.forEach((key, i) => {
    const v = cells[i];
    if (key === "first_kg_price" || key === "add_kg_price" || key === "max_weight_kg") {
      row[key] = v === "" ? null : Number(v);
    } else {
      row[key] = v;
    }
  });
  return row;
});

writeFileSync(outPath, JSON.stringify(rows, null, 2), "utf-8");
console.log(`csv-to-json: wrote ${rows.length} rows → ${outPath}`);
