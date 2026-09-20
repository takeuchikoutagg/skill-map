import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// テストの設定。ブラウザの代わりに jsdom(パソコンの中で動く、簡易なブラウザ)で、画面の部品を動かす。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) }, // "@/lib/api" のような書き方を、テストでも使えるようにする
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
