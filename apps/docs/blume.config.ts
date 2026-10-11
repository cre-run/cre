import { defineConfig } from "blume";

export default defineConfig({
  title: "CRE Docs",
  description: "CRE のドキュメント",
  logo: {
    image: "./public/logo.svg",
    text: "CRE Docs",
  },
  i18n: {
    defaultLocale: "ja",
    locales: [{ code: "ja", label: "日本語" }],
  },
  deployment: {
    site: "https://docs.cre.run",
  },
  theme: {
    accent: "#42D6A4",
  },
});
