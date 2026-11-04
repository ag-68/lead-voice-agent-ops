import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastHost } from "@/components/toast-host";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lead Qualifier Pipeline | AI-Powered Sales Automation",
  description: "Autonomous inbound lead qualifier with LLM scoring, Slack approval workflow, and ElevenAgents voice follow-up.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full overflow-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} h-full overflow-hidden antialiased`}
      >
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
