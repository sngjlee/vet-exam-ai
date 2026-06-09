import Image from "next/image";
import Link from "next/link";
import { getLegalDocument, LEGAL_DOCUMENTS, type LegalDocumentId } from "../lib/legal/documents";

export default async function LegalDocumentPage({ id }: { id: LegalDocumentId }) {
  const doc = await getLegalDocument(id);
  const relatedDocs = Object.values(LEGAL_DOCUMENTS).filter((item) => item.id !== id);

  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link href="/" className="legal-brand" aria-label="KVLE 홈">
          <Image src="/logo.png" alt="KVLE 수의미래연구소" width={108} height={36} priority />
        </Link>
        <div className="legal-meta">
          <span>사용자 공개 문서</span>
          <span>{doc.canonicalPath}</span>
        </div>
        <h1>{doc.title}</h1>
        <p>{doc.description}</p>
      </header>

      <article className="legal-prose" dangerouslySetInnerHTML={{ __html: doc.html }} />

      <footer className="legal-footer">
        <div>
          <strong>문서 원본</strong>
          <span>{doc.sourcePath}</span>
        </div>
        <nav aria-label="다른 정책 문서">
          {relatedDocs.map((item) => (
            <Link key={item.id} href={item.canonicalPath}>
              {item.title}
            </Link>
          ))}
        </nav>
      </footer>
    </main>
  );
}
