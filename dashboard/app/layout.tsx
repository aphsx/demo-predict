import type { Metadata } from "next";
import { Noto_Sans_Thai, Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={`${notoSansThai.variable} ${inter.variable} dashboard-shell min-h-screen`}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <div className="mx-auto min-h-screen max-w-[1600px] px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}

