import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import ConditionalNavBar from "../components/ConditionalNavBar";
import { DueCountProvider } from "../lib/context/DueCountContext";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KVLE — 수의사 국가시험 학습 플랫폼",
  description: "수의사 국가시험 대비 스마트 학습 플랫폼. 약점 데이터 분석으로 합격을 설계합니다.",
  icons: { icon: "/favicon.ico" },
  openGraph: {
    title: "KVLE — 수의사 국가시험 학습 플랫폼",
    description: "수의사 국가시험 대비 스마트 학습 플랫폼. 약점 데이터 분석으로 합격을 설계합니다.",
    url: "https://vet-exam-ai.vercel.app",
    siteName: "KVLE",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "KVLE — 수의사 국가시험 학습 플랫폼",
    description: "수의사 국가시험 대비 스마트 학습 플랫폼. 약점 데이터 분석으로 합격을 설계합니다.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" dir="ltr">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body
        className={`${ibmPlexMono.variable} antialiased`}
      >
        <DueCountProvider>
          <ConditionalNavBar />
          {children}
        </DueCountProvider>
        {/* Scroll-reveal fallback for browsers without animation-timeline: view() */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  if(typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timeline','view()')) return;
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){ e.target.style.animationPlayState='running'; io.unobserve(e.target); }
    });
  },{threshold:0.1});
  function observe(){ document.querySelectorAll('.scroll-reveal').forEach(function(el){ io.observe(el); }); }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',observe); } else { observe(); }
})();`,
          }}
        />
      </body>
    </html>
  );
}
