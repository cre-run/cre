import { expect, test } from "vite-plus/test";
import { ConfigError, DEFAULT_EDITOR_URL, readConfig } from "../src/config.ts";
import { ACCESS, BASE_URL, EDITOR_URL, FakeDb, envWith } from "./helpers.ts";

test("vars を読んで、origin と小文字のドメインに整える", () => {
  const config = readConfig(
    envWith(new FakeDb(), {
      BASE_URL: "https://short.example.com/",
      ACCESS: { ...ACCESS, allowedEmailDomains: ["Example.COM", "example.co.jp"] },
    }),
  );
  expect(config.baseUrl).toBe(BASE_URL);
  expect(config.editorUrl).toBe(EDITOR_URL);
  expect(config.access).toEqual({
    allowedEmailDomains: ["example.com", "example.co.jp"],
    teamDomain: "https://example.cloudflareaccess.com",
    aud: ACCESS.aud,
  });
});

test("EDITOR_URL を書かなければ editor.cre.run、ACCESS は .dev.vars の JSON 文字列でもよい", () => {
  const config = readConfig(
    envWith(new FakeDb(), { EDITOR_URL: undefined, ACCESS: JSON.stringify(ACCESS) }),
  );
  expect(config.editorUrl).toBe(DEFAULT_EDITOR_URL);
  expect(config.access.aud).toBe(ACCESS.aud);
});

test("ローカルだけは http を許す", () => {
  const config = readConfig(
    envWith(new FakeDb(), {
      BASE_URL: "http://localhost:8787",
      EDITOR_URL: "http://localhost:4173/",
      ACCESS: { ...ACCESS, teamDomain: "http://localhost:8788" },
    }),
  );
  expect(config.baseUrl).toBe("http://localhost:8787");
  expect(config.access.teamDomain).toBe("http://localhost:8788");
});

test("必須の vars が欠けていれば ConfigError", () => {
  const cases: Partial<Record<"BASE_URL" | "ACCESS" | "EDITOR_URL", unknown>>[] = [
    { BASE_URL: undefined },
    { BASE_URL: "" },
    { BASE_URL: "short.example.com" },
    { BASE_URL: "http://short.example.com" },
    { BASE_URL: "https://short.example.com/path" },
    { BASE_URL: "https://short.example.com/?x=1" },
    { ACCESS: undefined },
    { ACCESS: "not json" },
    { ACCESS: { ...ACCESS, allowedEmailDomains: [] } },
    { ACCESS: { ...ACCESS, allowedEmailDomains: ["user@example.com"] } },
    { ACCESS: { ...ACCESS, teamDomain: "example.cloudflareaccess.com" } },
    { ACCESS: { ...ACCESS, teamDomain: "https://example.cloudflareaccess.com/certs" } },
    { ACCESS: { ...ACCESS, aud: "" } },
    { EDITOR_URL: "https://editor.example.com/#d=abc" },
    { EDITOR_URL: "javascript:alert(1)" },
  ];
  for (const overrides of cases) {
    expect(() => readConfig(envWith(new FakeDb(), overrides)), JSON.stringify(overrides)).toThrow(
      ConfigError,
    );
  }
});
