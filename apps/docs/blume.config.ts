import { defineConfig } from "blume";

export default defineConfig({
  title: "CRE Docs",
  description: "CRE のドキュメント",
  logo: {
    image: "../../packages/asset/a1/symbol-mono.svg",
    text: "CRE Docs",
  },
  i18n: {
    defaultLocale: "ja",
    locales: [{ code: "ja", label: "日本語" }],
  },
  deployment: {
    site: "https://docs.cre.run",
  },
  // ガイドはアプリごとのディレクトリ（docs/<app>/）に置く。features/ 時代の URL は転送する
  redirects: [
    { from: "/features/message-editor", to: "/message-editor" },
    { from: "/features/message-editor-data-handling", to: "/message-editor/data-handling" },
  ],
  theme: {
    accent: "#42D6A4",
  },
});
