const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^=#]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const accountEmails = {
  ops: "kvle.seed.ops@example.com",
  memory: "kvle.seed.memory@example.com",
  explain: "kvle.seed.explain@example.com",
  correction: "kvle.seed.correction@example.com",
  wrong: "kvle.seed.wrongpoint@example.com",
};

const updates = [
  {
    question_id: "1.1_해부_66회_q001",
    author: "memory",
    body_text:
      "목덜미인대는 '머리 무게 받쳐주는 탄성 밴드' 느낌으로 잡으면 기억 잘 남아요. 말·소는 발달, 돼지·고양이는 없음. 저는 이 문제 나오면 일단 '돼지고양이 예외'부터 떠올립니다.",
  },
  {
    question_id: "1.1_해부_66회_q002",
    author: "wrong",
    body_text:
      "여기서 괜히 C1, C2 구조 다 외우려다 꼬였는데, 유두돌기는 목뼈 쪽이 아니라 등뼈/허리뼈 쪽으로 보내면 됩니다. '목뼈에서 안 보이는 것'을 묻는 문제라는 점이 포인트예요.",
  },
  {
    question_id: "1.3_생리_66회_q001",
    author: "memory",
    body_text:
      "한 줄 암기: 오래 버티는 자세 유지근 = type I, 순간 힘 쓰는 근육 = type IIb. 산화성은 지구력, 해당성은 폭발력이라고 생각하면 선택지 판단이 빨라집니다.",
  },
  {
    question_id: "1.3_생리_66회_q002",
    author: "explain",
    body_text:
      "장관신경계는 생각보다 독립적인 회로라서 감각뉴런-중간뉴런-운동뉴런이 다 들어갑니다. '감각+운동만 있다'는 말은 중간 처리 과정을 빼먹은 설명이에요.",
  },
  {
    question_id: "1.4_생화학_66회_q001",
    author: "wrong",
    body_text:
      "이건 지식보다 표현 싸움에 가깝습니다. 물과 R group 사이를 '이온결합'이라고 하면 너무 강하게 말한 거고, 실제로는 수소결합으로 보는 게 맞습니다.",
  },
  {
    question_id: "1.4_생화학_66회_q004",
    author: "memory",
    body_text:
      "공복 지방대사는 순서로 외우는 게 제일 편했어요. 인슐린↓ → HSL↑ → 지방산 방출 → 간에서 β-산화 → ketone body. 뇌가 지방산을 직접 쓰지 않는다는 것도 같이 체크!",
  },
  {
    question_id: "1.6_독성_66회_q001",
    author: "correction",
    body_text:
      "이 문항은 정답 확인 필요해 보입니다. '낮은 용량에서 치사효과가 나면 toxic potency가 높고 안전성이 낮다'는 문장은 맞는 설명이라, 문제의 원래 오답 선택지가 반대로 되어 있었는지 봐야 할 것 같아요.",
  },
  {
    question_id: "1.6_독성_66회_q002",
    author: "wrong",
    body_text:
      "Paraquat는 간보다 폐! 저는 이렇게만 외워도 이 문제는 풀렸습니다. 폐에 선택적으로 축적되고 ROS를 만들어 폐 손상/섬유화로 이어지는 흐름입니다.",
  },
  {
    question_id: "2.1_미생_66회_q001",
    author: "memory",
    body_text:
      "획득면역 키워드 세트: B세포, T세포, 특이성, 기억. 호중구나 NK세포가 보이면 선천면역 쪽으로 빼고, '재노출 때 더 빠르고 강함'은 adaptive로 보면 됩니다.",
  },
  {
    question_id: "2.1_미생_66회_q002",
    author: "explain",
    body_text:
      "정상미생물총은 피부에도 있지만 '가장 풍부'는 대장입니다. 대장 미생물 대사산물이 장 면역 조절에 관여한다는 식으로, 양과 기능을 같이 묻는 문제로 보면 좋아요.",
  },
  {
    question_id: "2.2_전염_66회_q001",
    author: "wrong",
    body_text:
      "FIP에서 calicivirus 고르면 함정에 빠진 겁니다. 기본은 feline enteric coronavirus, 이후 변이로 FIP 진행. 삼출형/비삼출형까지 같이 묶어두면 재등장해도 덜 흔들립니다.",
  },
  {
    question_id: "2.2_전염_66회_q002",
    author: "memory",
    body_text:
      "ASF는 병변만 보면 돼지열병이랑 헷갈릴 수 있는데, 연진드기(Ornithodoros) 단서가 붙으면 ASF 쪽으로 강하게 갑니다. 비장 종대+적흑색도 같이 기억해두면 좋습니다.",
  },
  {
    question_id: "2.3_병리_66회_q001",
    author: "explain",
    body_text:
      "심내막염에서 떨어져 나온 세균 덩어리가 뇌로 가면 '색전'이고, 뇌 조직은 결국 액화괴사로 가기 쉽습니다. 혈전과 색전 용어를 구분하는 문제이기도 합니다.",
  },
  {
    question_id: "2.3_병리_66회_q003",
    author: "memory",
    body_text:
      "노란 크림 같은 삼출물 + 호중구 많음 = 고름 = 세균성 화농 = 액화괴사. 저는 병리 괴사 문제에서 이 조합 나오면 거의 반사적으로 액화괴사를 먼저 봅니다.",
  },
  {
    question_id: "2.4_공보_66회_q001",
    author: "wrong",
    body_text:
      "발생률은 '새로 생긴 환축'입니다. 이미 앓고 있는 개체까지 포함하는 유병률이랑 분모/의미가 달라요. 시간 개념이 들어가면 발생률 쪽을 먼저 의심하면 됩니다.",
  },
  {
    question_id: "2.4_공보_66회_q002",
    author: "memory",
    body_text:
      "Direct, Cyclo, Meta, Sapro는 필요한 요소로 끊어 외우면 덜 피곤합니다. Direct=직접, Cyclo=척추동물 여러 숙주, Meta=절지동물 매개, Sapro=토양 같은 무생물 환경. 파상풍은 Sapro.",
  },
  {
    question_id: "2.5_조류_66회_q001",
    author: "explain",
    body_text:
      "MG는 단독 감염보다 만성 경과, 난계대 전파, 백신 특성을 같이 물어보는 식으로 나오는 듯합니다. 생균백신 strain과 불활화백신의 한계를 구분해두면 좋아요.",
  },
  {
    question_id: "2.5_조류_66회_q002",
    author: "wrong",
    body_text:
      "가금 파라티푸스는 어린 병아리와 산란 성계를 나눠서 봐야 합니다. 어린 병아리에서는 폐사, 성계에서는 겉으로 멀쩡한 보균 상태가 포인트입니다.",
  },
  {
    question_id: "2.6_수생_66회_q001",
    author: "memory",
    body_text:
      "흰반점증후군은 이름 그대로 체표 백점만 외우면 부족하고, WSSV + dsDNA + 새우 급성 대량폐사까지 붙여야 합니다. '급성 폐사 없다'는 말이 틀린 포인트입니다.",
  },
  {
    question_id: "2.6_수생_66회_q002",
    author: "explain",
    body_text:
      "지수식은 물이 고여 있는 양식이라고 생각하면 됩니다. 물이 안 흐르니까 산소 공급과 수질 관리가 중요해지고, 그래서 수차나 폭기 장치가 연결됩니다.",
  },
  {
    question_id: "2.7_기생_66회_q001",
    author: "wrong",
    body_text:
      "인수공통감염병 문제는 '사람까지 연결되는 생활사인가'를 보면 됩니다. Eimeria zuernii는 소 쪽에 특화된 원충이라 사람 감염으로 보지 않는 게 핵심입니다.",
  },
  {
    question_id: "2.7_기생_66회_q002",
    author: "memory",
    body_text:
      "너구리 분변검사에서 충란이 나오려면 너구리가 종숙주여야 합니다. 간질은 반추수 쪽으로 기억하고, 나머지는 야생 육식수와 연결 가능하다고 보면 답이 정리됩니다.",
  },
  {
    question_id: "2.8_실동_66회_q001",
    author: "memory",
    body_text:
      "임상시험 단계는 이 순서만 계속 봐도 됩니다. I상 안전성/동태, II상 소수 환자 유효성+용량, III상 대규모 비교, IV상 시판 후. '적정 용량 결정'이면 II상!",
  },
  {
    question_id: "2.8_실동_66회_q002",
    author: "explain",
    body_text:
      "질환모델동물은 연구하려는 인간 질병을 얼마나 잘 닮았는지가 중요합니다. '인간과 다른 독특한 특징'이 항상 나쁜 건 아니지만, 이 문항의 기본 조건과는 반대입니다.",
  },
  {
    question_id: "3.1_내과_66회_q001",
    author: "wrong",
    body_text:
      "탈수면 몸은 물을 아끼려고 합니다. 그래서 요량은 줄고 요는 농축됩니다. '희석된다'는 표현이 먼저 이상하고, 대사성 산증 쪽 흐름도 같이 봐야 합니다.",
  },
  {
    question_id: "3.1_내과_66회_q002",
    author: "correction",
    body_text:
      "이 문제도 정답 매칭 확인이 필요합니다. 중증 설사에서는 bicarbonate 손실, 저관류, 젖산 증가로 대사성 산증과 anion gap 증가가 설명되는데, 현재 정답 문장은 맞는 설명처럼 보입니다.",
  },
  {
    question_id: "3.3_외과_66회_q001",
    author: "correction",
    body_text:
      "해설 기준으로 보면 '개가 고양이보다 창상 치유가 빠르다'는 문장은 맞습니다. 그런데 현재 정답이 그 문장으로 잡혀 있어 충돌이 있어 보여요. 원문 선택지 입력 과정 확인 추천합니다.",
  },
  {
    question_id: "3.3_외과_66회_q002",
    author: "memory",
    body_text:
      "이차유합은 '바로 닫지 못하는 상처'라고 생각하면 편합니다. 오염/결손이 커서 열어두고 세척, 이물 제거, 육아조직 형성, 수축과 상피화로 가는 흐름입니다.",
  },
  {
    question_id: "3.4_영상_66회_q001",
    author: "memory",
    body_text:
      "폐포 패턴은 air bronchogram + lobar sign을 세트로 기억하세요. tramline은 기관지 패턴, donut sign도 폐포 패턴이 아니라는 식으로 소거하면 됩니다.",
  },
  {
    question_id: "3.4_영상_66회_q002",
    author: "explain",
    body_text:
      "기관허탈은 '어디가 무너지느냐'에 따라 잘 보이는 호흡상이 다릅니다. 경부는 흡기, 흉곽 내는 호기. 그래서 흡기/호기 영상이나 투시검사 이야기가 같이 나옵니다.",
  },
  {
    question_id: "3.5_산과_66회_q001",
    author: "wrong",
    body_text:
      "자궁경관 문제는 에스트로겐과 프로게스테론 방향을 바꾸면 바로 틀립니다. 발정기에는 에스트로겐 쪽, 임신/황체기에는 프로게스테론 쪽으로 닫히고 보호되는 느낌입니다.",
  },
  {
    question_id: "3.5_산과_66회_q003",
    author: "memory",
    body_text:
      "계절번식은 광조시간을 1번으로 두면 됩니다. 빛 변화 → 송과체 멜라토닌 → 시상하부-뇌하수체-생식샘 축. 영양이나 합사는 보조 요인으로 보는 게 안정적입니다.",
  },
  {
    question_id: "4.1_법규_66회_q001",
    author: "wrong",
    body_text:
      "음압환기는 내부 공기를 빼서 안쪽 압력을 낮추는 방식입니다. 설치 비용이 비교적 낮은 게 장점 중 하나라서, 양압환기보다 초기 비용이 더 많이 든다는 말이 반대입니다.",
  },
  {
    question_id: "4.1_법규_66회_q002",
    author: "memory",
    body_text:
      "수의사 면허는 농림축산식품부장관. 검역본부가 워낙 자주 보여서 헷갈리지만, 면허 발급권자는 장관으로 고정해두면 됩니다.",
  },
  {
    question_id: "1.5_약리_64회_q001",
    author: "explain",
    body_text:
      "Collie + ivermectin 독성은 MDR1/ABCB1, P-glycoprotein, BBB 약물 배출을 한 세트로 외우면 됩니다. P-gp가 약을 뇌 밖으로 빼내야 하는데 그 기능이 떨어지는 상황입니다.",
  },
  {
    question_id: "1.5_약리_64회_q002",
    author: "memory",
    body_text:
      "Clenbuterol은 β2 agonist라 기관지 확장만 생각하면 아깝고, 체지방 감소/근육량 증가 때문에 repartitioning agent로도 연결됩니다. 수용체 분류로 먼저 소거하면 쉬워요.",
  },
];

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

async function main() {
  const users = await listAllUsers();
  const authorIds = Object.fromEntries(
    Object.entries(accountEmails).map(([key, email]) => {
      const user = users.find((item) => item.email === email);
      if (!user) throw new Error(`Missing seed account: ${email}`);
      return [key, user.id];
    }),
  );

  let updated = 0;
  for (const item of updates) {
    const userId = authorIds[item.author];
    const { error, count } = await supabase
      .from("comments")
      .update({
        body_text: item.body_text,
        body_html: renderPlainText(item.body_text),
      }, { count: "exact" })
      .eq("question_id", item.question_id)
      .eq("user_id", userId)
      .eq("status", "visible");

    if (error) throw error;
    updated += count ?? 0;
  }

  console.log(`Updated ${updated} comments.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
