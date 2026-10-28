import type { Evidence, EvidenceStance } from "@cre/editor-payload";

const STANCE_ORDER: EvidenceStance[] = ["supports", "conditional", "contradicts", "related"];

const STANCE_SHORT: Record<EvidenceStance, string> = {
  supports: "支持",
  conditional: "条件つき",
  contradicts: "食い違い",
  related: "関連",
};

/** 根拠の立場ごとの数を「支持 1・食い違い 1」の形にする。0 件の立場は書かない */
export const stanceSummary = (evidence: Evidence[]): string =>
  STANCE_ORDER.map(
    (stance) => [stance, evidence.filter((e) => e.stance === stance).length] as const,
  )
    .filter(([, count]) => count > 0)
    .map(([stance, count]) => `${STANCE_SHORT[stance]} ${count}`)
    .join("・");

/** 下線の主張と食い違う根拠があるか */
export const hasContradiction = (evidence: Evidence[]): boolean =>
  evidence.some((e) => e.stance === "contradicts");
