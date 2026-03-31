#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

from sgfmill import sgf
from sgfmill import sgf_moves


LETTERS = "ABCDEFGHJKLMNOPQRST"


def sgf_to_gtp(move, size):
    if move is None:
        return "pass"
    row, col = move
    return f"{LETTERS[col]}{size - row}"


def load_game(path):
    data = Path(path).read_bytes()
    game = sgf.Sgf_game.from_bytes(data)
    board, plays = sgf_moves.get_setup_and_moves(game)
    size = game.get_size()
    root = game.get_root()

    def prop(name, default=""):
        try:
            value = root.get(name)
        except KeyError:
            return default
        return value if value not in (None, "") else default

    info = {
        "size": size,
        "komi": game.get_komi() or 7.5,
        "black": prop("PB", ""),
        "white": prop("PW", ""),
        "result": prop("RE", ""),
        "event": prop("EV", ""),
        "date": prop("DT", ""),
    }
    moves = []
    for color, move in plays:
      moves.append((color.upper(), sgf_to_gtp(move, size)))
    return info, moves


def detect_student_color(info, player_name):
    target = (player_name or "").strip().lower()
    if not target:
        return "B"
    if target in (info["black"] or "").lower():
        return "B"
    if target in (info["white"] or "").lower():
        return "W"
    return "B"


class KataGoAnalyzer:
    def __init__(self, katago_bin, config_path, model_path, size):
        cmd = [
            katago_bin,
            "analysis",
            "-config",
            config_path,
            "-model",
            model_path,
        ]
        self.proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self.size = size

    def query(self, moves, komi, max_visits, idx):
        payload = {
            "id": f"query-{idx}",
            "moves": moves,
            "initialStones": [],
            "rules": "Chinese",
            "komi": komi,
            "boardXSize": self.size,
            "boardYSize": self.size,
            "maxVisits": max_visits,
        }
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            stderr = self.proc.stderr.read()
            raise RuntimeError(f"KataGo did not respond. {stderr}")
        return json.loads(line)

    def close(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()


def summarize_issue(issue, student_name):
    move_no = issue["move_number"]
    return (
        f"第 {move_no} 手，{student_name} 下了 {issue['played_move']}，"
        f"KataGo 更推荐 {issue['best_move']}。这手大约掉了 {issue['loss']:.1f}% 胜率，"
        f"推荐变化是 {' '.join(issue['pv'][:8])}。"
    )


def build_markdown(info, student_name, student_color, issues, language, llm_text):
    if language == "en-US":
        lines = [
            f"# KataSensei Review: {info['black']} vs {info['white']}",
            "",
            f"- Student: {student_name or 'auto'} ({student_color})",
            f"- Result: {info['result'] or 'Unknown'}",
            f"- Date: {info['date'] or 'Unknown'}",
            "",
            "## Biggest mistakes",
        ]
        for issue in issues[:5]:
            lines.append(
                f"- Move {issue['move_number']}: played {issue['played_move']}, KataGo preferred {issue['best_move']}, estimated loss {issue['loss']:.1f}%."
            )
        lines.extend(["", "## Coach notes", llm_text or "No LLM notes."])
        return "\n".join(lines)

    lines = [
        f"# KataSensei 复盘报告：{info['black']} vs {info['white']}",
        "",
        f"- 学生：{student_name or '自动识别'}（执{ '黑' if student_color == 'B' else '白' }）",
        f"- 结果：{info['result'] or '未知'}",
        f"- 日期：{info['date'] or '未知'}",
        "",
        "## 关键错手",
    ]
    if issues:
        for issue in issues[:5]:
            lines.append(f"- {summarize_issue(issue, student_name or '学生')}")
    else:
        lines.append("- 这一盘没有抓到达到阈值的大失误，可以把阈值再调低继续细看。")
    lines.extend(
        [
            "",
            "## 改进方向",
            "- 先看最大掉点的 3 手，不要一口气看完整盘。",
            "- 把推荐变化在棋盘上自己摆一遍，确认每一手到底在抢什么。",
            "- 如果同类问题反复出现，就单独做一个训练主题，比如方向感、厚薄判断、官子先后手。",
            "",
            "## 教练讲解",
            llm_text or "未启用 LLM，当前报告仅基于 KataGo 数值与变化生成。",
        ]
    )
    return "\n".join(lines)


def call_llm(base_url, api_key, model, payload):
    body = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "你是顶级围棋教练。请严格依据提供的 KataGo 数据，用通俗中文解释学生为什么错、正确思路是什么、怎么训练。",
            },
            {
                "role": "user",
                "content": json.dumps(payload, ensure_ascii=False),
            },
        ],
        "temperature": 0.4,
        "max_completion_tokens": 700,
    }
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=150) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sgf", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--katago-bin", required=True)
    parser.add_argument("--katago-config", required=True)
    parser.add_argument("--katago-model", required=True)
    parser.add_argument("--player-name", default="")
    parser.add_argument("--max-visits", type=int, default=600)
    parser.add_argument("--min-winrate-drop", type=float, default=7.0)
    parser.add_argument("--language", default="zh-CN")
    parser.add_argument("--llm-base-url", default="")
    parser.add_argument("--llm-api-key", default="")
    parser.add_argument("--llm-model", default="")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    info, moves = load_game(args.sgf)
    student_color = detect_student_color(info, args.player_name)
    analyzer = KataGoAnalyzer(args.katago_bin, args.katago_config, args.katago_model, info["size"])
    issues = []

    try:
        for index, (color, played_move) in enumerate(moves):
            if color != student_color:
                continue
            history = moves[:index]
            response = analyzer.query(history, info["komi"], args.max_visits, index)
            move_infos = response.get("moveInfos", [])
            if not move_infos:
                continue
            best = move_infos[0]
            best_wr = float(best.get("winrate", 0.5)) * 100.0
            played_response = analyzer.query(moves[: index + 1], info["komi"], args.max_visits, f"played-{index}")
            played_root = played_response.get("rootInfo", {})
            played_wr = float(played_root.get("winrate", 0.5)) * 100.0
            loss = max(0.0, best_wr - played_wr)
            if loss < args.min_winrate_drop:
                continue
            issues.append(
                {
                    "move_number": index + 1,
                    "played_move": played_move,
                    "best_move": best.get("move", ""),
                    "loss": loss,
                    "best_winrate": best_wr,
                    "played_winrate": played_wr,
                    "score_lead": best.get("scoreLead", 0.0),
                    "pv": best.get("pv", []),
                }
            )
    finally:
        analyzer.close()

    issues.sort(key=lambda item: item["loss"], reverse=True)
    summary = {
        "student_color": student_color,
        "student_name": args.player_name,
        "mistake_count": len(issues),
        "top_loss": issues[0]["loss"] if issues else 0.0,
        "issues": issues[:10],
    }

    llm_text = ""
    if args.llm_api_key and args.llm_model and args.llm_base_url:
        try:
            llm_payload = {
                "student_color": summary["student_color"],
                "student_name": summary["student_name"],
                "mistake_count": summary["mistake_count"],
                "top_loss": summary["top_loss"],
                "issues": summary["issues"][:5],
            }
            llm_text = call_llm(args.llm_base_url, args.llm_api_key, args.llm_model, llm_payload)
        except Exception as exc:
            llm_text = f"LLM 讲解生成失败：{exc}"

    markdown = build_markdown(info, args.player_name, student_color, issues, args.language, llm_text)
    markdown_path = out_dir / "review.md"
    json_path = out_dir / "review.json"
    markdown_path.write_text(markdown, encoding="utf-8")
    json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    result = {
        "markdown_path": str(markdown_path),
        "json_path": str(json_path),
        "summary": summary,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
