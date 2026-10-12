/**
 * ローカルと単体テストで Cloudflare Access の代わりをする道具。
 * RSA の鍵を作り、Access と同じ形の JWT（RS256、kid 付き）に署名し、公開鍵を JWKS の形で返す。
 * Web Crypto だけを使うので、Node（scripts/dev-access.ts・tests）でそのまま動く。
 */
export interface StubKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey & { kid: string; alg: string; use: string };
}

const RSA = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

export const createStubKey = async (kid = "stub"): Promise<StubKey> => {
  // Workers の型は CryptoKey | CryptoKeyPair / ArrayBuffer | JsonWebKey を返すので、RSA・jwk の形に絞る
  const pair = (await crypto.subtle.generateKey(
    { ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicJwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return {
    kid,
    privateKey: pair.privateKey,
    publicJwk: { ...publicJwk, kid, alg: "RS256", use: "sig" },
  };
};

/** `/cdn-cgi/access/certs` が返す形 */
export const jwksOf = (key: StubKey): { keys: StubKey["publicJwk"][] } => ({
  keys: [key.publicJwk],
});

export const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const encodeJson = (value: unknown): string =>
  toBase64Url(new TextEncoder().encode(JSON.stringify(value)));

/** Access が発行する JWT と同じ形で署名する。header を上書きすると壊れた JWT も作れる */
export const signToken = async (
  key: StubKey,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = {},
): Promise<string> => {
  const encodedHeader = encodeJson({ alg: "RS256", typ: "JWT", kid: key.kid, ...header });
  const encodedPayload = encodeJson(claims);
  const signature = await crypto.subtle.sign(
    RSA.name,
    key.privateKey,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  return `${encodedHeader}.${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
};

/** ログインした人の JWT に Access が入れる主なクレーム。1 時間有効 */
export const accessClaims = ({
  iss,
  aud,
  email,
  now = Date.now(),
}: {
  iss: string;
  aud: string;
  email: string;
  now?: number;
}): Record<string, unknown> => {
  const seconds = Math.floor(now / 1000);
  return { iss, aud: [aud], email, iat: seconds, nbf: seconds, exp: seconds + 3600 };
};

/** 鍵をファイルに残すための形（scripts/dev-access.ts） */
export interface StoredStubKey {
  kid: string;
  privateJwk: JsonWebKey;
  publicJwk: StubKey["publicJwk"];
}

export const exportStubKey = async (key: StubKey): Promise<StoredStubKey> => ({
  kid: key.kid,
  privateJwk: (await crypto.subtle.exportKey("jwk", key.privateKey)) as JsonWebKey,
  publicJwk: key.publicJwk,
});

export const importStubKey = async (stored: StoredStubKey): Promise<StubKey> => ({
  kid: stored.kid,
  privateKey: await crypto.subtle.importKey("jwk", stored.privateJwk, RSA, true, ["sign"]),
  publicJwk: stored.publicJwk,
});
