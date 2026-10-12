/**
 * 判定データの検査と、D1 の読み書き。
 * data は Message Editor の URL の `#d=` より後ろの値そのもの（base64url）を、そのまま保存する。
 */
import { HASH_KEY, decodePayload } from "@cre/editor-payload";

/** 短縮 URL の ID は UUID v4 だけ（小文字） */
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** `#d=` に載る値は base64url の文字だけ。改行や `&` を Location ヘッダーや URL に混ぜられないようにする */
export const DATA_CHARS = /^[A-Za-z0-9_-]+$/u;

export class InvalidDataError extends Error {
  override name = "InvalidDataError";
}

/** Message Editor が表示できるデータだけを受け付ける（長さと展開後の大きさの上限も同じ） */
export const validateData = (data: unknown): string => {
  if (typeof data !== "string" || !DATA_CHARS.test(data)) {
    throw new InvalidDataError("data は Message Editor の URL の #d= より後ろの値を渡してください");
  }
  try {
    decodePayload(data);
  } catch (error) {
    throw new InvalidDataError(
      error instanceof Error ? error.message : "Message Editor が表示できないデータです",
    );
  }
  return data;
};

/** D1 のうち使う部分。テストでは同じ形の偽物を渡す */
export interface LinkStore {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
    };
  };
}

export const insertLink = async (
  db: LinkStore,
  data: string,
  now: number = Date.now(),
): Promise<string> => {
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO links (id, data, created_at) VALUES (?1, ?2, ?3)")
    .bind(id, data, Math.floor(now / 1000))
    .run();
  return id;
};

export const findLink = async (db: LinkStore, id: string): Promise<string | null> => {
  const row = await db.prepare("SELECT data FROM links WHERE id = ?1").bind(id).first<{
    data: string;
  }>();
  return row?.data ?? null;
};

export const shortUrl = (baseUrl: string, id: string): string => `${baseUrl}/id/${id}`;

/** 転送先は設定の EDITOR_URL だけ（オープンリダイレクトにしない）。判定データは `#` 以降なのでサーバーには届かない */
export const editorUrl = (editor: string, data: string): string => `${editor}#${HASH_KEY}=${data}`;
