import type { Metadata } from "next";
import LegalDocumentPage from "../../components/LegalDocumentPage";

export const metadata: Metadata = {
  title: "커뮤니티 가이드라인 | KVLE",
  description: "KVLE 커뮤니티 가이드라인입니다.",
  alternates: { canonical: "/community-guidelines" },
};

export default function CommunityGuidelinesPage() {
  return <LegalDocumentPage id="community" />;
}
