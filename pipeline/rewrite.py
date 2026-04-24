"""수의국시 기출문제 재작성 — vet40 원문 저작권 우회.

Usage:
    python rewrite.py pipeline/output/1.1_해부_66회.json --limit 2      # 2문제만 테스트
    python rewrite.py pipeline/output/1.1_해부_66회.json                # 1개 파일 전체
    python rewrite.py --all                                              # 전체 20과목 × 10회차
    python rewrite.py pipeline/output/1.1_해부_66회.json --force         # 이미 완료된 파일 덮어쓰기

Output:
    pipeline/output/rewritten/<원본과 동일 파일명>.json

규칙:
    - 원본 문제/선택지/해설의 지식은 그대로 유지, 표현만 변경
    - 선택지 순서도 셔플
    - 해설은 새로 작성 (원본 없으면 지식 기반으로 생성)
    - community_notes(수험생 댓글)는 원본 그대로 보존 — 이미 파생 저작물
    - 복수정답·정답없음·미복원 문제는 is_active=false로 스킵
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import anthropic
from dotenv import load_dotenv

PIPELINE_ROOT = Path(__file__).parent
OUTPUT_ROOT = PIPELINE_ROOT / "output"
REWRITTEN_ROOT = OUTPUT_ROOT / "rewritten"

load_dotenv(PIPELINE_ROOT / ".env")

MODEL_DEFAULT = "claude-opus-4-7"

REWRITE_SYSTEM_PROMPT = """너는 한국 수의사 국가시험 기출문제를 저작권 문제 없이 학습용으로 재구성하는 전문가다.

## 목표
원본 문제의 **지식·정답·의학적 사실은 100% 보존**하면서, **표현과 선택지 순서는 완전히 새로 쓴다**. 결과물은 원본의 파생저작물이 아닌 독립된 학습 문제로 읽혀야 한다.

## 재작성 규칙

### 1. 문제 본문 (question)
- 원본과 의미는 동일하되 **문장 구조·어휘·어미를 전면 재구성**
- 원본: "~에 대한 설명으로 옳은 것은?" → 재작성: "~의 특성을 바르게 기술한 것은?" / "~에 관하여 맞는 내용은?" 같은 식으로 다양화
- 원본에 포함된 지문(보기·설명)도 의미 유지하며 다른 표현으로
- 의학 용어(해부학적 명칭, 질병명, 약물명 등)는 **원본 그대로 유지** — 재명명 금지
- 영문 병기가 있으면 병기 유지

### 2. 선택지 (choices)
- 모든 선택지의 **의미는 보존**하되 **표현은 다르게** 작성
- **선택지 순서를 무작위로 섞을 것** — 원본 ①이 재작성본 ③이 될 수 있음
- 정답 선택지도 다른 표현으로 재작성 (단, 의미·지시대상은 동일해야 함)
- 오답 선택지도 모두 재작성 — 각 오답이 가진 "왜 틀린지"의 포인트는 유지
- 선택지 앞의 번호(①②③④⑤)는 붙이지 말 것 — 순수 텍스트만

### 3. 정답 (answer)
- 재작성된 choices 배열 중 정답에 해당하는 항목의 **텍스트를 그대로** 반환
- choices 중 정확히 하나와 문자열이 일치해야 함

### 4. 해설 (explanation)
- 원본 해설이 있으면 그 지식을 바탕으로 **완전히 새로운 문장**으로 재작성
- 원본 해설이 없으면 수의학 지식 기반으로 새로 작성 (한국 수의학 교과서 수준)
- 정답이 왜 맞는지 + 주요 오답이 왜 틀렸는지 포함
- 500자 이내 권장, 너무 짧거나 너무 길지 않게

## 금지사항
- 원본과 동일한 문장·어구를 그대로 재사용하는 것 (의학 용어 제외)
- 지식·사실관계를 바꾸는 것 (정답이 달라지거나 의학적으로 틀린 내용 생성)
- 선택지 개수를 원본과 다르게 만드는 것
- 문제에 없던 새로운 조건·제약을 추가하는 것

## 출력 형식
JSON schema를 엄격히 준수. `answer`는 반드시 `choices` 배열의 한 요소와 문자열이 정확히 일치.
"""

OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "question": {
            "type": "string",
            "description": "재작성된 문제 본문 (지식 보존, 표현 변경)",
        },
        "choices": {
            "type": "array",
            "items": {"type": "string"},
            "description": "재작성된 선택지 (순서 셔플, 번호 없이 순수 텍스트)",
        },
        "answer": {
            "type": "string",
            "description": "choices 중 정답에 해당하는 항목의 텍스트 (정확히 일치)",
        },
        "explanation": {
            "type": "string",
            "description": "새로 작성한 해설",
        },
    },
    "required": ["question", "choices", "answer", "explanation"],
    "additionalProperties": False,
}


def build_user_message(q: dict, subject_full: str) -> str:
    """원본 문제 → API에 전달할 user 메시지."""
    choices_block = "\n".join(
        f"{i + 1}. {c}" for i, c in enumerate(q["choices"])
    )
    answer_idx = q["answer_numbers"][0]
    answer_original = (
        q["choices"][answer_idx - 1]
        if 1 <= answer_idx <= len(q["choices"])
        else "(정답 파싱 불가)"
    )

    if q.get("has_explanation") and q.get("explanation"):
        exp_block = q["explanation"]
    else:
        exp_block = "(원본에 해설 없음 — 수의학 지식 기반으로 새로 작성할 것)"

    return f"""다음 한국 수의사 국가시험 기출 문제를 위 규칙에 따라 재작성하라.

## 과목
{subject_full}

## 원본 문제
{q["question"]}

## 원본 선택지
{choices_block}

## 원본 정답
{answer_idx}번: {answer_original}

## 원본 해설
{exp_block}
"""


def should_skip(q: dict) -> tuple[bool, str]:
    """재작성 스킵 여부 결정. (skip, reason)."""
    if q.get("is_unrestored"):
        return True, "unrestored"
    if not q.get("answer_numbers"):
        return True, "no_answer"
    if len(q["answer_numbers"]) > 1:
        return True, "multi_answer"
    if not q.get("choices") or len(q["choices"]) < 2:
        return True, "bad_choices"
    if not q.get("question"):
        return True, "no_question_body"
    return False, ""


def rewrite_one(
    client: anthropic.Anthropic, model: str, q: dict, subject_full: str
) -> tuple[dict, anthropic.types.Usage]:
    """한 문제 재작성 → 파싱된 결과 + 사용량 리턴."""
    response = client.messages.create(
        model=model,
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": REWRITE_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        output_config={
            "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA}
        },
        messages=[{"role": "user", "content": build_user_message(q, subject_full)}],
    )

    text = next(b.text for b in response.content if b.type == "text")
    parsed = json.loads(text)

    if parsed["answer"] not in parsed["choices"]:
        raise ValueError(
            f"정답이 choices에 없음: answer={parsed['answer']!r}, "
            f"choices={parsed['choices']}"
        )
    return parsed, response.usage


def process_file(
    client: anthropic.Anthropic,
    model: str,
    input_path: Path,
    output_path: Path,
    limit: int | None = None,
    force: bool = False,
) -> dict:
    """JSON 파일 1개 처리 → 재작성본 저장 + 통계 리턴."""
    if output_path.exists() and not force:
        print(f"  [skip] 이미 처리됨: {output_path.name} (--force로 덮어쓰기)")
        return {}

    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    rewritten: list[dict] = []
    skipped: list[dict] = []
    failed: list[dict] = []
    totals = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
    }

    questions = data["questions"]
    if limit is not None:
        questions = questions[:limit]

    subject_full = data["subject_full"]
    round_num = data["round"]
    prefix = data["subject_folder"].split(" ", 1)[0]
    short = data["subject_short"]

    for q in questions:
        skip, reason = should_skip(q)
        if skip:
            skipped.append({"number": q["number"], "reason": reason})
            continue

        qid = f"{prefix}_{short}_{round_num}회_q{q['number']:03d}"
        try:
            result, usage = rewrite_one(client, model, q, subject_full)
        except Exception as e:
            failed.append(
                {"number": q["number"], "error": f"{type(e).__name__}: {e}"}
            )
            print(f"  [fail] q{q['number']:03d}: {e}")
            continue

        totals["input_tokens"] += usage.input_tokens
        totals["output_tokens"] += usage.output_tokens
        totals["cache_creation_input_tokens"] += (
            usage.cache_creation_input_tokens or 0
        )
        totals["cache_read_input_tokens"] += usage.cache_read_input_tokens or 0

        rewritten.append(
            {
                "id": qid,
                "source_number": q["number"],
                "question": result["question"],
                "choices": result["choices"],
                "answer": result["answer"],
                "explanation": result["explanation"],
                "community_notes": q.get("community_notes"),
                "has_question_image": q.get("has_question_image", False),
                "question_images": q.get("question_images", []),
                "explanation_images": q.get("explanation_images", []),
                "comment_images": q.get("comment_images", []),
            }
        )

    result_doc = {
        "source_file": data["source_file"],
        "subject_folder": data["subject_folder"],
        "subject_short": data["subject_short"],
        "subject_full": data["subject_full"],
        "session": data["session"],
        "round": data["round"],
        "year": data["year"],
        "model": model,
        "source_question_count": len(questions),
        "rewritten_count": len(rewritten),
        "skipped_count": len(skipped),
        "failed_count": len(failed),
        "skipped": skipped,
        "failed": failed,
        "usage": totals,
        "questions": rewritten,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result_doc, f, ensure_ascii=False, indent=2)

    return result_doc


def format_usage_cost(usage: dict, model: str) -> str:
    """사용량 + 예상 비용 요약 문자열."""
    if model == "claude-opus-4-7":
        in_rate, out_rate, cache_write_mul, cache_read_mul = 5.0, 25.0, 1.25, 0.1
    elif model == "claude-sonnet-4-6":
        in_rate, out_rate, cache_write_mul, cache_read_mul = 3.0, 15.0, 1.25, 0.1
    elif model == "claude-haiku-4-5":
        in_rate, out_rate, cache_write_mul, cache_read_mul = 1.0, 5.0, 1.25, 0.1
    else:
        in_rate, out_rate, cache_write_mul, cache_read_mul = 5.0, 25.0, 1.25, 0.1

    cost = (
        usage["input_tokens"] * in_rate
        + usage["cache_creation_input_tokens"] * in_rate * cache_write_mul
        + usage["cache_read_input_tokens"] * in_rate * cache_read_mul
        + usage["output_tokens"] * out_rate
    ) / 1_000_000

    total_cached = usage["cache_read_input_tokens"] + usage["cache_creation_input_tokens"]
    cache_hit_rate = (
        usage["cache_read_input_tokens"] / total_cached * 100
        if total_cached > 0
        else 0
    )

    return (
        f"in={usage['input_tokens']:,} "
        f"cache_w={usage['cache_creation_input_tokens']:,} "
        f"cache_r={usage['cache_read_input_tokens']:,} "
        f"out={usage['output_tokens']:,} "
        f"hit={cache_hit_rate:.0f}% "
        f"cost=${cost:.4f}"
    )


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input", nargs="?", help="입력 JSON 파일 (--all일 때 생략)")
    p.add_argument(
        "--all",
        action="store_true",
        help="output/ 안의 모든 JSON을 처리",
    )
    p.add_argument("--model", default=MODEL_DEFAULT, help=f"모델 (기본: {MODEL_DEFAULT})")
    p.add_argument(
        "--limit", type=int, help="파일당 문제 수 제한 (테스트용)"
    )
    p.add_argument(
        "--force", action="store_true", help="이미 처리된 파일도 다시 처리"
    )
    args = p.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY가 설정되지 않음. pipeline/.env 확인.")
        sys.exit(1)

    client = anthropic.Anthropic()

    if args.all:
        inputs = sorted(
            f for f in OUTPUT_ROOT.glob("*.json") if not f.name.startswith("_")
        )
    elif args.input:
        p_in = Path(args.input)
        if not p_in.is_absolute():
            p_in = Path.cwd() / p_in
        inputs = [p_in]
    else:
        print("ERROR: 입력 파일을 지정하거나 --all 옵션 사용")
        sys.exit(1)

    grand_totals = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
    }
    files_processed = 0
    questions_rewritten = 0
    t0 = time.time()

    for input_path in inputs:
        output_path = REWRITTEN_ROOT / input_path.name
        print(f"\n== {input_path.name} → {output_path.relative_to(OUTPUT_ROOT)} ==")

        try:
            result = process_file(
                client, args.model, input_path, output_path,
                limit=args.limit, force=args.force,
            )
        except KeyboardInterrupt:
            print("\n중단됨.")
            break

        if not result:
            continue

        files_processed += 1
        questions_rewritten += result["rewritten_count"]
        for k in grand_totals:
            grand_totals[k] += result["usage"][k]

        print(
            f"  재작성 {result['rewritten_count']}/{result['source_question_count']} "
            f"(스킵 {result['skipped_count']}, 실패 {result['failed_count']})"
        )
        print(f"  사용량: {format_usage_cost(result['usage'], args.model)}")

    elapsed = time.time() - t0
    print(
        f"\n=== 완료: {files_processed} 파일, {questions_rewritten} 문제, "
        f"{elapsed:.0f}초 ==="
    )
    print(f"누적 사용량: {format_usage_cost(grand_totals, args.model)}")


if __name__ == "__main__":
    main()
