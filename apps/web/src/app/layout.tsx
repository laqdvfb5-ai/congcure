import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/session";
import { core } from "@/lib/core";
import "@fontsource/source-sans-pro/400.css";
import "@fontsource/source-sans-pro/600.css";
import "@fontsource/source-sans-pro/700.css";
import "./globals.css";

const sans = Inter_Tight({
  subsets: ["latin", "vietnamese"],
  variable: "--font-grotesk",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin", "vietnamese"],
  variable: "--font-mono-face",
  display: "swap",
});
export const metadata = {
  title: { default: "congcure | Kho tài khoản số", template: "%s | congcure" },
  description:
    "Kho tài khoản số. Thanh toán bằng ví, nhận tài khoản và quản lý đơn hàng tại congcure.",
  icons: {
    icon: [
      { url: "/brand/congcure-mark.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [user, categories] = await Promise.all([
    getCurrentUser(),
    core.listCategories(),
  ]);
  const profile = user
    ? {
        name: user.name,
        email: user.email,
        balance: user.balance,
        tier: user.tier,
        role: user.role,
      }
    : null;
  return (
    <html
      lang="vi"
      data-scroll-behavior="smooth"
      className={sans.variable + " " + mono.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppShell user={profile} categories={categories}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
