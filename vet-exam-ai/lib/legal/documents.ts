import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export type LegalDocumentId = "terms" | "privacy" | "community";

type LegalDocumentMeta = {
  id: LegalDocumentId;
  title: string;
  description: string;
  canonicalPath: string;
  fileName: string;
  sourcePath: string;
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocumentMeta> = {
  terms: {
    id: "terms",
    title: "이용약관",
    description: "KVLE 서비스 이용 조건과 회원, 운영자의 권리와 의무를 안내합니다.",
    canonicalPath: "/terms",
    fileName: "terms-of-service.md",
    sourcePath: "docs/public/terms-of-service.md",
  },
  privacy: {
    id: "privacy",
    title: "개인정보 처리방침",
    description: "KVLE의 개인정보 처리 원칙, 가입 정책, 보유 및 파기 기준을 안내합니다.",
    canonicalPath: "/privacy",
    fileName: "privacy-policy.md",
    sourcePath: "docs/public/privacy-policy.md",
  },
  community: {
    id: "community",
    title: "커뮤니티 가이드라인",
    description: "KVLE 커뮤니티의 작성 원칙, 금지 행위, 신고 및 이의제기 절차를 안내합니다.",
    canonicalPath: "/community-guidelines",
    fileName: "community-guidelines.md",
    sourcePath: "docs/public/community-guidelines.md",
  },
};

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "h1",
    "h2",
    "h3",
    "h4",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
};

export async function getLegalDocument(id: LegalDocumentId) {
  const meta = LEGAL_DOCUMENTS[id];
  const markdownPath = path.join(process.cwd(), "public", "legal", meta.fileName);
  const markdown = await readFile(markdownPath, "utf8");
  const rawHtml = marked.parse(markdown, { async: false, gfm: true }) as string;

  return {
    ...meta,
    html: sanitizeHtml(rawHtml, sanitizeOptions),
  };
}
