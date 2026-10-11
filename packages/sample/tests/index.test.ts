import { expect, test } from "vite-plus/test";
import { hello } from "../src/index.ts";

test("hello", () => {
  expect(hello("cre")).toBe("Hello, cre!");
});
