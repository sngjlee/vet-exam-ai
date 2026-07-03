import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type AdminClient = SupabaseClient<Database>;

type SeedAuthor = "ops" | "memory" | "explain" | "correction" | "wrong";

type SeedComment = {
  questionId: string;
  author: SeedAuthor;
  type: "memorization" | "correction" | "explanation" | "question" | "discussion";
  bodyText: string;
};

const DEFAULT_DAILY_LIMIT = 5;

const seedAccounts: Array<{
  key: SeedAuthor;
  email: string;
  nickname: string;
}> = [
  { key: "ops", email: "kvle.seed.ops@example.com", nickname: "국시막판정리" },
  { key: "memory", email: "kvle.seed.memory@example.com", nickname: "암기카드" },
  { key: "explain", email: "kvle.seed.explain@example.com", nickname: "해설다시보기" },
  { key: "correction", email: "kvle.seed.correction@example.com", nickname: "정정확인중" },
  { key: "wrong", email: "kvle.seed.wrongpoint@example.com", nickname: "오답노트중" },
];

const seedComments: SeedComment[] = [
  {
    questionId: "1.1_해부_66회_q003",
    author: "memory",
    type: "memorization",
    bodyText:
      "몸통축위근은 척추 등쪽 근육 묶음으로 먼저 잡고, 허리네모근은 그 묶음에서 빼면 됩니다. 이름이 허리에 있어서 헷갈리지만 epaxial 3계통 안에 넣지 않는 게 포인트예요.",
  },
  {
    questionId: "1.1_해부_66회_q004",
    author: "wrong",
    type: "explanation",
    bodyText:
      "엉치뼈 능선 문제는 '무엇이 융합했나'를 보는 문제입니다. 정중엉치뼈능선은 가시돌기 쪽이고, 가로돌기는 바깥쪽 가장자리와 귀모양면 쪽으로 연결해서 기억하면 덜 섞입니다.",
  },
  {
    questionId: "1.1_해부_66회_q005",
    author: "memory",
    type: "memorization",
    bodyText:
      "말 앞발허리뼈는 3번이 주축입니다. 셋째 앞발허리뼈=cannon bone, 둘째/넷째는 splint bone. 숫자 3 하나만 제대로 잡아도 이 문제는 거의 끝납니다.",
  },
  {
    questionId: "1.3_생리_66회_q003",
    author: "explain",
    type: "explanation",
    bodyText:
      "anion gap은 공식 실수만 안 하면 됩니다. ([Na]+[K])-([Cl]+[HCO3]) = (152+5)-(113+27)=17. 단백질 수치는 이 기본 계산식에 바로 넣지 않습니다.",
  },
  {
    questionId: "1.3_생리_66회_q004",
    author: "memory",
    type: "memorization",
    bodyText:
      "신경전달물질 방출은 Ca2+ 유입이 방아쇠입니다. Na+는 활동전위, K+는 재분극 쪽으로 보내고, 축삭말단에서 소포 융합을 직접 밀어주는 건 Ca2+라고 정리하면 좋아요.",
  },
  {
    questionId: "1.3_생리_66회_q005",
    author: "wrong",
    type: "explanation",
    bodyText:
      "T-tubule은 Ca 저장고가 아니라 전기 신호를 근섬유 깊숙이 넣어주는 통로입니다. Ca2+ 저장과 방출은 근형질세망 쪽으로 분리해서 외우면 오답이 줄어듭니다.",
  },
  {
    questionId: "1.4_생화학_66회_q007",
    author: "memory",
    type: "memorization",
    bodyText:
      "lactate와 alanine은 둘 다 pyruvate로 들어온다고 묶어두면 편합니다. lactate는 LDH, alanine은 ALT를 거쳐 pyruvate. 당신생 문제에서 자주 쓰이는 입구입니다.",
  },
  {
    questionId: "1.4_생화학_66회_q010",
    author: "correction",
    type: "correction",
    bodyText:
      "이 문항은 정답 확인이 필요해 보입니다. ATP와 NADH가 TCA cycle을 억제한다는 설명은 일반적으로 맞는 내용이라, '틀린 것'의 정답으로 잡힌 이유를 원문 선택지와 대조하면 좋겠습니다.",
  },
  {
    questionId: "1.4_생화학_66회_q012",
    author: "explain",
    type: "explanation",
    bodyText:
      "전자전달계가 막히면 결국 ATP 생성이 떨어집니다. NADH/FADH2 재산화도 안 되니 TCA와 β-oxidation도 연쇄적으로 둔해진다고 생각하면 됩니다.",
  },
  {
    questionId: "1.6_독성_66회_q003",
    author: "wrong",
    type: "explanation",
    bodyText:
      "막 통과는 비이온화형이 유리합니다. 이온화형은 전하 때문에 지용성이 낮아 세포막을 통과하기 어렵고, 비이온화형은 지용성이 높아 통과가 쉬운 쪽입니다.",
  },
  {
    questionId: "1.6_독성_66회_q004",
    author: "memory",
    type: "memorization",
    bodyText:
      "구토 유발은 종과 의식 상태를 먼저 봅니다. 개는 apomorphine, 고양이는 xylazine 쪽으로 생각하고, 의식 없거나 말/반추류/토끼/설치류는 시도하면 안 됩니다.",
  },
  {
    questionId: "1.6_독성_66회_q005",
    author: "wrong",
    type: "explanation",
    bodyText:
      "메트헤모글로빈혈증은 초콜릿색/암적색 쪽입니다. cherry red는 청산 중독 단서라서 색깔 키워드만 제대로 잡아도 선택지가 갈립니다.",
  },
  {
    questionId: "2.1_미생_66회_q003",
    author: "explain",
    type: "explanation",
    bodyText:
      "APC를 묻는 문제면 dendritic cell을 먼저 떠올리면 됩니다. macrophage도 항원제시 기능이 있지만 활성화 후 MHC II 발현이라는 차이가 있어서 같이 구분해두면 좋아요.",
  },
  {
    questionId: "2.1_미생_66회_q004",
    author: "memory",
    type: "memorization",
    bodyText:
      "역전사효소=Retroviridae로 바로 연결해도 됩니다. Avian leukosis virus가 retrovirus라 RNA를 DNA로 바꿔 숙주 게놈에 통합하는 흐름입니다.",
  },
  {
    questionId: "2.1_미생_66회_q005",
    author: "memory",
    type: "memorization",
    bodyText:
      "IgE는 알레르기와 기생충. 비만세포/호염기구에 붙어 있다가 재노출 때 히스타민 방출로 이어진다고 보면 됩니다. IgA는 점막, IgG는 혈청 쪽으로 분리하세요.",
  },
  {
    questionId: "2.2_전염_66회_q003",
    author: "wrong",
    type: "explanation",
    bodyText:
      "개 전염성 간염은 CAV-1입니다. CAV-2는 kennel cough 쪽이라 숫자 하나가 함정이에요. ICH에서 blue eye, 간세포 핵내 봉입체도 같이 묶어두면 좋습니다.",
  },
  {
    questionId: "2.2_전염_66회_q004",
    author: "explain",
    type: "explanation",
    bodyText:
      "광견병은 혈행 전파가 아니라 신경을 타고 올라갑니다. 감염 부위에서 말초신경 축삭을 따라 역행성으로 CNS에 도달한다는 흐름이 핵심입니다.",
  },
  {
    questionId: "2.2_전염_66회_q005",
    author: "memory",
    type: "memorization",
    bodyText:
      "CPV는 구토/혈성 설사/백혈구 감소, 어린 강아지에서는 심근염까지. 고양이 panleukopenia virus와 항원교차반응도 같이 붙여두면 문제 설명만 보고 바로 잡힙니다.",
  },
  {
    questionId: "2.3_병리_66회_q004",
    author: "wrong",
    type: "explanation",
    bodyText:
      "위막(pseudomembrane)이 보이면 섬유소성 염증을 먼저 생각하세요. 장액성은 묽은 삼출, 화농성은 pus, 카타르성은 점막 분비/박리 쪽이라 결이 다릅니다.",
  },
  {
    questionId: "2.3_병리_66회_q006",
    author: "memory",
    type: "memorization",
    bodyText:
      "Congo red 양성 + 원형세포 종양이면 형질세포종 쪽을 떠올리면 됩니다. 아밀로이드 침착과 연결되는 대표 종양이라는 식으로 정리해두면 편해요.",
  },
  {
    questionId: "2.3_병리_66회_q009",
    author: "wrong",
    type: "explanation",
    bodyText:
      "노화 신경세포 색소는 멜라닌이 아니라 리포푸신입니다. 'wear-and-tear pigment' 느낌으로 기억하면 노화/산화 스트레스와 연결됩니다.",
  },
  {
    questionId: "2.4_공보_66회_q003",
    author: "memory",
    type: "memorization",
    bodyText:
      "세균성 질병만 고르는 문제에서는 렙토스피라증과 돼지단독만 남깁니다. 구제역/황열은 바이러스, 칸디다는 진균, 바베시아는 원충으로 바로 분류하세요.",
  },
  {
    questionId: "2.4_공보_66회_q004",
    author: "wrong",
    type: "explanation",
    bodyText:
      "모기 매개 질병 묶음에서 마버그열은 빠집니다. 뎅기/서나일/일본뇌염/황열은 모기, 마버그는 감염 동물이나 사람과의 접촉 쪽으로 기억하면 됩니다.",
  },
  {
    questionId: "2.4_공보_66회_q005",
    author: "explain",
    type: "explanation",
    bodyText:
      "HFRS는 한타바이러스 계열이고 설치류 배설물 흡입/접촉이 핵심입니다. 진드기 매개도 아니고 세균도 아니라는 점을 먼저 지우면 선택지가 많이 정리됩니다.",
  },
  {
    questionId: "2.5_조류_66회_q003",
    author: "memory",
    type: "memorization",
    bodyText:
      "Eimeria maxima는 이름처럼 oocyst가 크고 면역원성이 강하다고 묶어두면 기억이 쉽습니다. 기생 부위는 소장 중부. tenella는 맹장 혈변으로 따로 빼두세요.",
  },
  {
    questionId: "2.5_조류_66회_q004",
    author: "explain",
    type: "explanation",
    bodyText:
      "닭 대장균증은 혈청형이 다양해서 농장별 자가백신 이야기가 나옵니다. 동종 혈청형 방어는 되지만 이종 혈청형 교차방어가 어렵다는 점이 이유입니다.",
  },
  {
    questionId: "2.5_조류_66회_q005",
    author: "wrong",
    type: "explanation",
    bodyText:
      "IB는 전파가 빠르지만 조기 도태가 핵심 예방책은 아닙니다. all-in/all-out, 차단방역, 위생관리, 백신 사용 쪽으로 예방 전략을 잡아야 합니다.",
  },
];

function parseDailyLimit() {
  const raw = process.env.DAILY_COMMENT_SEED_LIMIT;
  if (!raw) return DEFAULT_DAILY_LIMIT;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_DAILY_LIMIT;
  return Math.min(value, 20);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPlainText(text: string) {
  return `<p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>`;
}

async function listAllUsers(admin: AdminClient) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function ensureSeedAccounts(admin: AdminClient) {
  const existingUsers = await listAllUsers(admin);
  const usersByEmail = new Map(existingUsers.map((user) => [user.email, user]));
  const result: Record<SeedAuthor, string> = {} as Record<SeedAuthor, string>;

  for (const account of seedAccounts) {
    let user = usersByEmail.get(account.email);
    if (!user) {
      const password = crypto.randomBytes(24).toString("base64url");
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: { seed_account: true, seed_label: account.nickname },
      });
      if (error) throw error;
      user = data.user;
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ display_name: account.nickname, role: "user", is_active: true })
      .eq("id", user.id);
    if (profileError) throw profileError;

    const { error: publicError } = await admin
      .from("user_profiles_public")
      .upsert(
        {
          user_id: user.id,
          nickname: account.nickname,
          bio: "클로즈베타 학습 댓글 계정입니다.",
        },
        { onConflict: "user_id" },
      );
    if (publicError) throw publicError;

    result[account.key] = user.id;
  }

  return result;
}

export async function runDailyCommentSeeding(admin: AdminClient) {
  const limit = parseDailyLimit();
  const authorIds = await ensureSeedAccounts(admin);
  const internalIds = [...new Set(seedComments.map((comment) => comment.questionId))];

  // B1: seed data carries internal question ids; resolve them to KVLE public ids
  // so seeded comments live in the same identifier space as user comments.
  const { data: questionRows, error: questionError } = await admin
    .from("questions")
    .select("id, public_id")
    .in("id", internalIds);
  if (questionError) throw questionError;

  const publicIdByInternal = new Map<string, string>();
  for (const q of questionRows ?? []) {
    if (q.public_id) publicIdByInternal.set(q.id, q.public_id);
  }

  // Only seed comments whose question resolved to a public id.
  const resolvable = seedComments.filter((comment) =>
    publicIdByInternal.has(comment.questionId),
  );
  const questionPublicIds = [
    ...new Set(resolvable.map((comment) => publicIdByInternal.get(comment.questionId)!)),
  ];

  const { data: existingRows, error: existingError } = await admin
    .from("comments")
    .select("question_public_id, body_text")
    .in("question_public_id", questionPublicIds);
  if (existingError) throw existingError;

  const existing = new Set(
    (existingRows ?? []).map((row) => `${row.question_public_id}\n${row.body_text}`),
  );
  const keyOf = (comment: (typeof seedComments)[number]) =>
    `${publicIdByInternal.get(comment.questionId)}\n${comment.bodyText}`;
  const existingSeedCount = resolvable.filter((comment) =>
    existing.has(keyOf(comment)),
  ).length;

  const pending = resolvable
    .filter((comment) => !existing.has(keyOf(comment)))
    .slice(0, limit);

  if (pending.length === 0) {
    return {
      ok: true,
      inserted: 0,
      remaining: resolvable.length - existingSeedCount,
      limit,
    };
  }

  const rows = pending.map((comment) => ({
    question_public_id: publicIdByInternal.get(comment.questionId)!,
    user_id: authorIds[comment.author],
    parent_id: null,
    type: comment.type,
    body_text: comment.bodyText,
    body_html: renderPlainText(comment.bodyText),
    image_urls: [],
    status: "visible" as const,
  }));

  const { data, error } = await admin
    .from("comments")
    .insert(rows)
    .select("id, question_public_id, type");
  if (error) throw error;

  return {
    ok: true,
    inserted: data?.length ?? 0,
    remaining: resolvable.length - existingSeedCount - (data?.length ?? 0),
    limit,
  };
}
