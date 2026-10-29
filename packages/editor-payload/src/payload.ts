import { Inflate, deflate } from "pako";
import type { ReplyReviewPayload } from "./types.ts";
import {
  type Shape,
  isArrayOf,
  isCheck,
  isEvidence,
  isNextActionTiming,
  isObject,
  isOptionalArrayOf,
  isOptionalString,
  isPayloadOf,
  isString,
  isUnique,
  oneOf,
} from "./validate.ts";

/** URL ハッシュのキー（`#d=<base64url>`） */
export const HASH_KEY = "d";

/**
 * 受け付ける圧縮データの最大長（文字数）。見本データで約 3,700 文字。
 * deflate は 700 倍以上に展開できるので、上限がないと巨大な URL で開いたタブが固まる。
 */
export const MAX_ENCODED_LENGTH = 100_000;

/**
 * 展開後の JSON の最大バイト数。見本データで約 8 KB。
 * 圧縮後の長さだけでは展開爆弾を防げない（10 万文字の圧縮データが 70 MB 以上に展開できる）ので、
 * 展開しながら大きさを見て、超えた時点で打ち切る。
 */
export const MAX_DECODED_BYTES = 1_000_000;

const tooLarge = (limit: string): Error => new Error(`データが大きすぎます（${limit}まで）`);

/** 展開後の大きさを見ながら inflate し、上限を超えたら途中でやめる */
const inflateBounded = (bytes: Uint8Array): Uint8Array => {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inflater = new Inflate({ chunkSize: 16 * 1024 });
  inflater.onData = (chunk) => {
    total += chunk.length;
    if (total > MAX_DECODED_BYTES) {
      throw tooLarge(`展開後 ${MAX_DECODED_BYTES.toLocaleString("ja-JP")} バイト`);
    }
    chunks.push(chunk);
  };
  if (!inflater.push(bytes, true) || inflater.err) {
    throw new Error(inflater.msg || "データを展開できません");
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const fromBase64Url = (text: string): Uint8Array => {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

/** payload を pako で圧縮し、URL に載せられる文字列にする */
export const encodePayload = (payload: ReplyReviewPayload): string =>
  toBase64Url(deflate(new TextEncoder().encode(JSON.stringify(payload))));

/** encodePayload の逆。形式が不正なら例外を投げる */
export const decodePayload = (encoded: string): ReplyReviewPayload => {
  if (encoded.length > MAX_ENCODED_LENGTH) {
    throw tooLarge(`${MAX_ENCODED_LENGTH.toLocaleString("ja-JP")} 文字`);
  }
  const json = new TextDecoder().decode(inflateBounded(fromBase64Url(encoded)));
  return parsePayload(JSON.parse(json));
};

/** `#d=...` 形式のハッシュから圧縮データを取り出す。なければ null */
export const readHash = (hash: string): string | null => {
  const params = new URLSearchParams(hash.replace(/^#/u, ""));
  return params.get(HASH_KEY);
};

export const toHash = (payload: ReplyReviewPayload): string =>
  `#${HASH_KEY}=${encodePayload(payload)}`;

const isAssertionStatus = oneOf("verified", "conditional", "recheck");

const isAssertion = (v: unknown): v is Shape =>
  isObject(v) &&
  ["id", "text", "topic", "summary"].every((key) => isString(v[key])) &&
  ["method", "conditions", "nextAction"].every((key) => isOptionalString(v[key])) &&
  isAssertionStatus(v.status) &&
  (v.nextActionTiming === undefined || isNextActionTiming(v.nextActionTiming)) &&
  isArrayOf(v.checks, isCheck) &&
  isArrayOf(v.evidence, isEvidence) &&
  isOptionalArrayOf(v.owners, isString);

const isGapOption = (v: unknown): v is Shape =>
  isObject(v) && isString(v.label) && isOptionalArrayOf(v.evidence, isEvidence);

const isGap = (v: unknown): v is Shape =>
  isObject(v) &&
  isString(v.id) &&
  isString(v.question) &&
  isOptionalString(v.guidance) &&
  isOptionalArrayOf(v.options, isGapOption) &&
  isOptionalArrayOf(v.owners, isString);

const KINDS = ["text", "assertion", "gap"] as const;

/** text・assertion・gap のどれか 1 つだけを持つ */
const isPart = (v: unknown): v is Shape => {
  if (!isObject(v)) {
    return false;
  }
  const kinds = KINDS.filter((kind) => kind in v);
  if (kinds.length !== 1) {
    return false;
  }
  return kinds[0] === "text"
    ? isString(v.text)
    : kinds[0] === "assertion"
      ? isAssertion(v.assertion)
      : isGap(v.gap);
};

const isReplyParagraph = (v: Shape): boolean => isArrayOf(v.parts, isPart);

/** 下線と空欄の ID。画面で選ぶ・チェックを付ける対象なので、返信全体で重複させない */
const itemIds = (data: Shape): unknown[] =>
  ((data.reply as Shape).paragraphs as Shape[]).flatMap((p) =>
    (p.parts as Shape[]).flatMap((part) => {
      const item = (part.assertion ?? part.gap) as Shape | undefined;
      return item ? [item.id] : [];
    }),
  );

/** 判定データ（version 2）の形かを確かめる */
export const isPayload = (data: unknown): data is ReplyReviewPayload =>
  isPayloadOf(data, 2, isReplyParagraph) && isUnique(itemIds(data as Shape));

/** 廃止した判定データの version。画面はエラーではなく、新しい形式への切り替えを案内する */
export const RETIRED_VERSIONS: readonly number[] = [1];

/**
 * 廃止した version（段落ごとに判定する version 1）の判定データを読み込もうとしたときのエラー。
 * 形式の誤りとは分けて、画面が案内を出せるようにする
 */
export class RetiredVersionError extends Error {
  override name = "RetiredVersionError";
  readonly version: number;
  constructor(version: number) {
    super(
      `このデータ形式（version ${version}）は廃止されました。新しいデータ形式（version 2）で URL を作り直してください`,
    );
    this.version = version;
  }
}

/**
 * JSON から読んだ値が、画面が表示できる判定データ（version 2）かを確かめて返す。
 * そうでなければ例外を投げる（廃止した version は RetiredVersionError）
 */
export const parsePayload = (data: unknown): ReplyReviewPayload => {
  if (isPayload(data)) {
    return data;
  }
  if (
    isObject(data) &&
    typeof data.version === "number" &&
    RETIRED_VERSIONS.includes(data.version)
  ) {
    throw new RetiredVersionError(data.version);
  }
  throw new Error("データの形式が正しくありません（version 2 の payload ではありません）");
};
