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
  it("香港 100 张：含港澳台印刷品/包裹方式，不应出现 M-bag 航空/SAL/水陆 flat", () => {
    const res = estimate({ destination: "香港", cardCount: 100, cardWeightG: 5 });
    const methods = res.options.map((o) => o.method);
    expect(methods).toContain("printed_hktw");
    expect(methods).toContain("mbag_hktw");
    expect(methods.some((m) => m === "mbag_air" || m === "mbag_sal" || m === "mbag_surface")).toBe(false);
    // 港澳台包裹也只有 hktw_air / hktw_surface
    expect(methods.some((m) => m === "parcel_hktw_air" || m === "parcel_hktw_surface")).toBe(true);
  });
});

describe("estimate 数据缺口", () => {
  it("不在 printed_air 分组的目的地（如俄罗斯联邦），印刷品航空不出现且有 note", () => {
    const res = estimate({ destination: "俄罗斯联邦", cardCount: 100, cardWeightG: 5 });
    expect(res.options.some((o) => o.method === "printed_air")).toBe(false);
    expect(res.notes.some((n) => n.includes("印刷品航空"))).toBe(true);
  });
});
