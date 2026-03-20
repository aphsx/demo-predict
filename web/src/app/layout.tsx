import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "1Moby Analytics",
  description: "Customer Predictive Analytics Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
