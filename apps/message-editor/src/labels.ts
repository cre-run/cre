import type {
  CheckResult,
  EvidenceStance,
  EvidenceType,
  ParagraphStatus,
} from "@cre/message-payload";

export const STATUS: Record<ParagraphStatus, { label: string; icon: string }> = {
  verified: { label: "確認済み", icon: "✓" },
  conditional: { label: "条件あり", icon: "◐" },
  recheck: { label: "再確認", icon: "↻" },
  unverified: { label: "根拠なし", icon: "!" },
};

export const EVIDENCE_TYPE: Record<EvidenceType, string> = {
  terms: "利用規約",
  "internal-rule": "社内ルール",
  precedent: "先行事例",
  "case-law": "判例",
  code: "実装コード",
  faq: "社内FAQ",
  help: "公式ヘルプ",
};

export const STANCE: Record<EvidenceStance, string> = {
  supports: "主張を支持",
  conditional: "条件つきで支持",
  contradicts: "主張と食い違い",
  related: "関連情報",
};

export const CHECK_RESULT: Record<CheckResult, string> = {
  ok: "OK",
  warn: "要確認",
  ng: "NG",
};

export type Freshness = "fresh" | "recent" | "stale";

const DAY = 24 * 60 * 60 * 1000;

/** 確認日時の鮮度。7日以内は fresh、30日以内は recent、それより前は stale */
export const freshness = (checkedAt: string, now: string): { days: number; level: Freshness } => {
  const days = Math.max(0, Math.floor((Date.parse(now) - Date.parse(checkedAt)) / DAY));
  const level: Freshness = days <= 7 ? "fresh" : days <= 30 ? "recent" : "stale";
  return { days, level };
};

const parts = (iso: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Tokyo",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );

/** 2026/10/05 */
export const formatDate = (iso: string): string => {
  const p = parts(iso);
  return `${p.year}/${p.month}/${p.day}`;
};

/** 10月6日 09:15 */
export const formatMonthDayTime = (iso: string): string => {
  const p = parts(iso);
  return `${Number(p.month)}月${Number(p.day)}日 ${p.hour}:${p.minute}`;
};

/** 2026.10.06 */
export const formatDotDate = (iso: string): string => formatDate(iso).replaceAll("/", ".");
