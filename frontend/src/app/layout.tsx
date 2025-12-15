import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const pepi = localFont({
  src: [
    {
      path: "../../public/font/PepiTRIAL-Light-BF676cc17205955.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/font/PepiTRIAL-Regular-BF676cc1720c98c.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/font/PepiTRIAL-Medium-BF676cc171efb6c.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/font/PepiTRIAL-SemiBold-BF676cc171edf1b.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/font/PepiTRIAL-Bold-BF676cc171e9076.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-pepi",
});

export const metadata: Metadata = {
  title: "Never Eats - Order delivery near you",
  description: "Order food delivery from local restaurants near you",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.css"
        />
      </head>
      <body className={`${pepi.variable} antialiased`}>{children}</body>
    </html>
  );
}
