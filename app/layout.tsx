import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import { BrandProvider } from "@/components/providers/BrandProvider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RedBox Apparel",
  description:
    "Unified commerce platform for Philippine multi-branch branded apparel retail",
};

const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: "#E8192C",
    colorBackground: "#0A0A0A",
    colorInputBackground: "#111111",
    colorInputText: "#F5F5F5",
    colorText: "#F5F5F5",
    colorTextSecondary: "#888888",
    colorDanger: "#E8192C",
    borderRadius: "0.5rem",
    fontFamily: "Inter, sans-serif",
  },
  elements: {
    card: "bg-[#111111] border border-[#2A2A2A] shadow-2xl",
    headerTitle: "text-[#F5F5F5] font-bold",
    headerSubtitle: "text-[#888888]",
    socialButtonsBlockButton:
      "bg-[#1A1A1A] border-[#2A2A2A] text-[#F5F5F5] hover:bg-[#2A2A2A]",
    formButtonPrimary:
      "bg-[#E8192C] hover:bg-[#B71420] text-white font-bold",
    footerActionLink: "text-[#E8192C] hover:text-[#FF2D3B]",
    formFieldInput:
      "bg-[#1A1A1A] border-[#2A2A2A] text-[#F5F5F5] focus:border-[#E8192C] focus:ring-[#E8192C]",
    formFieldLabel: "text-[#888888]",
    dividerLine: "bg-[#2A2A2A]",
    dividerText: "text-[#888888]",
    identityPreview: "bg-[#1A1A1A] border-[#2A2A2A]",
    identityPreviewText: "text-[#F5F5F5]",
    identityPreviewEditButton: "text-[#E8192C]",
    userButtonPopoverCard: "bg-[#111111] border-[#2A2A2A]",
    userButtonPopoverActionButton: "text-[#F5F5F5] hover:bg-[#1A1A1A]",
    userButtonPopoverActionButtonText: "text-[#F5F5F5]",
    userButtonPopoverActionButtonIcon: "text-[#888888]",
    userButtonPopoverFooter: "border-[#2A2A2A]",
    userPreviewMainIdentifier: "text-[#F5F5F5]",
    userPreviewSecondaryIdentifier: "text-[#888888]",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en">
        <body className={inter.className}>
          <ConvexClientProvider>
            <BrandProvider>{children}</BrandProvider>
          </ConvexClientProvider>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
