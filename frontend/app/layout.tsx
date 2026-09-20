import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "skill-map",
  description: "誰がどのスキルを習得しているかを可視化するスキル管理アプリ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>
        <header className="topbar">
          <h1>skill-map</h1>
        </header>
        {children}
      </body>
    </html>
  );
}
