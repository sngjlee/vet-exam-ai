"""HWP 기출문제 → 구조화 JSON 추출.

Usage:
    python extract.py "raw-exams/1.1 해부"       # 폴더 1개
    python extract.py --all                        # 전체 20과목

Output:
    output/<prefix>_<short>_<round>회.json         # 예: 1.1_해부_66회.json
    output/images/<key>_q<N>_<tag><i>.<ext>        # 예: 1.1_해부_66회_q001_fig1.png

HWP 구조 (hwp5html 변환 후):
    문제 1개 = <table> 1개. 셀 위치 고정:
        cell[0]=과목축약 / cell[2]=문제번호 / cell[7]=정답번호(1~5)
        cell[9]=문제본문+선택지 / cell[11]=해설 / cell[13]=댓글(선택)
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from lxml import etree

SUBJECTS: dict[str, dict] = {
    "1.1 해부": {"short": "해부", "full": "해부학", "session": 1},
    "1.2 조직": {"short": "조직", "full": "조직학", "session": 1},
    "1.3 생리": {"short": "생리", "full": "생리학", "session": 1},
    "1.4 생화학": {"short": "생화학", "full": "생화학", "session": 1},
    "1.5 약리": {"short": "약리", "full": "약리학", "session": 1},
    "1.6 독성": {"short": "독성", "full": "독성학", "session": 1},
    "2.1 미생": {"short": "미생", "full": "미생물학", "session": 2},
    "2.2 전염": {"short": "전염", "full": "전염병학", "session": 2},
    "2.3 병리": {"short": "병리", "full": "병리학", "session": 2},
    "2.4 공보": {"short": "공보", "full": "공중보건학", "session": 2},
    "2.5 조류": {"short": "조류", "full": "조류질병학", "session": 2},
    "2.6 수생": {"short": "수생", "full": "수생생물의학", "session": 2},
    "2.7 기생": {"short": "기생", "full": "기생충학", "session": 2},
    "2.8 실동": {"short": "실동", "full": "실험동물학", "session": 2},
    "3.1 내과": {"short": "내과", "full": "내과학", "session": 3},
    "3.2 임병": {"short": "임병", "full": "임상병리학", "session": 3},
    "3.3 외과": {"short": "외과", "full": "외과학", "session": 3},
    "3.4 영상": {"short": "영상", "full": "영상진단의학", "session": 3},
    "3.5 산과": {"short": "산과", "full": "산과학", "session": 3},
    "4.1 법규": {"short": "법규", "full": "수의법규", "session": 4},
}

XHTML_NS = {"x": "http://www.w3.org/1999/xhtml"}
CHOICE_MARKS = ("①", "②", "③", "④", "⑤")
CIRCLED_DIGIT_MAP = {"①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5}


def parse_answer_numbers(raw: str) -> tuple[list[int], bool]:
    """정답 셀 텍스트에서 번호 추출.

    Returns:
        (numbers, is_template)
        is_template=True면 vet40이 복원 못 한 플레이스홀더 (①②③④⑤ 통째로)
    """
    numbers: list[int] = []
    for ch in raw:
        if ch in CIRCLED_DIGIT_MAP:
            numbers.append(CIRCLED_DIGIT_MAP[ch])
    if not numbers:
        numbers = [int(n) for n in re.findall(r"\d+", raw)]
    is_template = sorted(set(numbers)) == [1, 2, 3, 4, 5]
    if is_template:
        return [], True
    return numbers, False

PIPELINE_ROOT = Path(__file__).parent
HWP5HTML = PIPELINE_ROOT / ".venv" / "Scripts" / "hwp5html.exe"
OUTPUT_ROOT = PIPELINE_ROOT / "output"
REPO_ROOT = PIPELINE_ROOT.parent


def round_to_year(r: int) -> int:
    return r + 1956


def parse_round_from_filename(filename: str) -> int:
    m = re.search(r"(\d+)\s*회", filename)
    if not m:
        raise ValueError(f"회차를 파일명에서 찾을 수 없음: {filename}")
    return int(m.group(1))


def convert_hwp_to_html(hwp_path: Path, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [str(HWP5HTML), "--output", str(out_dir), str(hwp_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"hwp5html 실패: {hwp_path.name}\n{result.stderr}")
    xhtml = out_dir / "index.xhtml"
    if not xhtml.exists():
        raise RuntimeError(f"index.xhtml 누락: {hwp_path.name}")
    return xhtml


def collapse_text(elem) -> str:
    if elem is None:
        return ""
    parts = [t.replace("\r", "") for t in elem.itertext()]
    text = "".join(parts)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*\n\s*", "\n", text).strip()
    return text


def paragraph_texts(cell) -> list[str]:
    return [collapse_text(p) for p in cell.findall("./x:p", XHTML_NS)]


def split_question_and_choices(cell) -> tuple[str, list[str]]:
    """문제 셀 내부를 문제 본문과 선택지(①~⑤)로 분리."""
    question_lines: list[str] = []
    choices: list[str] = []
    current: str | None = None

    for text in paragraph_texts(cell):
        if not text:
            continue
        if text.startswith(CHOICE_MARKS):
            if current is not None:
                choices.append(current)
            current = text
        elif current is not None:
            current += " " + text
        else:
            question_lines.append(text)

    if current is not None:
        choices.append(current)

    return "\n".join(question_lines).strip(), choices


def collect_image_sources(cell) -> list[str]:
    return [img.get("src") for img in cell.findall(".//x:img", XHTML_NS) if img.get("src")]


def parse_table_as_question(table) -> dict | None:
    """셀 위치 고정 가정 + 유연한 길이 허용.
    최소: 10 cells (문제만), 표준: 14 (문제+해설+댓글), 확장: 16+.
    정답이 복수(출제오류 보정)인 경우도 있어 숫자를 리스트로 추출.
    """
    cells = table.findall("./x:tr/x:td", XHTML_NS)
    if len(cells) < 10:
        return None
    try:
        number = int(collapse_text(cells[2]))
    except ValueError:
        return None

    answer_raw = collapse_text(cells[7])
    answer_numbers, is_template = parse_answer_numbers(answer_raw)

    question_body, choices = split_question_and_choices(cells[9])
    is_unrestored = is_template and not question_body and not choices

    explanation = ""
    explanation_images: list[str] = []
    if len(cells) >= 12:
        explanation = collapse_text(cells[11])
        explanation_images = collect_image_sources(cells[11])

    community_notes = ""
    comment_images: list[str] = []
    if len(cells) >= 14:
        community_notes = collapse_text(cells[13])
        comment_images = collect_image_sources(cells[13])

    question_images = collect_image_sources(cells[9])

    answer_texts = [
        choices[n - 1] for n in answer_numbers if 1 <= n <= len(choices)
    ]

    return {
        "number": number,
        "question": question_body,
        "choices": choices,
        "answer_numbers": answer_numbers,    # 복수정답 가능
        "answer_texts": answer_texts,
        "answer_raw": answer_raw,            # 원본 정답 텍스트 (디버그용)
        "explanation": explanation,
        "has_explanation": bool(explanation),
        "is_unrestored": is_unrestored,      # vet40이 복원 못 한 빈 템플릿 문제
        "community_notes": community_notes or None,
        "has_question_image": bool(question_images),
        "question_images": question_images,
        "explanation_images": explanation_images,
        "comment_images": comment_images,
    }


def copy_and_rename_images(
    q: dict, tmp_dir: Path, images_out: Path, key: str
) -> None:
    """이미지를 output/images/ 로 복사하고 파일명을 의미있게 rename.
    q의 이미지 리스트를 새 파일명으로 교체."""
    remap: dict[str, str] = {}

    def handle(src_list: list[str], tag: str) -> list[str]:
        new_names: list[str] = []
        for idx, src in enumerate(src_list):
            if src not in remap:
                ext = Path(src).suffix
                new_name = f"{key}_q{q['number']:03d}_{tag}{idx + 1}{ext}"
                remap[src] = new_name
                orig = tmp_dir / src
                if orig.exists():
                    shutil.copy2(orig, images_out / new_name)
            new_names.append(remap[src])
        return new_names

    q["question_images"] = handle(q["question_images"], "fig")
    q["explanation_images"] = handle(q["explanation_images"], "exp")
    q["comment_images"] = handle(q["comment_images"], "note")


def extract_one_hwp(hwp_path: Path, meta: dict) -> dict:
    round_num = parse_round_from_filename(hwp_path.name)
    year = round_to_year(round_num)
    key = f"{meta['prefix']}_{meta['short']}_{round_num}회"

    images_out = OUTPUT_ROOT / "images"
    images_out.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        xhtml = convert_hwp_to_html(hwp_path, tmp)
        root = etree.parse(str(xhtml)).getroot()

        questions: list[dict] = []
        for table in root.findall(".//x:table", XHTML_NS):
            q = parse_table_as_question(table)
            if q is None:
                continue
            copy_and_rename_images(q, tmp, images_out, key)
            questions.append(q)

    q_with_img = sum(1 for q in questions if q["has_question_image"])
    q_without_exp = sum(1 for q in questions if not q["has_explanation"])
    q_multi_answer = sum(1 for q in questions if len(q["answer_numbers"]) > 1)
    q_no_answer = sum(1 for q in questions if len(q["answer_numbers"]) == 0 and not q["is_unrestored"])
    q_unrestored = sum(1 for q in questions if q["is_unrestored"])
    return {
        "source_file": hwp_path.name,
        "subject_folder": meta["folder_name"],
        "subject_short": meta["short"],
        "subject_full": meta["full"],
        "session": meta["session"],
        "round": round_num,
        "year": year,
        "question_count": len(questions),
        "question_with_image_count": q_with_img,
        "question_without_explanation_count": q_without_exp,
        "question_multi_answer_count": q_multi_answer,
        "question_no_answer_count": q_no_answer,
        "question_unrestored_count": q_unrestored,
        "questions": questions,
    }


def extract_folder(folder: Path) -> None:
    name = folder.name
    if name not in SUBJECTS:
        raise ValueError(f"알 수 없는 과목 폴더: {name}")

    base = SUBJECTS[name]
    meta = {**base, "folder_name": name, "prefix": name.split(" ", 1)[0]}

    hwp_files = sorted(folder.glob("*.hwp"))
    if not hwp_files:
        print(f"  [skip] HWP 없음: {folder}")
        return

    print(f"== {name} ({len(hwp_files)} files) ==")
    for hwp in hwp_files:
        print(f"  → {hwp.name}", end=" ", flush=True)
        try:
            result = extract_one_hwp(hwp, meta)
        except Exception as e:
            print(f"[FAIL] {e}")
            continue

        key = f"{meta['prefix']}_{meta['short']}_{result['round']}회"
        out_json = OUTPUT_ROOT / f"{key}.json"
        out_json.parent.mkdir(parents=True, exist_ok=True)
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        flags = []
        if result["question_with_image_count"]:
            flags.append(f"img={result['question_with_image_count']}")
        if result["question_unrestored_count"]:
            flags.append(f"unrestored={result['question_unrestored_count']}")
        if result["question_without_explanation_count"]:
            flags.append(f"no_exp={result['question_without_explanation_count']}")
        if result["question_multi_answer_count"]:
            flags.append(f"multi={result['question_multi_answer_count']}")
        if result["question_no_answer_count"]:
            flags.append(f"no_ans={result['question_no_answer_count']}")
        flag_str = f" [{', '.join(flags)}]" if flags else ""
        print(f"[OK] {result['question_count']}문제{flag_str}")


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    arg = sys.argv[1]
    if arg == "--all":
        for folder_name in SUBJECTS:
            folder = REPO_ROOT / "raw-exams" / folder_name
            if folder.exists():
                extract_folder(folder)
    else:
        folder = Path(arg)
        if not folder.is_absolute():
            folder = Path.cwd() / folder
        if not folder.is_dir():
            print(f"폴더가 아님: {folder}")
            sys.exit(1)
        extract_folder(folder)


if __name__ == "__main__":
    main()
