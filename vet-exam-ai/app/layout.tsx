import type { Metadata } from "next";
import { Noto_Serif_KR, Noto_Sans_KR, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "../components/NavBar";
import { DueCountProvider } from "../lib/context/DueCountContext";

// IMPORTANT: Korean fonts must include the "korean" subset or glyphs fall back to system fonts
const notoSerifKR = Noto_Serif_KR({
  subsets: ["latin", "korean"],
  weight: ["700"],
  variable: "--font-noto-serif-kr",
  display: "swap",
});

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin", "korean"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-kr",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vexa — 수의사 국가시험 학습 플랫폼",
  description: "수의사 국가시험 대비 스마트 학습 플랫폼. 약점 데이터 분석으로 합격을 설계합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" dir="ltr">
      <body
        className={`${notoSerifKR.variable} ${notoSansKR.variable} ${ibmPlexMono.variable} antialiased`}
      >
        <DueCountProvider>
          <NavBar />
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
