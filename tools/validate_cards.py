#!/usr/bin/env python3
"""校验卡片内容文件。用法：
    python3 tools/validate_cards.py content/talk.json            # 校验一个文件
    python3 tools/validate_cards.py content/*.json               # 一起校验（还会查 id 是否重复）
有错误时退出码为 1。警告不影响退出码，但请尽量处理。
规则以 docs/SPEC.md 第 4、5 节为准。
"""
import json
import re
import sys
from pathlib import Path

TYPES = ["talk", "play", "puzzle", "show", "do", "trio", "insight"]
FORMATS = ["plain", "reveal", "quiz", "either", "steps", "widget"]
AUDIENCES = ["all", "dad"]
FOR = ["kid", "three", "wife", "self"]
SCENES = ["救场", "车上", "饭桌", "球场", "睡前", "周末", "出游", "出差"]
REF_LEVELS = ["实证", "指南", "官方", "权威媒体", "专家意见", "个案", "常识", "经典"]
ART = [
    "ball", "hoop", "sneaker", "whistle", "scoreboard", "trophy", "jersey",
    "car", "table", "bed", "sofa", "door", "window",
    "chat", "question", "bulb", "brain", "magnifier", "key", "pouch", "compass", "map", "flag",
    "dice", "cards", "chess", "puzzle", "gamepad", "target", "hourglass", "stopwatch",
    "book", "pencil", "abc", "globe", "rocket", "planet", "star", "moon", "sun", "atom", "magnet", "flask", "telescope",
    "pan", "pizza", "cup", "film", "music", "camera", "earbuds-off", "phone-down",
    "tent", "mountain", "bike", "skate", "snow", "tree", "paper-plane", "kite",
    "heart", "highfive", "family", "calendar", "clock", "suitcase", "briefcase", "battery", "seedling", "lighthouse",
]
ID_RE = re.compile(r"^(talk|play|puz|show|do|trio|ins)-\d{3}$")
ID_PREFIX = {"talk": "talk", "play": "play", "puzzle": "puz", "show": "show", "do": "do", "trio": "trio", "insight": "ins"}

# 公开仓库：不能出现能定位到具体家庭、学校的信息。
# 具体的词不写在代码里（否则等于把它们公开了），放在本机的 tools/private_words.txt 里，一行一个；这个文件不进仓库。
_pw = Path(__file__).resolve().parent / "private_words.txt"
FORBIDDEN = [w.strip() for w in _pw.read_text(encoding="utf-8").splitlines() if w.strip() and not w.startswith("#")] if _pw.exists() else []
# 对孩子说的话里不该有的说教腔（只是警告）
PREACHY = ["你应该", "你要懂得", "这告诉我们", "这个道理", "要学会", "一定要记住", "从中我们", "寓教于乐", "教育意义"]

LIMITS = {"title": 20, "body": 110, "hint": 100, "more": 520, "sub": 8, "cta": 8}


def clen(s):
    """按显示宽度粗略计数：中日韩字符算 1，其余每两个算 1。"""
    n = 0.0
    for ch in s:
        n += 1 if ord(ch) > 0x2E7F else 0.5
    return int(n + 0.5)


def check_card(c, errs, warns, where):
    def err(msg):
        errs.append(f"{where}: {msg}")

    def warn(msg):
        warns.append(f"{where}: {msg}")

    if not isinstance(c, dict):
        err("不是对象")
        return
    for k in ["id", "type", "format", "audience", "for", "scenes", "mins", "title", "body"]:
        if k not in c:
            err(f"缺少字段 {k}")
    if errs and any(e.startswith(where + ": 缺少字段") for e in errs):
        return
    cid = c["id"]
    if not ID_RE.match(str(cid)):
        err(f"id 格式不对：{cid}（应为 前缀-三位数字，如 talk-001）")
    if c["type"] not in TYPES:
        err(f"type 不合法：{c['type']}")
    elif not str(cid).startswith(ID_PREFIX[c["type"]] + "-"):
        err(f"id 前缀与 type 不符：{cid} / {c['type']}")
    if c["format"] not in FORMATS:
        err(f"format 不合法：{c['format']}")
    if c["audience"] not in AUDIENCES:
        err(f"audience 不合法：{c['audience']}")
    if c["for"] not in FOR:
        err(f"for 不合法：{c['for']}")
    if not isinstance(c["scenes"], list) or any(s not in SCENES for s in c["scenes"]):
        err(f"scenes 不合法：{c['scenes']}（只能从 {SCENES} 里选）")
    elif not c["scenes"] and c["audience"] == "all":
        err("给孩子或全家看的卡片至少要有一个场景")
    if not isinstance(c["mins"], int) or not (1 <= c["mins"] <= 240):
        err(f"mins 应为 1–240 的整数：{c['mins']}")
    if "救场" in (c.get("scenes") or []) and isinstance(c["mins"], int) and c["mins"] > 5:
        warn("标了「救场」的卡片应当 5 分钟以内、零准备")

    for k, lim in LIMITS.items():
        v = c.get(k)
        if v is None:
            continue
        if not isinstance(v, str) or not v.strip():
            err(f"{k} 应为非空字符串")
        elif clen(v) > lim:
            err(f"{k} 太长：{clen(v)} 字（上限 {lim}）")

    # 类型与受众的约束
    if c["type"] == "insight" and c["audience"] != "dad":
        err("insight（锦囊）必须 audience=dad")
    if c["for"] in ("wife", "self") and c["audience"] != "dad":
        err("for=wife/self 的卡片必须 audience=dad（一起看模式下隐藏）")
    if c["type"] == "trio" and c["for"] != "three":
        err("trio（三人局）必须 for=three")

    # 各 format 的必填字段
    f = c["format"]
    if f == "reveal":
        r = c.get("reveal")
        if not isinstance(r, dict) or not r.get("text"):
            err("format=reveal 需要 reveal.text")
        else:
            if clen(r["text"]) > 170:
                err(f"reveal.text 太长：{clen(r['text'])}（上限 170）")
            if r.get("explain") and clen(r["explain"]) > 240:
                err(f"reveal.explain 太长：{clen(r['explain'])}（上限 240）")
            if r.get("label") and clen(r["label"]) > 8:
                err("reveal.label 太长（上限 8）")
    if f == "quiz":
        o = c.get("options")
        if not isinstance(o, list) or not (2 <= len(o) <= 4):
            err("format=quiz 需要 2–4 个 options")
        else:
            for x in o:
                if not isinstance(x, str) or clen(x) > 26:
                    err(f"选项太长或不是字符串：{x}")
            a = c.get("answer")
            if not isinstance(a, int) or not (0 <= a < len(o)):
                err("format=quiz 需要 answer（从 0 开始的选项序号）")
        if not c.get("explain"):
            err("format=quiz 需要 explain（为什么是这个答案）")
        elif clen(c["explain"]) > 240:
            err(f"explain 太长：{clen(c['explain'])}（上限 240）")
    if f == "either":
        e = c.get("either")
        if not isinstance(e, dict) or not e.get("a") or not e.get("b"):
            err("format=either 需要 either.a 和 either.b")
        else:
            for k in ("a", "b"):
                if clen(e[k]) > 24:
                    err(f"either.{k} 太长：{clen(e[k])}（上限 24）")
            if e.get("ask") and clen(e["ask"]) > 40:
                err("either.ask 太长（上限 40）")
    if f == "steps":
        s = c.get("steps")
        if not isinstance(s, list) or not (2 <= len(s) <= 8):
            err("format=steps 需要 2–8 个 steps")
        else:
            for x in s:
                if not isinstance(x, str) or clen(x) > 64:
                    err(f"步骤太长（上限 64）：{x}")
        n = c.get("need")
        if n is not None and (not isinstance(n, list) or any(not isinstance(x, str) or clen(x) > 16 for x in n)):
            err("need 应为字符串数组，每项不超过 16 字")
    if f == "widget":
        if not isinstance(c.get("widget"), str) or not re.match(r"^[a-z0-9]+$", c.get("widget", "")):
            err("format=widget 需要 widget（组件 id，小写字母数字）")
        if "params" in c and not isinstance(c["params"], dict):
            err("params 应为对象")

    # 引用
    refs = c.get("refs")
    if refs is not None:
        if not isinstance(refs, list):
            err("refs 应为数组")
        else:
            for r in refs:
                if not isinstance(r, dict) or not r.get("t"):
                    err("refs 的每一项需要 t（来源名称）")
                    continue
                if clen(r["t"]) > 60:
                    err(f"refs.t 太长：{r['t']}")
                if r.get("u") and not re.match(r"^https?://\S+$", r["u"]):
                    err(f"refs.u 不是合法网址：{r['u']}")
                if r.get("lv") and r["lv"] not in REF_LEVELS:
                    err(f"refs.lv 不合法：{r['lv']}（可选 {REF_LEVELS}）")
    if c["type"] == "insight" and not refs:
        err("insight（锦囊）至少要有一条 refs")
    if c["type"] == "show" and f != "widget" and not refs:
        warn("给他看的知识类卡片最好附一条可查证的 refs")

    if "art" in c and c["art"] not in ART:
        err(f"art 不在插画清单里：{c['art']}")
    if "art" not in c and f != "widget":
        warn("没有选插画 art")

    blob = json.dumps(c, ensure_ascii=False)
    for w in FORBIDDEN:
        if w in blob:
            err(f"出现了不能公开的词：{w}")
    if c["audience"] == "all":
        kid_text = " ".join(str(c.get(k, "")) for k in ("title", "body", "more")) + json.dumps(c.get("reveal", ""), ensure_ascii=False) + str(c.get("explain", ""))
        for w in PREACHY:
            if w in kid_text:
                warn(f"给孩子看的文字里有说教腔：「{w}」")
    extra = set(c.keys()) - {
        "id", "type", "sub", "format", "audience", "for", "scenes", "mins", "title", "body", "more", "reveal",
        "options", "answer", "explain", "either", "steps", "need", "widget", "params", "cta", "hint", "refs", "art", "tags",
    }
    if extra:
        err(f"有未定义的字段：{sorted(extra)}")


def validate_files(paths):
    errs, warns, cards = [], [], []
    seen = {}
    for p in paths:
        p = Path(p)
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            errs.append(f"{p.name}: JSON 解析失败：{e}")
            continue
        if not isinstance(data, list):
            errs.append(f"{p.name}: 顶层应为数组")
            continue
        for i, c in enumerate(data):
            cid = c.get("id", f"#{i}") if isinstance(c, dict) else f"#{i}"
            where = f"{p.name} {cid}"
            check_card(c, errs, warns, where)
            if isinstance(c, dict) and "id" in c:
                if c["id"] in seen:
                    errs.append(f"{where}: id 与 {seen[c['id']]} 重复")
                seen[c["id"]] = p.name
                cards.append(c)
        titles = {}
        for c in data:
            if isinstance(c, dict) and c.get("title"):
                if c["title"] in titles:
                    warns.append(f"{p.name}: 标题重复「{c['title']}」（{titles[c['title']]} 和 {c.get('id')}）")
                titles[c["title"]] = c.get("id")
    return errs, warns, cards


def main():
    paths = [a for a in sys.argv[1:] if not a.startswith("-")]
    if not paths:
        print(__doc__)
        sys.exit(2)
    errs, warns, cards = validate_files(paths)
    by_type = {}
    for c in cards:
        by_type[c["type"]] = by_type.get(c["type"], 0) + 1
    print(f"共 {len(cards)} 张卡片：" + "，".join(f"{k} {v}" for k, v in sorted(by_type.items())))
    for w in warns:
        print("警告  " + w)
    for e in errs:
        print("错误  " + e)
    print(f"{len(errs)} 个错误，{len(warns)} 个警告")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
