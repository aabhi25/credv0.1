import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "PreApprove — Credit Eligibility",
  description: "Instant pre-approved credit eligibility checks",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>
        <ConfirmProvider>{children}</ConfirmProvider>
      </body>
    </html>
  );
}
