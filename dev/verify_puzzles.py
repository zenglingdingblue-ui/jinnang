#!/usr/bin/env python3
"""验证 content/puzzle.json 里 50 道「烧脑」题的答案。

用法：python3 dev/verify_puzzles.py        （哪个目录下运行都行；有一题不过，退出码为 1）

每道题一个检查函数，用卡片 id 标注：
- 「程序」：答案由程序算出来或穷举出来，再和卡片上写的数字、选项逐一比对。
- 「人工」：横向思维题、侦探题没法用程序证明。函数里的注释是逐条检查过的要点
  （线索是否都在题面里、有没有第二个说得通的答案），程序只核对卡片的结构和关键字。

复核记录（除了这个脚本以外做过的两件事；两位“审校”都是另起的独立 AI 会话，不是真人）：
- 盲做：一个没看过答案的审校只看题面把 50 题做了一遍（能穷举的它也自己穷举了），答案全部与卡片一致。
  它指出的空子、缺的条件、课本原题都已处理：换掉了 3 道小学课本原题（找次品、鸽巢、烙饼），改了 10 来处题面；
  新换上的题又让它盲做了第二轮。注释里的“盲审”指的就是这两轮。
- 校对：另一个审校不看本脚本，把答案、解释、爸爸提示逐张重算、重读了一遍，没有发现算错或选项指错；
  它抓到的问题（标题剧透谜底、解释和题面对不上、提示照做会卡住等）也已改完。注释里的“校对”指这一轮。

改了卡片上的任何数字，都要重新跑一遍这个脚本。它只能保证“卡片上的数和算出来的数一致”，
保证不了题目好不好玩——那得拿去给真的 12 岁孩子试。
"""
import calendar
import datetime
import heapq
import itertools
import json
import math
import random
import sys
from fractions import Fraction as F
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = {c["id"]: c for c in json.loads((ROOT / "content" / "puzzle.json").read_text(encoding="utf-8"))}
CHECKS = []


def check(cid, kind):
    def deco(fn):
        CHECKS.append((cid, kind, fn))
        return fn
    return deco


def text(cid):
    """卡片上孩子和爸爸能看到的全部文字。"""
    c = CARDS[cid]
    parts = [c["title"], c["body"], c.get("hint", ""), c.get("explain", "")]
    parts += [c.get("reveal", {}).get("text", ""), c.get("reveal", {}).get("explain", "")]
    parts += c.get("options", [])
    return "\n".join(parts)


def need(cid, *subs):
    """卡片文字里必须出现这些数字或关键字（保证文字和算式一致）。"""
    t = text(cid)
    for s in subs:
        assert s in t, f"{cid} 的文字里应该出现「{s}」"


def answer_is(cid, option):
    c = CARDS[cid]
    assert c["format"] == "quiz" and c["options"][c["answer"]] == option, f"{cid} 的正确选项应为「{option}」"


def reveal_has(cid, *subs):
    t = CARDS[cid]["reveal"]["text"]
    for s in subs:
        assert s in t, f"{cid} 的答案里应该出现「{s}」"


# ───────────────────────── 逻辑 ─────────────────────────

@check("puz-001", "程序")
def _():
    # 四人过桥：对所有走法做最短路搜索，最少 17 分钟。
    times = (1, 2, 5, 10)
    everyone = frozenset(range(4))
    start = (everyone, 0)                      # （还在起点的人，手电在起点 0 / 对岸 1）
    dist, pq, n, best = {start: 0}, [(0, 0, start)], 0, None
    while pq:
        d, _, (left, side) = heapq.heappop(pq)
        if d > dist[(left, side)]:
            continue
        if not left:
            best = d
            break
        here = left if side == 0 else everyone - left
        for k in (1, 2):
            for grp in itertools.combinations(sorted(here), k):
                cost = max(times[i] for i in grp)
                nl = left - set(grp) if side == 0 else left | set(grp)
                st = (nl, 1 - side)
                if d + cost < dist.get(st, 10 ** 9):
                    dist[st] = d + cost
                    n += 1
                    heapq.heappush(pq, (d + cost, n, st))
    assert best == 17
    # 卡片上的走法逐步核对
    near, far, torch_near, total = {1, 2, 5, 10}, set(), True, 0
    for grp in [(1, 2), (1,), (5, 10), (2,), (1, 2)]:
        src, dst = (near, far) if torch_near else (far, near)
        assert set(grp) <= src and len(grp) <= 2
        src -= set(grp)
        dst |= set(grp)
        total += max(grp)
        torch_near = not torch_near
    assert not near and total == 17 == 2 + 1 + 10 + 2 + 2
    assert 10 + 1 + 5 + 1 + 2 == 19            # “最快的人来回接送”的走法
    assert "隔着桥也照不到" in CARDS["puz-001"]["body"]            # 堵住“站在桥头给他们照着”的空子（盲审提出）
    reveal_has("puz-001", "17 分钟", "2+1+10+2+2=17")
    need("puz-001", "19 分钟")


@check("puz-002", "程序")
def _():
    # 7 环金链：穷举“切开哪几个环”，看剩下的几段能不能凑出 1–7 的每一个数（允许找零 = 任取几段）。
    def pieces(cut):                                                # cut：被切开的环（1–7 号）；切开的环自己算 1 环
        out, run = [1] * len(cut), 0
        for ring in range(1, 8):
            if ring in cut:
                if run:
                    out.append(run)
                run = 0
            else:
                run += 1
        if run:
            out.append(run)
        return sorted(out)

    def can_pay(ps):
        sums = {sum(c) for k in range(len(ps) + 1) for c in itertools.combinations(ps, k)}
        return all(day in sums for day in range(1, 8))

    assert pieces(()) == [7] and not can_pay(pieces(()))             # 不切不行
    good = [cut for cut in itertools.combinations(range(1, 8), 1) if can_pay(pieces(cut))]
    assert good == [(3,), (5,)]                                     # 只切 1 个就够，而且必须是从一头数的第 3 个
    assert pieces((3,)) == [1, 2, 4]
    # 卡片上的付法：每天收工时他手里的那几段
    holds = {1: [1], 2: [2], 3: [1, 2], 4: [4], 5: [1, 4], 6: [2, 4], 7: [1, 2, 4]}
    assert all(sum(v) == day and len(set(v)) == len(v) for day, v in holds.items())
    assert pieces((2, 4, 6)) == [1] * 7                             # “把每个环都拆开”其实切 3 个就够（提示里的 3）
    reveal_has("puz-002", "只切 1 个", "第 3 个环", "1 环、2 环、4 环")
    need("puz-002", "7 个环", "找零", "切开的那个也算 1 环")
    # 盲审提醒：要是不许把给出去的环换回来，就得切 3 个（第 2、4、6 个）。提示里写了孩子可能答 3，以及该怎么问。
    assert "3 或 6" in CARDS["puz-002"]["hint"]
    # 题面注明“两头不相连”：要是首尾相接成一个圈，切 1 个环只能得到 1 环 + 6 环，付不了第 2 天，答案会变成 2。
    assert "两头不相连" in CARDS["puz-002"]["body"]
    assert not can_pay([1, 6]) and can_pay([1, 1, 2, 3])


@check("puz-003", "程序")
def _():
    # 10 盒巧克力：第 k 盒拿 k 块，少几克就是第几盒。
    assert sum(range(1, 11)) == 55
    full = sum(k * 10 for k in range(1, 11))
    assert full == 550
    for bad in range(1, 11):
        got = sum(k * (9 if k == bad else 10) for k in range(1, 11))
        assert full - got == bad
    need("puz-003", "55 块", "550 克")
    assert "读数从头到尾只许看一次" in CARDS["puz-003"]["body"]    # 堵住“一块一块往秤上加、盯着读数跳”的空子（盲审提出）


@check("puz-004", "程序")
def _():
    # 真话 / 假话机器人：问“另一个会指哪条”，四种情况得到的都是死路。
    for good, bad in (("左", "右"), ("右", "左")):
        for asked_truthful in (True, False):
            other_says = bad if asked_truthful else good       # 另一个机器人会怎么指
            reply = other_says if asked_truthful else (good if other_says == bad else bad)
            assert reply == bad                                # 永远指向死路，所以走另一条
    # 解释里提到的另一种问法：“如果我问你‘左边这条通往球馆吗’，你会回答‘是’吗？”——说“是”就走左边
    for left_is_good in (True, False):
        for truthful in (True, False):
            would_say_yes = left_is_good if truthful else not left_is_good     # 直接问它“左边通吗”，它会不会说“是”
            reply_yes = would_say_yes if truthful else not would_say_yes       # 再问“你会回答‘是’吗”
            assert reply_yes == left_is_good
    # 对照：直接问“哪条路通往球馆”，两个机器人的回答相反，分不出来
    assert {("左" if truthful else "右") for truthful in (True, False)} == {"左", "右"}
    reveal_has("puz-004", "另一个机器人", "走另外一条")
    need("puz-004", "它说“是”就走左边")


@check("puz-005", "程序")
def _():
    # 三人一句真话：逐个假设，只有“小东”满足恰好一句真话。
    sols = []
    for culprit in ("小北", "小南", "小东"):
        said = [culprit != "小北", culprit == "小北", culprit != "小东"]
        if sum(said) == 1:
            sols.append(culprit)
    assert sols == ["小东"]
    answer_is("puz-005", "小东")


@check("puz-006", "程序")
def _():
    # 帽子：穷举所有戴法，按“我不知道”一步步筛，剩下的情况里最前面的人全是红帽。
    worlds = [w for w in itertools.product("红蓝", repeat=3) if w.count("蓝") <= 2]   # （后，中，前）

    def knows(w, ws, me, sees):
        return len({x[me] for x in ws if all(x[i] == w[i] for i in sees)}) == 1

    w1 = [w for w in worlds if not knows(w, worlds, 0, (1, 2))]     # 最后面的人说不知道
    w2 = [w for w in w1 if not knows(w, w1, 1, (2,))]               # 中间的人也说不知道
    assert len(worlds) == 7 and len(w1) == 6 and len(w2) == 4
    assert {w[2] for w in w2} == {"红"}
    assert all(knows(w, w2, 2, ()) for w in w2)                     # 最前面的人什么也看不见，照样能确定
    reveal_has("puz-006", "红色")


@check("puz-007", "程序")
def _():
    # 时针分针：两针夹角每小时变化 330°，重合时刻是 12k/11 小时。
    ts = [F(12 * k, 11) for k in range(40) if F(12 * k, 11) < 24]
    assert len(ts) == 22 and ts[0] == 0
    assert all((360 * t - 30 * t) % 360 == 0 for t in ts)
    # 用“每秒扫一遍”再数一次，防止漏算
    wraps = sum(1 for s in range(24 * 3600) if (330 * F(s, 3600)) // 360 != (330 * F(s + 1, 3600)) // 360)
    assert wraps == 22                                              # 这样数的是 (0, 24] 里的 22 次，把 24 点换成 0 点，还是 22
    assert [t for t in ts if 11 <= t < 13] == [F(12)]               # 11 点到 1 点之间只有 12 点整
    answer_is("puz-007", "22 次")
    need("puz-007", "24−2=22")


@check("puz-008", "程序")
def _():
    # 来回跑的小狗：老老实实一趟一趟加，和“200×5”比对。
    you, dad, dog, total, t, toward_dad = F(0), F(600), F(0), F(0), F(0), True
    for _ in range(80):
        dt = ((dad - dog) if toward_dad else (dog - you)) / (200 + 60)
        total += 200 * dt
        t += dt
        you += 60 * dt
        dad -= 60 * dt
        dog = dad if toward_dad else you
        toward_dad = not toward_dad
    assert t < 5 and 1000 - total < F(1, 10 ** 9)
    assert F(600, 60 + 60) == 5 and 200 * 5 == 1000
    reveal_has("puz-008", "1000 米")
    need("puz-008", "120 米", "5 分钟", "200×5=1000")


@check("puz-009", "程序")
def _():
    # 淘汰赛：随机排赛程（含轮空）模拟，场数永远是 队数-1。
    def knockout(n, rng):
        teams, games = list(range(n)), 0
        while len(teams) > 1:
            rng.shuffle(teams)
            nxt = [teams.pop()] if len(teams) % 2 else []          # 轮空
            for i in range(0, len(teams), 2):
                games += 1
                nxt.append(rng.choice(teams[i:i + 2]))
            teams = nxt
        return games

    rng = random.Random(9)
    assert all(knockout(37, rng) == 36 for _ in range(300))
    assert all(knockout(n, rng) == n - 1 for n in range(2, 130))
    reveal_has("puz-009", "36 场")
    need("puz-009", "淘汰 36 支", "63 场")


@check("puz-010", "程序")
def _():
    # 标签全错：只有 2 种可能的装法；从贴“白黄”的盒子摸一个球就能分清。
    # （第一稿用的是篮球和足球，盲审指出手一摸、掂一掂就能分出来，所以换成只有颜色不同的乒乓球。）
    labels = ["白白", "黄黄", "白黄"]
    worlds = [p for p in itertools.permutations(labels) if all(p[i] != labels[i] for i in range(3))]
    assert len(worlds) == 2                                         # p[i] = 贴着 labels[i] 的盒子里实际装的
    for w in worlds:
        assert w[2] in ("白白", "黄黄")                               # 贴“白黄”的盒子里一定是两个同色的
        ball = w[2][0]
        assert [x for x in worlds if ball in x[2]] == [w]           # 摸出这个球后只剩一种可能
    w = next(x for x in worlds if x[2] == "白白")                    # 摸出白球的那种情况
    assert w[1] == "白黄" and w[0] == "黄黄"
    # 对照：从贴“白白”的盒子摸，摸到黄球时两种装法都说得通
    assert len([x for x in worlds if "黄" in x[0]]) == 2
    assert all(lb in CARDS["puz-010"]["body"] for lb in ("“白白”", "“黄黄”", "“白黄”", "全都贴错了"))
    reveal_has("puz-010", "贴着“白黄”的盒子", "贴“黄黄”的盒子装的是“白黄”", "贴“白白”的装的是“黄黄”")


@check("puz-011", "程序")
def _():
    # 蒙眼分硬币：20 枚里 6 枚正面的全部 38760 种摆法都试一遍。
    n, h = 20, 6
    count = 0
    for heads in itertools.combinations(range(n), h):
        hs = set(heads)
        mine = sum(1 for i in range(h) if i not in hs)              # 拿走前 6 枚并全部翻面后，这堆的正面数
        rest = sum(1 for i in range(h, n) if i in hs)
        assert mine == rest
        count += 1
    assert count == math.comb(20, 6) == 38760
    rng = random.Random(11)                                         # “随便数出 6 枚”：随机挑也一样
    for _ in range(3000):
        hs, pile = set(rng.sample(range(n), h)), set(rng.sample(range(n), h))
        assert sum(1 for i in pile if i not in hs) == sum(1 for i in range(n) if i not in pile and i in hs)
    # 对照：数出来的不是 6 枚就不保证成立（比如拿 5 枚）
    assert any(sum(1 for i in range(5) if i not in set(hd)) != sum(1 for i in range(5, n) if i in set(hd))
               for hd in itertools.combinations(range(n), h))
    reveal_has("puz-011", "6 枚", "14 枚")


@check("puz-012", "程序")
def _():
    # 前天 12 岁、明年过 15 岁生日：把“今天”和“生日”的所有组合都试一遍，只有一组成立。
    # （这个位置原来是“摸黑拿袜子”，盲审指出它是小学课本“鸽巢问题”的原题，换掉了。）
    def age(day, born):
        return day.year - born.year - ((day.month, day.day) < (born.month, born.day))

    one_day = datetime.timedelta(days=1)
    sols = set()
    for year in (2025, 2026, 2027, 2028):                           # “今年”取平年、闰年都试
        born = datetime.date(year - 18, 1, 1)
        while born.year <= year - 10:                               # 出生日期放宽到 10–18 年前的每一天
            # 条件二：15 岁生日落在明年（今年年底 14 岁，明年年底 15 岁）
            if age(datetime.date(year, 12, 31), born) == 14 and age(datetime.date(year + 1, 12, 31), born) == 15:
                today = datetime.date(year, 1, 1)
                while today.year == year:
                    if age(today - 2 * one_day, born) == 12:        # 条件一：前天还是 12 岁
                        sols.add((today.month, today.day, born.month, born.day))
                    today += one_day
            born += one_day
    assert sols == {(1, 1, 12, 31)}                                 # 唯一解：今天 1 月 1 日，生日 12 月 31 日
    reveal_has("puz-012", "今天是 1 月 1 日", "生日是 12 月 31 日")
    need("puz-012", "前天我还是 12 岁", "明年我就要过 15 岁生日", "12 月 30 日", "满 13 岁", "满 14 岁")


@check("puz-013", "程序")
def _():
    # 超过第 2 名：把名次排成一列，“超过”= 和前面那个人交换位置。
    # （这个位置原来是“三张饼最快几分钟”，盲审指出它是小学课本“烙饼问题”的原题，换掉了。）
    for field in range(3, 9):
        order = [f"选手{i}" for i in range(1, field + 1)]          # 下标 0 是第 1 名
        order[2] = "你"                                             # 要超过第 2 名，你得紧跟在他后面，也就是第 3
        order[1], order[2] = order[2], order[1]
        assert order.index("你") + 1 == 2 and order[0] == "选手1" and order[2] == "选手2"
    # 追问：超过最后一名——你得先排在最后一名的后面，那最后一名就是你自己，矛盾。
    answer_is("puz-013", "第 2 名")
    need("puz-013", "100 米", "之后名次再没变过", "自己才是最后一名")
    assert "最后一名" not in CARDS["puz-013"]["explain"]             # 追问放在爸爸提示里，不在答案页上提前亮底（校对提出）
    # 题面写的是 100 米直道：换成要跑好几圈的项目，套圈时确实能“超过最后一名”，追问就不成立了。
    assert "1500" not in text("puz-013") and "圈" not in text("puz-013")


# ───────────────────────── 脑洞（横向思维） ─────────────────────────
# 这一类没法用程序证明。下面每个函数的注释是检查记录：
#   线索 = 题面里有没有给出推到答案所需要的东西
#   别解 = 我能想到的其他说法，为什么不如标准答案（“是或不是”玩法里，爸爸对别解答“不是”即可）

def _lateral(cid, *keys, yesno=True):
    c = CARDS[cid]
    assert c["sub"] == "脑洞" and c["format"] == "reveal"
    reveal_has(cid, *keys)
    if yesno:
        assert "是或不是" in c["hint"], f"{cid} 的提示里要告诉爸爸用“是或不是”来玩"


@check("puz-014", "人工")
def _():
    # 线索：“推”着“小车”、“旅馆”、“破产”，三样凑在一起指向强手棋类游戏；题面排除了被骗和事故。
    # 别解：“车坏在旅馆门口没钱修”——解释不了“立刻知道”；“旅馆是他开的、倒闭了”——解释不了为什么推车。
    # 分寸：答案写“‘大富翁’这类棋盘游戏”，是泛指的玩法，不指向某一款商品的关卡或画面。
    # 风险（盲审指出）：没玩过实体版“小车棋子 + 旅馆”的孩子很难想到。所以提示里给爸爸备了一句兜底的话。
    assert "围着一张桌子" in CARDS["puz-014"]["hint"]
    _lateral("puz-014", "棋盘游戏", "旅馆")


@check("puz-015", "人工")
def _():
    # 线索：下楼能到 1 楼（按钮在最下面）；上楼只到 12 楼；“有别人”“下雨”时例外——多出来的是帮手和伞。
    # 别解：“为了锻炼身体”——解释不了雨天和有人时的例外；“12 楼以上电梯坏了”——同样解释不了例外。
    # 分寸：原版主角是矮个子成年人，这里改成够不着按钮的小学生，不拿身材开玩笑。
    # 数字：20 − 12 = 8 层楼梯。
    assert 20 - 12 == 8
    need("puz-015", "爬 8 层")
    _lateral("puz-015", "够得着 12 楼的按钮", "伞")


@check("puz-016", "人工")
def _():
    # 线索：他要的是水却没喝、被吼了反而道谢——说明“吼”解决了他要用水解决的问题。
    # 别解：“老板认错了人”——解释不了他为什么道谢、为什么不要水了。
    # 分寸：原版是掏枪，这里改成大吼一声。解释里注明吓一跳止嗝“因人而异”，不写成医学结论。
    _lateral("puz-016", "打嗝")


@check("puz-017", "人工")
def _():
    # 线索：“墙很薄”（声音从隔壁来）；电话接通就挂，说明目的只是让对方醒一下。
    # 别解（盲审提出）：“一个人住害怕，确认隔壁有人就安心了”。题面加了“墙很薄”之后，呼噜的解释明显更贴；
    #       孩子真这么答，爸爸可以说“也说得通，不过墙很薄这句还没用上”。
    assert "墙很薄" in CARDS["puz-017"]["body"]
    _lateral("puz-017", "呼噜")


@check("puz-018", "人工")
def _():
    # 线索：胡萝卜 + 两颗纽扣 + 围巾挨在一起；季节是春天（雪化之后）。
    # 别解：“有人野餐落下的”——题面说了没有人把它们扔在草地上，而且解释不了为什么恰好是这三样。
    # 措辞：题面写“没有人把它们扔在草地上”（它们当初是被放在雪人身上的），不说“没有人放过”，避免自相矛盾。
    need("puz-018", "春天", "没有人把它们扔在草地上")
    _lateral("puz-018", "雪人", yesno=True)


@check("puz-019", "人工")
def _():
    # 线索：全文没有出现“夜”“晚”“天黑”；路灯坏了、没有月亮、没开车灯在白天都可以成立。
    # 别解：“司机视力特别好”“车有夜视仪”——都不如“是白天”干净；爸爸可以答“不需要这么复杂”。
    body = CARDS["puz-019"]["body"]
    assert not any(w in body for w in ("夜", "晚", "天黑", "漆黑"))
    _lateral("puz-019", "白天", yesno=False)


@check("puz-020", "人工")
def _():
    # 线索：“只有两位理发师”“全镇人的头发都归他俩剪”——所以两人的头发是互相剪的。
    # 前提（写在解释里）：理发师没法给自己理发。孩子要是抬杠“他自己剪的”，提示里给爸爸备了一句“后脑勺怎么办”。
    # 别解：“找整齐的那位，因为他讲究”——正是题目要推翻的直觉。
    need("puz-020", "只有两位理发师", "互相剪", "后脑勺")
    _lateral("puz-020", "乱七八糟", yesno=False)


@check("puz-021", "程序")
def _():
    # 绳梯：陷阱算法是 (3−1)×30÷15 = 4 小时；实际上船随水涨，永远淹不到。
    assert (3 - 1) * 30 / 15 == 4
    answer_is("puz-021", "永远淹不到")
    need("puz-021", "4 小时", "浮在水上")
    # 别解检查：题面说的是“船舷上挂着绳梯”（梯子挂在船上，不是固定在码头上），所以不存在“梯子不动”的读法。
    assert "船舷上挂着绳梯" in CARDS["puz-021"]["body"]


@check("puz-022", "程序")
def _():
    # 2 月 29 日出生的人：72 岁生日当天，一共经历过 18 个 2 月 29 日（出生那天不算）。
    tested = 0
    for born in range(1904, 2029, 4):
        if not (calendar.isleap(born) and calendar.isleap(born + 72)):
            continue                                                # 72 岁生日那天得真有 2 月 29 日
        assert sum(1 for y in range(born + 1, born + 73) if calendar.isleap(y)) == 18
        tested += 1
    assert tested >= 30 and 72 // 4 == 18
    # 注：只有跨过 2100 年（不是闰年）才会少一次，现在活着的人都碰不上。
    # 别解：“他在国际日期变更线上出生”之类都凑不出 18 这个数；72÷4=18 是唯一干净的解释。
    reveal_has("puz-022", "2 月 29 日", "72÷4=18")


# ───────────────────────── 数学魔术 ─────────────────────────
# 每个把戏都验证“对所有允许的输入都成立”，并核对卡片上写明的适用条件。

@check("puz-023", "程序")
def _():
    # (2x+46)÷2 − x = 23，对整数、分数、负数都成立（用精确分数算，不用浮点）。
    xs = [F(n, d) for n in range(-60, 61) for d in (1, 2, 3, 7, 10)] + [F(10 ** 9), F(314159, 1000)]
    assert all((x * 2 + 46) / 2 - x == 23 for x in xs)
    assert 46 // 2 == 23
    reveal_has("puz-023", "23")
    need("puz-023", "加上 46", "它的一半")
    # 事实：乔丹在公牛、奇才穿 23 号；詹姆斯在骑士、湖人穿过 23 号（也穿过 6 号）。卡片写的是“都穿过”。


@check("puz-024", "程序")
def _():
    # 1089：百位和个位至少相差 2 的全部三位数都试一遍。
    diffs, tested = set(), 0
    for n in range(100, 1000):
        a, c = n // 100, n % 10
        if abs(a - c) < 2:
            continue
        rev = int(str(n)[::-1])                                     # 个位是 0 时，倒过来当作 047 这样的数
        d = abs(n - rev)
        assert 100 <= d <= 999
        assert d + int(str(d)[::-1]) == 1089
        diffs.add(d)
        tested += 1
    assert tested == 640                                            # 900 个三位数里有 640 个满足条件
    assert sorted(diffs) == [99 * k for k in range(2, 10)] == [198, 297, 396, 495, 594, 693, 792, 891]
    assert all(str(d)[1] == "9" and int(str(d)[0]) + int(str(d)[2]) == 9 for d in diffs)
    assert 742 - 247 == 495 and 495 + 594 == 1089 and 900 + 180 + 9 == 1089
    # 适用条件为什么是“至少相差 2”：只差 1 时差是 99，不补 0 的话 99+99=198；相同则差是 0。
    assert abs(211 - 112) == 99 and 99 + 99 != 1089
    need("puz-024", "至少相差 2", "742", "247", "495", "594", "198、297、396、495、594、693、792、891", "047")
    reveal_has("puz-024", "1089")
    assert "1089" not in CARDS["puz-024"]["title"] + CARDS["puz-024"]["body"]   # 标题和题面不能把谜底写出来（校对抓到第一稿标题就是 1089）
    need("puz-024", "99a−99c=99×(a−c)")
    assert all((100 * a + 10 * b + c) - (100 * c + 10 * b + a) == 99 * (a - c) for a in range(10) for b in range(10) for c in range(10))


@check("puz-025", "程序")
def _():
    # 日历九宫：所有月份长度 × 1 号落在星期几 × 所有放得下的 3×3 方块。
    blocks = 0
    for days in (28, 29, 30, 31):
        for first_col in range(7):
            grid = {divmod(first_col + d - 1, 7): d for d in range(1, days + 1)}      # (行, 列) -> 日期
            for (r, c), m in grid.items():
                cells = [(r + i, c + j) for i in range(3) for j in range(3)]
                if c > 4 or not all(x in grid for x in cells):
                    continue                                        # 9 个格子里都要有日期
                vals = [grid[x] for x in cells]
                assert min(vals) == m and grid[(r + 1, c + 1)] == m + 8
                assert sum(vals) == (m + 8) * 9
                blocks += 1
    assert blocks > 100
    assert (5 + 8) * 9 == 117
    assert "挤在一格" in CARDS["puz-025"]["hint"]                  # 有的挂历把 23/30 印在同一格，提示里让爸爸避开
    reveal_has("puz-025", "加 8", "乘以 9", "(5+8)×9=117")
    need("puz-025", "9 个格子里都要有日期", "最小数加 8")


@check("puz-026", "程序")
def _():
    # 生日读心：12 个月 × 31 天全部验证，减 165 后正好是 100×月+日。
    for m in range(1, 13):
        for d in range(1, 32):
            said = ((m * 5 + 6) * 4 + 9) * 5 + d
            x = said - 165
            assert x == 100 * m + d and divmod(x, 100) == (m, d)
    assert ((12 * 5 + 6) * 4 + 9) * 5 + 22 == 1387 and 1387 - 165 == 1222
    assert -200 + 35 == -165                                        # 提示里的心算办法
    assert ((1 * 5 + 7) * 4 + 9) * 5 - 100 == 185                   # 提示里的改编：加 6 换成加 7，最后该减 185
    # 实操坑（盲审提出）：计算器连着按不按“=”，会先乘除后加减，比如 12 月 25 日会算成 12×5+6×4+9×5+25。
    assert 12 * 5 + 6 * 4 + 9 * 5 + 25 == 154 != ((12 * 5 + 6) * 4 + 9) * 5 + 25 == 1390
    assert "每算完一步按一下“=”" in CARDS["puz-026"]["body"]
    reveal_has("puz-026", "减去 165", "1387−165=1222", "12 月 22 日")
    need("puz-026", "100m+165", "20m+24", "20m+33", "先减 200，再加 35", "最后就减 185")


@check("puz-027", "程序")
def _():
    # 圈掉的数字：所有“数字不全相同”的四位数 × 所有打乱方式 × 差里每一个非 0 数字。
    def guess(rest):
        r = (-sum(rest)) % 9
        return 9 if r == 0 else r

    tested = 0
    for n in range(1000, 10000):
        s = str(n)
        if len(set(s)) == 1:
            continue
        for p in set(itertools.permutations(s)):
            m = int("".join(p))                                     # 打乱后 0 开头也行，就是个三位数
            if m == n:
                continue
            diff = abs(n - m)
            assert diff > 0 and diff % 9 == 0
            ds = [int(ch) for ch in str(diff)]
            for i, x in enumerate(ds):
                if x:
                    assert guess(ds[:i] + ds[i + 1:]) == x
                    tested += 1
    assert tested > 300000
    assert 3 + 5 + 8 == 16 and guess([3, 5, 8]) == 2
    assert guess([9, 9]) == 9                                       # 为什么不许圈 0：990 里圈掉 0，会被当成 9
    need("puz-027", "不能全一样", "不是 0 的数字", "和是 16", "离 18 差 2", "圈掉的是 9")
    # 边角（两位审校都提到）：差恰好是 9、90、900 时，圈掉 9 以后没数字可念或只剩 0——按规则仍然答 9，提示里写了。
    assert guess([]) == 9 and guess([0]) == 9 and guess([0, 0]) == 9
    assert "只剩 0，那就是 9" in CARDS["puz-027"]["hint"]
    assert all(10 ** k % 9 == 1 for k in range(1, 5))               # 解释里的理由：10、100、1000 除以 9 都余 1


@check("puz-028", "程序")
def _():
    # 十个数的和 = 第 7 个数 × 11。用 (a 的系数, b 的系数) 做符号推导，再用随机数验算。
    seq = [(1, 0), (0, 1)]
    while len(seq) < 10:
        seq.append((seq[-1][0] + seq[-2][0], seq[-1][1] + seq[-2][1]))
    assert seq[2:] == [(1, 1), (1, 2), (2, 3), (3, 5), (5, 8), (8, 13), (13, 21), (21, 34)]
    assert seq[6] == (5, 8)
    assert (sum(a for a, _ in seq), sum(b for _, b in seq)) == (55, 88) == (11 * 5, 11 * 8)
    rng = random.Random(28)
    for _ in range(2000):
        nums = [F(rng.randint(-999, 999), rng.choice((1, 1, 1, 2, 10))) for _ in range(2)]
        while len(nums) < 10:
            nums.append(nums[-1] + nums[-2])
        assert sum(nums) == 11 * nums[6]
    nums = [3, 5]
    while len(nums) < 10:
        nums.append(nums[-1] + nums[-2])
    assert nums[6] == 55 and sum(nums) == 605 and 55 + 550 == 605
    assert "你在旁边看着" in CARDS["puz-028"]["body"]              # 表演的人得看得见第 7 个数
    reveal_has("puz-028", "第 7 个数", "乘以 11", "第 7 个数是 55", "605")
    need("puz-028", "55a+88b", "5a+8b（这是第 7 个）", "55+550")


@check("puz-029", "程序")
def _():
    # 两位数乘 11：10–99 全部验证。
    def trick(n):
        a, b = divmod(n, 10)
        s = a + b
        return a * 100 + s * 10 + b if s <= 9 else (a + 1) * 100 + (s - 10) * 10 + b

    assert all(trick(n) == 11 * n for n in range(10, 100))
    assert trick(43) == 473 and trick(78) == 858 and 430 + 43 == 473 and 7 + 8 == 15
    assert "救场" not in CARDS["puz-029"]["scenes"]                 # 爸爸得先练会，不算零准备（校对提出），所以不标救场
    reveal_has("puz-029", "得 473", "得 858", "7、15、8")
    need("puz-029", "你说 473", "你说 858", "430+43")


@check("puz-030", "程序")
def _():
    # 21 张牌：那张牌一开始在任何位置、另外两列怎么放、收牌时每列顺序是否整体颠倒，全部组合都试。
    def run(start, sides, flips):
        deck = list(range(21))
        chosen, trace = deck[start], []
        for rnd in range(3):
            cols = [deck[i::3] for i in range(3)]                   # 一张一张轮流发成 3 列
            k = next(i for i in range(3) if chosen in cols[i])
            others = [cols[i] for i in range(3) if i != k]
            if sides[rnd]:
                others.reverse()
            packets = [others[0], cols[k], others[1]]               # 他指的那一列夹在中间
            if flips[rnd]:
                packets = [p[::-1] for p in packets]
            deck = [x for p in packets for x in p]
            trace.append(deck.index(chosen) + 1)
        return trace

    n = 0
    for start in range(21):
        for sides in itertools.product((0, 1), repeat=3):
            for flips in itertools.product((0, 1), repeat=3):
                t = run(start, sides, flips)
                assert 8 <= t[0] <= 14 and 10 <= t[1] <= 12 and t[2] == 11
                n += 1
    assert n == 21 * 64
    # 解释里的两句话：第 8–14 张发开后落在各列的第 3–5 张；第 10–12 张发开后各在一列、都是第 4 张
    assert {(p - 1) // 3 + 1 for p in range(8, 15)} == {3, 4, 5}
    assert {(p - 1) // 3 + 1 for p in range(10, 13)} == {4} and len({(p - 1) % 3 for p in range(10, 13)}) == 3
    reveal_has("puz-030", "第 11 张")
    need("puz-030", "21 张", "每列 7 张", "数到第 11 张", "第 8–14 张", "第 3–5 张", "第 10–12 张", "都排在第 4 张")


# ───────────────────────── 估一估（费米估算） ─────────────────────────
# 这里验证的是：卡片上的每一步算术都对得上，结论落在用“宽一点的输入”算出来的范围里。
# 用到的常数和把握程度写在每题的注释里。

@check("puz-031", "程序")
def _():
    # 常数：12 米级城市公交车外廓约 12 × 2.55 × 3 米，车厢内部按 11 × 2.3 × 2 米估（估算值）；
    #       7 号篮球周长约 75–78 厘米，直径约 24–25 厘米，卡片取 24.6 厘米。
    volume = 11 * 2.3 * 2
    assert 49 < volume < 52                                         # “约 50 立方米”
    per_m3 = (100 // 25) ** 3
    assert per_m3 == 64 and 50 * per_m3 == 3200
    ball = 4 / 3 * math.pi * (0.246 / 2) ** 3                       # 一个球的体积，约 0.0078 立方米
    loose = (math.pi / 6) * volume / ball                           # 横平竖直码放，填充率 π/6 ≈ 52%
    tight = 0.64 * volume / ball                                    # 随机塞紧，填充率约 64%
    assert 3000 < loose < 3600 and 3900 < tight < 4300              # “3000 到 4000 都算估得准”
    assert 75 / math.pi < 24.6 < 78 / math.pi
    need("puz-031", "24.6 厘米", "约 50 立方米", "4×4×4=64", "50×64=3200", "3000 到 4000")
    reveal_has("puz-031", "三四千", "几千")


@check("puz-032", "程序")
def _():
    # 常数：成年人静息心率 60–100 次/分（美国心脏协会等机构的通用说法）；卡片取 75。
    assert 75 * 60 == 4500 and 4500 * 24 == 108_000 and 108_000 * 365 == 39_420_000
    low, high = 60 * 60 * 24 * 365, 100 * 60 * 24 * 365
    assert (low, high) == (31_536_000, 52_560_000)                  # “3000 万到 5000 万”
    need("puz-032", "4500 下", "10.8 万下", "3900 万下", "60–100 下", "3000 万到 5000 万")
    reveal_has("puz-032", "4000 万", "几千万")


@check("puz-033", "程序")
def _():
    year = 60 * 60 * 24 * 365
    assert year == 31_536_000                                       # “一年大约 3150 万秒”
    assert abs(10 ** 6 / 86400 - 11.57) < 0.01                      # “100 万秒大约是 11 天半”
    assert abs(10 ** 9 / year - 31.7) < 0.05                        # “约等于 31.7 年”
    answer_is("puz-033", "大约 32 年")
    # 三个干扰项正好是 1 千万秒、1 亿秒、100 亿秒
    assert 3.5 < 10 ** 7 / 86400 / 30.4 < 4.1 and 3.0 < 10 ** 8 / year < 3.3 and 300 < 10 ** 10 / year < 330
    real_year = 365.25 * 86400
    assert 3.7e8 < 12 * real_year and 13.5 * real_year < 4.3e8      # 12–13 岁半：“大约活了 4 亿秒”
    t = 10 ** 9 / real_year
    assert int(t) == 31 and int((t - 31) * 12) == 8                 # 提示里的“31 岁零 8 个月”
    need("puz-033", "3150 万秒", "31.7 年", "4 亿秒", "31 岁零 8 个月")


@check("puz-034", "程序")
def _():
    # 常数：地球赤道周长约 40075 公里；每天步数、步长是估计值（6000 步、0.7 米）。
    day = 6000 * 0.7 / 1000
    assert abs(day - 4.2) < 1e-9                                    # “一天大约 4 公里”
    year = day * 365
    assert 1450 < year < 1600                                       # “一年约 1500 公里”
    life = year * 75
    assert 105_000 < life < 120_000                                 # “约 11 万公里”
    assert 2.6 < life / 40075 < 3.1
    busy = 10000 * 0.75 / 1000 * 365 * 75 / 40075                   # 特别爱走路：一天一万步
    lazy = 3000 * 0.7 / 1000 * 365 * 75 / 40075                     # 整天坐着：一天三千步
    assert 4.5 < busy < 5.5 and 1 < lazy < 2
    answer_is("puz-034", "3 圈左右")
    need("puz-034", "6000 步", "0.7 米", "1500 公里", "11 万公里", "4 万公里")


@check("puz-035", "程序")
def _():
    # 常数：《中国居民膳食指南（2022）》建议成年人每天饮水 1500–1700 毫升；卡片写 1.5–1.7 升，取 1.7 升。
    year_l = 1.7 * 365
    assert 600 < year_l < 640                                       # “一年约 600 升”
    life = year_l * 80 / 1000
    assert 48 < life < 52                                           # “80 年约 50 立方米”
    assert 1.5 * 365 * 80 / 1000 > 43 and 2 * 365 * 80 / 1000 < 59  # 就算放宽到 1.5–2 升，也是 44–58 立方米，仍是“一间屋”
    assert abs(4 * 4 * 2.8 - 44.8) < 1e-9                           # “卧室约 45 立方米”
    assert 150 < 300 / 1.7 < 200                                    # 0.3 立方米的浴缸：约半年
    pool = 50 * 25 * 2
    assert pool == 2500 and 45 < pool / life < 55                   # “够 50 个人喝一辈子”
    tubs = [age * 365 * litre / 300 for age in (12, 13) for litre in (1.2, 1.7)]
    assert 15 < min(tubs) and max(tubs) < 28                        # 提示里的“二十个上下”
    answer_is("puz-035", "一间卧室")
    need("puz-035", "1.5–1.7 升", "600 升", "50 立方米", "45 立方米", "2500 立方米")


@check("puz-036", "程序")
def _():
    # 常数（把握一般，所以卡片只给量级）：大米千粒重约 16–25 克，卡片取 20 克；一碗饭约 80–100 克生米。
    assert 1000 / 20 == 50 and 80 * 50 == 4000 and 100 * 50 == 5000
    lo, hi = 70 * 1000 / 25, 110 * 1000 / 16                        # 小碗长粒米 … 大碗小粒米
    assert 2500 < lo < 3000 and 6000 < hi < 7000                    # 卡片说“3000 到 6000 之间都算估对了”
    need("puz-036", "80–100 克", "20 克左右", "50 粒", "4000–5000 粒", "3000 到 6000")
    reveal_has("puz-036", "四五千粒", "几千")


@check("puz-037", "程序")
def _():
    # 常数：肩并肩每人约占 0.5 米（肩宽约 0.4 米加一点缝，估计值）；标准跑道一圈 400 米。
    assert 1200 * 0.5 == 600 and 600 / 400 == 1.5
    assert round(1200 * 0.42) == 504 and round(1200 * 0.58) == 696  # “挤一点 500 米，松一点 700 米”
    assert abs(1200 * 1.3 - 1560) < 1e-9 and 3.8 < 1560 / 400 < 4   # 提示：手拉手每人约 1.3 米，将近 4 圈
    need("puz-037", "1200×0.5=600", "500 米", "700 米")
    reveal_has("puz-037", "600 米", "一圈半")


# ───────────────────────── 找规律与图形 ─────────────────────────

@check("puz-038", "程序")
def _():
    a = [n * (n + 1) for n in range(1, 7)]
    assert a == [2, 6, 12, 20, 30, 42] and [a[i + 1] - a[i] for i in range(5)] == [4, 6, 8, 10, 12]
    b = [math.factorial(n) for n in range(1, 7)]
    assert b == [1, 2, 6, 24, 120, 720]
    c = [calendar.monthrange(2025, m)[1] for m in range(1, 7)]      # 2025 是平年
    assert c == [31, 28, 31, 30, 31, 30]
    body = CARDS["puz-038"]["body"]
    for seq in (a, b, c):
        assert "，".join(map(str, seq[:5])) + "，?" in body
    reveal_has("puz-038", "① 42", "② 720", "③ 30")
    # 唯一性：①两种看法（差是 4、6、8、10；或 n×(n+1)）给出同一个 42；②只有阶乘说得通；③是月份天数，不是算式。


@check("puz-039", "程序")
def _():
    # 外观数列：每行把上一行“念”出来。
    def say(s):
        return "".join(str(len(list(g))) + k for k, g in itertools.groupby(s))

    rows = ["1"]
    while len(rows) < 7:
        rows.append(say(rows[-1]))
    assert rows == ["1", "11", "21", "1211", "111221", "312211", "13112221"]
    assert CARDS["puz-039"]["body"].split("\n")[1:] == rows[:5] + ["?"]
    reveal_has("puz-039", "312211")
    assert "念" not in CARDS["puz-039"]["title"]                     # 标题不能把钥匙（“念”）写出来（校对提出）
    need("puz-039", "13112221")


@check("puz-040", "程序")
def _():
    words = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"]
    initials = [w[0] for w in words]
    assert initials[:7] == list("OTTFFSS") and initials[7:] == ["E", "N", "T"]
    assert "O，T，T，F，F，S，S，?" in CARDS["puz-040"]["body"]
    reveal_has("puz-040", "E。", "N、T")
    # 唯一性：题面给了“刚学英语时就会背”的提示，把答案锁在数数上。


@check("puz-041", "程序")
def _():
    # 火柴棍谜题（卡片上用牙签摆，不碰火柴）：把“移动 1 根”拆成“拿走 1 根 + 放下 1 根”，穷举所有结果，只留成立的等式。
    # 各符号用的根数：I=1，V=2，X=2，+=2，−=1，＝=2。
    def roman(n):
        out = ""
        for v, s in ((10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
            while n >= v:
                out += s
                n -= v
        return out

    val = {roman(n): n for n in range(1, 40)}                       # 只认规范写法

    def side_value(side, unary):
        if unary and side.startswith("+"):
            side = side[1:]
        if side in val:
            return val[side]
        ops = [i for i, ch in enumerate(side) if ch in "+-"]
        if len(ops) != 1:
            return None
        a, b = side[:ops[0]], side[ops[0] + 1:]
        if a in val and b in val:
            return val[a] + val[b] if side[ops[0]] == "+" else val[a] - val[b]
        return None

    def holds(s, unary=False):
        if s.count("=") != 1:
            return False
        left, right = (side_value(x, unary) for x in s.split("="))
        return left is not None and left == right

    def take_one(s):                                                # 拿走 1 根
        for i, ch in enumerate(s):
            if ch == "I":
                yield s[:i] + s[i + 1:]
            if ch == "+":
                yield s[:i] + "-" + s[i + 1:]                       # 拿走竖的那根
                yield s[:i] + "I" + s[i + 1:]                       # 拿走横的那根
            if ch == "=":
                yield s[:i] + "-" + s[i + 1:]

    def put_one(s):                                                 # 放下 1 根
        for i in range(len(s) + 1):
            yield s[:i] + "I" + s[i:]
        for i, ch in enumerate(s):
            if ch == "-":
                yield s[:i] + "+" + s[i + 1:]
                yield s[:i] + "=" + s[i + 1:]
            if ch == "I":
                yield s[:i] + "+" + s[i + 1:]

    def solve(s, unary=False):
        return {b for a in take_one(s) for b in put_one(a) if b != s and holds(b, unary)}

    puzzle = "X+II=X"
    assert "**X + II = X**" in CARDS["puz-041"]["body"] and not holds(puzzle)
    assert "VI 是 6，IV 是 4" in CARDS["puz-041"]["body"]           # 写法用 V 举例，不直接把 XI、IX 摆在题面上
    assert val["VI"] == 6 and val["IV"] == 4 and val["XI"] == 11 and val["IX"] == 9
    assert solve(puzzle) == {"IX+I=X", "X+I=XI"}                    # 恰好两种移法
    assert not any(holds(a) for a in take_one(puzzle))              # 没有“只拿走一根就成立”的偷懒解
    assert solve(puzzle, unary=True) == solve(puzzle)               # 允许式子以“+”开头，也不会多出解
    # 第一稿用的是 XI + I = X，被这个检查否掉了：拿走加号的竖棍就得到 XI − I = X，孩子会说“我移到旁边了”。
    assert any(holds(a) for a in take_one("XI+I=X"))
    reveal_has("puz-041", "IX + I = X", "9+1=10", "X + I = XI", "10+1=11")
    need("puz-041", "10+2=10", "≠", "V+V=X 要动两根")              # “≠”和 V+V=X 这两种抬杠答案，提示里都交代给爸爸了
    assert "火柴" not in text("puz-041")


@check("puz-042", "程序")
def _():
    # 硬币三角形：三角点阵用整数坐标（x 放大 2 倍）。倒三角平移到任何位置，最多和原三角重叠 7 枚。
    up = {(2 * k - r, r) for r in range(4) for k in range(r + 1)}
    assert len(up) == 10 and [sum(1 for p in up if p[1] == r) for r in range(4)] == [1, 2, 3, 4]

    def down(x0, y0):
        return {(x0 + 2 * k + j, y0 + j) for j in range(4) for k in range(4 - j)}

    best = max(len(up & down(x0, y0)) for x0 in range(-14, 15) for y0 in range(-8, 9))
    assert best == 7                                                # 只要有 1 枚重叠，平移量就在点阵上，所以这样搜是完整的
    assert 10 - best == 3                                           # 至少要移 3 枚
    # 卡片上的移法：顶上 1 枚移到最底下一排的正下方；底排两头的 2 枚移到第 2 排的两边
    after = (up - {(0, 0), (-3, 3), (3, 3)}) | {(0, 4), (-3, 1), (3, 1)}
    assert after == down(-3, 1)
    assert [sum(1 for p in after if p[1] == y) for y in range(1, 5)] == [4, 3, 2, 1]
    stay = up & after
    assert [sum(1 for p in stay if p[1] == r) for r in range(4)] == [0, 2, 3, 2]   # 不动的 7 枚：第 2 排 2、第 3 排 3、第 4 排中间 2
    need("puz-042", "1、2、3、4", "4、3、2、1", "重叠 7 枚")


@check("puz-043", "程序")
def _():
    def squares(n):                                                 # 沿格线的正方形：边长 s，左上角有 (n-s+1)² 个位置
        return sum(1 for s in range(1, n + 1) for _ in itertools.product(range(n - s + 1), repeat=2))

    assert squares(4) == 30 and [(4 - s + 1) ** 2 for s in range(1, 5)] == [16, 9, 4, 1]
    assert squares(8) == 204 == sum(k * k for k in range(1, 9))
    answer_is("puz-043", "30 个")
    need("puz-043", "16+9+4+1=30", "204")


@check("puz-044", "程序")
def _():
    # 切披萨。两种办法互相印证：
    # (1) 找一组具体的 4 刀，在圆里撒密密的格点，按“在每一刀的哪一侧”分类，数出有几块；
    # (2) 公式：没有三刀交于一点时，块数 = 1 + 刀数 + 圆内交点数。4 刀最多 6 个交点，所以上限是 11。
    cuts = [(0, 0.10), (45, -0.15), (90, 0.20), (135, -0.10)]       # （法线方向的角度，离圆心的距离）

    def pieces(cs):
        lines = [(math.cos(math.radians(a)), math.sin(math.radians(a)), d) for a, d in cs]
        return len({tuple(x * cx + y * sy > d for cx, sy, d in lines) for x, y in pts})

    n = 300
    pts = [(-1 + 2 * (i + 0.5) / n, -1 + 2 * (j + 0.5) / n) for i in range(n) for j in range(n)]
    pts = [p for p in pts if p[0] ** 2 + p[1] ** 2 < 1]
    counts = [pieces(cuts[:k]) for k in range(1, 5)]
    assert counts == [2, 4, 7, 11]                                  # 1、2、3、4 刀：2、4、7、11 块

    def crossings(cs):
        k = 0
        for c1, c2 in itertools.combinations(cs, 2):
            a1, a2 = math.radians(c1[0]), math.radians(c2[0])
            det = math.cos(a1) * math.sin(a2) - math.sin(a1) * math.cos(a2)
            if abs(det) < 1e-12:
                continue
            x = (c1[1] * math.sin(a2) - c2[1] * math.sin(a1)) / det
            y = (c2[1] * math.cos(a1) - c1[1] * math.cos(a2)) / det
            k += x * x + y * y < 1
        return k

    assert crossings(cuts) == 6 == math.comb(4, 2) and 1 + 4 + 6 == 11
    assert [1 + k + math.comb(k, 2) for k in range(1, 5)] == [2, 4, 7, 11]
    assert pieces([(0, 0), (45, 0), (90, 0), (135, 0)]) == 8        # 四刀都过圆心（切成“米”字）：只有 8 块
    reveal_has("puz-044", "11 块")
    need("puz-044", "1 刀 2 块，2 刀 4 块，3 刀 7 块，4 刀 11 块")


# ───────────────────────── 破案 ─────────────────────────
# 检查要点：线索是不是都在题面里；答案是否只靠常识；有没有第二个说得通的答案。

@check("puz-045", "人工")
def _():
    # 线索：那人自己说“以为这是我的房间”，可他是“敲门”——两件事放在一起就是破绽。全在题面里。
    # 别解（盲审提出）：忘带房卡、屋里有同伴的人也会敲门，所以这不是铁证。
    #       处理：题面里房客只说“请留意一下这个人”，问的是“为什么起了疑心”；解释里把这两种可能也写了出来。
    need("puz-045", "敲门", "以为这是我的房间", "请留意一下这个人", "忘了带卡", "没有一口咬定")
    reveal_has("puz-045", "谁会先敲门")


@check("puz-046", "人工")
def _():
    # 线索：“整栋楼停电”和“连着家里的 Wi-Fi 看直播”矛盾：平板有电池，但路由器要插电。
    #       第一稿写的是“用客厅的电视看直播”，盲审认为对初一太直白，改成要多想一步的 Wi-Fi。
    # 抬杠点：“他用的是流量”——他自己说的是“家里的 Wi-Fi”；“路由器接了备用电源”——那得他自己拿出来解释。
    # 另两人：打手电找蜡烛、7 点半就睡，都和停电不冲突，挑不出毛病。
    # 结论只说“谁的话有漏洞”，不断言蛋糕是谁吃的。
    body = CARDS["puz-046"]["body"]
    assert "整栋楼停电" in body and "连着家里的 Wi-Fi" in body and "一直" in body
    assert "8 点到 10 点" in body and "7 点半" in body
    answer_is("puz-046", "哥哥")
    need("puz-046", "路由器要插电", "平板有电池")


@check("puz-047", "人工")
def _():
    # 线索：页码 57 和 58 在题面里。常识：书从第 1 页起，单数页在一张纸的正面，下一个双数页在它背面。
    def leaf(page):                                                 # 这一页印在第几张纸上
        return (page + 1) // 2

    assert leaf(57) == leaf(58) == 29 and leaf(59) == 30
    assert all(leaf(2 * k - 1) == leaf(2 * k) != leaf(2 * k + 1) for k in range(1, 200))
    # 例外：极少数书的页码排法不同。提示里已经写了“他要是找到这样一本书，就算他赢”，爸爸不会下不来台。
    reveal_has("puz-047", "同一张纸的正反两面")
    need("puz-047", "58 页和 59 页之间", "算他赢")


@check("puz-048", "程序")
def _():
    # 镜子里的钟：镜像把角度 a 变成 360−a（12 点方向为 0，顺时针）。
    def hands(h, m):
        return ((h % 12) * 30 + m * 0.5) % 360, (m * 6) % 360

    def mirror(angles):
        return tuple((360 - a) % 360 for a in angles)

    assert mirror(hands(9, 0)) == hands(3, 0)
    sols = [(h, m) for h in range(12) for m in range(60) if mirror(hands(h, m)) == hands(3, 0)]
    assert sols == [(9, 0)]                                         # 镜中像 3 点整的，只有真实的 9 点整
    body = CARDS["puz-048"]["body"]
    assert "没有数字的挂钟" in body                                   # 有数字的钟一眼就能看出是反的
    assert "自拍" not in body                                       # 手机前置镜头会把画面再翻一次，所以写“朋友给他拍的”
    reveal_has("puz-048", "9 点整")
    # 上午 9 点还是晚上 9 点分不出来，卡片只说“9 点整”。


@check("puz-049", "人工")
def _():
    # 线索：摊主那句话里的“公元前”三个字。推理：当时的人不知道后来会有“公元”这种算法。
    # 事实核对：公元纪年是公元 6 世纪才提出的（狄奥尼修斯），卡片只写“很多年以后”，不写具体年份，稳妥。
    # 卡片没有说当时用“年号”（年号始于汉武帝，晚于公元前 221 年），只说“用当时的纪年”。
    assert "年号" not in text("puz-049")
    need("puz-049", "公元前 221 年")
    reveal_has("puz-049", "公元前")


@check("puz-050", "人工")
def _():
    # 线索：“一见生人就狂叫”“那晚谁也没听见狗叫”；三个人里两个是生人（新来的、第一次来），一个是熟人（每天喂它）。
    # 结论用的是“最可疑”，不是“一定是他”。
    body = CARDS["puz-050"]["body"]
    assert all(k in body for k in ("一见生人就狂叫", "新来的", "第一次来", "每天喂大黄"))
    answer_is("puz-050", "每天喂大黄的管理员")
    # 出处：柯南·道尔《银色马》（1892 年发表，已进入公有领域）。卡片转述情节，没有引用原文。


# ───────────────────────── 总检查 ─────────────────────────

def main():
    ids = [f"puz-{i:03d}" for i in range(1, 51)]
    assert list(CARDS) == ids, "卡片应当正好是 puz-001 … puz-050，按顺序排列"
    checked = [cid for cid, _, _ in CHECKS]
    assert checked == ids, "每张卡片都要有且只有一个检查函数"
    subs = {}
    failed = 0
    for cid, kind, fn in CHECKS:
        c = CARDS[cid]
        subs[c["sub"]] = subs.get(c["sub"], 0) + 1
        try:
            fn()
            print(f"{cid}  通过（{kind}）  {c['sub']}｜{c['title']}")
        except AssertionError as e:
            failed += 1
            print(f"{cid}  没通过（{kind}）  {c['sub']}｜{c['title']}  ← {e or '断言不成立'}")
    by_kind = {k: sum(1 for _, kk, _ in CHECKS if kk == k) for k in ("程序", "人工")}
    print("分类：" + "，".join(f"{k} {v}" for k, v in subs.items()))
    print(f"{len(CHECKS) - failed}/{len(CHECKS)} 通过（程序验证 {by_kind['程序']} 题，人工核对 {by_kind['人工']} 题）")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
