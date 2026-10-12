// ローカルで Cloudflare Access の代わりをする（wrangler dev と組み合わせる）。
//   node scripts/dev-access.ts serve [--port 8788]                 公開鍵を /cdn-cgi/access/certs で返す
//   node scripts/dev-access.ts token --email dev@example.com       そのメールでログインした人の JWT を出す
// 鍵は .dev-access.json に置く（コミットしない）。.dev.vars の ACCESS.teamDomain を http://localhost:8788 に向ける。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  type StoredStubKey,
  type StubKey,
  accessClaims,
  createStubKey,
  exportStubKey,
  importStubKey,
  jwksOf,
  signToken,
} from "./access-stub.ts";

const KEY_FILE = join(dirname(fileURLToPath(import.meta.url)), "../.dev-access.json");

const loadKey = async (): Promise<StubKey> => {
  if (existsSync(KEY_FILE)) {
    return importStubKey(JSON.parse(readFileSync(KEY_FILE, "utf8")) as StoredStubKey);
  }
  const key = await createStubKey("dev");
  writeFileSync(KEY_FILE, JSON.stringify(await exportStubKey(key)));
  return key;
};

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string", default: "8788" },
    email: { type: "string" },
    aud: { type: "string", default: "short-url-dev" },
    iss: { type: "string", default: "http://localhost:8788" },
  },
});

const key = await loadKey();

switch (positionals[0]) {
  case "serve": {
    const port = Number(values.port);
    createServer((request, response) => {
      if (request.url === "/cdn-cgi/access/certs") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(jwksOf(key)));
      } else {
        response.writeHead(404).end();
      }
    }).listen(port, () => {
      console.log(`Access の公開鍵を http://localhost:${port}/cdn-cgi/access/certs で返しています`);
    });
    break;
  }
  case "token": {
    if (!values.email) {
      console.error("--email を指定してください");
      process.exit(1);
    }
    console.log(
      await signToken(key, accessClaims({ iss: values.iss, aud: values.aud, email: values.email })),
    );
    break;
  }
  default:
    console.error("使い方: node scripts/dev-access.ts serve | token --email <メール>");
    process.exit(1);
}
