import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` が、AI 向けの案内ファイル(AGENTS.md、CLAUDE.md)を、起動のたびに自動で作るのを止める。
  // このプロジェクトの決まりは、リポジトリ直下の CLAUDE.md に書いてある。
  agentRules: false,
  // 本番用のイメージ(Dockerfile)を、小さくするための出力。実行に必要なファイルだけを、
  // `.next/standalone` に、まとめて出す(`node_modules` を、まるごと持ち歩かなくてよい)。
  output: "standalone",
};

export default nextConfig;
