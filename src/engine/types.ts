export type Service =
  | "air"
  | "surface"
  | "sal"
  | "hktw"
  | "hktw_air"
  | "hktw_surface";

export type Category = "letter" | "printed" | "mbag";

export interface LetterBracket {
  /** 该档位的重量上限（含），单位 g */
  max_weight_g: number;
  /** 该档位单件资费 */
  price: number;
}

export interface LetterRate {
  category: Category;
  service: "air" | "surface" | "sal" | "hktw";
  grp: string;
  /** 累进模型用 —— 阶梯模型可填 0 */
  first_weight_g: number;
  first_price: number;
  add_unit_g: number;
  add_price: number;
  /** 阶梯模型 —— 港澳台信函专用：按重量分档查价。存在时优先于累进字段。 */
  brackets?: LetterBracket[];
  /** 航空附加费 —— 在 brackets 或累进基础上叠加（港澳台航空寄）。单位 g + 单价。 */
  air_surcharge_unit_g?: number;
  air_surcharge_price?: number;
  /** 最低计费重量 —— 实际重量小于此值时按此值计费（国际印刷品 1kg 起算）。 */
  min_billable_g?: number;
  /** 单件重量上限（拆件时用） */
  max_weight_g: number;
  note?: string;
}

export interface ParcelRate {
  service: "air" | "surface" | "sal" | "hktw_air" | "hktw_surface";
  destination: string;
  first_kg_price: number;
  add_kg_price: number;
  max_weight_kg: number | null;
  size_class: string;
}

export interface Surcharge {
  code: string;
  label: string;
  unit: string;
  price: number;
}

export interface PostageSeed {
  letter_rates: LetterRate[];
  surcharges: Surcharge[];
  dest_groups: {
    printed_air: Record<string, string[]>;
    letter_surface_special: Record<string, string[]>;
    letter_air: Record<string, string[]>;
  };
  mbag_20kg_capped: string[];
}

export interface EstimateOption {
  method: string;
  label: string;
  base_cost: number;
  cost_with_tracking: number;
  cost: number;
  pieces: number;
  weight_g: number;
  feasible: boolean;
  has_tracking: boolean;
  notes: string[];
  flags: string[];
}

export interface EstimateResult {
  destination: string;
  card_count: number;
  weight_g: number;
  tracking_required: boolean;
  recommended: { method: string; label: string; cost: number } | null;
  options: EstimateOption[];
  notes: string[];
}
