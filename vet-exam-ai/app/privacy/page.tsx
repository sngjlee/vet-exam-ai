import type { Metadata } from "next";
import LegalDocumentPage from "../../components/LegalDocumentPage";

export const metadata: Metadata = {
  title: "개인정보 처리방침 | KVLE",
  description: "KVLE 개인정보 처리방침 및 가입 정책입니다.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalDocumentPage id="privacy" />;
}
