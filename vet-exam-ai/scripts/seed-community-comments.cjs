const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

let supabase;

const seedAccounts = [
  {
    key: "ops",
    email: "kvle.seed.ops@example.com",
    nickname: "국시막판정리",
  },
  {
    key: "memory",
    email: "kvle.seed.memory@example.com",
    nickname: "암기카드",
  },
  {
    key: "explain",
    email: "kvle.seed.explain@example.com",
    nickname: "해설다시보기",
  },
  {
    key: "correction",
    email: "kvle.seed.correction@example.com",
    nickname: "정정확인중",
  },
  {
    key: "wrong",
    email: "kvle.seed.wrongpoint@example.com",
    nickname: "오답노트중",
  },
];

const comments = [
  {
    question_id: "1.1_해부_66회_q001",
    author: "memory",
    type: "memorization",
    body_text:
      "목덜미인대는 '머리 무게를 탄성으로 받쳐주는 앞쪽 가시위인대'로 잡아두면 좋아요. 말·소처럼 머리와 목의 부담이 큰 동물에서 발달하고, 돼지·고양이는 예외로 묶어두면 선택지가 빨리 지워집니다.",
  },
  {
    question_id: "1.1_해부_66회_q002",
    author: "wrong",
    type: "explanation",
    body_text:
      "이 문제는 목뼈의 '있는 구조'보다 없는 구조를 찾는 문제입니다. 가로돌기구멍은 C1~C6, 가쪽 척추구멍은 C1에서 떠올리고, 유두돌기는 등뼈/허리뼈 쪽 구조로 빼면 정답이 깔끔해집니다.",
  },
  {
    question_id: "1.3_생리_66회_q001",
    author: "memory",
    type: "memorization",
    body_text:
      "근섬유는 기능으로 외우면 덜 헷갈립니다. 자세 유지처럼 오래 버텨야 하는 일은 type I slow oxidative, 순간적인 큰 힘은 type IIb fast glycolytic입니다. '오래 버팀=산화성'만 잡아도 오답이 줄어요.",
  },
  {
    question_id: "1.3_생리_66회_q002",
    author: "explain",
    type: "explanation",
    body_text:
      "장관신경계는 감각뉴런, 중간뉴런, 운동뉴런이 모두 들어간 작은 회로처럼 보면 됩니다. '중간뉴런이 없다'는 선택지는 장관신경총 안에서 정보가 중계된다는 핵심을 지워버린 표현이라 틀립니다.",
  },
  {
    question_id: "1.4_생화학_66회_q001",
    author: "wrong",
    type: "explanation",
    body_text:
      "물 분자와 단백질 R group의 상호작용을 볼 때 포인트는 결합 이름입니다. 물은 쌍극자라 친수성/이온화 R group과 주로 수소결합을 만들고, '이온결합을 형성한다'는 표현이 함정입니다.",
  },
  {
    question_id: "1.4_생화학_66회_q004",
    author: "memory",
    type: "memorization",
    body_text:
      "절식 상태 흐름은 '인슐린 감소 → HSL 활성화 → 지방산 방출 → 간 β-산화 → ketone body'로 한 줄로 묶으면 좋습니다. 뇌는 ketone body는 쓸 수 있지만 유리 지방산 자체를 바로 쓰지는 못한다는 점도 같이 체크하세요.",
  },
  {
    question_id: "1.6_독성_66회_q001",
    author: "correction",
    type: "correction",
    body_text:
      "정정 검토가 필요해 보입니다. 문제는 '틀린 내용'을 묻고 있는데 현재 정답 문장은 '낮은 용량에서 치사효과가 나면 독성 역가가 높고 안전성이 낮다'로, 해설상 옳은 설명입니다. 원문 선택지가 반대로 되어 있었는지 확인하면 좋겠습니다.",
  },
  {
    question_id: "1.6_독성_66회_q002",
    author: "wrong",
    type: "explanation",
    body_text:
      "Paraquat는 '폐 선택적 축적 → ROS → 폐 손상/섬유화'로 연결해 두면 좋습니다. 간 대사 독성처럼 보이게 만든 선택지가 함정이고, 이 문제의 중심 장기는 폐입니다.",
  },
  {
    question_id: "2.1_미생_66회_q001",
    author: "memory",
    type: "memorization",
    body_text:
      "획득면역은 'B/T 세포 + 특이성 + 기억 + 느린 시작'으로 정리하면 됩니다. 호중구와 NK세포가 나오면 선천면역 쪽으로 보내고, 재노출 때 더 빠르고 강해진다는 문장이 보이면 adaptive 쪽입니다.",
  },
  {
    question_id: "2.1_미생_66회_q002",
    author: "explain",
    type: "explanation",
    body_text:
      "정상미생물총 문제는 '어디가 가장 많나'와 '대사산물이 면역에 뭘 하나'를 같이 묻습니다. 대장은 미생물 밀도가 높고 단쇄지방산 같은 대사산물이 장 면역 조절과 병원체 억제에 관여합니다.",
  },
  {
    question_id: "2.2_전염_66회_q001",
    author: "wrong",
    type: "explanation",
    body_text:
      "FIP는 이름 때문에 호흡기 바이러스나 calicivirus와 섞이면 안 됩니다. 핵심은 feline enteric coronavirus가 변이되어 FIP로 진행한다는 점이고, 삼출형/비삼출형 병변을 같이 묶어두면 좋습니다.",
  },
  {
    question_id: "2.2_전염_66회_q002",
    author: "memory",
    type: "memorization",
    body_text:
      "ASF는 '고치사율 전신성 출혈 + 비장 종대/적흑색 + Ornithodoros 연진드기' 조합으로 기억하면 구분이 쉽습니다. 돼지열병과 병변이 비슷해 보여도 진드기 매개 단서가 ASF 쪽으로 강하게 기웁니다.",
  },
  {
    question_id: "2.3_병리_66회_q001",
    author: "explain",
    type: "explanation",
    body_text:
      "심내막염 병소에서 떨어져 나온 세균성 색전이 뇌혈관을 막고, 뇌는 허혈 뒤 액화괴사로 가기 쉽다는 흐름입니다. 혈전은 '제자리에서 생김', 색전은 '떨어져 이동함'으로 구분하세요.",
  },
  {
    question_id: "2.3_병리_66회_q003",
    author: "memory",
    type: "memorization",
    body_text:
      "황색 크림양 삼출물 + 호중구 다수 = 화농성 염증 = 세균 = 액화괴사로 연결하면 빠릅니다. 결핵성 건락괴사나 기생충성 호산구 반응과 비교해서 정리하면 선택지 제거가 쉬워요.",
  },
  {
    question_id: "2.4_공보_66회_q001",
    author: "wrong",
    type: "explanation",
    body_text:
      "발생률은 '관찰 기간 중 새로 생긴 환축'이 포인트입니다. 유병률은 이미 질병 상태인 개체까지 포함하는 스냅샷에 가깝고, 치명율은 걸린 개체 중 사망 비율이라 분모가 달라집니다.",
  },
  {
    question_id: "2.4_공보_66회_q002",
    author: "memory",
    type: "memorization",
    body_text:
      "Zoonoses 분류는 필요한 요소로 외우면 편합니다. Direct=한 숙주로 가능, Cyclo=척추동물 2종 이상, Meta=절지동물 매개체, Sapro=토양/식물/유기물 같은 무생물 환경 필요. 파상풍은 Sapro 쪽입니다.",
  },
  {
    question_id: "2.5_조류_66회_q001",
    author: "explain",
    type: "explanation",
    body_text:
      "MG는 '만성 호흡기 + 난계대 전파 + 생균백신 strain'을 같이 봐야 합니다. 불활화백신은 산란 저하/난계대 전염 예방에는 도움 되지만 감염 자체를 완전히 차단하는 개념은 아닙니다.",
  },
  {
    question_id: "2.5_조류_66회_q002",
    author: "wrong",
    type: "explanation",
    body_text:
      "가금 파라티푸스는 연령별 차이가 포인트입니다. 2주령 이하 병아리에서는 폐사가 두드러지고, 산란 성계에서는 임상증상 없이 보균 상태로 지나가는 경우가 많다는 대비를 잡아두세요.",
  },
  {
    question_id: "2.6_수생_66회_q001",
    author: "memory",
    type: "memorization",
    body_text:
      "흰반점증후군은 'WSSV, 피막 있는 dsDNA, 새우에서 급성 대량 폐사'를 한 덩어리로 외우면 됩니다. 체색 적변/퇴색/체표 백점이 나오면 급성 폐사가 없다는 선택지는 바로 의심하세요.",
  },
  {
    question_id: "2.6_수생_66회_q002",
    author: "explain",
    type: "explanation",
    body_text:
      "지수식 양식은 물 흐름이 거의 없는 정체 수역을 쓰기 때문에 산소 공급과 수질 관리가 핵심입니다. 유수식은 흐르는 물, 순환여과식은 여과·재순환, 가두리는 자연 수역 그물 설치로 구분하면 됩니다.",
  },
  {
    question_id: "2.7_기생_66회_q001",
    author: "wrong",
    type: "explanation",
    body_text:
      "인수공통 여부는 숙주 범위로 가르면 좋습니다. Eimeria zuernii는 소 등 특정 숙주에 치우친 원충이라 사람 감염 쪽으로 가지 않고, 유구조충·분선충·간흡충·Giardia는 사람과의 연결고리가 있습니다.",
  },
  {
    question_id: "2.7_기생_66회_q002",
    author: "memory",
    type: "memorization",
    body_text:
      "너구리 분변검사 문제는 '육식수 종숙주가 가능한가'를 묻습니다. 간질은 주로 반추수가 종숙주라 너구리에서 빼고, 폐흡충·요코가와흡충·광절열두조충·Alaria는 야생 육식수 가능성을 떠올리면 됩니다.",
  },
  {
    question_id: "2.8_실동_66회_q001",
    author: "memory",
    type: "memorization",
    body_text:
      "임상시험 단계는 숫자와 목적을 붙여 외우면 편합니다. I상=건강인 안전성/동태, II상=소수 환자 유효성·안전성·용량, III상=대규모 비교, IV상=시판 후 추적입니다.",
  },
  {
    question_id: "2.8_실동_66회_q002",
    author: "explain",
    type: "explanation",
    body_text:
      "질환모델동물은 '인간 질병을 닮아야 연구 모델이 된다'는 전제가 핵심입니다. 인간과 다른 독특한 특성이 장점처럼 보일 수 있지만, 이 문항에서는 유사한 생물학적·유전적 특성이 기본 조건입니다.",
  },
  {
    question_id: "3.1_내과_66회_q001",
    author: "wrong",
    type: "explanation",
    body_text:
      "탈수 보상은 물을 아끼는 방향입니다. 그래서 요량은 줄고 요는 농축됩니다. 또 순환 저하와 이화 증가가 겹치면 산증 쪽으로 가기 쉬우므로 '희석뇨/알칼리증' 표현이 함정입니다.",
  },
  {
    question_id: "3.1_내과_66회_q002",
    author: "correction",
    type: "correction",
    body_text:
      "정답/해설 검토가 필요합니다. 급성 중증 설사에서는 bicarbonate 손실, 저관류, 젖산 증가로 대사성 산증과 anion gap 증가가 설명되는데, 현재 정답 문장은 그 자체로 맞는 설명처럼 보입니다. 원문 오답 선택지와 매칭을 확인하면 좋겠습니다.",
  },
  {
    question_id: "3.3_외과_66회_q001",
    author: "correction",
    type: "correction",
    body_text:
      "이 문항은 정답 선택지와 해설이 충돌해 보입니다. 해설은 고양이의 피부 창상 치유가 개보다 느리다고 설명하므로 '개에서 더 빠르다'는 문장은 맞는 설명입니다. 원본에서 틀린 선택지가 '고양이에서 더 빠르다'였는지 확인이 필요합니다.",
  },
  {
    question_id: "3.3_외과_66회_q002",
    author: "memory",
    type: "memorization",
    body_text:
      "이차유합은 '크게 비거나 오염된 상처를 열어두고, 세척·이물 제거·육아조직·수축/상피화로 간다'는 흐름입니다. Primary healing은 깨끗한 절개창을 바로 맞대는 상황으로 대비하세요.",
  },
  {
    question_id: "3.4_영상_66회_q001",
    author: "memory",
    type: "memorization",
    body_text:
      "폐포 패턴은 air bronchogram과 lobar sign을 세트로 잡아두면 좋습니다. tramline은 기관지 패턴, interlobular fissure는 간질 패턴 쪽 단서라 폐포 패턴 선택지에서 걸러낼 수 있습니다.",
  },
  {
    question_id: "3.4_영상_66회_q002",
    author: "explain",
    type: "explanation",
    body_text:
      "기관허탈은 위치와 호흡상이 같이 나옵니다. 경부 기관은 흡기 때, 흉곽 내 기관은 호기 때 더 잘 보입니다. 정적 방사선만 보면 놓칠 수 있어 투시검사가 동적 평가에 유리하다는 점도 같이 기억하세요.",
  },
  {
    question_id: "3.5_산과_66회_q001",
    author: "wrong",
    type: "explanation",
    body_text:
      "자궁경관은 호르몬 방향을 헷갈리기 쉽습니다. 발정기에는 에스트로겐 영향으로 이완·통과 허용, 황체기/임신기에는 프로게스테론 영향으로 폐쇄·보호 쪽입니다. '발정기 프로게스테론'이 함정입니다.",
  },
  {
    question_id: "3.5_산과_66회_q003",
    author: "memory",
    type: "memorization",
    body_text:
      "계절번식은 광조시간 → 송과체 → 멜라토닌 → HPG axis로 이어지는 흐름을 잡으면 됩니다. 영양이나 합사도 영향을 주지만, 계절성을 만드는 1차 환경 신호는 photoperiod입니다.",
  },
  {
    question_id: "4.1_법규_66회_q001",
    author: "wrong",
    type: "explanation",
    body_text:
      "음압환기는 팬으로 내부 공기를 빼내 축사 안을 낮은 압력으로 만드는 방식입니다. 장점 중 하나가 비교적 낮은 설치 비용이므로, 양압환기보다 초기 비용이 더 많이 든다는 표현이 반대입니다.",
  },
  {
    question_id: "4.1_법규_66회_q002",
    author: "memory",
    type: "memorization",
    body_text:
      "수의사 면허 발급권자는 농림축산식품부장관입니다. 검역본부가 수의 방역·검역 업무에서 자주 등장해서 헷갈리지만, 법령상 면허 정의에서는 장관을 기준으로 잡아두면 됩니다.",
  },
  {
    question_id: "1.5_약리_64회_q001",
    author: "explain",
    type: "explanation",
    body_text:
      "Collie의 ivermectin 독성은 MDR1/ABCB1 변이로 P-glycoprotein 기능이 떨어져 BBB에서 약물 배출이 안 되는 흐름입니다. 'P-gp가 뇌 밖으로 빼낸다'는 방향성을 기억하면 조합 문제가 쉬워집니다.",
  },
  {
    question_id: "1.5_약리_64회_q002",
    author: "memory",
    type: "memorization",
    body_text:
      "Clenbuterol은 β2 agonist라 기관지 확장과 함께 체지방 감소·근육량 증가 쪽 효과가 연결됩니다. Epinephrine은 비선택적, phenylephrine은 α1, verapamil은 Ca channel blocker로 분류를 먼저 지우면 됩니다.",
  },
];

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    console.log([
      "Usage:",
      "  node scripts/seed-community-comments.cjs --dry-run",
      "  node scripts/seed-community-comments.cjs --apply",
      "",
      "Default is --dry-run. --apply creates seed accounts and inserts missing comments.",
    ].join("\n"));
    process.exit(0);
  }
  if (args.has("--dry-run") && args.has("--apply")) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }
  return { apply: args.has("--apply") };
}

function initSupabase() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([^=#]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function summarizeSeedPlan() {
  const byType = comments.reduce((acc, comment) => {
    acc[comment.type] = (acc[comment.type] ?? 0) + 1;
    return acc;
  }, {});
  const byAuthor = comments.reduce((acc, comment) => {
    acc[comment.author] = (acc[comment.author] ?? 0) + 1;
    return acc;
  }, {});
  const questionCount = new Set(comments.map((comment) => comment.question_id)).size;

  return {
    mode: "dry-run",
    comments: comments.length,
    questions: questionCount,
    accounts: seedAccounts.map((account) => account.nickname),
    byType,
    byAuthor,
    sample: comments.slice(0, 5).map((comment) => ({
      question_id: comment.question_id,
      author: comment.author,
      type: comment.type,
      body_text: comment.body_text,
    })),
    applyCommand: "node scripts/seed-community-comments.cjs --apply",
  };
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPlainText(text) {
  return `<p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>`;
}

async function listAllUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function ensureSeedAccounts() {
  const existingUsers = await listAllUsers();
  const usersByEmail = new Map(existingUsers.map((user) => [user.email, user]));
  const result = {};

  for (const account of seedAccounts) {
    let user = usersByEmail.get(account.email);
    if (!user) {
      const password = crypto.randomBytes(24).toString("base64url");
      const { data, error } = await supabase.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: { seed_account: true, seed_label: account.nickname },
      });
      if (error) throw error;
      user = data.user;
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (data) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ display_name: account.nickname, role: "user", is_active: true })
      .eq("id", user.id);
    if (profileError) throw profileError;

    const { error: publicError } = await supabase
      .from("user_profiles_public")
      .upsert(
        {
          user_id: user.id,
          nickname: account.nickname,
          bio: "KVLE 학습 댓글 운영 계정입니다.",
        },
        { onConflict: "user_id" },
      );
    if (publicError) throw publicError;

    result[account.key] = user.id;
  }

  return result;
}

async function main() {
  const { apply } = parseArgs();
  if (!apply) {
    console.log(JSON.stringify(summarizeSeedPlan(), null, 2));
    return;
  }

  initSupabase();
  const authorIds = await ensureSeedAccounts();
  const questionIds = [...new Set(comments.map((comment) => comment.question_id))];

  const { data: existingRows, error: existingError } = await supabase
    .from("comments")
    .select("question_id, body_text")
    .in("question_id", questionIds);
  if (existingError) throw existingError;

  const existing = new Set(
    (existingRows ?? []).map((row) => `${row.question_id}\n${row.body_text}`),
  );
  const rows = comments
    .filter((comment) => !existing.has(`${comment.question_id}\n${comment.body_text}`))
    .map((comment) => ({
      question_id: comment.question_id,
      user_id: authorIds[comment.author],
      parent_id: null,
      type: comment.type,
      body_text: comment.body_text,
      body_html: renderPlainText(comment.body_text),
      image_urls: [],
      status: "visible",
    }));

  if (rows.length === 0) {
    console.log("No new comments to insert.");
    return;
  }

  const { data, error } = await supabase
    .from("comments")
    .insert(rows)
    .select("id, question_id, type, user_id");
  if (error) throw error;

  console.log(`Inserted ${data.length} comments.`);
  console.log(
    JSON.stringify(
      {
        accounts: seedAccounts.map((account) => ({
          nickname: account.nickname,
          id: authorIds[account.key],
        })),
        insertedByType: data.reduce((acc, row) => {
          acc[row.type] = (acc[row.type] ?? 0) + 1;
          return acc;
        }, {}),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
