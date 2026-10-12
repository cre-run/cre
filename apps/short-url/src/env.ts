/**
 * wrangler.jsonc の binding と vars。
 * vars は検証する前の値なので unknown で受ける（.dev.vars では JSON も文字列で届く）。検証は config.ts。
 */
export interface Bindings {
  DB: D1Database;
  BASE_URL?: unknown;
  ACCESS?: unknown;
  EDITOR_URL?: unknown;
}
