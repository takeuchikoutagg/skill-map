import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` が、AI 向けの案内ファイル(AGENTS.md、CLAUDE.md)を、起動のたびに自動で作るのを止める。
  // このプロジェクトの決まりは、リポジトリ直下の CLAUDE.md に書いてある。
  agentRules: false,
};

export default nextConfig;
