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

// 1 张卡 + 信封 ≈ 20g（用户偏好默认）。多张共用信封时可在 UI 调小。
export const DEFAULT_CARD_WEIGHT_G = 20;

function progressiveOne(rate: LetterRate, weightG: number): number {
  const extra = Math.max(0, weightG - rate.first_weight_g);
  const steps = extra > 0 ? Math.ceil(extra / rate.add_unit_g) : 0;
  return rate.first_price + steps * rate.add_price;
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
    total += progressiveOne(rate, w);
  }
  return { total: round2(total), pieces };
}

export function costMbag(rate: LetterRate, weightG: number): number {
  const billable = Math.max(rate.first_weight_g, weightG);
  const steps = Math.ceil(
    (billable - rate.first_weight_g) / rate.add_unit_g,
  );
  return round2(rate.first_price + steps * rate.add_price);
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
}

export function estimate(input: EstimateInput): EstimateResult {
  const { destination, cardCount, trackingRequired = false } = input;
  const cardWeightG = input.cardWeightG ?? DEFAULT_CARD_WEIGHT_G;
  const w = cardCount * cardWeightG;
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

  // 包裹（按目的地，自带追踪）
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

  // 印刷品
  const printedSvc: "hktw" | "air" = isHktw ? "hktw" : "air";
  const printedGrp = isHktw
    ? "hktw"
    : lookupGroup("printed_air", destination);
  if (printedGrp) {
    const rate = letterRate("printed", printedSvc, printedGrp);
    if (rate) {
      const { total, pieces } = costProgressive(rate, w);
      const n = [
        "通常无追踪（可加挂号16/件）",
        `单件上限${rate.max_weight_g / 1000}kg`,
      ];
      if (pieces > 1) n.push(`超限拆 ${pieces} 件，每件重付首重`);
      add(
        `printed_${printedSvc}`,
        `印刷品·${isHktw ? "港澳台" : "航空"}`,
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
  } else if (!isHktw) {
    notes.push("印刷品航空：该目的地分组未知，未估算（数据待补全）");
  }

  // 印刷品·水陆（统一价）
  if (!isHktw) {
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
  if (!isHktw) {
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
  if (!isHktw) {
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

  // M-bag
  if (isHktw) {
    const rate = letterRate("mbag", "hktw", "hktw");
    if (rate) {
      add("mbag_hktw", "M-bag·港澳台", costMbag(rate, w), {
        feasible: true,
        hasTracking: false,
        trackSurcharge: mbagReg,
        notes: ["港澳台一次打包", "不足5kg按5kg计", "需追踪+80挂号"],
      });
    }
  } else if (printedGrp) {
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
  if (!isHktw) {
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
