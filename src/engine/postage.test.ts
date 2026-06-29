// 引擎对账：用 POSTAGE_RATES.md §E「寄日本成本速查」的已验算数字作为基准。
import { describe, expect, it } from "vitest";
import { costMbag, costParcel, costProgressive, estimate } from "./postage";
import { letterRate, parcelRatesFor } from "./rates";

describe("公式单元", () => {
  it("信函·水陆·日本特例 100 张(500g) = 22.7", () => {
    const r = letterRate("letter", "surface", "jp_special")!;
    expect(r).toBeTruthy();
    const { total, pieces } = costProgressive(r, 100 * 5);
    expect(total).toBe(22.7);
    expect(pieces).toBe(1);
  });

  it("信函·水陆·日本特例 400 张(2kg, 单件上限) = 82.7", () => {
    const r = letterRate("letter", "surface", "jp_special")!;
    const { total, pieces } = costProgressive(r, 400 * 5);
    expect(total).toBe(82.7);
    expect(pieces).toBe(1);
  });

  it("信函·水陆·日本特例 500 张(2.5kg, 超2kg上限拆2件) — 两件各 1.25kg", () => {
    const r = letterRate("letter", "surface", "jp_special")!;
    const { total, pieces } = costProgressive(r, 500 * 5);
    expect(pieces).toBe(2);
    // 件1 2000g = 82.7, 件2 500g = 3.5 + ceil(480/10)*0.4 = 3.5 + 48*0.4 = 22.7
    expect(total).toBe(105.4);
  });

  it("包裹·水陆·日本 5kg = 161.6", () => {
    const jp = parcelRatesFor("日本").find((r) => r.service === "surface")!;
    expect(jp).toBeTruthy();
    expect(jp.first_kg_price).toBe(108.0);
    expect(jp.add_kg_price).toBe(13.4);
    expect(costParcel(jp, 5000)).toBe(161.6);
  });

  it("包裹·水陆·日本 1kg 封底 = 108.0（500g 也按 1kg 算）", () => {
    const jp = parcelRatesFor("日本").find((r) => r.service === "surface")!;
    expect(costParcel(jp, 500)).toBe(108.0);
    expect(costParcel(jp, 1000)).toBe(108.0);
  });

  it("M-bag·水陆·flat 5kg = 200, 6kg = 250", () => {
    const r = letterRate("mbag", "surface", "flat")!;
    expect(costMbag(r, 5000)).toBe(200.0);
    expect(costMbag(r, 6000)).toBe(250.0);
    // 不足 5kg 也按 5kg
    expect(costMbag(r, 3000)).toBe(200.0);
  });

  it("M-bag·航空·日本(第二组) 5kg = 610", () => {
    const r = letterRate("mbag", "air", "2")!;
    expect(r.first_price).toBe(610.0);
    expect(costMbag(r, 5000)).toBe(610.0);
  });

  it("国际印刷品 1kg 起算 —— 不到 1kg 按 1kg 计费", () => {
    // 印刷品·水陆·flat：min_billable_g=1000，首重 20g ¥4，续重每 10g ¥1.8
    const r = letterRate("printed", "surface", "flat")!;
    expect(r.min_billable_g).toBe(1000);
    // 5g 实际重量 → 按 1000g 计：4 + ceil((1000-20)/10)*1.8 = 4 + 98*1.8 = 180.4
    const { total: cost5g } = costProgressive(r, 5);
    expect(cost5g).toBe(180.4);
    // 500g → 同样按 1000g 计
    const { total: cost500g } = costProgressive(r, 500);
    expect(cost500g).toBe(180.4);
    // 1500g → 实际 1500g 计费：4 + ceil(1480/10)*1.8 = 4 + 148*1.8 = 270.4
    const { total: cost1500g } = costProgressive(r, 1500);
    expect(cost1500g).toBe(270.4);
  });

  it("国际印刷品·航空·第一组 1kg 起算 = 220.1", () => {
    const r = letterRate("printed", "air", "1")!;
    expect(r.min_billable_g).toBe(1000);
    const { total } = costProgressive(r, 5);
    // 4.5 + 98*2.2 = 220.1
    expect(total).toBe(220.1);
  });

  it("国际信函/M-bag/港澳台印刷品 不受 1kg min 影响（无 min_billable_g 字段）", () => {
    expect(letterRate("letter", "surface", "jp_special")?.min_billable_g).toBeUndefined();
    expect(letterRate("letter", "air", "1")?.min_billable_g).toBeUndefined();
    expect(letterRate("mbag", "surface", "flat")?.min_billable_g).toBeUndefined();
    expect(letterRate("printed", "hktw", "surface")?.min_billable_g).toBeUndefined();
  });
});

describe("estimate 寄日本", () => {
  // 显式 cardWeightG=5 以匹配 POSTAGE_RATES.md §E 中的速查数字（裸卡 5g）
  const JP = (cardCount: number, trackingRequired = false) =>
    estimate({ destination: "日本", cardCount, trackingRequired, cardWeightG: 5 });

  it("100 张：推荐平信水陆特例 22.7", () => {
    const res = JP(100);
    expect(res.recommended).not.toBeNull();
    expect(res.recommended!.method).toBe("letter_surface");
    expect(res.recommended!.cost).toBe(22.7);
  });

  it("400 张(=平信上限 2kg)：推荐还是平信特例 82.7", () => {
    const res = JP(400);
    expect(res.recommended!.method).toBe("letter_surface");
    expect(res.recommended!.cost).toBe(82.7);
  });

  it("1000 张(5kg)：包裹水陆最省 161.6", () => {
    const res = JP(1000);
    expect(res.recommended!.method).toBe("parcel_surface");
    expect(res.recommended!.cost).toBe(161.6);
  });

  it("追踪要求开启时，平信加挂号(16)，包裹自带追踪不变", () => {
    const noTrack = JP(100);
    const tracked = JP(100, true);
    const noTrackLetter = noTrack.options.find((o) => o.method === "letter_surface")!;
    const trackedLetter = tracked.options.find((o) => o.method === "letter_surface")!;
    expect(trackedLetter.cost).toBe(noTrackLetter.base_cost + 16);
    const noTrackParcel = noTrack.options.find((o) => o.method === "parcel_surface")!;
    const trackedParcel = tracked.options.find((o) => o.method === "parcel_surface")!;
    expect(trackedParcel.cost).toBe(noTrackParcel.base_cost); // 自带追踪
  });
});

describe("estimate 港澳台", () => {
  it("香港 100×5g：港澳台 6 大类(信函/印刷品/M-bag × 水陆/航空) + 包裹2", () => {
    const res = estimate({ destination: "香港", cardCount: 100, cardWeightG: 5 });
    const methods = res.options.map((o) => o.method);
    // 港澳台特有的 6 类信函/印刷品/M-bag
    expect(methods).toContain("letter_hktw_surface");
    expect(methods).toContain("letter_hktw_air");
    expect(methods).toContain("printed_hktw_surface");
    expect(methods).toContain("printed_hktw_air");
    expect(methods).toContain("mbag_hktw_surface");
    expect(methods).toContain("mbag_hktw_air");
    // 不应出现国际方式
    expect(methods.some((m) => m === "mbag_air" || m === "mbag_sal" || m === "mbag_surface")).toBe(false);
    expect(methods.some((m) => m === "letter_air" || m === "letter_surface")).toBe(false);
    // 港澳台包裹有 hktw_air / hktw_surface
    expect(methods.some((m) => m === "parcel_hktw_air" || m === "parcel_hktw_surface")).toBe(true);
  });

  it("台湾 1 张(20g)：平信水陆 ¥1.50，平信航空 +2*0.5 = ¥2.50", () => {
    const res = estimate({ destination: "台湾", cardCount: 1, cardWeightG: 20 });
    const sf = res.options.find((o) => o.method === "letter_hktw_surface")!;
    const air = res.options.find((o) => o.method === "letter_hktw_air")!;
    expect(sf.base_cost).toBe(1.5);
    expect(air.base_cost).toBe(2.5);
  });

  it("台湾 100×20g(=2000g, 落在阶梯最大档)：水陆 ¥55.80，航空 ¥55.80+200×0.5=¥155.80", () => {
    const res = estimate({ destination: "台湾", cardCount: 100, cardWeightG: 20 });
    const sf = res.options.find((o) => o.method === "letter_hktw_surface")!;
    const air = res.options.find((o) => o.method === "letter_hktw_air")!;
    expect(sf.base_cost).toBe(55.8);
    expect(air.base_cost).toBe(155.8);
    expect(sf.pieces).toBe(1);
  });

  it("香港 25 张(500g)：阶梯 500g 档 = ¥16.70 水陆", () => {
    const res = estimate({ destination: "香港", cardCount: 25, cardWeightG: 20 });
    const sf = res.options.find((o) => o.method === "letter_hktw_surface")!;
    expect(sf.base_cost).toBe(16.7);
  });

  it("澳门 300×20g(=6000g, 超 2kg 上限拆 3 件)：水陆 = 3×55.80 = ¥167.40", () => {
    const res = estimate({ destination: "澳门", cardCount: 300, cardWeightG: 20 });
    const sf = res.options.find((o) => o.method === "letter_hktw_surface")!;
    expect(sf.pieces).toBe(3);
    expect(sf.base_cost).toBe(167.4);
  });

  it("台湾印刷品·水陆 vs 航空 (100×20g=2000g)：差额 = 200×0.5 = ¥100", () => {
    const res = estimate({ destination: "台湾", cardCount: 100, cardWeightG: 20 });
    const sf = res.options.find((o) => o.method === "printed_hktw_surface")!;
    const air = res.options.find((o) => o.method === "printed_hktw_air")!;
    expect(air.base_cost - sf.base_cost).toBeCloseTo(100, 1);
  });

  it("M-bag·港澳台·水陆 5kg = ¥180；航空 = ¥180 + 500×0.5 = ¥430", () => {
    const res = estimate({ destination: "香港", cardCount: 1000, cardWeightG: 5 });
    const sf = res.options.find((o) => o.method === "mbag_hktw_surface")!;
    const air = res.options.find((o) => o.method === "mbag_hktw_air")!;
    expect(sf.base_cost).toBe(180);
    expect(air.base_cost).toBe(430);
  });
});

describe("estimate 数据缺口", () => {
  it("不在 printed_air 分组的目的地（如俄罗斯联邦），印刷品航空不出现且有 note", () => {
    const res = estimate({ destination: "俄罗斯联邦", cardCount: 100, cardWeightG: 5 });
    expect(res.options.some((o) => o.method === "printed_air")).toBe(false);
    expect(res.notes.some((n) => n.includes("印刷品航空"))).toBe(true);
  });
});

describe("estimate 小批量国际印刷品（1kg 起算暴击）", () => {
  it("美国 1 张(5g)：印刷品价格按 1kg 计，注解说明", () => {
    const res = estimate({ destination: "美国", cardCount: 1, cardWeightG: 5 });
    const printedAir = res.options.find((o) => o.method === "printed_air")!;
    // 美国 in printed_air group 2 (¥5.0/20g + ¥2.5/10g)；按 1000g 计 = 5 + 98*2.5 = 250
    expect(printedAir.base_cost).toBe(250.0);
    expect(printedAir.notes.some((n) => n.includes("1kg") && n.includes("不划算"))).toBe(true);
    // 推荐应该不是印刷品 —— 平信便宜得多
    expect(res.recommended!.method).not.toBe("printed_air");
    expect(res.recommended!.method).not.toBe("printed_surface");
  });
});
