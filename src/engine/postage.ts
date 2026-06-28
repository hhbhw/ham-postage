// M7 资费选优引擎 —— port 自 qsl-manager backend/app/services/postage.py。
// 数据缺口处理：未知分组的方式不给估算；不预设任何寄法便宜，按数字排序。
import {
  letterRate,
  lookupGroup,
  parcelRatesFor,
  surcharge,
} from "./rates";
import type {
  EstimateOption,
  EstimateResult,
  LetterRate,
  ParcelRate,
} from "./types";

const HKTW = new Set(["香港", "澳门", "台湾"]);

// 信封 10g（1 个）+ 卡片 5g/张。多张共用一个信封。
export const DEFAULT_CARD_WEIGHT_G = 5;
export const DEFAULT_ENVELOPE_WEIGHT_G = 10;

function bracketPrice(rate: LetterRate, weightG: number): number {
  // brackets 已按 max_weight_g 升序写入；不在任何档位内则按最大档收（实际拆件机制会保证不到这一步）
  for (const b of rate.brackets!) {
    if (weightG <= b.max_weight_g) return b.price;
  }
  return rate.brackets![rate.brackets!.length - 1].price;
}

function progressivePiece(rate: LetterRate, weightG: number): number {
  const extra = Math.max(0, weightG - rate.first_weight_g);
  const steps = extra > 0 ? Math.ceil(extra / rate.add_unit_g) : 0;
  return rate.first_price + steps * rate.add_price;
}

function airSurcharge(rate: LetterRate, weightG: number): number {
  if (!rate.air_surcharge_unit_g || !rate.air_surcharge_price) return 0;
  // 每 10g 或其零数加收 ¥0.50 —— 按重量向上取整步数
  return Math.ceil(weightG / rate.air_surcharge_unit_g) * rate.air_surcharge_price;
}

/** 单件价格 —— 阶梯优先，否则累进；之上叠加航空附加费（如有）。 */
function piecePrice(rate: LetterRate, weightG: number): number {
  const base = rate.brackets ? bracketPrice(rate, weightG) : progressivePiece(rate, weightG);
  return base + airSurcharge(rate, weightG);
}

export function costProgressive(
  rate: LetterRate,
  weightG: number,
): { total: number; pieces: number } {
  const cap = rate.max_weight_g || weightG || 1;
  const pieces = Math.max(1, Math.ceil(weightG / cap));
  let total = 0;
  let remaining = weightG;
  for (let i = 0; i < pieces; i++) {
    const w = Math.min(cap, remaining);
    remaining -= w;
    total += piecePrice(rate, w);
  }
  return { total: round2(total), pieces };
}

export function costMbag(rate: LetterRate, weightG: number): number {
  const billable = Math.max(rate.first_weight_g, weightG);
  const steps = Math.ceil(
    (billable - rate.first_weight_g) / rate.add_unit_g,
  );
  // M-bag 也可能有航空附加费（港澳台·航空）—— 按实际重量计算
  return round2(
    rate.first_price + steps * rate.add_price + airSurcharge(rate, weightG),
  );
}

export function costParcel(rate: ParcelRate, weightG: number): number {
  const billableKg = Math.max(1, Math.ceil(weightG / 1000));
  return round2(rate.first_kg_price + (billableKg - 1) * rate.add_kg_price);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface EstimateInput {
  destination: string;
  cardCount: number;
  trackingRequired?: boolean;
  cardWeightG?: number;
  envelopeWeightG?: number;
}

export function estimate(input: EstimateInput): EstimateResult {
  const { destination, cardCount, trackingRequired = false } = input;
  const cardWeightG = input.cardWeightG ?? DEFAULT_CARD_WEIGHT_G;
  // 默认 0 —— 老测试用例(裸卡片 5g)不传信封；UI 端传 10g
  const envelopeWeightG = input.envelopeWeightG ?? 0;
  const w = envelopeWeightG + cardCount * cardWeightG;
  const isHktw = HKTW.has(destination);
  const reg = surcharge("registration");
  const mbagReg = surcharge("mbag_registration");

  const options: EstimateOption[] = [];
  const notes: string[] = [];

  const add = (
    method: string,
    label: string,
    baseCost: number,
    opts: {
      feasible: boolean;
      hasTracking: boolean;
      trackSurcharge: number;
      pieces?: number;
      notes?: string[];
      flags?: string[];
    },
  ): void => {
    const tracked = opts.hasTracking
      ? baseCost
      : round2(baseCost + opts.trackSurcharge);
    const cost = trackingRequired ? tracked : baseCost;
    options.push({
      method,
      label,
      base_cost: round2(baseCost),
      cost_with_tracking: tracked,
      cost,
      pieces: opts.pieces ?? 1,
      weight_g: w,
      feasible: opts.feasible,
      has_tracking: opts.hasTracking,
      notes: opts.notes ?? [],
      flags: opts.flags ?? [],
    });
  };

  // 包裹（按目的地，自带追踪）—— 国际 & 港澳台都走这里
  for (const pr of parcelRatesFor(destination)) {
    const feasible =
      pr.max_weight_kg === null || w / 1000 <= pr.max_weight_kg;
    const svcLabel: Record<string, string> = {
      air: "航空",
      surface: "水陆",
      sal: "SAL",
      hktw_air: "航空",
      hktw_surface: "水陆",
    };
    const n = ["自带单号追踪", "起重1kg封底，不足1kg按1kg"];
    if (!feasible) n.push(`超目的地限重 ${pr.max_weight_kg}kg`);
    add(`parcel_${pr.service}`, `包裹·${svcLabel[pr.service] ?? pr.service}`,
      costParcel(pr, w),
      { feasible, hasTracking: true, trackSurcharge: 0, notes: n });
  }

  if (isHktw) {
    // —— 港澳台：信函/印刷品/M-bag 各拆「水陆 / 航空」两版 ——
    const grpLabel = { surface: "水陆", air: "航空" } as const;
    for (const grp of ["surface", "air"] as const) {
      const gl = grpLabel[grp];

      // 信函（阶梯计费）
      const letter = letterRate("letter", "hktw", grp);
      if (letter) {
        const { total, pieces } = costProgressive(letter, w);
        const n = [
          "港澳台信函" + (grp === "air" ? "（含航空费）" : "（水陆/陆运基本资费）"),
          "通常无追踪（可加挂号16/件）",
          `单件上限${letter.max_weight_g / 1000}kg`,
        ];
        if (pieces > 1) n.push(`超${letter.max_weight_g / 1000}kg拆 ${pieces} 件，按档分付`);
        add(`letter_hktw_${grp}`, `平信·港澳台·${gl}`, total, {
          feasible: true,
          hasTracking: false,
          trackSurcharge: reg * pieces,
          pieces,
          notes: n,
        });
      }

      // 印刷品
      const printed = letterRate("printed", "hktw", grp);
      if (printed) {
        const { total, pieces } = costProgressive(printed, w);
        const n = [
          grp === "air" ? "港澳台印刷品（基本+航空费）" : "港澳台印刷品（水陆基本）",
          "通常无追踪（可加挂号16/件）",
          `单件上限${printed.max_weight_g / 1000}kg`,
        ];
        if (pieces > 1) n.push(`超限拆 ${pieces} 件，每件重付首重`);
        add(`printed_hktw_${grp}`, `印刷品·港澳台·${gl}`, total, {
          feasible: true,
          hasTracking: false,
          trackSurcharge: reg * pieces,
          pieces,
          notes: n,
        });
      }

      // M-bag
      const mbag = letterRate("mbag", "hktw", grp);
      if (mbag) {
        const n = [
          grp === "air" ? "港澳台一次打包（含航空费）" : "港澳台一次打包（水陆）",
          "不足5kg按5kg计",
          "需追踪+80挂号",
        ];
        add(`mbag_hktw_${grp}`, `M-bag·港澳台·${gl}`, costMbag(mbag, w), {
          feasible: true,
          hasTracking: false,
          trackSurcharge: mbagReg,
          notes: n,
        });
      }
    }
  } else {
    // —— 国际目的地 ——

    // 印刷品·航空（按 printed_air 分组）
    const printedGrp = lookupGroup("printed_air", destination);
    if (printedGrp) {
      const rate = letterRate("printed", "air", printedGrp);
      if (rate) {
        const { total, pieces } = costProgressive(rate, w);
        const n = [
          "通常无追踪（可加挂号16/件）",
          `单件上限${rate.max_weight_g / 1000}kg`,
        ];
        if (pieces > 1) n.push(`超限拆 ${pieces} 件，每件重付首重`);
        add("printed_air", "印刷品·航空", total, {
          feasible: true,
          hasTracking: false,
          trackSurcharge: reg * pieces,
          pieces,
          notes: n,
        });
      }
    } else {
      notes.push("印刷品航空：该目的地分组未知，未估算（数据待补全）");
    }

    // 印刷品·水陆（统一价）
    {
      const rate = letterRate("printed", "surface", "flat");
      if (rate) {
        const { total, pieces } = costProgressive(rate, w);
        const n = [
          "水陆路，最慢但便宜",
          "通常无追踪（可加挂号16/件）",
          `单件上限${rate.max_weight_g / 1000}kg`,
        ];
        if (pieces > 1) n.push(`超限拆 ${pieces} 件，每件重付首重`);
        add("printed_surface", "印刷品·水陆", total, {
          feasible: true,
          hasTracking: false,
          trackSurcharge: reg * pieces,
          pieces,
          notes: n,
        });
      }
    }

    // 信函·水陆（27 路向特例 / 否则统一价）
    {
      const jp = lookupGroup("letter_surface_special", destination) === "jp_special";
      const rate = letterRate("letter", "surface", jp ? "jp_special" : "flat");
      if (rate) {
        const { total, pieces } = costProgressive(rate, w);
        const n = [
          jp ? "水陆路信函特例，小批量最省" : "水陆路信函统一价",
          "通常无追踪（可加挂号16/件）",
          "单件上限2kg",
        ];
        if (pieces > 1) n.push(`超2kg拆 ${pieces} 件，每件重付首重`);
        add(
          "letter_surface",
          jp ? "平信·水陆(日本特例)" : "平信·水陆",
          total,
          {
            feasible: true,
            hasTracking: false,
            trackSurcharge: reg * pieces,
            pieces,
            notes: n,
          },
        );
      }
    }

    // 信函·航空（按 letter_air 分组）
    {
      const grp = lookupGroup("letter_air", destination);
      if (grp) {
        const rate = letterRate("letter", "air", grp);
        if (rate) {
          const { total, pieces } = costProgressive(rate, w);
          const n = ["航空信函", "通常无追踪（可加挂号16/件）", "单件上限2kg"];
          if (pieces > 1) n.push(`超2kg拆 ${pieces} 件，每件重付首重`);
          add("letter_air", "平信·航空", total, {
            feasible: true,
            hasTracking: false,
            trackSurcharge: reg * pieces,
            pieces,
            notes: n,
          });
        }
      }
    }

    // M-bag 航空 / SAL（跟印刷品同组）
    if (printedGrp) {
      for (const [svc, svcLabel] of [
        ["air", "航空"] as const,
        ["sal", "SAL"] as const,
      ]) {
        const rate = letterRate("mbag", svc, printedGrp);
        if (!rate) continue;
        add(`mbag_${svc}`, `M-bag·${svcLabel}`, costMbag(rate, w), {
          feasible: true,
          hasTracking: false,
          trackSurcharge: mbagReg,
          notes: ["一次打包省操作", "不足5kg按5kg计", "需追踪+80挂号"],
        });
      }
    }

    // M-bag·水陆（统一价，不分组）
    {
      const rate = letterRate("mbag", "surface", "flat");
      if (rate) {
        add("mbag_surface", "M-bag·水陆", costMbag(rate, w), {
          feasible: true,
          hasTracking: false,
          trackSurcharge: mbagReg,
          notes: [
            "水陆路一次打包，M-bag 里最便宜",
            "不足5kg按5kg计",
            "需追踪+80挂号",
          ],
        });
      }
    }
  }

  // 排序选优
  const feasibleOpts = options.filter((o) => o.feasible);
  feasibleOpts.sort((a, b) => a.cost - b.cost);
  const recommended = feasibleOpts[0] ?? null;

  options.sort((a, b) => {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
    return a.cost - b.cost;
  });

  return {
    destination,
    card_count: cardCount,
    weight_g: w,
    tracking_required: trackingRequired,
    recommended: recommended
      ? {
          method: recommended.method,
          label: recommended.label,
          cost: recommended.cost,
        }
      : null,
    options,
    notes,
  };
}
