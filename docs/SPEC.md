# 锦囊 · 产品与协作规格

> 所有参与的人先读完这一份。它是唯一的接口约定：文件归谁、卡片长什么样、组件怎么接、文字怎么写、画怎么画。
> 有冲突时以本文件为准；觉得本文件不对，在交付说明里写出来，不要自己改接口。

## 0. 这是什么

「锦囊」是一个装在手机主屏幕上、断网也能用的小应用。里面有 365 张卡片，像刷短视频一样上下滑。
每一张都是一个能马上用的小主意：一句打开话头的问题、一个两个人在一部手机上就能玩的对决、一道一起解的题、
一个让人“哇”一声的小东西、一件放下手机去做的事，或者一条只给爸爸看的提示。

**为谁做**：一个三口之家。爸爸妈妈都忙；孩子是 12–13 岁、刚上初中的男孩，喜欢篮球，英语不错，爱搞怪，
开始不爱听大人讲道理。爸爸最怕两件事：冷场时不知道说什么；一开口孩子就觉得“又在说教、又有目的”。

**它要解决的事**：
- 冷场的时候，三秒钟内给爸爸一句能说出口的话，或者一件能马上一起做的事。
- 把手机屏幕从“各刷各的短视频”变成“两三个人围着一起解决的问题、一起看的东西”。
- 给爸爸一些有出处的提示，也有可以直接递给妈妈看的页面，还有给爸爸自己的。

**五条原则**（每个人做决定时都用它来判断）：
1. **不说教。** 给孩子看的任何一个字，都不能有“教育意义”的尾巴。好玩就是全部目的。
2. **三秒上手。** 一张卡片一屏看完，不用滚动，不用学习怎么操作。
3. **真的离线。** 不请求任何外部网络资源：没有 CDN、没有外链字体、没有统计。全部文件加起来控制在 3 MB 以内。
4. **可以公开。** 代码会放在公开仓库。不出现任何真实姓名、学校、城区等能定位到具体家庭的信息（写到“北京”这一级可以）。
5. **有出处、不吹牛。** 给爸爸的提示要有来源，证据是什么强度就说什么强度；给孩子看的知识必须查得到、站得住。

## 1. 团队与文件归属

一个文件只有一个主人。不要改别人的文件；需要别人配合的地方写在交付说明里。

| 角色 | 负责的文件 |
|---|---|
| 负责人 | `docs/SPEC.md` `css/base.css` `js/core.js` `js/widgets/basic.js` `css/widgets-basic.css` `tools/*` `dev/*` `content/lead.json` `content/_sample.json` `README.md` |
| 外壳工程师 A | `index.html` `manifest.webmanifest` `sw.js` `css/app.css` `js/store.js` `js/app.js`（可拆成 `js/app-*.js`） |
| 组件工程师 G1（逻辑与数字） | `js/widgets/logic.js` `css/widgets-logic.css` `content/w-logic.json` |
| 组件工程师 G2（对决） | `js/widgets/duel.js` `css/widgets-duel.css` `content/w-duel.json` |
| 组件工程师 G3（聚会与家庭工具） | `js/widgets/party.js` `css/widgets-party.css` `content/w-party.json` |
| 组件工程师 G4（概率与算法模拟） | `js/widgets/sim.js` `css/widgets-sim.css` `content/w-sim.json` |
| 组件工程师 G5（物理与视觉） | `js/widgets/phys.js` `css/widgets-phys.css` `content/w-phys.json` |
| 视觉设计师 V1（品牌与界面） | `assets/icons.svg` `assets/icon-*.png` `assets/apple-touch-icon.png` `assets/favicon.svg` `css/theme.css` `docs/DESIGN.md` |
| 插画师 V2 | `assets/art.svg` |
| 内容 T（话匣子） | `content/talk.json` |
| 内容 P（烧脑） | `content/puzzle.json` |
| 内容 S（给他看） | `content/show.json` |
| 内容 D（一起做、三人局） | `content/do.json` |
| 内容 I（锦囊） | `content/insight.json` |

生成的文件（任何人都可以跑 `python3 tools/build.py` 重新生成，不要手改）：`data/cards.js`、`js/sprites.js`、`precache-manifest.js`。

## 2. 体验设计（外壳工程师实现；其他人了解即可）

### 2.1 结构

- **刷**（首页）：全屏卡片流，上滑下一张，下滑上一张，365 张首尾相接无限循环。
- **发现**：按类型、按场景的入口，搜索，以及「工具箱」（所有互动组件的直达列表）。
- **收藏**：收藏的、做过的。
- **我的**：进度、设置（音效、震动）、安装到主屏幕的图文指引、离线状态与版本、全部参考来源、关于与说明、清空记录。
- 底部标签栏四个标签，中间一个突出的 **「救场」** 按钮。
- **舞台**：互动组件在全屏浮层里运行（标题、规则按钮、关闭按钮，其余空间全给组件）。
- **抽屉**（bottom sheet）：展开阅读（`more`）、步骤、参考来源、筛选。

### 2.2 两种看法：「我看」与「一起看」

顶部左侧一个开关。
- **我看**：全部 365 张，显示「爸爸提示」。
- **一起看**：把手机递给孩子或放在三个人中间时用。隐藏所有 `audience=dad` 的卡片，隐藏所有卡片上的 `hint`，
  隐藏「锦囊」类型入口。从「一起看」切回「我看」需要**长按** 0.8 秒（防止孩子顺手切回去看到提示）。

### 2.3 卡片流

- 只在 DOM 里保留上一张、当前、下一张三张卡片，用指针事件自己实现上下拖动和吸附（不用原生滚动），
  支持键盘上下键、空格和鼠标滚轮。横向手势不处理。
- 打开应用第一张是**今日锦囊**：把当前模式下的卡片按固定种子排成一个固定顺序，取「今年第几天」那一张，所以一年里每天不同。
- 之后的顺序：以当天日期为种子打乱，并尽量避免相邻两张同一类型。
- 顶部一排可横向滑动的类型筛选（全部 / 话匣子 / 一起玩 / 烧脑 / 给他看 / 一起做 / 三人局 / 锦囊），旁边一个筛选按钮打开抽屉，可再按场景、时长（2 分钟内 / 10 分钟内 / 不限）筛。
- 每张卡片右侧一列操作：收藏、做过、分享（有 Web Share 用它，否则复制文字）、换一张（随机跳）。
- 卡片底部显示「第 N / 总数」。

### 2.4 卡片长相（DOM 约定，设计师按它写皮肤）

```html
<article class="card" data-type="talk" data-format="either" data-id="talk-001">
  <div class="card__bg"></div>                     <!-- 类型色渐变与花纹，由 theme.css 画 -->
  <svg class="card__art jn-art"><use href="#art-ball"/></svg>   <!-- 大贴纸；没有 art 时用类型图标 -->
  <header class="card__meta">                      <!-- 类型徽标 · 子类 · 时长 · 对象 -->
    <span class="jn-badge card__type">…</span> …
  </header>
  <h2 class="card__title">…</h2>
  <div class="card__body">…</div>
  <div class="card__action">…</div>                <!-- 看答案 / 选项 / 二选一 / 开始 / 展开步骤 -->
  <div class="card__preview"></div>                <!-- 组件的自动预览动画（如果有） -->
  <button class="card__hint">…</button>            <!-- 爸爸提示，一起看模式下不渲染 -->
  <footer class="card__foot">…</footer>            <!-- 来源、序号 -->
</article>
```

外壳的 `css/app.css` 只管版面和交互状态；`css/theme.css`（在它之后加载）只管颜色、渐变、花纹、阴影这些“皮肤”。

### 2.5 六种卡片形态（`format`）

| format | 卡片上怎么玩 |
|---|---|
| `plain` | 标题 + 正文；有 `more` 时出现「展开」，在抽屉里读 |
| `reveal` | 正文是问题；点「看答案」翻出 `reveal.text` 和 `reveal.explain` |
| `quiz` | 2–4 个选项；点了以后显示对错和 `explain` |
| `either` | 二选一，两个大按钮。选完显示追问 `either.ask`；并提供「递给对方也选一次」，两人都选完后揭晓是否一致 |
| `steps` | 一起做的事：正文 + 「看步骤」（抽屉里列出 `need` 和 `steps`） |
| `widget` | 互动组件：卡片上放自动预览（如果组件有 `preview`）和一个「开始」按钮（文字可用 `cta` 自定义），点了进舞台 |

### 2.6 救场

底部中间的按钮。点开是一个全屏浮层：顶上一排场景（车上 / 饭桌 / 球场 / 睡前 / 周末 / 出游 / 出差），
中间直接给出一张「救场」卡片（从带「救场」场景标签的卡片里随机；选了场景就取交集），
两个大按钮：「就这个」（跳到这张卡片）和「换一个」。

### 2.7 离线与安装

- `sw.js` 用 `importScripts('./precache-manifest.js')` 拿到文件清单和版本号，安装时全部缓存，之后缓存优先；
  发现新版本时提示「有新内容，点这里更新」。清单不存在时也要能正常工作（开发期）。
- 所有路径用相对路径（站点会挂在 `https://<用户>.github.io/<仓库>/` 这样的子路径下）。
- iOS 没有安装提示，「我的」里给图文步骤：Safari → 分享 → 添加到主屏幕。安卓有 `beforeinstallprompt` 就给一个安装按钮。
- 进入舞台时尝试申请屏幕常亮（`navigator.wakeLock`），失败静默。
- 打开浮层时 `history.pushState`，安卓返回键和浏览器后退能关掉浮层而不是退出应用。

## 3. 卡片数据

### 3.1 字段

内容写在 `content/*.json`，每个文件是一个数组。字段如下（除标了“可选”的都必填）：

| 字段 | 说明 |
|---|---|
| `id` | 唯一。格式 `前缀-三位数字`，前缀与类型对应：talk / play / puz / show / do / trio / ins。各人的号段见 3.3 |
| `type` | `talk` 话匣子 · `play` 一起玩 · `puzzle` 烧脑 · `show` 给他看 · `do` 一起做 · `trio` 三人局 · `insight` 锦囊 |
| `sub` | 可选。子类小标签，≤8 字，如「二选一」「如果」「你教我」「篮球」「数学魔术」「给太太」「给自己」 |
| `format` | `plain` `reveal` `quiz` `either` `steps` `widget` |
| `audience` | `all` 谁都能看 · `dad` 只给爸爸（一起看模式隐藏）。`insight` 必须是 `dad` |
| `for` | 这张卡主要给谁用：`kid` 爸爸和孩子 · `three` 三个人 · `wife` 递给妈妈看或夫妻二人 · `self` 爸爸自己。后两种必须 `audience=dad` |
| `scenes` | 数组，从这八个里选：`救场` `车上` `饭桌` `球场` `睡前` `周末` `出游` `出差`。`audience=all` 的至少选一个。标「救场」的必须 5 分钟内、零准备、不需要任何道具 |
| `mins` | 大约要几分钟，整数 |
| `title` | ≤20 字（建议 ≤14）。卡片上最大的字 |
| `body` | ≤110 字（建议 ≤70）。可以用 `\n` 换行、`**粗体**` |
| `more` | 可选，≤520 字。展开后才看到的内容，支持空行分段、`**粗体**`、以 `- ` 开头的列表 |
| `reveal` | `format=reveal` 必填：`{ "label": "看答案", "text": "…", "explain": "…" }`（label ≤8 字可省略，text ≤170，explain ≤240 可省略） |
| `options` `answer` `explain` | `format=quiz` 必填：2–4 个选项（每个 ≤26 字）、正确选项的序号（从 0 起）、解释（≤240） |
| `either` | `format=either` 必填：`{ "a": "…", "b": "…", "ask": "…" }`（a、b 各 ≤24 字；ask 是选完后的追问，≤40 字，可省略） |
| `steps` `need` | `format=steps` 必填 `steps`：2–8 步，每步 ≤64 字；`need` 可选：要准备的东西，每项 ≤16 字 |
| `widget` `params` `cta` | `format=widget` 必填 `widget`（组件 id）；`params` 是传给组件的参数；`cta` 可选，按钮文字 ≤8 字，默认「开始」 |
| `hint` | 可选，≤100 字。**爸爸提示**：这张卡怎么用才不翻车。一起看模式下不显示 |
| `refs` | 可选数组：`{ "t": "来源名称", "u": "https://…", "lv": "实证" }`。`u` 可省略；`lv` 从 `实证` `指南` `官方` `权威媒体` `专家意见` `个案` `常识` `经典` 里选。`insight` 至少一条 |
| `art` | 可选但强烈建议：贴纸插画的名字，从 5.3 的清单里选 |
| `tags` | 可选，自由标签数组，给搜索用 |

校验：`python3 tools/validate_cards.py content/你的文件.json`，必须 0 错误，警告尽量清掉。

### 3.2 示例

`content/_sample.json` 里有九张示例卡片，覆盖了全部形态，也是文字水准的参照。动手前先读它。

### 3.3 数量与号段（合计正好 365）

| 文件 | 类型与数量 | id 号段 |
|---|---|---|
| `content/talk.json` | talk 70 | `talk-001`–`talk-070` |
| `content/puzzle.json` | puzzle 50 | `puz-001`–`puz-050` |
| `content/show.json` | show 35 | `show-001`–`show-035` |
| `content/do.json` | do 55，trio 15 | `do-001`–`do-055`，`trio-001`–`trio-015` |
| `content/insight.json` | insight 65 | `ins-001`–`ins-065` |
| `content/w-logic.json` | play 22 | `play-101`–`play-122` |
| `content/w-duel.json` | play 12 | `play-201`–`play-212` |
| `content/w-party.json` | play 6，trio 9 | `play-301`–`play-306`，`trio-101`–`trio-109` |
| `content/w-sim.json` | play 5，show 8 | `play-401`–`play-405`，`show-101`–`show-108` |
| `content/w-phys.json` | play 5，show 7 | `play-501`–`play-505`，`show-201`–`show-207` |
| `content/lead.json` | trio 1 | `trio-100` |

数量必须正好，一张不多一张不少。

## 4. 文字怎么写

### 4.1 三种口气

**给孩子看的字**（`audience=all` 的 title、body、reveal、explain、more）：
像一个有意思的学长在抛话题。短、具体、有画面。可以有梗、可以自嘲。
写完自查：把它念给一个 12 岁男孩听，他会不会翻白眼？会，就重写。
- 不出现“这告诉我们”“要学会”“你应该”“道理”“意义”。
- 不以大人的口吻夸奖或鼓励（“你真棒”“加油”）。
- 不问成绩、作业、考试、补课、排名、身高，不和别的孩子比。
- 题目难度：初一学生跳一跳够得着；爸爸不一定比孩子强，这很好。

**爸爸提示**（`hint`）：只管爸爸自己的行为，告诉他这张卡怎么用才不翻车。
- 好的：`他选完别评对错。你也选一个，再讲一次你自己搞砸的时候。`
- 坏的：`借此引导孩子理解团队合作的重要性。`（这就是孩子最烦的“有目的”）
- 常用的几种：先自己答一个更糗的；他答完不点评；输了就认；说完就停；让他当懂行的那一方。

**锦囊**（`type=insight`，只给爸爸）：
- `title` 像一句口诀，是一个能照做的动作：`回家路上只说一句`、`先敲门，等他应声`。
- `body` 说清楚具体怎么做（什么时候、说哪句话、不说哪句话）。
- `more` 写依据和边界：证据是研究、专家经验还是个案，照实说；没有证据的不要写成“研究表明”。
- `for=wife` 的卡片是**可以直接把手机递给妈妈看**的一页：平等的口气，先承认她的担心有道理，再给事实，最后给一个她不勉强的选择。
  不是在说服她，更不能有指责。也可以是夫妻两个人之间的小事（与孩子无关）。
- `for=self` 的卡片写给一个忙、累、有点焦虑的中年管理者：不灌鸡汤，要具体，可以有点幽默。可以引用已进入公有领域的古典
  （《论语》《道德经》、苏轼、王阳明、马可·奥勒留、塞涅卡、爱比克泰德），注明出处；不要编造或张冠李戴名人名言。

### 4.2 事实与出处

- 只写你有把握、而且查得到的事实。数字拿不准就不写或只给量级。之后会有人逐条用搜索核对。
- `refs.u` 只填你确信真实存在的网址（例如标题确定的维基百科条目、机构官网的固定页面、调研报告里已有的链接）。拿不准就只写 `t` 不写 `u`。**绝不编造网址。**
- 经典谜题、传统游戏标 `lv: "经典"` 即可；用自己的话写，不照抄任何一本书或网站的表述。
- 不引用歌词、台词、书摘。确需引语时最多一句、15 字以内，并注明出处。

### 4.3 安全与分寸

- 一起做的事不涉及明火、刀具、危险化学品、高处、水域；运动类提醒一句热身即可。
- 青春期、身体、网络安全这类话题只出现在 `insight`（只给爸爸）里，写法平实、准确，以权威机构的口径为准，并在 `more` 里注明不替代医生面诊。
- 不制造身体焦虑、成绩焦虑；不出现性别刻板印象、地域玩笑、政治与宗教争议、恐怖血腥。
- 不给具体商业产品做广告。游戏、短视频平台尽量泛指；球队、球星、赛事可以直接写名字，但涉及事实必须准确。
- 篮球是这个孩子的最爱，但不要每张都是篮球：全部内容里与篮球直接相关的控制在五分之一左右。

### 4.4 一年的节奏

365 张里应该四季都有（冬天滑冰、夏天夜跑、开学、期末、假期、出游、出差），节日可以有但不依赖具体日期。

## 5. 视觉

### 5.1 方向

深色、颜色大胆、字很大。每种类型是一个“颜色世界”：整屏渐变 + 一张大贴纸 + 很淡的花纹。
「锦囊」类型是例外：深蓝底、金色细节，像一只丝绸锦囊，安静、克制，一眼就知道这是给爸爸看的。
要让一个 12 岁的男孩觉得酷而不是幼稚，也让一个中年人觉得不费眼。

令牌（颜色、字号、间距、圆角）全部定义在 `css/base.css`，变量名固定；取值可以由 V1 在 `css/theme.css` 里覆盖。
所有人只用这些变量和 `.jn-*` 通用类（`.jn-btn` `.jn-chip` `.jn-seg` `.jn-badge` `.jn-panel` `.jn-big` `.jn-num` …），不写死颜色和字号。
字体只用系统字体。

### 5.2 图标（V1 画，放进 `assets/icons.svg`）

一个 `<svg>` 里放若干 `<symbol id="i-名字" viewBox="0 0 24 24">`。线性图标：2px 描边、圆头圆角、不填充；
symbol 内部**不要**写 `stroke` 和 `fill`（由 `.jn-ic` 统一给）。带 `-fill` 的实心版本在 path 上显式写 `fill="currentColor" stroke="none"`。

- 界面：`feed` `discover` `saved` `me` `rescue` `heart` `heart-fill` `check` `check-fill` `share` `dice` `close` `back` `more` `info`
  `clock` `people2` `people3` `lock` `eye` `eye-off` `filter` `search` `settings` `sound` `sound-off` `vibrate` `install` `offline`
  `refresh` `link` `play` `pause` `replay` `chevron-up` `chevron-down` `chevron-right` `plus` `minus` `undo` `trash` `bulb` `book` `star` `hand` `rotate`
- 类型：`t-talk` `t-play` `t-puzzle` `t-show` `t-do` `t-trio` `t-insight`
- 场景：`s-rescue` `s-car` `s-table` `s-court` `s-bed` `s-weekend` `s-trip` `s-away`

用法：`JN.util.icon('heart')` 或 `<svg class="jn-ic"><use href="#i-heart"/></svg>`。

### 5.3 贴纸插画（V2 画，放进 `assets/art.svg`）

一个 `<svg>` 里放 70 个 `<symbol id="art-名字" viewBox="0 0 120 120">`。风格：粗壮的几何剪纸，圆角，不描边，三种色调——
主体 `fill="currentColor"`；次要面 `fill="currentColor" opacity=".55"`；暗部 `fill="#000" opacity=".22"`。
这样贴纸会自动跟着卡片的文字颜色走（彩色卡片上是白色，锦囊卡片上是金色）。每个贴纸在 60px 下也要一眼认得出。

名字清单（内容作者的 `art` 字段只能从这里选）：

- 篮球：`ball` `hoop` `sneaker` `whistle` `scoreboard` `trophy` `jersey`
- 家里：`car` `table` `bed` `sofa` `door` `window`
- 话与想法：`chat` `question` `bulb` `brain` `magnifier` `key` `pouch` `compass` `map` `flag`
- 玩：`dice` `cards` `chess` `puzzle` `gamepad` `target` `hourglass` `stopwatch`
- 知识：`book` `pencil` `abc` `globe` `rocket` `planet` `star` `moon` `sun` `atom` `magnet` `flask` `telescope`
- 生活：`pan` `pizza` `cup` `film` `music` `camera` `earbuds-off` `phone-down`
- 户外：`tent` `mountain` `bike` `skate` `snow` `tree` `paper-plane` `kite`
- 家人与自己：`heart` `highfive` `family` `calendar` `clock` `suitcase` `briefcase` `battery` `seedling` `lighthouse`

用法：`JN.util.art('ball')`。

## 6. 互动组件

### 6.1 接口

读 `js/core.js` 末尾的注释和 `js/widgets/basic.js` 这个参考实现。要点：

```js
JN.registerWidget({
  id: 'make24',            // 小写字母数字，见 6.3 的清单，不要改名
  name: '算 24 点',         // 舞台标题
  rules: '一两句规则。',     // 舞台上「规则」按钮里显示
  mount(root, params, ctx) { /* 完整可玩 */ return { destroy() {} }; },
  preview(root, params, ctx) { /* 可选：卡片上的自动循环小动画，不接收触摸 */ return { destroy() {} }; }
});
```

`ctx` 提供：`done(result)` `confetti()` `sfx(name)` `haptic(ms)` `store.get/set` `rng(seed)` `size()` `onResize(fn)` `reduced` `isPreview`。

### 6.2 硬性要求

1. **自己收拾干净。** `destroy()` 里清掉所有 `setTimeout` / `setInterval` / `requestAnimationFrame` 和挂在 `window` / `document` 上的监听。销毁后不能再有任何代码在跑。
2. **不溢出。** 舞台可用区域从 320×480 到 430×860 都要完整显示、不需要整页滚动；用 `ctx.size()` 和 `ctx.onResize()` 自适应。画布按 `devicePixelRatio`（上限 2）处理清晰度。
3. **手指友好。** 可点的东西不小于 44×44；拖动区域加 `touch-action: none`；不依赖悬停、右键、键盘。
4. **两个人、三个人能一起玩的，就做成在一部手机上一起玩。** 对决类把屏幕分成上下两半，上半屏整体旋转 180°（`.jn-flip`）给对面的人看。玩家颜色统一用 `--p1` `--p2` `--p3`。
5. **三秒上手。** 进来就能玩，不要先弹一页说明；规则写进 `rules`。每一局结束给明确的结果和「再来一局」，并调用一次 `ctx.done()`；赢了可以 `ctx.confetti()`。
6. **不用任何外部资源**，不用 `alert` / `confirm` / `prompt`，不改 `document.title`、不动 `location` 和 `history`。
7. **参数有默认值。** `params` 为空对象时也要能正常玩；同一个组件靠不同 `params` 做出两三张不同的卡片（不同难度、不同题库、不同模式）。
8. **样式隔离。** 类名一律 `w-<组件 id>-…`，写在自己的 css 文件里，只用 `base.css` 的变量和 `.jn-*` 通用类。
9. **预览（`preview`）**：在卡片上一块大约 300×200 的区域里自动循环播放，像一段无声的短视频；不接收触摸，不发声音，
   `ctx.reduced` 为真时只画一帧静态画面。会动的可视化类组件都应该提供。
10. **正确。** 涉及规则、数学、物理的地方必须是对的（必胜策略、概率、公式、常数）。把推导或出处写在代码注释里。
11. **原创。** 可以做经典、传统、通用玩法的游戏（井字棋、取石子、汉诺塔、数独、猜数字这类），
    不要复刻某一款具体的商业游戏的名字、关卡、画面。

每个组件工程师还要为自己的组件写卡片（`content/w-*.json`，数量见 3.3），每个组件至少一张，重点组件两三张（不同参数）。
卡片文字同样遵守第 4 节。

自测：
- `node --check js/widgets/你的文件.js`
- `python3 tools/build.py`（合并卡片、检查卡片引用的组件是否存在）
- `bash tools/selftest.sh`（无头浏览器把每个组件按每张卡片的参数挂载、乱点、销毁，报告报错和横向溢出；必须 0 错误）
- 有浏览器的话打开 `dev/harness.html` 手动玩一遍

### 6.3 组件清单（id 固定）

| 文件 | 组件 id | 是什么 |
|---|---|---|
| basic.js（负责人） | `picker` | 点兵点将：多指按住随机选一个人 |
| logic.js（G1） | `make24` | 算 24 点 |
| | `bulls` | 猜数字（几 A 几 B） |
| | `nim` | 取石子（抢 21、多堆取子），可人机可双人 |
| | `hanoi` | 汉诺塔 |
| | `sudoku` | 迷你数独（4×4、6×6） |
| | `lights` | 关灯谜题 |
| | `memory` | 记忆翻牌（可双人计分） |
| | `onestroke` | 一笔画 |
| | `mindread` | 读心术（二进制卡片魔术） |
| | `cipher` | 密码机（凯撒密码：破译、给对方留密文） |
| duel.js（G2） | `reaction` | 反应对决（2–3 人） |
| | `tapwar` | 指尖拔河 |
| | `mathduel` | 心算对决（两边可设不同难度） |
| | `gomoku` | 五子棋 |
| | `dots` | 点格棋（2–3 人） |
| | `tensec` | 估 10 秒（不看表，谁最接近） |
| | `stroop` | 颜色与字打架（斯特鲁普测试） |
| party.js（G3） | `tacit` | 默契考验（一个答、一个猜） |
| | `wheel` | 转盘（今晚谁做主、吃什么，可自定义） |
| | `whois` | 谁最可能（三人匿名投票） |
| | `scoreboard` | 球场计分板（计分、投篮接龙记字、罚球赛） |
| | `timer` | 挑战计时器（两分钟挑战） |
| | `sketch` | 你画我猜（出词、画板、倒计时） |
| | `storydice` | 故事骰子（掷出几个词，轮流接龙编故事） |
| sim.js（G4） | `monty` | 三门问题 |
| | `galton` | 高尔顿板（小球落下排成钟形） |
| | `chaosgame` | 混沌游戏（随机点画出三角分形） |
| | `montepi` | 扔飞镖算圆周率 |
| | `life` | 生命游戏 |
| | `sorting` | 排序赛跑（算法可视化） |
| | `birthday` | 生日悖论 |
| phys.js（G5） | `pendulum` | 双摆（混沌） |
| | `wavependulum` | 摆的波浪 |
| | `curves` | 万花尺曲线 |
| | `fractal` | 分形树 |
| | `hoopshot` | 投篮物理（出手角度与速度） |
| | `illusion` | 视觉错觉（多种，可验证） |
| | `scale` | 如果地球是一个篮球（太阳系尺度） |

## 7. 交付说明

干完以后用几段话说明：做了什么；自测结果（贴上校验脚本和自测脚本的最后一行输出）；哪些地方拿不准；需要别人配合什么。
不要粘贴大段代码或全部卡片。
