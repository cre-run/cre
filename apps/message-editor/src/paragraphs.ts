import type {
  Claim,
  Evidence,
  EvidenceStance,
  ParagraphStatus,
  ReplyParagraph,
} from "@cre/editor-payload";

/** 確認状況を並べる順（内訳・凡例で使う） */
export const STATUS_ORDER: ParagraphStatus[] = ["verified", "conditional", "recheck", "unverified"];

/**
 * 本文を書き換えたか。前後の空白と改行コードの違いは編集とみなさない
 * （contentEditable の innerText は末尾の改行などが元の文字列と変わることがある）。
 */
export const isEdited = (paragraph: ReplyParagraph, edited: string | undefined): boolean =>
  edited !== undefined && normalize(edited) !== normalize(paragraph.text);

const normalize = (text: string): string => text.replaceAll("\r\n", "\n").trim();

export interface Segment {
  text: string;
  /** 印を付ける文。付けない部分は undefined */
  claim?: Claim;
}

/**
 * 本文を、印を付ける文とそれ以外に分ける。印を付けるのは確認済み以外の文だけ。
 * 本文に見つからない文と、先に見つかった文と重なる文は印を付けない（本文はそのまま全部残す）。
 */
export const splitByClaims = (text: string, claims: Claim[] | undefined): Segment[] => {
  const found = (claims ?? [])
    .filter((claim) => claim.status !== "verified" && claim.text !== "")
    .map((claim) => ({ claim, start: text.indexOf(claim.text) }))
    .filter(({ start }) => start >= 0)
    .sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let at = 0;
  for (const { claim, start } of found) {
    if (start < at) {
      continue;
    }
    if (start > at) {
      segments.push({ text: text.slice(at, start) });
    }
    segments.push({ text: claim.text, claim });
    at = start + claim.text.length;
  }
  if (at < text.length || segments.length === 0) {
    segments.push({ text: text.slice(at) });
  }
  return segments;
};

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

/** 段落の主張と食い違う根拠があるか */
export const hasContradiction = (evidence: Evidence[]): boolean =>
  evidence.some((e) => e.stance === "contradicts");

/** 状態ごとの段落の数。0 件の状態は含めない */
export const statusCounts = (
  paragraphs: ReplyParagraph[],
): { status: ParagraphStatus; count: number }[] =>
  STATUS_ORDER.map((status) => ({
    status,
    count: paragraphs.filter((p) => p.status === status).length,
  })).filter(({ count }) => count > 0);

/**
 * 指定した状態の段落のうち、今選んでいる段落の次のもの（最後まで行ったら先頭に戻る）。
 * 今選んでいる段落がその状態でなければ、先頭から数えて最初のもの。
 */
export const nextWith = <T extends { id: string }>(
  items: T[],
  matches: (item: T) => boolean,
  currentId: string | undefined,
): T | undefined => {
  const at = items.findIndex((item) => item.id === currentId);
  const ordered = [...items.slice(at + 1), ...items.slice(0, at + 1)];
  return ordered.find(matches);
};
