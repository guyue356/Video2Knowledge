import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video2Knowledge",
  description: "把视频、音频和媒体链接整理成结构清晰、可继续编辑的文本资产。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
