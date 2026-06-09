import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  FileWarning,
  Image as ImageIcon,
  MessageSquareWarning,
  TrendingDown,
} from "lucide-react";
import { createClient } from "../../../lib/supabase/server";
import {
  getQuestionQualityIssues,
  QUESTION_QUALITY_LABELS,
  type QuestionQualityFields,
  type QuestionQualityIssue,
} from "../../../lib/admin/question-quality";

export const dynamic = "force-dynamic";

const QUESTION_LIMIT = 3000;
const ATTEMPT_LIMIT = 5000;
const COMMENT_LIMIT = 2000;

type QuestionRecord = QuestionQualityFields & {
  id: string;
  public_id: string;
  question: string;
  category: string;
  subject: string | null;
  topic: string | null;
  created_at: string;
};

type AttemptRecord = {
  question_id: string;
  is_correct: boolean;
};

type ReportedComment = {
  id: string;
  question_id: string;
  report_count: number;
  status: string;
  body_text: string;
  created_at: string;
};

type TriageRecord = {
  question_id: string;
  status: string;
};

type CorrectionRecord = {
  question_id: string;
  status: string;
};

type ReportedQuestionRow = {
  question: QuestionRecord;
  reportCount: number;
  commentCount: number;
  hiddenCount: number;
  latestReportedAt: string;
};

type AccuracyQuestionRow = {
  question: QuestionRecord;
  attempts: number;
  correct: number;
  incorrect: number;
  accuracy: number;
};

type TopicRow = {
  topic: string;
  category: string;
  attempts: number;
  incorrect: number;
  accuracy: number;
  questionCount: number;
};

type ImagePendingRow = {
  question: QuestionRecord;
  triageStatus: string | null;
  correctionStatus: string | null;
  issues: QuestionQualityIssue[];
};

async function loadQualityDashboard() {
  const supabase = await createClient();

  const [questionsRes, attemptsRes, commentsRes, triageRes, correctionsRes] = await Promise.all([
    supabase
      .from("questions")
      .select(
        "id, public_id, question, choices, answer, explanation, category, subject, topic, year, session, round, tags, is_active, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .limit(QUESTION_LIMIT),
    supabase
      .from("attempts")
      .select("question_id, is_correct")
      .order("answered_at", { ascending: false })
      .limit(ATTEMPT_LIMIT),
    supabase
      .from("comments")
      .select("id, question_id, report_count, status, body_text, created_at")
      .gt("report_count", 0)
      .order("report_count", { ascending: false })
      .limit(COMMENT_LIMIT),
    supabase
      .from("question_image_triage")
      .select("question_id, status")
      .limit(QUESTION_LIMIT),
    supabase
      .from("question_corrections")
      .select("question_id, status")
      .in("status", ["proposed", "reviewing"])
      .limit(COMMENT_LIMIT),
  ]);

  const questions = ((questionsRes.data ?? []) as QuestionRecord[]).map((question) => ({
    ...question,
    choices: question.choices ?? [],
    tags: question.tags ?? [],
  }));
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const attempts = (attemptsRes.data ?? []) as AttemptRecord[];
  const reportedComments = (commentsRes.data ?? []) as ReportedComment[];
  const triageRows = (triageRes.data ?? []) as TriageRecord[];
  const correctionRows = (correctionsRes.data ?? []) as CorrectionRecord[];

  const issueCounts = Object.fromEntries(
    Object.keys(QUESTION_QUALITY_LABELS).map((issue) => [issue, 0]),
  ) as Record<QuestionQualityIssue, number>;
  const issueRows: ImagePendingRow[] = [];
  const triageMap = new Map(triageRows.map((row) => [row.question_id, row.status]));
  const correctionMap = new Map(correctionRows.map((row) => [row.question_id, row.status]));

  for (const question of questions) {
    const issues = getQuestionQualityIssues(question);
    for (const issue of issues) issueCounts[issue] += 1;
    if (issues.length > 0) {
      issueRows.push({
        question,
        triageStatus: triageMap.get(question.id) ?? null,
        correctionStatus: correctionMap.get(question.id) ?? null,
        issues,
      });
    }
  }

  const reportedByQuestion = new Map<string, ReportedQuestionRow>();
  for (const comment of reportedComments) {
    const question = questionMap.get(comment.question_id);
    if (!question) continue;
    const current = reportedByQuestion.get(comment.question_id) ?? {
      question,
      reportCount: 0,
      commentCount: 0,
      hiddenCount: 0,
      latestReportedAt: comment.created_at,
    };
    current.reportCount += comment.report_count ?? 0;
    current.commentCount += 1;
    if (comment.status !== "visible") current.hiddenCount += 1;
    if (comment.created_at > current.latestReportedAt) current.latestReportedAt = comment.created_at;
    reportedByQuestion.set(comment.question_id, current);
  }

  const attemptsByQuestion = new Map<string, AccuracyQuestionRow>();
  const topicAgg = new Map<string, TopicRow>();
  for (const attempt of attempts) {
    const question = questionMap.get(attempt.question_id);
    if (!question) continue;
    const current = attemptsByQuestion.get(attempt.question_id) ?? {
      question,
      attempts: 0,
      correct: 0,
      incorrect: 0,
      accuracy: 0,
    };
    current.attempts += 1;
    if (attempt.is_correct) current.correct += 1;
    else current.incorrect += 1;
    current.accuracy = current.correct / current.attempts;
    attemptsByQuestion.set(attempt.question_id, current);

    const topic = question.topic?.trim() || "(topic 없음)";
    const key = `${question.category}\n${topic}`;
    const topicRow = topicAgg.get(key) ?? {
      topic,
      category: question.category,
      attempts: 0,
      incorrect: 0,
      accuracy: 0,
      questionCount: 0,
    };
    topicRow.attempts += 1;
    if (!attempt.is_correct) topicRow.incorrect += 1;
    topicRow.accuracy = (topicRow.attempts - topicRow.incorrect) / topicRow.attempts;
    topicAgg.set(key, topicRow);
  }

  for (const [key, topic] of topicAgg) {
    const [category, topicName] = key.split("\n");
    topic.questionCount = questions.filter(
      (question) => question.category === category && (question.topic?.trim() || "(topic 없음)") === topicName,
    ).length;
  }

  const reportedQuestions = Array.from(reportedByQuestion.values())
    .sort((a, b) => b.reportCount - a.reportCount || b.commentCount - a.commentCount)
    .slice(0, 8);
  const lowAccuracyQuestions = Array.from(attemptsByQuestion.values())
    .filter((row) => row.attempts >= 5)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, 8);
  const weakTopics = Array.from(topicAgg.values())
    .filter((row) => row.attempts >= 8)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, 8);
  const imagePendingRows = issueRows
    .filter((row) => row.issues.includes("image_pending") || row.triageStatus === "needs_replacement")
    .sort((a, b) => Number(a.question.is_active) - Number(b.question.is_active));
  const imagePending = imagePendingRows.slice(0, 8);

  return {
    errors: [
      questionsRes.error && `questions: ${questionsRes.error.message}`,
      attemptsRes.error && `attempts: ${attemptsRes.error.message}`,
      commentsRes.error && `comments: ${commentsRes.error.message}`,
      triageRes.error && `question_image_triage: ${triageRes.error.message}`,
      correctionsRes.error && `question_corrections: ${correctionsRes.error.message}`,
    ].filter(Boolean) as string[],
    counts: {
      totalQuestions: questionsRes.count ?? questions.length,
      loadedQuestions: questions.length,
      attempts: attempts.length,
      reportedQuestions: reportedByQuestion.size,
      needsReview: issueRows.length,
      imagePending: imagePendingRows.length,
    },
    issueCounts,
    reportedQuestions,
    lowAccuracyQuestions,
    weakTopics,
    imagePending,
  };
}

function percent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function shortText(value: string, max = 72): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function questionHref(question: QuestionRecord): string {
  return `/admin/questions/${encodeURIComponent(question.id)}`;
}

export default async function AdminQualityPage() {
  const dashboard = await loadQualityDashboard();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          콘텐츠 품질
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          신고, 풀이 결과, 메타데이터, 이미지 검수 상태를 한 번에 봅니다.
        </p>
      </header>

      {dashboard.errors.length > 0 && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            background: "var(--wrong-dim)",
            border: "1px solid rgba(192,74,58,0.3)",
            color: "var(--wrong)",
          }}
        >
          {dashboard.errors.join(" / ")}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="검수 필요" value={dashboard.counts.needsReview} icon={FileWarning} href="/admin/questions?quality=needs_review" />
        <SummaryCard label="신고 문항" value={dashboard.counts.reportedQuestions} icon={MessageSquareWarning} href="/admin/reports" />
        <SummaryCard label="풀이 표본" value={dashboard.counts.attempts} icon={BarChart3} href="/admin/questions" />
        <SummaryCard label="이미지 보류" value={dashboard.counts.imagePending} icon={ImageIcon} href="/admin/image-questions" />
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <IssueCountPanel counts={dashboard.issueCounts} />
        <QualityTable
          title="신고 많은 문항"
          icon={MessageSquareWarning}
          empty="신고가 누적된 문항이 없습니다."
          href="/admin/reports"
        >
          {dashboard.reportedQuestions.map((row) => (
            <tr key={row.question.id}>
              <Td>
                <QuestionLink question={row.question} />
                <Small>{shortText(row.question.question)}</Small>
              </Td>
              <Td align="right">{row.reportCount.toLocaleString("ko-KR")}</Td>
              <Td align="right">{row.commentCount.toLocaleString("ko-KR")}</Td>
              <Td>{formatDate(row.latestReportedAt)}</Td>
            </tr>
          ))}
        </QualityTable>
        <QualityTable
          title="이미지/검수 보류"
          icon={ImageIcon}
          empty="이미지 보류 문항이 없습니다."
          href="/admin/image-questions"
        >
          {dashboard.imagePending.map((row) => (
            <tr key={row.question.id}>
              <Td>
                <QuestionLink question={row.question} />
                <Small>{shortText(row.question.question)}</Small>
              </Td>
              <Td>{row.triageStatus ?? "미분류"}</Td>
              <Td>{row.correctionStatus ?? "—"}</Td>
              <Td>
                <IssueBadges issues={row.issues} />
              </Td>
            </tr>
          ))}
        </QualityTable>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <QualityTable
          title="정답률 이상치"
          icon={TrendingDown}
          empty="풀이 표본 5건 이상인 낮은 정답률 문항이 없습니다."
          href="/admin/questions"
        >
          {dashboard.lowAccuracyQuestions.map((row) => (
            <tr key={row.question.id}>
              <Td>
                <QuestionLink question={row.question} />
                <Small>{shortText(row.question.question, 96)}</Small>
              </Td>
              <Td align="right">{row.attempts.toLocaleString("ko-KR")}</Td>
              <Td align="right">{percent(row.accuracy)}</Td>
              <Td align="right">{row.incorrect.toLocaleString("ko-KR")}</Td>
            </tr>
          ))}
        </QualityTable>

        <QualityTable
          title="오답률 높은 Topic"
          icon={AlertTriangle}
          empty="풀이 표본 8건 이상인 topic 이상치가 없습니다."
          href="/admin/questions"
        >
          {dashboard.weakTopics.map((row) => (
            <tr key={`${row.category}-${row.topic}`}>
              <Td>
                <Link
                  href={`/admin/questions?q=${encodeURIComponent(row.topic === "(topic 없음)" ? row.category : row.topic)}`}
                  style={{ color: "var(--teal)", textDecoration: "none" }}
                >
                  {row.topic}
                </Link>
                <Small>{row.category}</Small>
              </Td>
              <Td align="right">{row.attempts.toLocaleString("ko-KR")}</Td>
              <Td align="right">{percent(1 - row.accuracy)}</Td>
              <Td align="right">{row.questionCount.toLocaleString("ko-KR")}</Td>
            </tr>
          ))}
        </QualityTable>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number }>;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg p-4"
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--rule)",
        textDecoration: "none",
      }}
    >
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <Icon size={13} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold kvle-mono" style={{ color: "var(--text)" }}>
        {value.toLocaleString("ko-KR")}
      </div>
    </Link>
  );
}

function IssueCountPanel({ counts }: { counts: Record<QuestionQualityIssue, number> }) {
  return (
    <section
      className="rounded-lg p-4"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
        <FileWarning size={15} />
        품질 이슈 분포
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(QUESTION_QUALITY_LABELS) as QuestionQualityIssue[]).map((issue) => (
          <Link
            key={issue}
            href={`/admin/questions?quality=${issue}`}
            className="rounded-md px-3 py-2"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--rule)",
              color: "var(--text)",
              textDecoration: "none",
            }}
          >
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {QUESTION_QUALITY_LABELS[issue]}
            </div>
            <div className="mt-1 text-lg font-semibold kvle-mono">
              {counts[issue].toLocaleString("ko-KR")}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function QualityTable({
  title,
  icon: Icon,
  empty,
  href,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  empty: string;
  href: string;
  children: React.ReactNode;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section
      className="overflow-hidden rounded-lg"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--rule)" }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
          <Icon size={15} />
          {title}
        </div>
        <Link href={href} className="text-xs" style={{ color: "var(--teal)", textDecoration: "none" }}>
          전체 보기
        </Link>
      </div>
      {hasRows ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <tbody>{children}</tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          {empty}
        </div>
      )}
    </section>
  );
}

function QuestionLink({ question }: { question: QuestionRecord }) {
  return (
    <Link href={questionHref(question)} className="kvle-mono" style={{ color: "var(--teal)", textDecoration: "none" }}>
      {question.public_id}
    </Link>
  );
}

function IssueBadges({ issues }: { issues: QuestionQualityIssue[] }) {
  if (issues.length === 0) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {issues.map((issue) => (
        <span
          key={issue}
          className="rounded-full text-[10px] font-medium"
          style={{
            padding: "2px 7px",
            background: "var(--wrong-dim)",
            color: "var(--wrong)",
            border: "1px solid rgba(192,74,58,0.25)",
          }}
        >
          {QUESTION_QUALITY_LABELS[issue]}
        </span>
      ))}
    </div>
  );
}

function Small({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={align === "right" ? "px-4 py-3 text-right align-top" : "px-4 py-3 align-top"}
      style={{
        borderBottom: "1px solid var(--rule)",
        color: "var(--text)",
        whiteSpace: align === "right" ? "nowrap" : undefined,
      }}
    >
      {children}
    </td>
  );
}
