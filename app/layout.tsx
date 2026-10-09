import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "厦门理工台球社管理系统",
  description: "成员、赛事、约战与积分一体化管理平台",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
