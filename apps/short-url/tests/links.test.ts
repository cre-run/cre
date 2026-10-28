import {
  HASH_KEY,
  MAX_ENCODED_LENGTH,
  encodePayload,
  type ReplyReviewPayload,
} from "@cre/editor-payload";
import { expect, test } from "vite-plus/test";
import {
  InvalidDataError,
  UUID_V4,
  editorUrl,
  findLink,
  insertLink,
  shortUrl,
  validateData,
} from "../src/links.ts";
import { BASE_URL, EDITOR_URL, FakeDb, data, payload } from "./helpers.ts";

test("Message Editor が表示できる判定データだけを受け付ける", () => {
  expect(validateData(data)).toBe(data);
  for (const bad of [
    undefined,
    42,
    "",
    `${data}\n`,
    `${data}&x=1`,
    "not-a-payload",
    encodePayload({ ...payload, version: 3 as 2 }),
    "A".repeat(MAX_ENCODED_LENGTH + 1),
  ]) {
    expect(() => validateData(bad), String(bad).slice(0, 20)).toThrow(InvalidDataError);
  }
});

test("version 1 の判定データ（利用中の URL）も登録できる", () => {
  const [first] = payload.reply.paragraphs;
  const v1 = {
    ...payload,
    version: 1,
    reply: { ...payload.reply, paragraphs: [{ ...first, parts: undefined, text: "返信" }] },
  };
  const encoded = encodePayload(v1 as unknown as ReplyReviewPayload);
  expect(validateData(encoded)).toBe(encoded);
});

test("登録した行は UUID v4 の id を持ち、data をそのまま返す", async () => {
  const db = new FakeDb();
  const id = await insertLink(db, data, 1_760_000_000_123);
  expect(id).toMatch(UUID_V4);
  expect(db.rows.get(id)).toEqual({ data, created_at: 1_760_000_000 });
  expect(await findLink(db, id)).toBe(data);
  expect(await findLink(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
});

test("短縮 URL と転送先の形", () => {
  const id = "0f8c3a52-6b1e-4d7a-9c25-3e4f5a6b7c8d";
  expect(shortUrl(BASE_URL, id)).toBe(`${BASE_URL}/id/${id}`);
  expect(editorUrl(EDITOR_URL, data)).toBe(`${EDITOR_URL}#${HASH_KEY}=${data}`);
});
