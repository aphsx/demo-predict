import type { Metadata } from "next";
import { Noto_Sans_Thai, Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import FloatingChat from "@/components/FloatingChat";
import { getActiveRunName } from "@/lib/activeRun";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ["latin", "thai"],
  display: "swap",
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Churn Insight — Customer Retention Intelligence",
  description: "Customer churn prediction, risk monitoring, and retention intelligence dashboard.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const activeRunName = await getActiveRunName();
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={`${notoSansThai.variable} ${inter.variable} dashboard-shell min-h-screen flex`}>
        <Sidebar activeRunName={activeRunName ?? undefined} />
        <main className="flex-1 overflow-auto flex flex-col h-screen relative">
          <div className="w-full flex-1 flex flex-col px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
            {children}
          </div>
          <FloatingChat />
        </main>
      </body>
    </html>
  );
}
