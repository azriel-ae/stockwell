import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Stockwell — Know your stock. Stay in control.",
    template: "%s · Stockwell",
  },
  description:
    "Stockwell is an inventory management application powered by Drivebase — products, categories, suppliers, stock movements and reports on a Drive-as-database backend.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-warmivory text-charcoal">{children}</body>
    </html>
  );
}
