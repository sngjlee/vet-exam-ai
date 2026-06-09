import type { Metadata } from "next";
import LegalDocumentPage from "../../components/LegalDocumentPage";

export const metadata: Metadata = {
  title: "이용약관 | KVLE",
  description: "KVLE 서비스 이용약관입니다.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalDocumentPage id="terms" />;
}
