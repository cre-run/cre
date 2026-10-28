/** テストで共通に使う、設定・偽の D1・Access の代わり */
import { type ReplyReviewPayload, encodePayload } from "@cre/editor-payload";
import {
  type StubKey,
  accessClaims,
  createStubKey,
  jwksOf,
  signToken,
} from "../scripts/access-stub.ts";
import { JWT_HEADER, type FetchJwks } from "../src/access.ts";
import type { Bindings } from "../src/env.ts";
import type { LinkStore } from "../src/links.ts";

export const BASE_URL = "https://short.example.com";
export const EDITOR_URL = "https://editor.example.com/";
export const TEAM_DOMAIN = "https://example.cloudflareaccess.com";
export const AUD = "aud-for-tests";
export const ACCESS = { allowedEmailDomains: ["example.com"], teamDomain: TEAM_DOMAIN, aud: AUD };

/** D1 のうち links.ts が使う部分だけを真似る */
export class FakeDb implements LinkStore {
  rows = new Map<string, { data: string; created_at: number }>();
  queries: string[] = [];

  prepare(query: string) {
    this.queries.push(query);
    return {
      bind: (...values: unknown[]) => ({
        run: async () => {
          const [id, data, createdAt] = values as [string, string, number];
          this.rows.set(id, { data, created_at: createdAt });
          return {};
        },
        first: async <T>() => (this.rows.get(values[0] as string) as T | undefined) ?? null,
      }),
    };
  }
}

export const envWith = (db: FakeDb, overrides: Partial<Bindings> = {}): Bindings => ({
  DB: db as unknown as D1Database,
  BASE_URL,
  ACCESS,
  EDITOR_URL,
  ...overrides,
});

export const stubKey: StubKey = await createStubKey("test-key");
export const fetchJwks: FetchJwks = async () => jwksOf(stubKey);

/** そのメールでログインした人の JWT（claims で上書きできる） */
export const tokenFor = (email: string, claims: Record<string, unknown> = {}): Promise<string> =>
  signToken(stubKey, { ...accessClaims({ iss: TEAM_DOMAIN, aud: AUD, email }), ...claims });

export const request = (path: string, token?: string): Request =>
  new Request(`${BASE_URL}${path}`, { headers: token ? { [JWT_HEADER]: token } : {} });

/** 最小限の判定データ（Message Editor が表示できる形） */
export const payload: ReplyReviewPayload = {
  version: 1,
  generatedAt: "2026-10-06T10:00:00+09:00",
  inquiry: {
    from: "田中 様",
    subject: "件名",
    receivedAt: "2026-10-05T09:00:00+09:00",
    paragraphs: [{ id: "q1", text: "問い合わせ" }],
  },
  reply: {
    to: "田中 様",
    subject: "Re: 件名",
    paragraphs: [
      {
        id: "r1",
        topic: "要点",
        text: "返信",
        summary: "要約",
        respondsTo: ["q1"],
        status: "verified",
        checks: [],
        evidence: [],
      },
    ],
  },
};

export const data = encodePayload(payload);
