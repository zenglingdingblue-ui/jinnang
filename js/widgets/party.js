/* 锦囊 · widgets/party —— 聚会与家庭工具（组件工程师 G3）
 *   tacit 默契考验 · wheel 转盘 · whois 谁最可能 · scoreboard 球场计分板
 *   timer 挑战计时器 · sketch 你画我猜 · storydice 故事骰子
 *
 * 写法照 widgets/basic.js：一个 IIFE，只通过 JN.registerWidget 对外；class 一律 w-<组件 id>-。
 * 每个组件的计时器、动画帧和监听都交给一个 Life，destroy 时一把清掉。
 * 题库、词库和不碰 DOM 的规则（计分、接龙、罚球、票数结论、转盘指针）挂在 JN._party 下，
 * dev/test-party.js 用 Node 直接检查它们。
 */
(function () {
  'use strict';
  var JN = window.JN;
  var U = JN.util;
  var P = (JN._party = {});

  var TAU = Math.PI * 2;
  /* 名单里第 0–3 位（爸爸、妈妈、孩子、外援）的固定颜色：同一个人在这几个游戏里始终是同一种颜色 */
  var COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--accent)'];

  /* ================================================================== *
   * 一、题库与词库
   * 规矩：不碰学校里的分数和名次，不碰身材，不涉及恋爱八卦，不让谁下不来台；大人和孩子是平等的玩家。
   * ================================================================== */

  /* ---------- 默契考验：每题 = [题目, 选项 × 3–4] ---------- */
  P.TACIT = {
    /* 吃的、玩的、篮球、游戏、家里的日常。谁来答都行，大人一样会被揭穿。 */
    kid: [
      ['比赛最后一攻，球在你手里', '自己投', '传给空位的队友', '突进去造犯规', '运到没时间'],
      ['周末早上最想怎么过', '睡到自然醒', '出门打球', '窝着打游戏', '慢悠悠吃顿早饭'],
      ['打完球最想来一口', '冰可乐', '冰西瓜', '白水就行', '一大碗面'],
      ['零食只能留一种', '薯片', '辣条', '巧克力', '冰淇淋'],
      ['最受不了哪种队友', '只投不传', '从不回防', '输了就甩锅', '一直指挥别人'],
      ['最想练成哪一招', '扣篮', '超远三分', '晃倒人的变向', '不看人传球'],
      ['打游戏时你通常是', '冲在最前面的', '躲在后面输出的', '到处救人的', '满地图捡东西的'],
      ['看球赛的时候你是', '安静看完全场', '全程大喊大叫', '边看边刷手机', '只看最后五分钟'],
      ['火锅第一筷子夹什么', '肉', '丸子', '毛肚这类脆的', '先涮青菜'],
      ['下雨打不了球，你会', '看比赛录像', '打游戏', '睡觉', '在客厅运球被赶走'],
      ['你吃西瓜的方式', '切块用叉子', '抱半个用勺挖', '切成瓣啃', '榨成汁'],
      ['能和一位球星单挑一球', '硬着头皮进攻', '先要个签名', '直接认输求合影', '耍赖用小动作'],
      ['最怕哪种虫子', '蟑螂', '蜘蛛', '毛毛虫', '都不怕'],
      ['闹钟响了，你通常', '马上起', '按掉再睡五分钟', '根本没听见', '闹钟没响就醒了'],
      ['手机只剩 5% 的电', '满屋找充电器', '开省电模式硬撑', '无所谓', '坐立不安'],
      ['路上有个空瓶子，你会', '一脚踢开', '捡起来投进垃圾桶', '当球运两步', '绕过去'],
      ['你点奶茶一般选', '全糖', '半糖', '不加糖', '根本不喝奶茶'],
      ['吃薯条蘸什么', '番茄酱', '冰淇淋', '什么都不蘸', '更怪的东西'],
      ['被蚊子咬了你会', '忍着不挠', '挠到破', '用指甲掐个十字', '马上找药'],
      ['全家出门，你通常是', '第一个准备好的', '最后一个出门的', '到楼下发现忘带东西的', '负责催别人的'],
      ['投篮没进，你最常说', '手滑了', '这球有问题', '再来一个', '什么都不说'],
      ['能改一条篮球规则', '三分线再远一点', '扣篮算三分', '允许多走一步', '篮筐降低一点'],
      ['一个人在家，你最可能', '把音乐开很大', '翻冰箱', '躺着一动不动', '在客厅练运球'],
      ['游戏连输三把，你会', '再来一把', '关掉去干别的', '怪队友', '换个游戏'],
      ['冬天早上怎么出被窝', '一咬牙弹起来', '一点一点挪出来', '先把衣服塞进被窝捂热', '等人来掀被子'],
      ['最想去现场看一次', 'NBA 总决赛', '世界杯决赛', '奥运会开幕式', '电竞总决赛'],
      ['路过球场，有人在打球', '站着看一会儿', '问能不能加一个', '手痒比划两下', '默默路过'],
      ['你怎么吃汉堡', '一层一层拆开吃', '压扁了整个咬', '先把薯条吃完', '把生菜挑出来'],
      ['新鞋第一天穿出门', '小心翼翼绕着水走', '该怎么穿怎么穿', '走几步低头看一眼', '请人先踩一脚破戒'],
      ['坐车时你最喜欢', '靠窗发呆', '戴耳机听歌', '睡觉', '一直找人说话'],
      ['冰箱里只剩最后一瓶饮料', '悄悄喝掉', '问一圈有没有人要', '喝一半留一半', '藏起来明天喝'],
      ['明天突然放一天假', '睡一整天', '约人打球', '打游戏打到爽', '出门随便逛'],
      ['看恐怖片的时候你是', '全程捂眼睛', '淡定吃零食', '专门吓唬别人', '坚决不看'],
      ['最想养的宠物', '狗', '猫', '乌龟这类安静的', '不养，照顾不过来'],
      ['听着什么睡得最香', '下雨声', '完全安静', '开着视频的声音', '空调的嗡嗡声'],
      ['只能选一个位置打一辈子', '控球后卫', '得分手', '内线大个子', '坐教练席']
    ],
    /* 假如、超能力、旅行、动物、未来：任意两个人都能玩 */
    any: [
      ['只能带一样东西去荒岛', '一把刀', '一口锅', '一个篮球', '一本很厚的书'],
      ['最想拥有的超能力', '瞬间移动', '隐身', '读心术', '时间暂停'],
      ['能和一种动物对话，选谁', '狗', '鲸鱼', '老鹰', '家里的蚊子'],
      ['时光机只能用一次', '去看一眼恐龙', '去一百年后', '回到昨天', '不用，留着卖钱'],
      ['中了一笔奖金，第一件事', '吃顿大的', '存起来', '买想了很久的那样东西', '先谁也不告诉'],
      ['可以在一个地方住一年', '海边', '雪山脚下', '大城市市中心', '太空站'],
      ['一觉醒来变成了动物', '猫', '鸟', '海豚', '老虎'],
      ['外星人来了，只让你说一句', '欢迎光临', '带我走', '你们吃什么', '我们没有恶意'],
      ['必须放弃一样', '甜食', '手机游戏', '肉', '空调'],
      ['最想去哪种地方旅行', '有雪的地方', '有海的地方', '好吃的特别多的城市', '没什么人的地方'],
      ['出门旅行时你更像', '做攻略的', '说走就走的', '负责拍照的', '负责找吃的'],
      ['可以瞬间学会一样本事', '一门外语', '一种乐器', '做一桌好菜', '后空翻'],
      ['一个月不能用手机，你能撑', '一个月没问题', '一个星期', '三天', '一个小时'],
      ['僵尸来了，你躲进', '超市', '体育馆', '自己家', '一辆能开的车'],
      ['给你一间空房间随便改', '游戏室', '室内篮球半场', '私人影院', '一屋子书和沙发'],
      ['要上一档节目，你选', '美食节目', '荒野求生', '知识问答', '整蛊真人秀'],
      ['未来的车，你最想要', '会飞的', '能潜水的', '自己开、你只管睡的', '能变形的'],
      ['给自己做饭，最拿手的是', '泡面加蛋', '蛋炒饭', '西红柿炒蛋', '点外卖'],
      ['你更相信哪个存在', '外星人', '水怪', '都不信', '都信'],
      ['穿越进一个故事里，你想当', '主角', '主角的搞笑朋友', '大反派', '路人，活着就好'],
      ['一百万，还是一只会说话的猫', '一百万', '会说话的猫', '先问猫能不能赚一百万'],
      ['每天多出一个小时，用来', '睡觉', '运动', '玩', '发呆'],
      ['你吃饭的速度', '全家最快', '全家最慢', '看菜决定', '边吃边聊没速度'],
      ['进了游乐园，你直奔', '过山车', '鬼屋', '旋转木马这类温柔的', '小吃摊'],
      ['最想亲眼看一次', '极光', '火山喷发（远远地）', '鲸鱼跃出水面', '火箭发射'],
      ['能让一种食物从世界上消失', '香菜', '苦瓜', '榴莲', '都留着，我不挑'],
      ['你觉得自己最像哪种天气', '大晴天', '雷阵雨', '多云转晴', '大雾'],
      ['到了一百年后，第一件事', '看看还有没有篮球', '找吃的', '查查自己后来怎样了', '找地方充电'],
      ['能把一种动物变成巨型的', '仓鼠', '鸭子', '蜗牛', '千万别'],
      ['搬去月球住，只能带一样', '游戏机', '一箱零食', '篮球', '枕头']
    ],
    /* 两个成年人之间的：只在「夫妻」题包里出现 */
    couple: [
      ['累了一天，最想', '谁都别理我', '有人陪着说说话', '吃顿好的', '早点睡'],
      ['理想的周六早上', '睡到自然醒', '早起一个人待会儿', '一起出门吃早点', '赖在床上刷手机'],
      ['难得两个人单独吃饭，去哪', '以前常去的老店', '一直想试的新店', '路边摊', '在家随便做点'],
      ['收到哪种礼物最开心', '实用的', '完全没想到的', '自己随口提过一次的', '不用买，陪我一天'],
      ['心情不好时，希望对方', '别问，待着就行', '听我说完', '带我出去走走', '帮我把事情解决'],
      ['两个人看电影，谁选片', '我', '对方', '猜拳', '谁先拿到遥控器'],
      ['一个只属于自己的下午', '睡觉', '逛街', '运动', '找个地方发呆'],
      ['拌嘴以后，通常谁先开口', '我', '对方', '都憋着，等吃饭', '靠孩子传话'],
      ['家务里最不想碰的', '洗碗', '拖地', '叠衣服', '倒垃圾'],
      ['出门旅行，行李什么时候收', '提前三天', '出发前一晚', '出发前一小时', '对方帮我收'],
      ['明天两个人都请一天假', '在家什么都不干', '去近郊走走', '连看两场电影', '各玩各的，晚饭见'],
      ['你做得最好的一道菜', '对方也认可的那道', '只有我自己爱吃的', '煮面', '我负责洗碗'],
      ['开车时想听什么', '音乐', '广播或播客', '安静', '对方说话'],
      ['最想让对方改的小习惯', '东西随手放', '回消息慢', '熬夜', '没有，都习惯了'],
      ['退休以后最想', '到处旅行', '找个小地方住下', '接着干点事', '天天睡到自然醒'],
      ['对方出差几天，你其实', '有点想', '难得清静', '忙得没感觉', '头天清静，第三天想'],
      ['结婚纪念日，你更想', '好好吃一顿', '出去住一晚', '收一份礼物', '记得就行'],
      ['逛超市时你是', '拿着清单直奔目标', '每个货架都要看', '负责推车', '在门口等'],
      ['半夜饿了', '忍着睡', '起来煮点东西', '翻零食', '把对方摇醒一起吃'],
      ['再度一次蜜月，去哪', '海岛', '雪山', '馆子很多的城市', '哪也不去，在家睡七天'],
      ['压力大的时候你会', '闷头干活', '找人说', '运动', '吃东西'],
      ['两个人散步，你喜欢', '边走边聊', '不说话，各走各的', '看路边的店', '走快点，早回家'],
      ['家里的空调温度谁说了算', '我', '对方', '谁拿着遥控器谁说了算', '一人一床被子解决'],
      ['有三天完全自由的时间', '回老家', '一个人旅行', '两个人出去', '在家补觉'],
      ['最想听对方说哪句', '辛苦了', '我来吧', '你说得对', '今天吃什么你定'],
      ['年轻时没做、现在还想做的', '学一样乐器', '一次长途旅行', '开一家小店', '把身体练好'],
      ['拍合照时你通常', '主动凑过去', '被拉过去', '负责举手机', '负责喊“再来一张”'],
      ['对方做哪件小事最让你舒服', '记得我爱吃什么', '悄悄把车加满油', '出门前说一声', '不用说就去倒垃圾'],
      ['早上谁先起', '我', '对方', '闹钟响了互相踢', '看谁今天有早会'],
      ['一起做过最好的决定', '搬到现在的家', '某一次旅行', '养成的一个小习惯', '当初在一起']
    ]
  };
  /* 题包 -> [主力题库, 搭配题库]：每一局六成的题来自主力题库。夫妻包只出两个人之间的题，不掺别的。 */
  P.TACIT_PACKS = { kid: ['kid', 'any'], couple: ['couple', 'couple'], mix: ['any', 'kid'] };

  /* ---------- 谁最可能：每一句前面都接“谁最可能……” ---------- */
  P.WHOIS = {
    /* 家里的日常糗事 */
    daily: [
      '在电梯里唱出声',
      '把遥控器放进冰箱',
      '出门十分钟又折回来拿手机',
      '看电影看到一半睡着',
      '笑话还没讲完，自己先笑倒',
      '在超市里走丢',
      '半夜起来翻冰箱',
      '说“马上就来”，然后半小时没动',
      '开着导航还走错路',
      '跟路边的小猫认真聊天',
      '忘了车停在哪一层',
      '游戏输了说是网卡了',
      '洗澡的时候开个人演唱会',
      '说“我不饿”，然后吃得最多',
      '打着手机的手电筒找手机',
      '抢到最后一个鸡翅',
      '把别人的名字叫错',
      '出门前换三套衣服',
      '回消息只回一个“嗯”',
      '把东西放在“一个安全的地方”，然后再也找不到',
      '第一个发现家里有好吃的',
      '走路撞上玻璃门',
      '对着镜子练帅气的表情',
      '赶火车时最后一个到',
      '戴着耳机大声唱歌，还跑调',
      '看到虫子叫得最大声',
      '炒菜时把糖当成盐',
      '鞋带散了一路都没发现',
      '聊到一半忘了自己要说什么',
      '拍照永远闭着眼',
      '下楼扔垃圾，回来手里还拎着垃圾',
      '吃自助餐撑到走不动',
      '在沙发上睡着了还说“我没睡”',
      '明明很烫，还是第一个下筷子',
      '因为一点小事笑上十分钟',
      '上车不到五分钟就问“还有多久到”'
    ],
    /* 脑洞版：假如、未来、荒岛、外星人 */
    wild: [
      '在荒岛上活到最后',
      '被外星人选中当地球代表',
      '因为一件糗事上热搜',
      '中了大奖还装作什么都没发生',
      '在鬼屋里第一个叫出声',
      '僵尸来了还要回去拿手机',
      '穿越到古代，第一天就露馅',
      '当了一天国王，第一道命令是取消星期一',
      '被困在电梯里时开始讲冷笑话',
      '发明一道没人敢吃的菜',
      '跟机器人吵架还吵输了',
      '参加吃辣比赛拿第一',
      '第一个报名去火星',
      '开一家只卖一样东西的小店',
      '在动物园被猴子抢走零食',
      '当了特工，第一天就说漏嘴',
      '变成超级英雄，却忘了自己的超能力是什么',
      '在马拉松终点线前停下来自拍',
      '在全场最安静的时候打一个巨响的喷嚏',
      '养一只比自己还懒的宠物',
      '捡到神灯，三个愿望全用来吃',
      '上真人秀，第一集就被淘汰',
      '被选去演电影里的大反派',
      '在太空站把牙膏挤得到处飘',
      '一口气看完一整季剧不睡觉',
      '上台领奖时把要感谢谁全忘了',
      '把一场普通的球赛解说得像总决赛',
      '投进一个连自己都没想到的球',
      '跟导航里的声音吵起来',
      '给家里每一样电器都起名字'
    ]
  };

  /* ---------- 挑战计时器：三十条“两分钟挑战”（零准备、不用道具） ---------- */
  P.CHALLENGES = [
    '两分钟内说出 15 种球类运动',
    '轮流说动物，不许重复，卡住超过 3 秒的人出局',
    '说出 12 支 NBA 球队的名字',
    '用英文说出 20 种吃的',
    '合作从 1 数到 30：谁都可以开口，两个人撞上就从头来',
    '说出 10 个带“三”字的成语',
    '对视两分钟，谁先眨眼谁出局',
    '单脚站立，看谁能撑满两分钟',
    '只用英语聊两分钟，谁先蹦出中文谁输',
    '轮流说国家的名字，不许重复，看能接多少个',
    '说出 15 种带轮子的东西',
    '一人一句编故事，必须用上“篮球、外星人、煎饼”',
    '说出冰箱里现在有的 10 样东西，说完开门验证',
    '说出 15 位篮球运动员的名字',
    '靠墙静蹲，看谁最后一个站起来',
    '成语接龙，接满 12 个',
    '说出 10 种不是红色的水果',
    '只做动作不出声，让别人猜出 5 种运动',
    '说出 8 部在场每个人都看过的电影',
    '在屋里找出 15 样圆形的东西',
    '平板支撑接力：几个人加起来撑满两分钟',
    '用身体摆出 10 个英文字母，让别人一个个猜出来',
    '从 A 到 Z，每个字母接一个英文单词',
    '说出 12 个奥运会比赛项目',
    '每人讲一个冷笑话，看谁先把别人逗笑',
    '说出 10 种会飞但不是鸟的东西',
    '只用“是”和“不是”回答，猜出对方心里想的那种动物',
    '说出 15 个城市，开头的字不许一样',
    '一个人说三个字的词，另一个人马上倒着念，连对 10 个',
    '用手边的三样东西编一条广告，并且演出来'
  ];

  /* ---------- 你画我猜的词库。english 一栏是「英文|中文」：画的人看得懂，猜的人要喊英文 ---------- */
  P.WORDS = {
    basketball: ['扣篮', '空中接力', '盖帽', '三分球', '罚球', '抢篮板', '欧洲步', '后撤步跳投', '压哨绝杀', '挡拆', '快攻', '背后运球',
      '胯下运球', '勾手投篮', '打板进球', '空心入网', '抢断', '走步', '暂停', '战术板', '篮板', '篮筐', '球衣', '护腕', '记分牌', '裁判',
      '替补席', '啦啦队', '冠军奖杯', '跳球', '全场紧逼', '隔人扣篮', '转身过人', '三不沾'],
    animal: ['长颈鹿', '企鹅', '章鱼', '刺猬', '袋鼠', '树懒', '变色龙', '河马', '火烈鸟', '海马', '蝙蝠', '孔雀', '骆驼', '鳄鱼', '水母',
      '啄木鸟', '松鼠', '猫头鹰', '鲸鱼', '螃蟹', '蜗牛', '大象', '斑马', '考拉', '熊猫', '蜘蛛', '海豚', '乌龟', '公鸡', '青蛙', '蚂蚁',
      '蝴蝶', '鲨鱼', '犀牛', '狐狸', '穿山甲', '海獭', '北极熊', '霸王龙', '蜜蜂'],
    food: ['火锅', '糖葫芦', '饺子', '汉堡', '披萨', '寿司', '煎饼果子', '烤串', '冰淇淋', '爆米花', '方便面', '月饼', '粽子', '棉花糖',
      '珍珠奶茶', '荷包蛋', '三明治', '热狗', '薯条', '甜甜圈', '西瓜', '菠萝', '榴莲', '玉米', '辣椒', '包子', '油条', '汤圆', '烤鸭',
      '小龙虾', '生日蛋糕', '巧克力', '棒棒糖', '拉面', '饭团', '春卷', '臭豆腐', '烤红薯', '石榴', '火龙果'],
    action: ['打喷嚏', '伸懒腰', '拔河', '系鞋带', '打瞌睡', '刷牙', '放风筝', '钓鱼', '堆雪人', '跳绳', '俯卧撑', '吹蜡烛', '自拍',
      '打哈欠', '挤地铁', '遛狗', '梦游', '倒立', '吃面条', '荡秋千', '冲浪', '玩滑板', '打嗝', '偷吃零食', '捉迷藏', '抢红包', '等外卖',
      '打蚊子', '搬家', '晾衣服', '洗碗', '挠痒痒', '举重', '潜水', '爬山', '划船'],
    thing: ['雨伞', '自行车', '闹钟', '冰箱', '电梯', '马桶', '望远镜', '红绿灯', '火箭', '降落伞', '热气球', '过山车', '仙人掌', '彩虹',
      '龙卷风', '火山', '金字塔', '长城', '机器人', '外星人', '潜水艇', '直升机', '挖掘机', '消防车', '帐篷', '行李箱', '遥控器', '耳机',
      '键盘', '台灯', '扫地机器人', '吹风机', '指南针', '沙漏', '灯塔', '稻草人'],
    english: ['basketball|篮球', 'giraffe|长颈鹿', 'umbrella|雨伞', 'volcano|火山', 'astronaut|宇航员', 'skateboard|滑板', 'sandwich|三明治',
      'dinosaur|恐龙', 'lighthouse|灯塔', 'waterfall|瀑布', 'helicopter|直升机', 'octopus|章鱼', 'rainbow|彩虹', 'telescope|望远镜',
      'snowman|雪人', 'treasure|宝藏', 'penguin|企鹅', 'backpack|背包', 'headphones|耳机', 'toothbrush|牙刷', 'pineapple|菠萝',
      'scarecrow|稻草人', 'tornado|龙卷风', 'pyramid|金字塔', 'kangaroo|袋鼠', 'fireworks|烟花', 'submarine|潜水艇', 'mushroom|蘑菇',
      'hamburger|汉堡', 'spider web|蜘蛛网', 'roller coaster|过山车', 'ice cream|冰淇淋', 'traffic light|红绿灯', 'slam dunk|扣篮',
      'referee|裁判', 'trophy|奖杯', 'sneakers|球鞋', 'popcorn|爆米花', 'robot|机器人', 'sunglasses|太阳镜', 'jellyfish|水母', 'compass|指南针']
  };
  P.WORD_CATS = [['mix', '混合'], ['basketball', '篮球'], ['animal', '动物'], ['food', '吃的'], ['action', '动作'], ['thing', '东西'], ['english', '英文']];
  /** 某个分类的全部词；mix 是所有中文分类合在一起 */
  P.wordsFor = function (cat) {
    if (cat !== 'mix' && P.WORDS[cat]) return P.WORDS[cat];
    return ['basketball', 'animal', 'food', 'action', 'thing'].reduce(function (all, k) { return all.concat(P.WORDS[k]); }, []);
  };

  /* ---------- 故事骰子：每个主题 6 颗骰子，每颗 6 个面。面 = 「词」或「词|贴纸名」 ----------
   * 六颗各管一件事：谁、在哪、有什么、还有什么、出了什么岔子、怎么收场——这样随便掷都凑得成一个故事。
   * 贴纸名取自 docs/SPEC.md 5.3；雪碧图里没有这张贴纸时只显示词。 */
  P.DICE = {
    any: {
      name: '日常',
      dice: [
        ['爸爸', '妈妈', '一个孩子', '一只猫', '机器人', '外星人'],
        ['车里|car', '饭桌旁|table', '床底下|bed', '沙发上|sofa', '门后面|door', '窗外|window'],
        ['钥匙|key', '锦囊|pouch', '地图|map', '放大镜|magnifier', '行李箱|suitcase', '相机|camera'],
        ['披萨|pizza', '平底锅|pan', '杯子|cup', '骰子|dice', '纸飞机|paper-plane', '风筝|kite'],
        ['突然下雪|snow', '手机没电|battery', '时间到了|hourglass', '灯灭了|bulb', '迷路了|compass', '闹钟响了|clock'],
        ['击掌|highfive', '奖杯|trophy', '一颗星星|star', '一棵小苗|seedling', '月亮|moon', '一颗心|heart']
      ],
      openers: ['那天早上一切都很正常，直到……', '谁也没想到，事情是从一顿早饭开始的。', '“别回头。”有人小声说。', '这件事我本来打算谁也不告诉。']
    },
    hoop: {
      name: '篮球',
      dice: [
        ['教练', '裁判', '新来的队友', '替补席最末尾的人', '对面的大个子', '看台上的老爷爷'],
        ['最后三秒|stopwatch', '露天球场|hoop', '更衣室|door', '大巴车上|car', '雪天的球场|snow', '深夜的球馆|moon'],
        ['篮球|ball', '球鞋|sneaker', '哨子|whistle', '球衣|jersey', '记分牌|scoreboard', '奖杯|trophy'],
        ['战术板|pencil', '一张旧照片|camera', '一把钥匙|key', '幸运骰子|dice', '一张地图|map', '没电的手机|battery'],
        ['突然停电|bulb', '鞋带断了|sneaker', '对手迟到|clock', '下起大雨|window', '球卡在篮筐上|hoop', '全场安静|earbuds-off'],
        ['击掌|highfive', '绝杀|target', '握手言和|heart', '从头再来|seedling', '站上领奖台|flag', '去吃一顿|pizza']
      ],
      openers: ['比赛还剩最后三秒，全场的人都站了起来。', '那是一个谁都不看好的赛季。', '更衣室的门后面，贴着一张没人见过的纸条。', '热身的时候，球突然自己滚了回来。']
    },
    space: {
      name: '太空',
      dice: [
        ['宇航员', '外星小孩', '一只太空狗', '飞船上的机器人', '迷路的探险家', '会说话的陨石'],
        ['月球背面|moon', '陌生的行星|planet', '火箭里|rocket', '太阳附近|sun', '空间站窗边|window', '地球上空|globe'],
        ['望远镜|telescope', '磁铁|magnet', '神秘药水|flask', '星图|map', '指南针|compass', '一颗星星|star'],
        ['一个篮球|ball', '披萨|pizza', '行李箱|suitcase', '耳机|earbuds-off', '相机|camera', '一本书|book'],
        ['氧气只剩十分钟|hourglass', '电池耗尽|battery', '收到神秘信号|chat', '重力消失了|atom', '舱门打不开|door', '时间变慢了|clock'],
        ['回到地球|globe', '交到新朋友|highfive', '插上旗子|flag', '点亮灯塔|lighthouse', '种下一棵苗|seedling', '继续出发|rocket']
      ],
      openers: ['飞船的警报响到第三遍，终于有人醒了。', '从窗口望出去，地球只有一颗弹珠那么大。', '登陆后的第一个脚印，不是我们的。', '导航屏幕上只剩一行字：“欢迎回家？”']
    },
    spy: {
      name: '特工',
      dice: [
        ['代号“土豆”的特工', '双面间谍', '看门的大爷', '戴墨镜的猫', '第一天上班的特工', '神秘的接头人'],
        ['深夜的码头|lighthouse', '电影院最后一排|film', '山顶的小屋|mountain', '一辆旧车里|car', '图书馆|book', '露营地|tent'],
        ['一把钥匙|key', '公文包|briefcase', '放大镜|magnifier', '微型相机|camera', '一张地图|map', '一副扑克牌|cards'],
        ['一枚棋子|chess', '拼图碎片|puzzle', '游戏手柄|gamepad', '一杯咖啡|cup', '行李箱|suitcase', '一只怀表|clock'],
        ['暗号对不上|question', '倒计时开始|stopwatch', '电话突然响了|phone-down', '密码只差一位|abc', '灯全灭了|bulb', '耳机里没声音了|earbuds-off'],
        ['任务完成|target', '原来是自己人|highfive', '留下一张纸条|pencil', '飞往下一站|paper-plane', '真相大白|bulb', '带着锦囊离开|pouch']
      ],
      openers: ['接头暗号是：“今晚的月亮像个煎饼。”', '档案袋里只有一张照片。', '任务只有一句话：别让那只猫发现。', '电话响了三声就挂了，这是约好的信号。']
    },
    trip: {
      name: '出游',
      dice: [
        ['司机师傅', '导游', '背包客', '卖冰棍的老奶奶', '跟着走的小狗', '走散的同伴'],
        ['山顶|mountain', '露营地|tent', '高速服务区|car', '海边的灯塔|lighthouse', '一棵大树下|tree', '陌生的小镇|map'],
        ['行李箱|suitcase', '相机|camera', '指南针|compass', '自行车|bike', '风筝|kite', '滑板|skate'],
        ['一口锅|pan', '望远镜|telescope', '日历|calendar', '一本书|book', '一首歌|music', '纸飞机|paper-plane'],
        ['突然下雪|snow', '太阳下山了|sun', '手机没信号|phone-down', '走错了路|compass', '时间不够了|hourglass', '路牌看不懂|question'],
        ['满天星星|star', '月亮出来了|moon', '插上小旗|flag', '平安到家|door', '大家击掌|highfive', '明年再来|calendar']
      ],
      openers: ['导航说“您已偏离路线”的时候，车里谁都没说话。', '行李箱的轮子，在出发第十分钟掉了一个。', '地图上没有这个地方。', '天黑之前，我们必须决定往左还是往右。']
    }
  };

  /* ---------- 转盘的预设。项 = 「盘面上的短词」或「短词|转到以后显示的说明」 ---------- */
  P.WHEEL = {
    who: { name: '谁', title: '今晚谁做主？', items: [] },   /* 选项取名单里的三个人 */
    dinner: {
      name: '吃什么', title: '今晚吃什么？',
      items: ['火锅', '饺子', '面条', '蛋炒饭', '烤串', '披萨', '麻辣烫', '盖饭',
        '清冰箱|冰箱里有什么就做什么，不许出门买',
        '爸爸下厨|做成什么样都得吃完',
        '孩子点菜|孩子说吃什么就吃什么，大人不许皱眉',
        '妈妈定|今晚妈妈说了算，另外两位不许有意见']
    },
    weekend: {
      name: '周末', title: '这个周末做点什么？',
      items: ['投 50 个球|去球场，每人投进 50 个再回家',
        '骑车探路|骑车去一条从没走过的街，骑到头再回来',
        '早起吃早点|比平时早起一小时，去吃一家没吃过的早点',
        '老电影之夜|每人提名一部老电影，猜拳定一部，关灯看完',
        '逛菜市场|每人十块钱各买一样菜，回家拼成一顿饭',
        '一起做饭|孩子当主厨，大人只打下手，不许指挥',
        '公园野餐|带上垫子和吃的，找块草地坐到太阳偏西',
        '书店一小时|进了书店各逛各的，一小时后互相推荐一本',
        '爬一座小山|找一座两小时能上下的小山，山顶吃自己背上去的零食',
        '桌游之夜|把家里的棋和牌都翻出来，输的人洗碗',
        '拍照任务|出门散步，每人拍 5 张“圆形的东西”，回家评最佳',
        '大扫除竞速|每人一个房间，计时 20 分钟，看谁的最能见人']
    },
    forfeit: {
      name: '小惩罚', title: '输的人要……',
      items: ['播音腔|用新闻播音员的腔调，读一段手边找得到的说明书',
        '机器人|接下来三句话，必须用机器人的声音和动作说',
        '夸赢家|不重样地夸赢的人三句，要夸得真诚',
        '慢动作|用慢动作表演一次压哨绝杀，包括庆祝',
        '学动物|学三种动物的叫声，让大家猜是什么',
        '解说员|像体育解说一样，解说赢家喝一口水的全过程',
        '拍广告|拿起手边任意一样东西，给它演一条 10 秒广告',
        '木头人|摆一个最帅的姿势，保持 30 秒，不许动也不许笑',
        '说反话|接下来一分钟只能说反话，说错一次加十秒',
        '倒着走|倒着走，绕着大家转两圈，不许回头看',
        '太空步|用太空步从房间这头滑到那头',
        '免罚金牌|运气不错：这一次什么都不用做']
    }
  };

  /* ================================================================== *
   * 二、不碰 DOM 的规则
   * ================================================================== */

  function fill(str, map) {
    return String(str).replace(/\{(\w+)\}/g, function (m, k) { return map[k] != null ? map[k] : m; });
  }
  function chars(s) { return Array.from(String(s == null ? '' : s)); }
  /** 收拾一段用户输入：压掉多余空白，按显示宽度截断（汉字算 1，字母数字算半个，和卡片校验脚本的算法一致） */
  function cleanText(s, max) {
    var cs = chars(String(s == null ? '' : s).replace(/\s+/g, ' ').trim());
    var out = '', w = 0;
    max = max || 8;
    for (var i = 0; i < cs.length; i++) {
      var cw = cs[i].charCodeAt(0) > 0x2e7f ? 1 : 0.5;
      if (w + cw > max) break;
      w += cw;
      out += cs[i];
    }
    return out.trim();
  }

  /** 默契度的评语：hit 猜中几题，total 一共几题，a 答的人，b 猜的人 */
  P.tacitVerdict = function (hit, total, a, b) {
    var r = total ? hit / total : 0;
    var t;
    if (r >= 1) t = '全中。你俩是不是偷偷对过答案？';
    else if (r >= 0.8) t = '就差一点满分。{b} 很懂 {a}。';
    else if (r >= 0.6) t = '过半了。{b} 平时没白观察。';
    else if (r >= 0.4) t = '一半一半。{a} 还有不少隐藏设定。';
    else if (r > 0) t = '只蒙对一点。{a} 在 {b} 眼里是个谜。';
    else t = '一题没中！{b} 该请 {a} 吃顿好的，重新认识一下。';
    return fill(t, { a: a, b: b });
  };

  /** 谁最可能：根据票数给出得票最多的人和一句结论。counts[i] 是 names[i] 的票数。 */
  P.whoisVerdict = function (names, counts, pick) {
    pick = pick || U.pick;
    var total = 0, max = 0, top = [];
    counts.forEach(function (c) { total += c; if (c > max) max = c; });
    if (!total) return { top: [], text: '还没有人投票。' };
    counts.forEach(function (c, i) { if (c === max) top.push(i); });
    var text;
    if (top.length === 1) {
      text = max === total && total > 1
        ? pick(['全票通过。{x}，这事没得洗。', '{n} 票全给了 {x}，连 {x} 自己都投了自己。'])
        : pick(['{x} 以 {m} 票当选。认了吧，再讲一个真事。', '多数人觉得是 {x}。{x} 可以申辩一句，只能一句。', '{m} 票投给 {x}。大家心里都有数。']);
      return { top: top, text: fill(text, { x: names[top[0]], m: max, n: total }) };
    }
    if (top.length === counts.length) {
      return { top: top, text: pick(['一人一票，谁也别说谁。', '票数完全打平：这个家人人都有嫌疑。']) };
    }
    var who = top.map(function (i) { return names[i]; });
    var joined = who.slice(0, -1).join('、') + ' 和 ' + who[who.length - 1];
    return { top: top, text: fill(pick(['{w} 打平。石头剪刀布，输的那个认领。', '{w} 并列，半斤八两。']), { w: joined }) };
  };

  /** 转盘：指针在正上方，盘面顺时针转过 angle（弧度）之后，指针指着第几格。
   *  n 格等分，第 0 格从正上方起、顺时针排开。推导：盘面转过 θ，第 k 格占据屏幕角 [k·seg+θ, (k+1)·seg+θ)，
   *  指针在屏幕角 0，所以它落在盘面自己的角度 (−θ mod 2π) 上。 */
  P.wheelIndex = function (angle, n) {
    var seg = TAU / n;
    var phi = (((-angle) % TAU) + TAU) % TAU;
    return Math.floor(phi / seg) % n;
  };

  /* ---------- 计分板 · 两队计分 ---------- */
  P.score = {
    create: function (target) {
      return { names: ['橙队', '蓝队'], s: [0, 0], hist: [], target: target === 21 || target === 0 ? target : 11, flip: false };
    },
    /** 先到 target 分的一方获胜；target 为 0 表示不限分。还没分出来返回 -1。 */
    winner: function (st) {
      if (!st.target) return -1;
      var a = st.s[0] >= st.target, b = st.s[1] >= st.target;
      if (a && b) return st.s[0] === st.s[1] ? -1 : (st.s[0] > st.s[1] ? 0 : 1);
      return a ? 0 : b ? 1 : -1;
    },
    add: function (st, team, pts) {
      if ((team !== 0 && team !== 1) || [1, 2, 3].indexOf(pts) < 0 || P.score.winner(st) >= 0) return false;
      st.s[team] += pts;
      st.hist.push([team, pts]);
      if (st.hist.length > 400) st.hist.shift();
      return true;
    },
    undo: function (st) {
      var h = st.hist.pop();
      if (!h) return false;
      st.s[h[0]] = Math.max(0, st.s[h[0]] - h[1]);
      return true;
    },
    reset: function (st) { st.s = [0, 0]; st.hist = []; },
    swap: function (st) { st.flip = !st.flip; }
  };

  /* ---------- 计分板 · 投篮接龙记字：投丢一次记一个字，先凑满整个词的人出局，剩下的最后一个人赢 ---------- */
  P.horse = {
    create: function (slots, word) {
      return { slots: slots.slice(), word: String(word), got: slots.map(function () { return 0; }), hist: [] };
    },
    len: function (st) { return chars(st.word).length; },
    out: function (st, i) { return st.got[i] >= P.horse.len(st); },
    alive: function (st) { return U.range(st.slots.length).filter(function (i) { return !P.horse.out(st, i); }); },
    winner: function (st) {
      var a = P.horse.alive(st);
      return st.slots.length > 1 && a.length === 1 ? a[0] : -1;
    },
    miss: function (st, i) {
      if (!(i >= 0 && i < st.slots.length) || P.horse.out(st, i) || P.horse.winner(st) >= 0) return false;
      st.got[i]++;
      st.hist.push(i);
      return true;
    },
    undo: function (st) {
      var i = st.hist.pop();
      if (i == null) return false;
      st.got[i] = Math.max(0, st.got[i] - 1);
      return true;
    }
  };

  /* ---------- 计分板 · 罚球赛：每人 shots 投，记进或没进 ---------- */
  P.ft = {
    create: function (slots, shots) {
      return { slots: slots.slice(), shots: shots, res: slots.map(function () { return []; }), cur: 0, hist: [] };
    },
    /** made 命中数，att 出手数，pct 命中率（四舍五入到整数百分比），streak 眼下连中几个，best 最长连中 */
    stats: function (arr) {
      var made = 0, run = 0, best = 0;
      arr.forEach(function (x) {
        if (x) { made++; run++; if (run > best) best = run; } else run = 0;
      });
      return { made: made, att: arr.length, pct: arr.length ? Math.round(made * 100 / arr.length) : 0, streak: run, best: best };
    },
    finished: function (st, i) { return st.res[i].length >= st.shots; },
    over: function (st) { return st.res.every(function (r) { return r.length >= st.shots; }); },
    shoot: function (st, made) {
      var i = st.cur;
      if (P.ft.finished(st, i)) return false;
      st.res[i].push(made ? 1 : 0);
      st.hist.push(i);
      if (P.ft.finished(st, i)) {
        for (var k = 1; k <= st.slots.length; k++) {   /* 这个人投完了：轮到下一个还没投完的 */
          var j = (i + k) % st.slots.length;
          if (!P.ft.finished(st, j)) { st.cur = j; break; }
        }
      }
      return true;
    },
    undo: function (st) {
      var i = st.hist.pop();
      if (i == null) return false;
      st.res[i].pop();
      st.cur = i;
      return true;
    },
    /** 命中最多的人（可能并列） */
    leaders: function (st) {
      var made = st.res.map(function (r) { return P.ft.stats(r).made; });
      var max = Math.max.apply(null, made);
      return U.range(made.length).filter(function (i) { return made[i] === max; });
    }
  };

  /* ================================================================== *
   * 三、几个组件共用的小工具
   * ================================================================== */

  /* ---------- Life：组件里所有的计时器、动画帧、监听都从这里走，destroy 时 kill() 一把清掉 ---------- */
  function Life() {
    this.alive = true;
    this._n = 0;
    this._t = {};     // setTimeout
    this._i = {};     // setInterval
    this._r = {};     // requestAnimationFrame
    this._off = [];   // 解除监听的函数
  }
  Life.prototype.after = function (fn, ms) {
    var self = this, k = ++this._n;
    this._t[k] = setTimeout(function () { delete self._t[k]; if (self.alive) fn(); }, ms);
    return k;
  };
  Life.prototype.cancel = function (k) {
    if (k && this._t[k] != null) { clearTimeout(this._t[k]); delete this._t[k]; }
    return 0;
  };
  Life.prototype.every = function (fn, ms) {
    var self = this, k = ++this._n;
    this._i[k] = setInterval(function () { if (self.alive) fn(); }, ms);
    return k;
  };
  Life.prototype.stop = function (k) {
    if (k && this._i[k] != null) { clearInterval(this._i[k]); delete this._i[k]; }
    return 0;
  };
  Life.prototype.frame = function (fn) {
    var self = this, k = ++this._n;
    this._r[k] = requestAnimationFrame(function (t) { delete self._r[k]; if (self.alive) fn(t); });
    return k;
  };
  Life.prototype.cancelFrame = function (k) {
    if (k && this._r[k] != null) { cancelAnimationFrame(this._r[k]); delete this._r[k]; }
    return 0;
  };
  /** 每帧调用 fn(dt 秒, now 毫秒)；fn 返回 false、或调用返回的函数，就停下。 */
  Life.prototype.loop = function (fn) {
    var self = this, id = 0, last = 0, on = true;
    function step(now) {
      if (!on) return;
      var dt = last ? Math.min(0.05, Math.max(0, (now - last) / 1000)) : 1 / 60;
      last = now;
      if (fn(dt, now) === false) { on = false; return; }
      if (on) id = self.frame(step);
    }
    id = self.frame(step);
    return function () { on = false; self.cancelFrame(id); };
  };
  Life.prototype.on = function (target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._off.push(function () { target.removeEventListener(type, fn, opts); });
  };
  Life.prototype.kill = function () {
    var k;
    this.alive = false;
    for (k in this._t) clearTimeout(this._t[k]);
    for (k in this._i) clearInterval(this._i[k]);
    for (k in this._r) cancelAnimationFrame(this._r[k]);
    this._off.forEach(function (off) { off(); });
    this._t = {}; this._i = {}; this._r = {}; this._off = [];
  };

  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }

  function btn(spec, text, onClick, attrs) {
    return U.el('button' + spec, { text: text, attrs: Object.assign({ type: 'button' }, attrs || {}), on: { click: onClick } });
  }

  /** 重新触发一次 CSS 动画（比如抖一下、弹一下） */
  function replay(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  /** 画布上不能用 var(--x)，从 CSS 里把令牌的实际取值读出来；读不到时用后备值（即 base.css 里的原值）。 */
  function token(node, name, fallback) {
    var v = '';
    try { v = window.getComputedStyle(node).getPropertyValue(name); } catch (e) { /* noop */ }
    v = String(v || '').trim();
    return v || fallback;
  }

  /** 按 devicePixelRatio（上限 2）设置画布的实际像素，返回已经缩放好的 2D 上下文（之后一律用 CSS 像素作图）。 */
  function fitCanvas(canvas, w, h, opts) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var g = canvas.getContext('2d', opts);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }

  /** 给组件最外层的盒子打尺寸标记：is-s 是又矮又窄的小舞台，is-land 是横着放。尺寸变了会再调 fn。 */
  function watchSize(box, ctx, fn) {
    function apply() {
      var s = ctx.size();
      box.classList.toggle('is-s', s.h > 0 && (s.h < 560 || s.w < 350));
      box.classList.toggle('is-land', s.h > 0 && s.w > s.h * 1.15);
      if (fn) fn(s);
    }
    ctx.onResize(apply);
    apply();
  }

  /* ---------- 名单：爸爸、妈妈、孩子（外加一位外援）。在哪个游戏里改了名字，别的游戏里也跟着变 ---------- */
  var NAME_DEFAULTS = ['爸爸', '妈妈', '孩子', '外援'];
  var NAME_KEY = 'w.party.names';
  function loadNames(ctx) {
    /* ctx.store 按组件隔离，做不到几个游戏共用一份名单，所以另存一份在 JN.store 里；两边都没有就用默认名字 */
    var saved = JN.store.get(NAME_KEY, null) || ctx.store.get('names', null);
    return NAME_DEFAULTS.map(function (d, i) { return cleanText(saved && saved[i], 6) || d; });
  }
  function saveNames(ctx, names) {
    var all = NAME_DEFAULTS.map(function (d, i) { return cleanText(names[i], 6) || d; });
    ctx.store.set('names', all);
    JN.store.set(NAME_KEY, all);
    return all;
  }
  /** n 个人玩的时候，默认是名单里的哪几位：1 孩子；2 爸爸和孩子；3 全家；4 加上外援 */
  function defaultSlots(n) {
    return n <= 1 ? [2] : n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3];
  }
  function validSlots(v, pool, min, max) {
    if (!Array.isArray(v)) return null;
    var seen = {}, out = [];
    v.forEach(function (s) { if (pool.indexOf(s) >= 0 && !seen[s]) { seen[s] = 1; out.push(s); } });
    return out.length >= min && out.length <= max ? out.sort() : null;
  }

  /* ---------- 小抽屉：改名字、选谁上场、改转盘选项（代替 prompt）。类名带上调用它的组件的前缀 ----------
   * o: { title, note, rows:[{text, on, color, fallback}], maxLen,
   *      toggle, minOn, maxOn          每行带「上场 / 休息」开关
   *      addable, min, max, addText    可以加行、删行
   *      defaults()                    「恢复默认」时取回的行
   *      onDone(rows) }                rows: [{text, on}]，空行已经去掉
   */
  function openEditor(host, pfx, o) {
    var seq = 0;
    function wrap(r) { return { text: r.text || '', on: r.on !== false, color: r.color || '', fallback: r.fallback || '', at: seq++ }; }
    var rows = o.rows.map(wrap);
    var inputs = [], rowEls = [];
    var closed = false;
    var maxLen = o.maxLen || 8;
    var list = U.el('div.' + pfx + '-ed-list');
    var foot = U.el('div.' + pfx + '-ed-foot');
    var panel = U.el('div.' + pfx + '-ed-panel', { on: { click: function (e) { e.stopPropagation(); } } }, [
      U.el('div.' + pfx + '-ed-title', { text: o.title }),
      o.note ? U.el('div.' + pfx + '-ed-note', { text: o.note }) : null,
      list,
      foot
    ]);
    var ov = U.el('div.' + pfx + '-ed', { on: { click: done } }, [panel]);

    function sync() { inputs.forEach(function (inp, i) { if (rows[i]) rows[i].text = inp.value; }); }
    function onCount() { return rows.filter(function (r) { return r.on; }).length; }
    function toggle(i) {
      sync();
      var r = rows[i];
      if (r.on) {
        if (onCount() <= o.minOn) { replay(rowEls[i], 'jn-shake'); return; }
        r.on = false;
      } else {
        if (onCount() >= o.maxOn) {   /* 满员了：让上场最久的那位下去休息 */
          var oldest = null;
          rows.forEach(function (x) { if (x.on && (!oldest || x.at < oldest.at)) oldest = x; });
          if (oldest) oldest.on = false;
        }
        r.on = true;
        r.at = seq++;
      }
      draw();
    }
    function draw(focusLast) {
      U.clear(list);
      inputs = [];
      rowEls = [];
      rows.forEach(function (r, i) {
        var inp = U.el('input.jn-input.' + pfx + '-ed-input', {
          attrs: { type: 'text', maxlength: maxLen * 2, placeholder: r.fallback || o.placeholder || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done' },
          on: { keydown: function (e) { if (e.key === 'Enter') inp.blur(); } }
        });
        inp.value = r.text;
        inputs.push(inp);
        var row = U.el('div.' + pfx + '-ed-row');
        if (r.color) {
          var dot = U.el('i.' + pfx + '-ed-dot');
          dot.style.background = r.color;
          row.appendChild(dot);
        }
        row.appendChild(inp);
        if (o.toggle) {
          row.appendChild(btn('.' + pfx + '-ed-tog' + (r.on ? '.is-on' : ''), r.on ? '上场' : '休息', function () { toggle(i); }, { 'aria-pressed': r.on ? 'true' : 'false' }));
        }
        if (o.addable) {
          var del = btn('.' + pfx + '-ed-del', '删', function () { sync(); if (rows.length > o.min) { rows.splice(i, 1); draw(); } }, { 'aria-label': '删掉这一项' });
          del.disabled = rows.length <= o.min;
          row.appendChild(del);
        }
        rowEls.push(row);
        list.appendChild(row);
      });
      U.clear(foot);
      if (o.addable) {
        var add = btn('.jn-btn.jn-btn--ghost.' + pfx + '-ed-btn', o.addText || '加一项', function () {
          sync();
          if (rows.length < o.max) { rows.push(wrap({ text: '' })); draw(true); }
        });
        add.disabled = rows.length >= o.max;
        foot.appendChild(add);
      }
      if (o.defaults) {
        foot.appendChild(btn('.jn-btn.jn-btn--line.' + pfx + '-ed-btn', '恢复默认', function () { rows = o.defaults().map(wrap); draw(); }));
      }
      foot.appendChild(btn('.jn-btn.' + pfx + '-ed-btn.' + pfx + '-ed-ok', '好了', done));
      if (focusLast && inputs.length) {
        list.scrollTop = list.scrollHeight;
        try { inputs[inputs.length - 1].focus(); } catch (e) { /* noop */ }
      }
    }
    function done() {
      if (closed) return;
      closed = true;
      sync();
      var out = [];
      rows.forEach(function (r) {
        var t = cleanText(r.text, maxLen) || r.fallback;
        if (t) out.push({ text: t, on: r.on });
      });
      if (o.addable && o.defaults && out.length < o.min) {   /* 删得太狠了：用默认项补到最少的数量 */
        o.defaults().forEach(function (d) {
          if (out.length < o.min && !out.some(function (x) { return x.text === d.text; })) out.push({ text: d.text, on: true });
        });
      }
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      o.onDone(out);
    }
    draw();
    host.appendChild(ov);
    return { close: function () { closed = true; if (ov.parentNode) ov.parentNode.removeChild(ov); } };
  }

  /** 预览用。卡片上的预览区是一条又宽又矮的带子（宽约 340，高 92–184）：按 320×150 的设计稿定一个基准字号，
   *  预览里的尺寸一律用 em，自然跟着缩放。 */
  function pvScale(box, ctx, fn) {
    function apply() {
      var s = ctx.size();
      var k = Math.min((s.w || 320) / 320, (s.h || 150) / 150);
      box.style.fontSize = U.clamp(16 * k, 8, 30).toFixed(1) + 'px';
      if (fn) fn(s);
    }
    ctx.onResize(apply);
    apply();
  }

  /* ================================================================== *
   * tacit 默契考验：一个人悄悄选，另一个人猜
   * params: { pack: 'kid' | 'couple' | 'mix'（默认）, rounds: 5 }
   * 一题的流程：A 选 → 递手机 → B 猜 → 揭晓；rounds 题后给默契度，可以互换角色再来。
   * ================================================================== */
  var TACIT_HIT = ['默契 +1。', '这都能猜到。', '{b} 很懂 {a}。', '心有灵犀。'];
  var TACIT_MISS = ['{a} 说说，为什么是这个？', '{b} 心里的 {a}，和真的 {a}，差了一个选项。', '没想到吧。', '{a} 的隐藏设定 +1。'];

  JN.registerWidget({
    id: 'tacit',
    name: '默契考验',
    rules: '一个人悄悄选，另一个人猜他选了哪个，猜中得一分。几题之后看默契度，再互换角色。选的人别让对方看见屏幕，也不许给眼神提示。',
    mount: function (root, params, ctx) {
      var life = new Life();
      var pack = P.TACIT_PACKS[params.pack] ? params.pack : 'mix';
      var rounds = U.clamp(parseInt(params.rounds, 10) || 5, 3, 10);
      var names = loadNames(ctx);
      var pool = pack === 'couple' ? [0, 1] : [0, 1, 2];           // 这个题包里可以上场的人
      var duo = (pack !== 'couple' && validSlots(ctx.store.get('duo.' + pack, null), pool, 2, 2)) || (pack === 'couple' ? [0, 1] : [0, 2]);
      var flip = false;       // false：duo[0] 先答
      var last = {};          // 'a>b' -> 上一局 b 猜 a 的默契度，用来比“谁更懂谁”
      var st = null;
      var editor = null;

      var roles = U.el('button.w-tacit-roles', { attrs: { type: 'button' }, on: { click: swapRoles } });
      var chip = btn('.jn-chip.w-tacit-chip', pack === 'couple' ? '改名' : '换人', openPlayers);
      var prog = U.el('div.w-tacit-prog');
      var body = U.el('div.w-tacit-body');
      var box = U.el('div.w-tacit', [U.el('div.w-tacit-head', [roles, chip]), prog, body]);
      root.appendChild(box);
      watchSize(box, ctx);

      /* 从题库里抽 n 道最近没出过的题；出过的记在 ctx.store 里，一轮用完再从头来 */
      function draw(listName, n) {
        var list = P.TACIT[listName];
        var seen = ctx.store.get('seen.' + listName, []);
        if (!Array.isArray(seen)) seen = [];
        var fresh = U.range(list.length).filter(function (i) { return seen.indexOf(i) < 0; });
        if (fresh.length < n) { seen = []; fresh = U.range(list.length); }
        var take = U.shuffle(fresh).slice(0, n);
        ctx.store.set('seen.' + listName, seen.concat(take));
        return take.map(function (i) { return list[i]; });
      }
      function start() {
        var src = P.TACIT_PACKS[pack];
        var nMain = Math.ceil(rounds * 0.6);
        st = {
          a: duo[flip ? 1 : 0], b: duo[flip ? 0 : 1],
          qs: U.shuffle(draw(src[0], nMain).concat(draw(src[1], rounds - nMain))),
          i: 0, pick: -1, guess: -1, order: [], hit: 0, log: [], say: '', phase: 'pick'
        };
        render();
      }

      function person(slot, role) {
        var p = U.el('span.w-tacit-p', [U.el('i.w-tacit-dot'), U.el('b', { text: names[slot] }), U.el('small', { text: role })]);
        p.style.setProperty('--c', COLORS[slot]);
        return p;
      }
      function drawHead() {
        var fresh = st.phase === 'pick' && st.i === 0;
        U.clear(roles);
        U.append(roles, [person(st.a, '答'), U.el('span.w-tacit-swap' + (fresh ? '.is-on' : ''), { text: fresh ? '互换' : '→' }), person(st.b, '猜')]);
        roles.disabled = !fresh;
        roles.setAttribute('aria-label', names[st.a] + '答，' + names[st.b] + '猜' + (fresh ? '。点一下互换' : ''));
        chip.disabled = !(fresh || st.phase === 'result');
        U.clear(prog);
        for (var k = 0; k < rounds; k++) {
          var cls = k < st.log.length ? (st.log[k] ? '.is-hit' : '.is-miss') : (k === st.i && st.phase !== 'result' ? '.is-now' : '');
          prog.appendChild(U.el('i.w-tacit-pip' + cls));
        }
        prog.appendChild(U.el('span.w-tacit-score', { text: '猜中 ' + st.hit }));
      }
      function render() {
        drawHead();
        U.clear(body);
        body.className = 'w-tacit-body is-' + st.phase;
        if (st.phase === 'pass') viewPass();
        else if (st.phase === 'reveal') viewReveal();
        else if (st.phase === 'result') viewResult();
        else viewAsk();
      }

      function viewAsk() {
        var guessing = st.phase === 'guess';
        var q = st.qs[st.i];
        var actor = guessing ? st.b : st.a, other = guessing ? st.a : st.b;
        var turn = U.el('div.w-tacit-turn', [
          U.el('b', { text: names[actor] + (guessing ? ' 来猜' : ' 悄悄选一个') }),
          U.el('small', { text: guessing ? names[other] + ' 刚才选了哪个？' : '别让 ' + names[other] + ' 看见你点了哪个' })
        ]);
        turn.style.setProperty('--c', COLORS[actor]);
        var opts = U.el('div.w-tacit-opts');
        /* 猜的人看到的选项顺序是打乱过的：就算瞄到了对方手指点的位置也没用 */
        (guessing ? st.order : U.range(q.length - 1)).forEach(function (k) {
          opts.appendChild(btn('.w-tacit-opt', q[k + 1], function () { choose(k); }));
        });
        U.append(body, [turn, U.el('div.w-tacit-q', { text: q[0] }), opts]);
      }
      function choose(k) {
        ctx.haptic(10);
        if (st.phase === 'pick') {
          st.pick = k;
          st.order = U.shuffle(U.range(st.qs[st.i].length - 1));
          st.phase = 'pass';
          ctx.sfx('tap');
        } else if (st.phase === 'guess') {
          var hit = k === st.pick;
          st.guess = k;
          st.log.push(hit ? 1 : 0);
          if (hit) st.hit++;
          st.say = fill(U.pick(hit ? TACIT_HIT : TACIT_MISS), { a: names[st.a], b: names[st.b] });
          st.phase = 'reveal';
          ctx.sfx(hit ? 'good' : 'bad');
        } else return;
        render();
      }
      function viewPass() {
        var who = U.el('b', { text: names[st.b] });
        who.style.color = COLORS[st.b];
        U.append(body, [
          U.el('div.w-tacit-passbig', ['把手机递给 ', who]),
          U.el('div.w-tacit-passsub', { text: names[st.a] + ' 选好了。不许给眼神提示。' }),
          btn('.jn-btn.jn-btn--lg.w-tacit-go', '我是' + names[st.b] + '，开始猜', function () { st.phase = 'guess'; ctx.sfx('pop'); render(); }),
          btn('.w-tacit-link', '点错了，让' + names[st.a] + '重选', function () { st.phase = 'pick'; st.pick = -1; render(); })
        ]);
      }
      function tagEl(text, color) {
        var t = U.el('i.w-tacit-tag', { text: text });
        t.style.setProperty('--c', color);
        return t;
      }
      function viewReveal() {
        var q = st.qs[st.i], hit = st.pick === st.guess;
        var opts = U.el('div.w-tacit-opts.is-done');
        st.order.forEach(function (k) {
          var isA = k === st.pick, isB = k === st.guess;
          var row = U.el('div.w-tacit-opt' + (isA ? '.is-a' : '') + (isB ? '.is-b' : ''), [U.el('span.w-tacit-optt', { text: q[k + 1] })]);
          if (isA || isB) {
            row.style.setProperty('--c', COLORS[isA ? st.a : st.b]);
            row.appendChild(U.el('span.w-tacit-tags', [
              isA ? tagEl(names[st.a] + '选的', COLORS[st.a]) : null,
              isB ? tagEl(names[st.b] + '猜的', COLORS[st.b]) : null
            ]));
          }
          opts.appendChild(row);
        });
        U.append(body, [
          U.el('div.w-tacit-verdict' + (hit ? '.is-hit' : '.is-miss'), { text: hit ? '猜中了！' : '没猜中' }),
          U.el('div.w-tacit-q.is-small', { text: q[0] }),
          opts,
          U.el('div.w-tacit-say', { text: st.say }),
          btn('.jn-btn.jn-btn--block.w-tacit-next', st.i >= rounds - 1 ? '看默契度' : '下一题', next)
        ]);
      }
      function next() {
        if (st.phase !== 'reveal') return;
        if (st.i >= rounds - 1) { finish(); return; }
        st.i++;
        st.pick = st.guess = -1;
        st.phase = 'pick';
        ctx.sfx('tap');
        render();
      }
      function finish() {
        var pct = Math.round(st.hit * 100 / rounds);
        st.phase = 'result';
        last[st.a + '>' + st.b] = pct;
        render();
        ctx.sfx(pct >= 60 ? 'win' : 'pop');
        if (pct >= 80) ctx.confetti();
        ctx.done({ win: pct >= 60, text: '默契度 ' + pct + '%' });
      }
      function viewResult() {
        var pct = Math.round(st.hit * 100 / rounds);
        var a = names[st.a], b = names[st.b];
        var back = last[st.b + '>' + st.a];
        var cmp = back == null ? null : U.el('div.w-tacit-cmp', {
          text: b + ' 猜 ' + a + ' ' + pct + '%，' + a + ' 猜 ' + b + ' ' + back + '%。' +
            (pct === back ? '打平，谁也不比谁更懂。' : (pct > back ? b : a) + ' 更懂对方。')
        });
        U.append(body, [
          U.el('div.w-tacit-cap', { text: b + ' 猜 ' + a + ' 的默契度' }),
          U.el('div.w-tacit-pct', { text: pct + '%' }),
          U.el('div.w-tacit-sub', { text: rounds + ' 题猜中 ' + st.hit + ' 题' }),
          U.el('div.w-tacit-line', { text: P.tacitVerdict(st.hit, rounds, a, b) }),
          cmp,
          btn('.jn-btn.jn-btn--lg.jn-btn--block.w-tacit-again', '互换角色再来', function () { flip = !flip; ctx.sfx('tap'); start(); }),
          btn('.jn-btn.jn-btn--ghost.jn-btn--block', '原样再来一局', function () { ctx.sfx('tap'); start(); })
        ]);
      }

      function swapRoles() {
        if (!(st.phase === 'pick' && st.i === 0)) return;
        var t = st.a;
        st.a = st.b;
        st.b = t;
        flip = !flip;
        ctx.sfx('tap');
        render();
      }
      function openPlayers() {
        if (editor) return;
        editor = openEditor(box, 'w-tacit', {
          title: pack === 'couple' ? '改名字' : '谁和谁玩',
          note: pack === 'couple' ? '' : '选两个人上场。名字可以改。',
          toggle: pack !== 'couple', minOn: 2, maxOn: 2, maxLen: 6,
          rows: pool.map(function (s) { return { text: names[s], on: duo.indexOf(s) >= 0, color: COLORS[s], fallback: NAME_DEFAULTS[s] }; }),
          onDone: function (rows) {
            editor = null;
            var on = [];
            rows.forEach(function (r, i) {
              names[pool[i]] = r.text;
              if (r.on) on.push(pool[i]);
            });
            names = saveNames(ctx, names);
            if (pack !== 'couple' && on.length === 2 && (on[0] !== duo[0] || on[1] !== duo[1])) {
              duo = on;
              flip = false;
              ctx.store.set('duo.' + pack, duo);
              start();
            } else render();
          }
        });
      }

      start();
      return {
        destroy: function () {
          life.kill();
          if (editor) editor.close();
        }
      };
    },

    /* 卡片上的预览：左边一道题，右边三个选项，两个小圆点先后落下，对上了就亮 */
    preview: function (root, params, ctx) {
      var life = new Life();
      var names = loadNames(ctx);
      var pack = P.TACIT_PACKS[params.pack] ? params.pack : 'mix';
      var a = 0, b = pack === 'couple' ? 1 : 2;
      var list = P.TACIT[P.TACIT_PACKS[pack][0]];
      function legend(slot, word) {
        var dot = U.el('i.w-tacit-pvdot');
        dot.style.background = COLORS[slot];
        return U.el('span', [dot, names[slot] + word]);
      }
      var qEl = U.el('div.w-tacit-pvq');
      var opts = U.el('div.w-tacit-pvopts');
      var res = U.el('div.w-tacit-pvres');
      var box = U.el('div.w-tacit-pv', [U.el('div.w-tacit-pvleft', [U.el('div.w-tacit-pvlegend', [legend(a, '选'), legend(b, '猜')]), qEl, res]), opts]);
      var n = 0, step = 0, rows = [], pick = 0, guess = 0;
      root.appendChild(box);
      pvScale(box, ctx);

      function scene() {
        var q = list[(n * 7) % list.length];
        n++;
        pick = n % 3;
        guess = n % 3 === 0 ? (pick + 1) % 3 : pick;      // 每三题里猜错一题，看起来才像真的
        qEl.textContent = q[0];
        U.clear(opts);
        rows = [];
        for (var k = 0; k < 3; k++) {
          var da = U.el('i.w-tacit-pvdot.is-a'), db = U.el('i.w-tacit-pvdot.is-b');
          da.style.background = COLORS[a];
          db.style.background = COLORS[b];
          var row = U.el('div.w-tacit-pvopt', [da, U.el('span', { text: q[k + 1] }), db]);
          rows.push(row);
          opts.appendChild(row);
        }
        res.textContent = '';
        res.className = 'w-tacit-pvres';
      }
      function show(s) {
        if (s >= 1) rows[pick].classList.add('has-a');
        if (s >= 2) rows[guess].classList.add('has-b');
        if (s >= 3) {
          var hit = pick === guess;
          res.textContent = hit ? '猜中了！' : '没猜中';
          res.classList.add(hit ? 'is-hit' : 'is-miss');
          if (hit) rows[pick].classList.add('is-hit');
        }
      }
      scene();
      if (ctx.reduced) show(3);
      else {
        life.every(function () {
          step++;
          if (step > 4) { step = 0; scene(); } else show(step);
        }, 800);
      }
      return { destroy: function () { life.kill(); } };
    }
  });

  /* ================================================================== *
   * wheel 转盘
   * params: { preset: 'who'（默认）| 'dinner' | 'weekend' | 'forfeit',
   *           title: '换一个问题，比如：今晚谁洗碗？', items: ['卡片自带的一组选项', …] }
   * ================================================================== */
  function parseItem(s) {
    s = String(s);
    var i = s.indexOf('|');
    return i < 0 ? { t: s, d: '' } : { t: s.slice(0, i), d: s.slice(i + 1) };
  }
  /** 盘面上的字竖着排，转到正上方时正好是竖排中文。把词切成一格一格：汉字一字一格，三个以内的字母数字合占一格；
   *  出现更长的英文就返回 null，改成顺着半径横着写。 */
  function wheelCells(label) {
    var out = [], run = '';
    var cs = chars(label);
    for (var i = 0; i <= cs.length; i++) {
      var c = cs[i];
      if (c != null && /[A-Za-z0-9]/.test(c)) { run += c; continue; }
      if (run) {
        if (run.length > 3) return null;
        out.push(run);
        run = '';
      }
      if (c != null && c !== ' ') out.push(c);
    }
    return out;
  }

  /** 负责把转盘画到 canvas 上。盘面先画进一张离屏画布，之后每帧只做一次旋转贴图，所以转起来不卡。 */
  function WheelPainter(canvas, host) {
    var g = null, S = 0, R = 0, cx = 0, cy = 0;
    var face = document.createElement('canvas');
    var slots = [];
    var C = null, font = 'sans-serif';

    function readTokens() {
      C = {
        ink: token(host, '--ink', '#f4f6fb'),
        on: token(host, '--on-color', '#ffffff'),
        bg: token(host, '--bg', '#0b0d12'),
        hub: token(host, '--surface-2', '#1e2433'),
        accent: token(host, '--accent', '#ffd166'),
        scrim: token(host, '--scrim', 'rgba(6, 8, 12, 0.72)'),
        pal: [['--c-talk-a', '#ff7a45'], ['--c-play-a', '#4d7cfe'], ['--c-do-a', '#2fb36a'], ['--c-trio-a', '#ff4fa3'], ['--c-show-a', '#00b8a9'], ['--c-puzzle-a', '#8a5cf6']]
          .map(function (p) { return token(host, p[0], p[1]); }),
        /* 同一组颜色的亮色版：给压在深色界面上的字用（theme.css 里的 --c-*-hi；没有就退回上面的底色） */
        hi: ['talk', 'play', 'do', 'trio', 'show', 'puzzle']
          .map(function (k) { return token(host, '--c-' + k + '-hi', '') || token(host, '--c-' + k + '-a', ''); }),
        players: [['--p1', '#ff7a45'], ['--p2', '#4d7cfe'], ['--p3', '#3ddc97'], ['--accent', '#ffd166']]
          .map(function (p) { return token(host, p[0], p[1]); })
      };
      font = token(host, 'font-family', 'sans-serif');
    }
    function label(f, text, r, seg) {
      var rOut = r * 0.9, rHub = r * 0.27;
      var half = Math.sin(Math.min(seg, Math.PI) / 2);
      var cells = wheelCells(text);
      if (cells && cells.length) {
        var s = Math.min(r * 0.2, (rOut - rHub) / cells.length);
        /* 最靠里的那个字不能比它所在位置的弦还宽 */
        while (s > 7 && s > 2 * (rOut - s * (cells.length - 0.5)) * half * 0.9) s -= 0.5;
        f.font = '700 ' + s.toFixed(1) + 'px ' + font;
        cells.forEach(function (c, j) { f.fillText(c, 0, -(rOut - s * (j + 0.5)), s * 1.2); });
      } else {
        var size = U.clamp(2 * (rHub + 10) * half, 9, r * 0.13);
        f.font = '700 ' + size.toFixed(1) + 'px ' + font;
        f.rotate(-Math.PI / 2);
        f.textAlign = 'right';
        f.fillText(text, rOut, 0, rOut - rHub);
        f.textAlign = 'center';
      }
    }
    function paintFace() {
      var n = slots.length;
      if (!n || R <= 0 || !C) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var D = Math.max(2, Math.round(R * 2 * dpr));
      var seg = TAU / n, r = R - 4, k, a;
      face.width = D;
      face.height = D;
      var f = face.getContext('2d');
      f.setTransform(dpr, 0, 0, dpr, 0, 0);
      f.translate(R, R);
      for (k = 0; k < n; k++) {
        f.beginPath();
        f.moveTo(0, 0);
        f.arc(0, 0, r, k * seg - Math.PI / 2, (k + 1) * seg - Math.PI / 2);
        f.closePath();
        f.fillStyle = slots[k].color;
        f.fill();
      }
      f.strokeStyle = C.bg;
      f.lineWidth = 2;
      for (k = 0; k < n; k++) {
        a = k * seg - Math.PI / 2;
        f.beginPath();
        f.moveTo(0, 0);
        f.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        f.stroke();
      }
      f.fillStyle = C.on;
      f.textAlign = 'center';
      f.textBaseline = 'middle';
      f.shadowColor = C.scrim;
      f.shadowBlur = 3;
      f.shadowOffsetY = 1;
      for (k = 0; k < n; k++) {
        f.save();
        f.rotate(k * seg + seg / 2);          /* 让这一格的中线朝正上方，再往下写 */
        label(f, slots[k].label, r, seg);
        f.restore();
      }
      f.shadowBlur = 0;
      f.shadowOffsetY = 0;
      f.beginPath();
      f.arc(0, 0, r, 0, TAU);
      f.lineWidth = 6;
      f.strokeStyle = C.hub;
      f.stroke();
      f.fillStyle = C.ink;
      for (k = 0; k < n; k++) {               /* 每条分界线顶上一颗小钉，指针就是被它们拨得“哒哒”响 */
        a = k * seg - Math.PI / 2;
        f.beginPath();
        f.arc(Math.cos(a) * r, Math.sin(a) * r, 3, 0, TAU);
        f.fill();
      }
    }
    return {
      /** 画布是边长 size 的正方形 */
      layout: function (size) {
        S = Math.max(100, Math.floor(size));
        g = fitCanvas(canvas, S, S);
        R = S / 2 - 14;
        cx = S / 2;
        cy = S / 2 + 6;
        readTokens();
        paintFace();
      },
      setSlots: function (list) { slots = list; paintFace(); },
      geom: function () { return { cx: cx, cy: cy, R: R }; },
      player: function (i) { if (!C) readTokens(); return C.players[i % C.players.length]; },
      /** 第 k 格（共 total 格）用调色盘里的哪个颜色：依次轮，保证首尾两格不撞色 */
      palette: function (k, total, bright) {
        if (!C) readTokens();
        var m = C.pal.length, i = k % m;
        if (total > 1 && k === total - 1 && i === 0) i = 3;
        return (bright && C.hi[i]) || C.pal[i];
      },
      /** theta 盘面转过的角度；o.win 高亮哪一格；o.pulse 0–1 高亮的呼吸；o.dim 其余格子压暗的程度；o.kick 指针被拨动的幅度 */
      draw: function (theta, o) {
        o = o || {};
        if (!g) return;
        g.clearRect(0, 0, S, S);
        if (!slots.length) return;
        g.save();
        g.translate(cx, cy);
        g.rotate(theta);
        g.drawImage(face, -R, -R, R * 2, R * 2);
        if (o.win != null && o.win >= 0) {
          var seg = TAU / slots.length, r = R - 4;
          var a0 = o.win * seg - Math.PI / 2, a1 = a0 + seg;
          g.beginPath();
          g.moveTo(0, 0);
          g.arc(0, 0, r, a1, a0 + TAU);
          g.closePath();
          g.globalAlpha = 0.62 * (o.dim == null ? 1 : o.dim);
          g.fillStyle = C.bg;
          g.fill();
          g.globalAlpha = 1;
          g.beginPath();
          g.moveTo(0, 0);
          g.arc(0, 0, r, a0, a1);
          g.closePath();
          g.lineJoin = 'round';
          g.lineWidth = 4 + 3 * (o.pulse || 0);
          g.strokeStyle = C.ink;
          g.stroke();
        }
        g.restore();
        g.beginPath();
        g.arc(cx, cy, R * 0.2, 0, TAU);
        g.fillStyle = C.hub;
        g.fill();
        g.lineWidth = Math.max(2, R * 0.03);
        g.strokeStyle = C.accent;
        g.stroke();
        g.fillStyle = C.accent;
        g.font = '800 ' + (R * 0.17).toFixed(1) + 'px ' + font;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('转', cx, cy + 1);
        /* 指针：钉在正上方。盘面顺时针转时，小钉把指针尖往右拨 */
        var pw = Math.max(9, R * 0.085), ph = Math.max(20, R * 0.2);
        g.save();
        g.translate(cx, cy - R - 8);
        g.rotate(-0.5 * (o.kick || 0) * (o.dir || 1));
        g.beginPath();
        g.moveTo(-pw, 0);
        g.lineTo(pw, 0);
        g.lineTo(0, ph);
        g.closePath();
        g.fillStyle = C.ink;
        g.fill();
        g.lineWidth = 3;
        g.lineJoin = 'round';
        g.strokeStyle = C.bg;
        g.stroke();
        g.restore();
      }
    };
  }

  /* 转盘的减速：dω/dt = −(K·ω + C0)。只有线性阻力的话永远停不下来，加一个常数项才会在有限时间内停住，
   * 并且临停前慢慢爬过最后几格。这个方程有解析解，所以每一帧直接按“甩出去之后过了多久”算角度：
   * 掉帧、切到后台再回来，都不影响它停在哪一格、什么时候停。
   *   角速度    ω(t) = (ω0 + C0/K)·e^(−K·t) − C0/K
   *   转过的角  s(t) = (ω0 + C0/K)·(1 − e^(−K·t))/K − (C0/K)·t
   *   停下的时刻 T = ln(1 + ω0·K/C0)/K        （令 ω(T) = 0 解出）
   * ω0 = 15 rad/s 时大约 4.6 秒停下、转三圈多。 */
  var WHEEL_K = 0.55, WHEEL_C0 = 0.7;
  P.wheelMotion = {
    stopTime: function (w0) { return Math.log(1 + w0 * WHEEL_K / WHEEL_C0) / WHEEL_K; },
    speed: function (w0, t) { return (w0 + WHEEL_C0 / WHEEL_K) * Math.exp(-WHEEL_K * t) - WHEEL_C0 / WHEEL_K; },
    travel: function (w0, t) { return (w0 + WHEEL_C0 / WHEEL_K) * (1 - Math.exp(-WHEEL_K * t)) / WHEEL_K - WHEEL_C0 / WHEEL_K * t; }
  };

  JN.registerWidget({
    id: 'wheel',
    name: '转盘',
    rules: '拨一下转盘甩出去，或者点「转」。指针停在哪一格就是哪一格——转之前说好不许反悔，大人也一样。选项可以自己增删改。',
    mount: function (root, params, ctx) {
      var life = new Life();
      var names = loadNames(ctx);
      var custom = Array.isArray(params.items) && params.items.length >= 2
        ? params.items.slice(0, 12).map(function (s) { var o = parseItem(s); o.t = cleanText(o.t, 8) || '？'; return o; }) : null;
      var preset0 = custom ? 'custom' : (P.WHEEL[params.preset] ? params.preset : 'who');
      var preset = preset0;
      var opts = [];        // 当前的选项 [{ t 盘面上的词, d 说明 }]
      var slots = [];       // 盘面上的格子 [{ opt, label, color }]；选项太少时每项会画两三遍
      var seg = TAU;
      var theta = Math.random() * TAU, omega = 0, dir = 1, kick = 0, pulse = 0, dim = 1;
      var spinning = false, dragging = false, pid = null;
      var lastA = 0, moved = 0, samples = [], lastTick = 0, lastTickAt = 0;
      var win = -1, stopSpin = null, stopPulse = null, editor = null;

      var tabs = U.el('div.w-wheel-tabs');
      var canvas = U.el('canvas.w-wheel-canvas', { attrs: { role: 'img', 'aria-label': '转盘' } });
      var holder = U.el('div.w-wheel-holder', [canvas]);
      var titleEl = U.el('div.w-wheel-title');
      var resEl = U.el('div.w-wheel-res');
      var subEl = U.el('div.w-wheel-sub');
      var info = U.el('div.w-wheel-info', [titleEl, resEl, subEl]);
      var editBtn = btn('.jn-btn.jn-btn--ghost.w-wheel-edit', '改选项', openOptions);
      var spinBtn = btn('.jn-btn.jn-btn--lg.w-wheel-spin', '转！', function () { if (!spinning && !dragging) launch(0, 0); });
      var side = U.el('div.w-wheel-side', [info, U.el('div.w-wheel-bar', [editBtn, spinBtn])]);
      var box = U.el('div.w-wheel', [tabs, U.el('div.w-wheel-main', [holder, side])]);
      root.appendChild(box);
      var painter = WheelPainter(canvas, box);

      function defaults(p) {
        if (p === 'custom') return custom.map(function (o) { return { t: o.t, d: o.d }; });
        if (p === 'who') return names.slice(0, 3).map(function (n) { return { t: n, d: '' }; });
        return P.WHEEL[p].items.map(parseItem);
      }
      function storeKey(p) {
        if (p !== 'custom') return 'opt.' + p;
        var h = 0, s = custom.map(function (o) { return o.t; }).join('|');
        for (var i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
        return 'opt.c' + h.toString(36);
      }
      function loadOpts() {
        var saved = ctx.store.get(storeKey(preset), null);
        var ok = Array.isArray(saved) && saved.length >= 2 && saved.length <= 12 &&
          saved.every(function (o) { return o && typeof o.t === 'string' && cleanText(o.t, 8); });
        opts = ok ? saved.map(function (o) { return { t: cleanText(o.t, 8), d: typeof o.d === 'string' ? o.d : '' }; }) : defaults(preset);
      }
      function buildSlots() {
        var n = opts.length;
        var times = n === 2 ? 3 : n === 3 ? 2 : 1;   /* 选项太少时每项画两三遍，盘面才像个转盘；每项的机会仍然均等 */
        var total = n * times;
        var byPerson = preset === 'who' && n <= 4;
        slots = [];
        for (var k = 0; k < total; k++) {
          slots.push({
            opt: k % n, label: opts[k % n].t,
            color: byPerson ? painter.player(k % n) : painter.palette(k, total),
            hi: byPerson ? painter.player(k % n) : painter.palette(k, total, true)
          });
        }
        seg = TAU / total;
        lastTick = Math.floor(theta / seg);
        painter.setSlots(slots);
      }
      function title() {
        if (preset === preset0 && params.title) return String(params.title);
        return preset === 'custom' ? '转一转' : P.WHEEL[preset].title;
      }
      function redraw() { painter.draw(theta, { win: win, pulse: pulse, dim: dim, kick: kick, dir: dir }); }
      function showInfo() {
        titleEl.textContent = title();
        info.classList.toggle('has-res', win >= 0);
        if (win >= 0) {
          var o = opts[slots[win].opt];
          resEl.textContent = o.t;
          resEl.style.color = slots[win].hi;
          subEl.textContent = o.d || '说好的，不许反悔。';
        } else {
          resEl.textContent = spinning ? '……' : '';
          subEl.textContent = spinning ? '' : '拨一下转盘，或者点「转」';
        }
        spinBtn.textContent = win >= 0 ? '再转一次' : '转！';
      }
      function drawTabs() {
        U.clear(tabs);
        tabs.hidden = !!custom;
        if (custom) return;
        Object.keys(P.WHEEL).forEach(function (p) {
          tabs.appendChild(btn('.jn-chip.w-wheel-tab' + (p === preset ? '.is-on' : ''), P.WHEEL[p].name, function () { setPreset(p); }));
        });
      }
      function setBusy(b) {
        spinBtn.disabled = b;
        editBtn.disabled = b;
        box.classList.toggle('is-busy', b);
      }
      function clearResult() {
        win = -1;
        pulse = 0;
        dim = 1;
        if (stopPulse) { stopPulse(); stopPulse = null; }
      }
      function setPreset(p) {
        if (spinning || dragging || p === preset) return;
        preset = p;
        clearResult();
        loadOpts();
        buildSlots();
        drawTabs();
        showInfo();
        redraw();
        ctx.sfx('tap');
      }
      function layout() {
        var w = holder.clientWidth, h = holder.clientHeight;
        if (w < 40 || h < 40) return;
        painter.layout(Math.min(w, h, 460));
        redraw();
      }

      /* 指针每越过一条分界线，“哒”一声，指针被拨一下 */
      function tickCheck() {
        var k = Math.floor(theta / seg);
        if (k === lastTick) return;
        lastTick = k;
        kick = 1;
        var t = now();
        if (t - lastTickAt > 45) {
          lastTickAt = t;
          ctx.sfx('tick');
          if (Math.abs(omega) < 5) ctx.haptic(6);
        }
      }
      /** w：松手时的角速度（rad/s，顺时针为正）；moved：这次拖动一共转过的角度 */
      function launch(w, movedBy) {
        if (spinning || !slots.length) return;
        clearResult();
        dir = w < 0 && movedBy > 0.05 ? -1 : 1;
        /* 甩得再轻也给足速度，再乘一个随机数：谁也没法“轻轻拨到想要的那一格” */
        var speed = Math.min(Math.max(Math.abs(w), 10 + Math.random() * 7), 26) * (0.88 + Math.random() * 0.24);
        var M = P.wheelMotion;
        var T = M.stopTime(speed);
        var from = theta, to = theta + dir * M.travel(speed, T);
        spinning = true;
        setBusy(true);
        showInfo();
        ctx.sfx('whoosh');
        if (ctx.reduced) {
          theta = to;
          settle();
          return;
        }
        var t0 = now();
        stopSpin = life.loop(function () {
          var t = (now() - t0) / 1000;
          if (t >= T) {
            theta = to;
            settle();
            return false;
          }
          theta = from + dir * M.travel(speed, t);
          omega = dir * M.speed(speed, t);
          kick *= 0.82;
          tickCheck();
          redraw();
        });
      }
      function settle() {
        var n = slots.length;
        spinning = false;
        omega = 0;
        stopSpin = null;
        /* 正好停在分界线上时往格子里推一点，免得争“到底算哪一格” */
        var f = ((((-theta) % TAU) + TAU) % TAU) / seg;
        var frac = f - Math.floor(f);
        if (frac < 0.06) theta -= (0.06 - frac) * seg;
        else if (frac > 0.94) theta += (frac - 0.94) * seg;
        win = P.wheelIndex(theta, n);
        lastTick = Math.floor(theta / seg);
        setBusy(false);
        showInfo();
        replay(resEl, 'jn-pop');
        ctx.sfx('win');
        ctx.haptic([20, 40, 90]);
        ctx.confetti();
        ctx.done({ text: opts[slots[win].opt].t });
        kick = 0;
        pulse = 0;
        dim = 1;
        if (ctx.reduced) { redraw(); return; }
        var t0 = now();
        dim = 0;
        stopPulse = life.loop(function () {
          var e = (now() - t0) / 1000;
          dim = Math.min(1, e / 0.25);
          pulse = e < 1.5 ? 0.5 - 0.5 * Math.cos(e * 12) : 0;
          redraw();
          if (e >= 1.5) { stopPulse = null; return false; }
        });
      }

      /* 拖动：盘面跟着手指转，松手时按最后一小段的角速度甩出去 */
      function pointAngle(e) {
        var r = canvas.getBoundingClientRect(), gm = painter.geom();
        return { a: Math.atan2(e.clientY - r.top - gm.cy, e.clientX - r.left - gm.cx), d: Math.sqrt(Math.pow(e.clientX - r.left - gm.cx, 2) + Math.pow(e.clientY - r.top - gm.cy, 2)), R: gm.R };
      }
      function onDown(e) {
        if (spinning || dragging || editor) return;
        var p = pointAngle(e);
        if (p.d > p.R + 18) return;
        e.preventDefault();
        dragging = true;
        pid = e.pointerId;
        lastA = p.a;
        moved = 0;
        samples = [{ t: now(), a: theta }];
        try { canvas.setPointerCapture(pid); } catch (err) { /* 合成事件没有可捕获的指针 */ }
        clearResult();
        showInfo();
        redraw();
      }
      function onMove(e) {
        if (!dragging || e.pointerId !== pid) return;
        var a = pointAngle(e).a;
        var d = a - lastA;
        if (d > Math.PI) d -= TAU;
        else if (d < -Math.PI) d += TAU;
        lastA = a;
        theta += d;
        moved += Math.abs(d);
        dir = d < 0 ? -1 : 1;
        samples.push({ t: now(), a: theta });
        if (samples.length > 10) samples.shift();
        kick *= 0.6;
        tickCheck();
        redraw();
      }
      function onUp(e) {
        if (!dragging || e.pointerId !== pid) return;
        dragging = false;
        var t = now(), w = 0, lastS = samples[samples.length - 1];
        for (var i = 0; i < samples.length; i++) {
          if (t - samples[i].t <= 130) {          /* 最近 130 毫秒里的平均角速度 */
            var span = (lastS.t - samples[i].t) / 1000;
            if (span > 0.012) w = (lastS.a - samples[i].a) / span;
            break;
          }
        }
        launch(w, moved);
      }
      function openOptions() {
        if (editor || spinning || dragging) return;
        editor = openEditor(box, 'w-wheel', {
          title: '改选项', note: '2 到 12 项，每项最多 8 个字。改完会记住。',
          addable: true, min: 2, max: 12, maxLen: 8, placeholder: '写点什么',
          rows: opts.map(function (o) { return { text: o.t }; }),
          defaults: function () { return defaults(preset).map(function (o) { return { text: o.t }; }); },
          onDone: function (rows) {
            editor = null;
            var def = defaults(preset);
            var note = {};
            opts.concat(def).forEach(function (o) { if (o.d && !note[o.t]) note[o.t] = o.d; });   /* 词没改，说明就留着 */
            opts = rows.slice(0, 12).map(function (r) { return { t: r.text, d: note[r.text] || '' }; });
            var same = opts.length === def.length && opts.every(function (o, i) { return o.t === def[i].t; });
            ctx.store.set(storeKey(preset), same ? null : opts);
            clearResult();
            buildSlots();
            showInfo();
            redraw();
          }
        });
      }

      life.on(canvas, 'pointerdown', onDown);
      life.on(canvas, 'pointermove', onMove);
      life.on(canvas, 'pointerup', onUp);
      life.on(canvas, 'pointercancel', onUp);
      life.on(canvas, 'lostpointercapture', onUp);

      loadOpts();
      buildSlots();
      drawTabs();
      showInfo();
      watchSize(box, ctx, layout);

      return {
        destroy: function () {
          life.kill();
          if (editor) editor.close();
        }
      };
    },

    /* 卡片上的预览：自己转、自己停、亮出结果，再转 */
    preview: function (root, params, ctx) {
      var life = new Life();
      var names = loadNames(ctx);
      var preset = P.WHEEL[params.preset] ? params.preset : 'who';
      var opts = Array.isArray(params.items) && params.items.length >= 2 ? params.items.slice(0, 12).map(parseItem)
        : preset === 'who' ? names.slice(0, 3).map(function (n) { return { t: n, d: '' }; }) : P.WHEEL[preset].items.map(parseItem);
      var canvas = U.el('canvas');
      var resEl = U.el('div.w-wheel-pvres');
      var box = U.el('div.w-wheel-pv', [canvas, U.el('div.w-wheel-pvside', [U.el('div.w-wheel-pvtitle', { text: params.title || P.WHEEL[preset].title }), resEl])]);
      root.appendChild(box);
      var painter = WheelPainter(canvas, box);
      var n = opts.length, times = n === 2 ? 3 : n === 3 ? 2 : 1, total = n * times;
      var slots = [];
      var theta = 0.35, win = -1, hold = 0;

      function build() {
        slots = [];
        for (var k = 0; k < total; k++) {
          slots.push({ opt: k % n, label: opts[k % n].t, color: preset === 'who' && n <= 4 ? painter.player(k % n) : painter.palette(k, total) });
        }
        painter.setSlots(slots);
      }
      function show() {
        win = P.wheelIndex(theta, total);
        resEl.textContent = slots[win].label;
      }
      function paint() { painter.draw(theta, { win: win, pulse: win >= 0 ? 0.5 - 0.5 * Math.cos(hold * 9) : 0, dim: 1 }); }
      pvScale(box, ctx, function (s) {
        painter.layout(Math.max(60, Math.min(s.h - 6, s.w * 0.5)));
        build();
        paint();
      });
      if (ctx.reduced) { show(); paint(); } else {
        var M = P.wheelMotion;
        var w0 = 8, from = theta, t0 = now(), T = M.stopTime(w0);
        life.loop(function () {
          var t = (now() - t0) / 1000;
          if (t < T) theta = from + M.travel(w0, t);
          else if (win < 0) { theta = from + M.travel(w0, T); show(); }
          hold = Math.max(0, t - T);
          if (hold > 2.2) {                       /* 亮够了：换个速度再转 */
            win = -1;
            resEl.textContent = '';
            w0 = 7 + Math.random() * 4;
            from = theta;
            t0 = now();
            T = M.stopTime(w0);
            hold = 0;
          }
          paint();
        });
      }
      return { destroy: function () { life.kill(); } };
    }
  });

  /* ================================================================== *
   * whois 谁最可能：轮流悄悄投票，全部投完一起揭晓
   * params: { players: 3（2–4）, pack: 'mix'（默认）| 'daily' 日常糗事 | 'wild' 脑洞版 }
   * ================================================================== */
  JN.registerWidget({
    id: 'whois',
    name: '谁最可能',
    rules: '屏幕出一句“谁最可能……”。每个人轮流悄悄投一票（可以投自己），投完把手机递给下一位，全部投完再一起揭晓。得票最多的那位认了，并且讲一个真事。',
    mount: function (root, params, ctx) {
      var life = new Life();
      var names = loadNames(ctx);
      var n0 = U.clamp(parseInt(params.players, 10) || 3, 2, 4);
      var pool = [0, 1, 2, 3];
      var slots = validSlots(ctx.store.get('on.' + n0, null), pool, 2, 4) || defaultSlots(n0);
      var pack = params.pack === 'daily' || params.pack === 'wild' ? params.pack : 'mix';
      var list = pack === 'mix' ? P.WHOIS.daily.concat(P.WHOIS.wild) : P.WHOIS[pack];
      var crowns = {};        // 名单位置 -> 这一场里当选了几次
      var st = null;          // { q, votes: [第几位玩家…], phase: 'vote' | 'cover' | 'ready' | 'reveal', res }
      var editor = null;

      var whoEl = U.el('div.w-whois-who');
      var chip = btn('.jn-chip.w-whois-chip', '换人', openPlayers);
      var qEl = U.el('div.w-whois-q');
      var body = U.el('div.w-whois-body');
      var box = U.el('div.w-whois', [
        U.el('div.w-whois-head', [whoEl, chip]),
        U.el('div.w-whois-card', [U.el('div.w-whois-lead', { text: '谁最可能' }), qEl]),
        body
      ]);
      root.appendChild(box);
      watchSize(box, ctx);

      function nm(k) { return names[slots[k]]; }
      function colored(tag, k, text) {
        var node = U.el(tag, { text: text == null ? nm(k) : text });
        node.style.setProperty('--c', COLORS[slots[k]]);
        return node;
      }
      /* 抽一句最近没出过的；出过的记在 ctx.store 里，全部出完再从头来 */
      function nextQuestion() {
        var seen = ctx.store.get('seen.' + pack, []);
        if (!Array.isArray(seen)) seen = [];
        var fresh = U.range(list.length).filter(function (i) { return seen.indexOf(i) < 0; });
        if (!fresh.length) { seen = []; fresh = U.range(list.length); }
        var i = U.pick(fresh);
        ctx.store.set('seen.' + pack, seen.concat([i]));
        return list[i];
      }
      function newRound(keepQuestion) {
        st = { q: keepQuestion && st ? st.q : nextQuestion(), votes: [], phase: 'vote', res: null };
        render();
      }
      function render() {
        U.clear(whoEl);
        slots.forEach(function (s, k) {
          var done = st.phase !== 'reveal' && k < st.votes.length;
          whoEl.appendChild(colored('span.w-whois-p' + (done ? '.is-done' : ''), k));
        });
        chip.disabled = !(st.phase === 'reveal' || (st.phase === 'vote' && !st.votes.length));
        qEl.textContent = st.q + '？';
        U.clear(body);
        body.className = 'w-whois-body is-' + st.phase;
        if (st.phase === 'vote') viewVote();
        else if (st.phase === 'cover') viewCover();
        else if (st.phase === 'ready') viewReady();
        else viewReveal();
      }
      function viewVote() {
        var k = st.votes.length;
        var turn = colored('div.w-whois-turn', k, '');
        U.append(turn, ['轮到 ', U.el('b', { text: nm(k) }), '，悄悄点一个人']);
        var cands = U.el('div.w-whois-cands' + (slots.length > 3 ? '.is-grid' : ''));
        slots.forEach(function (s, j) {
          var b = btn('.w-whois-cand', '', function () { vote(j); });
          U.append(b, [U.el('i.w-whois-dot'), U.el('span', { text: nm(j) + (j === k ? (slots.length > 3 ? '（我）' : '（我自己）') : '') })]);
          b.style.setProperty('--c', COLORS[s]);
          cands.appendChild(b);
        });
        U.append(body, [turn, cands, k === 0 ? btn('.w-whois-link', '这句不好玩，换一句', function () { ctx.sfx('tap'); newRound(); }) : null]);
      }
      function vote(j) {
        if (st.phase !== 'vote') return;
        st.votes.push(j);
        st.phase = st.votes.length >= slots.length ? 'ready' : 'cover';
        ctx.sfx('tap');
        ctx.haptic(10);
        render();
      }
      function redo() {
        st.votes.pop();
        st.phase = 'vote';
        render();
      }
      function viewCover() {
        var k = st.votes.length;
        var who = colored('b', k);
        who.style.color = COLORS[slots[k]];
        U.append(body, [
          U.el('div.w-whois-big', ['投好了。把手机递给 ', who]),
          U.el('div.w-whois-note', { text: '其他人先别看屏幕' }),
          btn('.jn-btn.jn-btn--lg.w-whois-go', '我是' + nm(k), function () { st.phase = 'vote'; ctx.sfx('pop'); render(); }),
          btn('.w-whois-link', '点错了，让' + nm(k - 1) + '重投', redo)
        ]);
      }
      function viewReady() {
        U.append(body, [
          U.el('div.w-whois-big', { text: slots.length + ' 票都投完了' }),
          U.el('div.w-whois-note', { text: '把手机放到中间，一起看' }),
          btn('.jn-btn.jn-btn--lg.w-whois-go', '揭晓', reveal),
          btn('.w-whois-link', '点错了，让' + nm(slots.length - 1) + '重投', redo)
        ]);
      }
      function reveal() {
        if (st.phase !== 'ready') return;
        var counts = slots.map(function () { return 0; });
        st.votes.forEach(function (j) { counts[j]++; });
        st.res = P.whoisVerdict(slots.map(function (s) { return names[s]; }), counts);
        st.res.counts = counts;
        if (st.res.top.length === 1) crowns[slots[st.res.top[0]]] = (crowns[slots[st.res.top[0]]] || 0) + 1;
        st.phase = 'reveal';
        render();
        ctx.sfx('win');
        ctx.haptic([20, 40, 60]);
        if (st.res.top.length === 1 && counts[st.res.top[0]] === slots.length) ctx.confetti();
        ctx.done({ text: st.res.text });
      }
      function viewReveal() {
        var bars = U.el('div.w-whois-bars');
        slots.forEach(function (s, k) {
          var c = st.res.counts[k], top = st.res.top.indexOf(k) >= 0;
          var fillEl = U.el('i.w-whois-fill');
          fillEl.style.width = Math.round(c * 100 / slots.length) + '%';
          var row = colored('div.w-whois-row' + (top ? '.is-top' : ''), k, '');
          U.append(row, [U.el('span.w-whois-rn', { text: nm(k) }), U.el('span.w-whois-track', [fillEl]), U.el('span.w-whois-rc', { text: c + ' 票' })]);
          bars.appendChild(row);
        });
        var tally = U.el('div.w-whois-tally');
        var any = slots.some(function (s) { return crowns[s]; });
        if (any) {
          tally.appendChild(U.el('span', { text: '这一场当选：' }));
          slots.forEach(function (s, k) { if (crowns[s]) tally.appendChild(colored('b.w-whois-crown', k, nm(k) + ' ×' + crowns[s])); });
        }
        var cut = st.res.text.indexOf('。') + 1;
        U.append(body, [
          bars,
          U.el('div.w-whois-verdict', [
            U.el('b', { text: cut > 0 ? st.res.text.slice(0, cut) : st.res.text }),
            cut > 0 && cut < st.res.text.length ? U.el('span', { text: st.res.text.slice(cut) }) : null
          ]),
          tally,
          btn('.jn-btn.jn-btn--lg.jn-btn--block.w-whois-next', '下一句', function () { ctx.sfx('tap'); newRound(); })
        ]);
      }
      function openPlayers() {
        if (editor) return;
        editor = openEditor(box, 'w-whois', {
          title: '谁来玩', note: '2 到 4 个人。名字可以改。',
          toggle: true, minOn: 2, maxOn: 4, maxLen: 6,
          rows: pool.map(function (s) { return { text: names[s], on: slots.indexOf(s) >= 0, color: COLORS[s], fallback: NAME_DEFAULTS[s] }; }),
          onDone: function (rows) {
            editor = null;
            var on = [];
            rows.forEach(function (r, i) {
              names[pool[i]] = r.text;
              if (r.on) on.push(pool[i]);
            });
            names = saveNames(ctx, names);
            if (on.length >= 2 && on.join() !== slots.join()) {
              slots = on;
              ctx.store.set('on.' + n0, slots);
              newRound(st.phase !== 'reveal');
            } else render();
          }
        });
      }

      newRound();
      return {
        destroy: function () {
          life.kill();
          if (editor) editor.close();
        }
      };
    },

    /* 卡片上的预览：一句话、三条票数，谁的最长谁当选 */
    preview: function (root, params, ctx) {
      var life = new Life();
      var names = loadNames(ctx);
      var pack = params.pack === 'wild' ? 'wild' : 'daily';
      var list = P.WHOIS[pack];
      var SPLITS = [[2, 1, 0], [0, 0, 3], [1, 2, 0], [1, 1, 1], [0, 3, 0], [2, 0, 1]];
      var qEl = U.el('div.w-whois-pvq');
      var rowsEl = U.el('div.w-whois-pvrows');
      var box = U.el('div.w-whois-pv', [U.el('div.w-whois-pvleft', [U.el('div.w-whois-pvlead', { text: '谁最可能' }), qEl]), rowsEl]);
      var n = 0, fills = [], rows = [];
      root.appendChild(box);
      pvScale(box, ctx);
      [0, 1, 2].forEach(function (s) {
        var f = U.el('i.w-whois-pvfill');
        f.style.background = COLORS[s];
        var row = U.el('div.w-whois-pvrow', [U.el('span', { text: names[s] }), U.el('span.w-whois-pvtrack', [f])]);
        fills.push(f);
        rows.push(row);
        rowsEl.appendChild(row);
      });
      function scene(showNow) {
        var split = SPLITS[n % SPLITS.length];
        qEl.textContent = list[(n * 5) % list.length] + '？';
        n++;
        var max = Math.max.apply(null, split);
        fills.forEach(function (f, i) {
          f.style.width = showNow ? Math.round(split[i] * 100 / 3) + '%' : '0%';
          rows[i].classList.toggle('is-top', showNow && split[i] === max && max > 1);
        });
        return split;
      }
      if (ctx.reduced) scene(true);
      else {
        var split = scene(false), step = 0;
        life.every(function () {
          step++;
          if (step === 1) {
            var max = Math.max.apply(null, split);
            fills.forEach(function (f, i) {
              f.style.width = Math.round(split[i] * 100 / 3) + '%';
              rows[i].classList.toggle('is-top', split[i] === max && max > 1);
            });
          } else if (step >= 4) { step = 0; split = scene(false); }
        }, 800);
      }
      return { destroy: function () { life.kill(); } };
    }
  });

  /* ================================================================== *
   * scoreboard 球场计分板：带去球场用，字要巨大、按钮要好按、阳光下看得清（亮色大色块 + 深色大字）
   * params: { mode: 'score'（默认）| 'horse' | 'ft',
   *           target: 11 | 21 | 0（不限分）, word: '输了', players: 2, shots: 10 }
   * 三种模式的进度分开存在 ctx.store 里，关掉再打开，没打完的还在。
   * ================================================================== */
  var SB_MODES = [['score', '计分'], ['horse', '接龙'], ['ft', '罚球']];
  var SB_WORDS = ['输了', '请喝水', 'HORSE'];

  JN.registerWidget({
    id: 'scoreboard',
    name: '球场计分板',
    rules: '计分：点 +1 +2 +3，点错了撤销；可以设先到 11 分或 21 分获胜。接龙：谁投丢了就给谁记一个字，先凑满整个词的人出局。罚球：每人十投，点「进」或「没进」，自动算命中率和连中。关掉再打开，没打完的比分还在。',
    mount: function (root, params, ctx) {
      var life = new Life();
      var names = loadNames(ctx);
      var modeIds = SB_MODES.map(function (m) { return m[0]; });
      var mode = modeIds.indexOf(params.mode) >= 0 ? params.mode : ctx.store.get('mode', 'score');
      if (modeIds.indexOf(mode) < 0) mode = 'score';
      var shots = U.clamp(parseInt(params.shots, 10) || 10, 3, 20);
      var word0 = cleanText(params.word, 6) || '';
      var G = { score: null, horse: null, ft: null };   // 三种模式各自的进度
      var fresh = {};          // 罚球：这一轮谁破了个人纪录
      var before = {};         // 罚球：这一轮记纪录之前的旧纪录，撤销时用
      var armed = 0;           // 「清零 / 重来」要点两次，这是等第二次的计时器
      var resumed = {};        // 哪个模式这次是接着上回没打完的那一局
      var noteEl = null, noteTimer = 0;
      var editor = null;
      var digitEls = [];

      var seg = U.el('div.jn-seg.w-scoreboard-seg');
      var body = U.el('div.w-scoreboard-body');
      var box = U.el('div.w-scoreboard', [U.el('div.w-scoreboard-top', [seg]), body]);
      root.appendChild(box);

      /* ---------- 存取 ---------- */
      function save() { ctx.store.set('game.' + mode, G[mode]); }
      function isArr(a, n) { return Array.isArray(a) && (n == null || a.length === n); }
      function loadScore() {
        var s = ctx.store.get('game.score', null);
        var t = params.target === 21 || params.target === 0 ? params.target : 11;
        var st = P.score.create(t);
        if (s && isArr(s.s, 2) && isArr(s.hist) && isArr(s.names, 2) && s.s.every(function (x) { return typeof x === 'number' && x >= 0; })) {
          st.names = s.names.map(function (n, i) { return cleanText(n, 6) || st.names[i]; });
          if (s.target === 0 || s.target === 11 || s.target === 21) st.target = s.target;
          st.flip = !!s.flip;
          st.s = s.s.slice();
          st.hist = s.hist.filter(function (h) { return isArr(h, 2); });
          if (P.score.winner(st) >= 0) P.score.reset(st);     /* 上次已经分出胜负：开一局新的，队名和设置留着 */
          else if (st.s[0] + st.s[1] > 0) resumed.score = true;
        }
        return st;
      }
      function horseSlots() { return validSlots(ctx.store.get('on.horse', null), [0, 1, 2], 2, 3) || defaultSlots(U.clamp(parseInt(params.players, 10) || 2, 2, 3)); }
      function ftSlots() { return validSlots(ctx.store.get('on.ft', null), [0, 1, 2], 1, 3) || defaultSlots(U.clamp(parseInt(params.players, 10) || 2, 1, 3)); }
      function loadHorse() {
        var s = ctx.store.get('game.horse', null);
        if (s && isArr(s.slots) && s.slots.length >= 2 && isArr(s.got, s.slots.length) && isArr(s.hist) && typeof s.word === 'string' && s.word &&
            validSlots(s.slots, [0, 1, 2], 2, 3) && s.got.every(function (x) { return typeof x === 'number' && x >= 0; })) {
          var st = P.horse.create(s.slots, s.word);
          st.got = s.got.slice();
          st.hist = s.hist.slice();
          if (P.horse.winner(st) < 0 && st.hist.length) { resumed.horse = true; return st; }       /* 没打完的才接着来 */
          return P.horse.create(s.slots, word0 || s.word);
        }
        return P.horse.create(horseSlots(), word0 || SB_WORDS[0]);
      }
      function loadFt() {
        var s = ctx.store.get('game.ft', null);
        if (s && isArr(s.slots) && s.slots.length >= 1 && isArr(s.res, s.slots.length) && isArr(s.hist) && s.shots >= 3 && s.shots <= 20 &&
            validSlots(s.slots, [0, 1, 2], 1, 3) && s.res.every(function (r) { return isArr(r) && r.length <= s.shots; })) {
          var st = P.ft.create(s.slots, s.shots);
          st.res = s.res.map(function (r) { return r.map(function (x) { return x ? 1 : 0; }); });
          st.hist = s.hist.slice();
          st.cur = U.clamp(parseInt(s.cur, 10) || 0, 0, s.slots.length - 1);
          if (!P.ft.over(st) && st.hist.length) { resumed.ft = true; return st; }
          return P.ft.create(s.slots, shots);
        }
        return P.ft.create(ftSlots(), shots);
      }
      function game() {
        if (!G[mode]) G[mode] = mode === 'score' ? loadScore() : mode === 'horse' ? loadHorse() : loadFt();
        return G[mode];
      }

      /* ---------- 共用的按钮 ---------- */
      function disarm() { armed = life.cancel(armed); }
      function celebrate(text) {
        ctx.sfx('win');
        ctx.haptic([40, 60, 120]);
        ctx.confetti();
        ctx.done({ win: true, text: text });
      }
      function undo() {
        var st = game();
        var ok = mode === 'score' ? P.score.undo(st) : mode === 'horse' ? P.horse.undo(st) : P.ft.undo(st);
        if (!ok) return;
        if (mode === 'ft') { restoreBest(st.cur); delete fresh[st.cur]; }   /* 撤销后 cur 就是被撤回那一投的人 */
        disarm();
        save();
        ctx.sfx('tap');
        render();
      }
      function restart() {
        var st = game();
        if (mode === 'score') P.score.reset(st);
        else if (mode === 'horse') G.horse = P.horse.create(st.slots, st.word);
        else { G.ft = P.ft.create(st.slots, st.shots); fresh = {}; before = {}; }
        disarm();
        save();
        ctx.sfx('tap');
        render();
      }
      /** 「清零 / 重来」：比赛打到一半时要连点两次，免得手滑 */
      function resetBtn(label, busy) {
        var b = btn('.w-scoreboard-ctl' + (armed ? '.is-armed' : ''), armed ? '再点一次' : label, function () {
          if (!busy || armed) { restart(); return; }
          armed = life.after(function () { armed = 0; render(); }, 2500);
          ctx.sfx('tap');
          render();
        });
        return b;
      }
      function ctl(label, fn, disabled) {
        var b = btn('.w-scoreboard-ctl', label, fn);
        b.disabled = !!disabled;
        return b;
      }
      function overlay(big, small, isScore) {
        return U.el('div.w-scoreboard-over', [U.el('div.w-scoreboard-overbox', [
          U.el('div.w-scoreboard-overt', { text: big }),
          small ? U.el('div.w-scoreboard-overs' + (isScore ? '.is-num' : ''), { text: small }) : null,
          U.el('div.w-scoreboard-overb', [btn('.jn-btn.jn-btn--lg', '再来一局', restart), btn('.jn-btn.jn-btn--ghost.w-scoreboard-overundo', '撤销', undo)])
        ])]);
      }

      /* ---------- 计分 ---------- */
      function viewScore() {
        var st = game();
        var w = P.score.winner(st);
        var order = st.flip ? [1, 0] : [0, 1];
        digitEls = [];
        var teams = order.map(function (t) {
          var digits = U.el('div.w-scoreboard-digits', { text: String(st.s[t]) });
          digitEls[t] = digits;
          var adds = U.el('div.w-scoreboard-adds', [1, 2, 3].map(function (p) {
            var b = btn('.w-scoreboard-add', '+' + p, function () { addScore(t, p); }, { 'aria-label': st.names[t] + '加 ' + p + ' 分' });
            b.disabled = w >= 0;
            return b;
          }));
          var panel = U.el('section.w-scoreboard-team' + (w === t ? '.is-win' : ''), [btn('.w-scoreboard-name', st.names[t], renameTeams, { 'aria-label': '改队名：' + st.names[t] }), digits, adds]);
          panel.style.setProperty('--c', t === 0 ? 'var(--p1)' : 'var(--p2)');
          return panel;
        });
        var mid = U.el('div.w-scoreboard-mid', [
          ctl('撤销', undo, !st.hist.length),
          ctl('换边', function () { P.score.swap(st); save(); ctx.sfx('tap'); render(); }),
          ctl(st.target ? '先到 ' + st.target : '不限分', function () {
            st.target = st.target === 11 ? 21 : st.target === 21 ? 0 : 11;
            save();
            ctx.sfx('tap');
            render();
            var nw = P.score.winner(st);
            if (nw >= 0) celebrate(st.names[nw] + ' 赢了');
          }),
          resetBtn('清零', st.hist.length > 0 && w < 0)
        ]);
        var court = U.el('div.w-scoreboard-court', [teams[0], mid, teams[1]]);
        if (w >= 0) court.appendChild(overlay(st.names[w] + ' 赢了！', st.s[order[0]] + ' : ' + st.s[order[1]], true));
        body.appendChild(court);
      }
      function addScore(t, p) {
        var st = game();
        if (!P.score.add(st, t, p)) return;
        disarm();
        save();
        ctx.sfx('pop');
        ctx.haptic(12);
        render();
        if (digitEls[t]) replay(digitEls[t], 'jn-pop');
        var w = P.score.winner(st);
        if (w >= 0) celebrate(st.names[w] + ' 赢了 ' + st.s[w] + ' : ' + st.s[1 - w]);
      }
      function renameTeams() {
        if (editor) return;
        var st = game();
        editor = openEditor(box, 'w-scoreboard', {
          title: '改队名', maxLen: 6,
          rows: [0, 1].map(function (t) { return { text: st.names[t], color: t ? 'var(--p2)' : 'var(--p1)', fallback: t ? '蓝队' : '橙队' }; }),
          onDone: function (rows) {
            editor = null;
            rows.forEach(function (r, i) { if (i < 2) st.names[i] = r.text; });
            save();
            render();
          }
        });
      }

      /* ---------- 投篮接龙记字 ---------- */
      function viewHorse() {
        var st = game();
        var w = P.horse.winner(st);
        var L = chars(st.word);
        var rows = U.el('div.w-scoreboard-rows');
        st.slots.forEach(function (slot, i) {
          var out = P.horse.out(st, i);
          var letters = U.el('div.w-scoreboard-letters', L.map(function (ch, j) { return U.el('span' + (j < st.got[i] ? '.is-on' : ''), { text: ch }); }));
          var missBtn = btn('.w-scoreboard-miss', '', function () { missShot(i); }, { 'aria-label': names[slot] + '没进，记一个字' });
          U.append(missBtn, [U.el('b', { text: '没进' }), U.el('small', { text: '记一个字' })]);
          missBtn.disabled = out || w >= 0;
          var row = U.el('section.w-scoreboard-hrow' + (out ? '.is-out' : '') + (w === i ? '.is-win' : ''), [
            U.el('div.w-scoreboard-hinfo', [U.el('div.w-scoreboard-hname', { text: names[slot] + (out ? ' · 出局' : '') }), letters]),
            missBtn
          ]);
          row.style.setProperty('--c', COLORS[slot]);
          rows.appendChild(row);
        });
        var idle = !st.hist.length;
        var mid = U.el('div.w-scoreboard-mid', [
          ctl('撤销', undo, idle),
          ctl('换词', function () {
            var list = SB_WORDS.slice();
            if (word0 && list.indexOf(word0) < 0) list.unshift(word0);
            G.horse = P.horse.create(st.slots, list[(list.indexOf(st.word) + 1) % list.length]);
            save();
            ctx.sfx('tap');
            render();
          }, !idle),
          ctl('换人', openPlayers),
          resetBtn('重来', !idle && w < 0)
        ]);
        var court = U.el('div.w-scoreboard-court.is-horse', [rows, mid]);
        if (w >= 0) court.appendChild(overlay(names[st.slots[w]] + ' 赢了！', '别人都凑满了“' + st.word + '”'));
        body.appendChild(court);
      }
      function missShot(i) {
        var st = game();
        if (!P.horse.miss(st, i)) return;
        disarm();
        save();
        ctx.sfx(P.horse.out(st, i) ? 'bad' : 'pop');
        ctx.haptic(P.horse.out(st, i) ? [30, 40, 30] : 12);
        render();
        var w = P.horse.winner(st);
        if (w >= 0) celebrate(names[st.slots[w]] + ' 赢了');
      }

      /* ---------- 罚球赛 ---------- */
      function bestKey(slot, n) { return slot + ':' + n; }
      function bestOf(slot, n) {
        var all = ctx.store.get('ftBest', {});
        var b = all && all[bestKey(slot, n)];
        return b && typeof b.made === 'number' ? b : null;
      }
      function allBest() {
        var all = ctx.store.get('ftBest', {});
        return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
      }
      /** 一个人投完了：命中数或最长连中超过以前，就记进 ctx.store。返回是不是破了纪录。 */
      function recordBest(slot, st, i) {
        var s = P.ft.stats(st.res[i]);
        var all = allBest();
        var key = bestKey(slot, st.shots);
        var old = all[key] && typeof all[key].made === 'number' ? all[key] : null;
        before[i] = { key: key, old: old };          /* 万一最后一投是点错的，撤销时把纪录也还原 */
        all[key] = { made: Math.max(s.made, old ? old.made : 0), streak: Math.max(s.best, old && old.streak ? old.streak : 0) };
        ctx.store.set('ftBest', all);
        return !!old && s.made > old.made;
      }
      function restoreBest(i) {
        var b = before[i];
        if (!b) return;
        var all = allBest();
        if (b.old) all[b.key] = b.old; else delete all[b.key];
        ctx.store.set('ftBest', all);
        delete before[i];
      }
      function viewFt() {
        var st = game();
        var over = P.ft.over(st);
        var tabs = U.el('div.w-scoreboard-tabs');
        st.slots.forEach(function (slot, i) {
          var s = P.ft.stats(st.res[i]);
          var t = btn('.w-scoreboard-tab' + (i === st.cur && !over ? '.is-on' : ''), '', function () {
            if (P.ft.finished(st, i) || st.cur === i) return;
            st.cur = i;
            save();
            ctx.sfx('tap');
            render();
          });
          U.append(t, [U.el('b', { text: names[slot] }), U.el('span', { text: s.made + '/' + s.att })]);
          t.style.setProperty('--c', COLORS[slot]);
          tabs.appendChild(t);
        });
        var main;
        if (over) {
          var lead = P.ft.leaders(st);
          var head = st.slots.length === 1 ? names[st.slots[0]] + ' 投完了'
            : lead.length === 1 ? names[st.slots[lead[0]]] + ' 赢了！' : '打平了，加赛一轮？';
          var list = U.el('div.w-scoreboard-ftres');
          st.slots.forEach(function (slot, i) {
            var s = P.ft.stats(st.res[i]);
            var row = U.el('div.w-scoreboard-ftrow' + (lead.indexOf(i) >= 0 ? '.is-top' : ''), [
              U.el('b', { text: names[slot] }),
              U.el('span.w-scoreboard-ftbig', { text: s.made + '/' + st.shots }),
              U.el('span', { text: s.pct + '% · 最长连中 ' + s.best }),
              fresh[i] ? U.el('em', { text: '新纪录' }) : null
            ]);
            row.style.setProperty('--c', COLORS[slot]);
            list.appendChild(row);
          });
          main = U.el('div.w-scoreboard-ftmain.is-over', [
            U.el('div.w-scoreboard-fthead', { text: head }),
            list,
            btn('.jn-btn.jn-btn--lg.jn-btn--block', '再来一轮', restart)
          ]);
        } else {
          var i = st.cur, slot = st.slots[i], s = P.ft.stats(st.res[i]), best = bestOf(slot, st.shots);
          var dots = U.el('div.w-scoreboard-dots');
          for (var k = 0; k < st.shots; k++) {
            dots.appendChild(U.el('i' + (k < st.res[i].length ? (st.res[i][k] ? '.is-in' : '.is-miss') : k === st.res[i].length ? '.is-next' : '')));
          }
          main = U.el('div.w-scoreboard-ftmain', [
            U.el('div.w-scoreboard-ftinfo', [
              U.el('div.w-scoreboard-fthead', { text: names[slot] + ' · 第 ' + (s.att + 1) + ' 投' }),
              dots,
              U.el('div.w-scoreboard-ftstat', [
                U.el('span', [U.el('b', { text: s.made + '/' + s.att }), '命中']),
                U.el('span', [U.el('b', { text: s.att ? s.pct + '%' : '–' }), '命中率']),
                U.el('span', [U.el('b', { text: String(s.streak) }), '连中'])
              ]),
              U.el('div.w-scoreboard-ftbest', { text: best ? '个人纪录 ' + best.made + '/' + st.shots + (best.streak ? ' · 最长连中 ' + best.streak : '') : '投完 ' + st.shots + ' 个，记下个人纪录' })
            ]),
            U.el('div.w-scoreboard-ftbtns', [
              btn('.w-scoreboard-in', '进', function () { shoot(1); }),
              btn('.w-scoreboard-out', '没进', function () { shoot(0); })
            ])
          ]);
          main.style.setProperty('--c', COLORS[slot]);
        }
        var mid = U.el('div.w-scoreboard-mid', [
          ctl('撤销', undo, !st.hist.length),
          ctl('换人', openPlayers),
          resetBtn('重来', st.hist.length > 0 && !over)
        ]);
        body.appendChild(U.el('div.w-scoreboard-court.is-ft', [tabs, main, mid]));
      }
      function shoot(made) {
        var st = game();
        var i = st.cur;
        if (!P.ft.shoot(st, made)) return;
        disarm();
        ctx.sfx(made ? 'good' : 'tap');
        ctx.haptic(made ? 20 : 8);
        if (P.ft.finished(st, i)) fresh[i] = recordBest(st.slots[i], st, i);
        save();
        render();
        if (P.ft.over(st)) {
          var lead = P.ft.leaders(st);
          var s = P.ft.stats(st.res[lead[0]]);
          celebrate((lead.length === 1 ? names[st.slots[lead[0]]] + ' ' : '并列 ') + s.made + '/' + st.shots);
        }
      }
      function openPlayers() {
        if (editor) return;
        var st = game();
        var isFt = mode === 'ft';
        editor = openEditor(box, 'w-scoreboard', {
          title: '谁上场', note: (isFt ? '1 到 3 个人。' : '2 到 3 个人。') + '名字可以改；换了人，这一局重新开始。',
          toggle: true, minOn: isFt ? 1 : 2, maxOn: 3, maxLen: 6,
          rows: [0, 1, 2].map(function (s) { return { text: names[s], on: st.slots.indexOf(s) >= 0, color: COLORS[s], fallback: NAME_DEFAULTS[s] }; }),
          onDone: function (rows) {
            editor = null;
            var on = [];
            rows.forEach(function (r, i) {
              names[i] = r.text;
              if (r.on) on.push(i);
            });
            names = saveNames(ctx, names);
            if (on.length >= (isFt ? 1 : 2) && on.join() !== st.slots.join()) {
              ctx.store.set('on.' + mode, on);
              if (isFt) { G.ft = P.ft.create(on, st.shots); fresh = {}; before = {}; } else G.horse = P.horse.create(on, st.word);
              save();
            }
            render();
          }
        });
      }

      /* ---------- 版面 ---------- */
      function fit() {
        var el, w, h;
        if (mode === 'score') {
          el = digitEls[0] || digitEls[1];
          if (!el) return;
          w = el.clientWidth;
          h = el.clientHeight;
          var len = Math.max(2, String(Math.max(G.score.s[0], G.score.s[1])).length);
          /* 数字越大越好：数字没有下伸部分，字高约是字号的 0.72，所以字号可以比格子高出两成；
             同时两位数（三位数）要横着放得下，一个数字大约 0.62 个字宽 */
          body.style.setProperty('--w-scoreboard-fs', Math.max(40, Math.floor(Math.min(h * 1.2, w * 0.92 / (0.62 * len)))) + 'px');
        } else if (mode === 'horse') {
          el = body.querySelector('.w-scoreboard-hinfo');
          if (!el) return;
          w = el.clientWidth;
          h = el.clientHeight;
          /* 这个词横着要放得下：一个汉字约 1.12 个字宽（含间隔），一个字母约 0.8 个 */
          var need = 0;
          chars(G.horse.word).forEach(function (ch) { need += ch.charCodeAt(0) > 0x2e7f ? 1.12 : 0.8; });
          body.style.setProperty('--w-scoreboard-fs', Math.max(22, Math.floor(Math.min((h - 30) * 0.8, (w - 8) / Math.max(2.24, need)))) + 'px');
        }
      }
      function render() {
        U.clear(seg);
        SB_MODES.forEach(function (m) {
          seg.appendChild(btn(m[0] === mode ? '.is-on' : '', m[1], function () {
            if (mode === m[0]) return;
            disarm();
            mode = m[0];
            ctx.store.set('mode', mode);
            ctx.sfx('tap');
            render();
          }));
        });
        U.clear(body);
        box.setAttribute('data-mode', mode);
        if (mode === 'score') viewScore();
        else if (mode === 'horse') viewHorse();
        else viewFt();
        fit();
        if (resumed[mode]) {
          resumed[mode] = false;
          note('接着上次没打完的这一局');
        }
      }
      /* 顶上浮一句话，三秒多以后自己消失（比如：告诉人这是接着上回的比分，不是出错了） */
      function note(text) {
        noteTimer = life.cancel(noteTimer);
        if (noteEl && noteEl.parentNode) noteEl.parentNode.removeChild(noteEl);
        noteEl = U.el('div.w-scoreboard-note', { text: text, attrs: { role: 'status' } });
        box.appendChild(noteEl);
        noteTimer = life.after(function () {
          noteTimer = 0;
          if (noteEl && noteEl.parentNode) noteEl.parentNode.removeChild(noteEl);
          noteEl = null;
        }, 3600);
      }

      render();
      watchSize(box, ctx, fit);
      return {
        destroy: function () {
          life.kill();
          if (editor) editor.close();
        }
      };
    },

    /* 卡片上的预览：比分自己往上跳（接龙是字一个个亮，罚球是圆点一个个填） */
    preview: function (root, params, ctx) {
      var life = new Life();
      var names = loadNames(ctx);
      var mode = ['score', 'horse', 'ft'].indexOf(params.mode) >= 0 ? params.mode : 'score';
      var box = U.el('div.w-scoreboard-pv.is-' + mode);
      var step = 0, tick;
      root.appendChild(box);
      pvScale(box, ctx);

      if (mode === 'score') {
        var SEQ = [[0, 2], [1, 3], [0, 2], [1, 2], [0, 3], [1, 1], [0, 2], [1, 2], [0, 2]];   // 橙队 2+2+3+2+2 = 11，蓝队 8
        var sc = [0, 0];
        var els = [0, 1].map(function (t) {
          var d = U.el('b', { text: '0' });
          var p = U.el('div.w-scoreboard-pvteam', [d]);
          p.style.setProperty('--c', t ? 'var(--p2)' : 'var(--p1)');
          box.appendChild(p);
          return d;
        });
        var show = function () { els[0].textContent = sc[0]; els[1].textContent = sc[1]; };
        tick = function () {
          if (step >= SEQ.length + 3) { step = 0; sc = [0, 0]; show(); return; }
          if (step < SEQ.length) {
            sc[SEQ[step][0]] += SEQ[step][1];
            show();
            replay(els[SEQ[step][0]], 'jn-pop');
          }
          step++;
        };
        if (ctx.reduced) { sc = [9, 8]; show(); }
      } else if (mode === 'horse') {
        var L = chars(cleanText(params.word, 6) || SB_WORDS[0]);
        var MISS = [];
        for (var q = 0; q < L.length * 2 - 1; q++) MISS.push(q % 2);          // 轮流丢，最后是 0 号先凑满
        var got = [0, 0];
        var spans = [0, 2].map(function (slot, i) {
          var letters = L.map(function (ch) { return U.el('span', { text: ch }); });
          var row = U.el('div.w-scoreboard-pvrow', [U.el('b', { text: names[slot] }), U.el('div.w-scoreboard-pvletters', letters)]);
          row.style.setProperty('--c', COLORS[slot]);
          box.appendChild(row);
          return letters;
        });
        var paint = function () { spans.forEach(function (ls, i) { ls.forEach(function (sp, j) { sp.classList.toggle('is-on', j < got[i]); }); }); };
        tick = function () {
          if (step >= MISS.length + 3) { step = 0; got = [0, 0]; paint(); return; }
          if (step < MISS.length) { got[MISS[step]]++; paint(); }
          step++;
        };
        if (ctx.reduced) { got = [1, 0]; paint(); }
      } else {
        var SHOTS = [1, 1, 0, 1, 1, 1, 0, 1, 1, 1];
        var dots = SHOTS.map(function () { return U.el('i'); });
        var sum = U.el('b.w-scoreboard-pvsum', { text: '0/0' });
        U.append(box, [U.el('div.w-scoreboard-pvdots', dots), sum]);
        var fillTo = function (n) {
          var made = 0;
          dots.forEach(function (d, i) {
            d.className = i < n ? (SHOTS[i] ? 'is-in' : 'is-miss') : '';
            if (i < n && SHOTS[i]) made++;
          });
          sum.textContent = made + '/' + n;
        };
        tick = function () {
          if (step > SHOTS.length + 3) step = 0;
          fillTo(Math.min(step, SHOTS.length));
          step++;
        };
        if (ctx.reduced) fillTo(7);
      }
      if (!ctx.reduced) life.every(tick, mode === 'ft' ? 420 : 650);
      return { destroy: function () { life.kill(); } };
    }
  });

  /* ================================================================== *
   * timer 挑战计时器：一个大圆环倒计时（或秒表）
   * params: { seconds: 120, challenge: '顶上显示的挑战内容', mode: 'countdown'（默认）| 'stopwatch' }
   * 没给 challenge 时从内置的三十条“两分钟挑战”里随机一条，可以「换一条」。
   * ================================================================== */
  var RING_C = TAU * 88;      // 圆环的周长（半径 88，画在 200×200 的视口里）
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /** 倒计时显示用“向上取整”的秒：刚开始是 2:00，最后一秒显示 0:01，归零的那一刻才是 0:00 */
  function ceilSecs(ms) { return Math.max(0, Math.ceil(ms / 1000 - 1e-6)); }
  function fmtClock(secs) { return Math.floor(secs / 60) + ':' + pad2(secs % 60); }
  /** 秒表：分:秒.百分秒 */
  function fmtSw(ms) {
    var cs = Math.floor(Math.max(0, ms) / 10);
    return Math.floor(cs / 6000) + ':' + pad2(Math.floor(cs / 100) % 60) + '.' + pad2(cs % 100);
  }
  /** 圆环。f 是 0–1 的比例。倒计时：剩下的弧从 12 点方向被顺时针“吃掉”；秒表：弧从 12 点方向顺时针长出来。
   *  圆的路径经过 rotate(-90) scale(1,-1) 之后是“从 12 点出发、逆时针走”，所以：
   *  倒计时取路径的前 f 段；秒表取路径的最后 f 段（用负的 dashoffset 把起点往前挪）。 */
  function setRing(circle, f, clockwise) {
    f = U.clamp(f, 0, 1);
    circle.style.opacity = f < 0.004 ? '0' : '1';
    circle.setAttribute('stroke-dasharray', (f * RING_C).toFixed(1) + ' ' + (RING_C + 4).toFixed(1));
    circle.setAttribute('stroke-dashoffset', clockwise ? (-(1 - f) * RING_C).toFixed(1) : '0');
  }
  function makeRing() {
    var prog = U.svg('circle', { class: 'w-timer-prog', r: 88, cx: 0, cy: 0, transform: 'rotate(-90) scale(1 -1)' });
    var svg = U.svg('svg', { class: 'w-timer-ring', viewBox: '-100 -100 200 200', 'aria-hidden': 'true' }, [
      U.svg('circle', { class: 'w-timer-track', r: 88, cx: 0, cy: 0 }),
      prog
    ]);
    return { svg: svg, prog: prog };
  }

  JN.registerWidget({
    id: 'timer',
    name: '挑战计时器',
    rules: '倒计时：看清顶上的挑战，点「开始」。可以暂停、加 10 秒；提前做到了就点「提前完成」。最后 10 秒会变色、滴答，时间到会响。秒表：点「开始」计时，「记圈」记下每一段。',
    mount: function (root, params, ctx) {
      var life = new Life();
      var mode = params.mode === 'stopwatch' ? 'stopwatch' : 'countdown';
      var given = cleanText(params.challenge, 60);
      var givenSec = parseInt(params.seconds, 10);
      givenSec = givenSec >= 5 && givenSec <= 3600 ? givenSec : 0;
      var chal = null;           // 倒计时眼下的挑战 { text, sec, builtin }
      var phase = 'idle';        // idle | run | pause | ask（时间到，问完成没有）| done
      var total = 0, left = 0, endAt = 0, lastSec = -1, result = '', used = 0;
      var sw = { phase: 'idle', elapsed: 0, startAt: 0, laps: [], reported: false };
      var stopLoop = null;

      var seg = U.el('div.jn-seg.w-timer-seg');
      var chText = U.el('div.w-timer-chtext');
      var swapBtn = btn('.jn-chip.w-timer-swap', '换一条', function () { nextChallenge(); });
      var ringParts = makeRing();
      var timeEl = U.el('div.w-timer-time');
      var hintEl = U.el('div.w-timer-hint');
      var ringBox = U.el('div.w-timer-ringbox', [ringParts.svg, U.el('div.w-timer-center', [timeEl, hintEl])]);
      var lapsEl = U.el('div.w-timer-laps');
      var askEl = U.el('div.w-timer-ask');
      var ctlEl = U.el('div.w-timer-ctl');
      var box = U.el('div.w-timer', [
        U.el('div.w-timer-top', [seg]),
        U.el('div.w-timer-ch', [chText, swapBtn]),
        ringBox, lapsEl, askEl, ctlEl
      ]);
      root.appendChild(box);

      /* ---------- 挑战 ---------- */
      function builtin() {
        var seen = ctx.store.get('seen', []);
        if (!Array.isArray(seen)) seen = [];
        var freshIdx = U.range(P.CHALLENGES.length).filter(function (i) { return seen.indexOf(i) < 0; });
        if (!freshIdx.length) { seen = []; freshIdx = U.range(P.CHALLENGES.length); }
        var i = U.pick(freshIdx);
        ctx.store.set('seen', seen.concat([i]));
        return { text: P.CHALLENGES[i], sec: 120, builtin: true };     /* 内置的都是两分钟挑战 */
      }
      function firstChallenge() {
        if (given) return { text: given, sec: givenSec || 120, builtin: false };
        if (givenSec && givenSec !== 120) return { text: '', sec: givenSec, builtin: false };   /* 只给了时长：一个干净的倒计时 */
        return builtin();
      }
      function nextChallenge() {
        if (mode !== 'countdown' || phase === 'run' || phase === 'pause' || phase === 'ask') return;
        chal = builtin();
        ctx.sfx('tap');
        reset();
      }

      /* ---------- 画 ---------- */
      function curLeft() { return phase === 'run' ? Math.max(0, endAt - now()) : left; }
      function swElapsed() { return sw.elapsed + (sw.phase === 'run' ? now() - sw.startAt : 0); }
      function paint() {
        if (mode === 'countdown') {
          var ms = curLeft();
          var secs = ceilSecs(ms);
          timeEl.textContent = fmtClock(secs);
          setRing(ringParts.prog, total ? ms / total : 0, false);
          box.classList.toggle('is-hot', phase === 'ask' || ((phase === 'run' || phase === 'pause') && secs <= 10));
          hintEl.textContent = phase === 'idle' ? '点「开始」' : phase === 'pause' ? '暂停中'
            : phase === 'ask' ? '时间到！' : phase === 'done' ? (result === 'win' ? '漂亮！' : '差一点') : (secs <= 10 ? '最后 ' + secs + ' 秒' : '');
        } else {
          var e = swElapsed();
          timeEl.textContent = fmtSw(e);
          setRing(ringParts.prog, (e % 60000) / 60000, true);
          box.classList.remove('is-hot');
          hintEl.textContent = sw.phase === 'idle' ? '点「开始」' : sw.phase === 'pause' ? '暂停中' : (sw.laps.length ? '第 ' + (sw.laps.length + 1) + ' 圈' : '');
        }
      }
      function loop() {
        if (stopLoop) stopLoop();
        stopLoop = life.loop(function () {
          if (mode === 'countdown') {
            if (phase !== 'run') { stopLoop = null; return false; }
            var ms = curLeft();
            var secs = ceilSecs(ms);
            if (secs !== lastSec) {
              if (secs <= 10 && secs > 0) { ctx.sfx('tick'); ctx.haptic(8); }
              lastSec = secs;
            }
            if (ms <= 0) { stopLoop = null; timeUp(); return false; }
          } else if (sw.phase !== 'run') { stopLoop = null; return false; }
          paint();
        });
      }
      function halt() {
        if (stopLoop) { stopLoop(); stopLoop = null; }
      }
      function fitRing() {
        var size = Math.floor(Math.min(ringBox.clientWidth, ringBox.clientHeight));
        if (size < 40) return;
        ringParts.svg.style.width = ringParts.svg.style.height = size + 'px';
        box.style.setProperty('--w-timer-fs', Math.round(size * (mode === 'stopwatch' ? 0.17 : 0.27)) + 'px');
      }

      /* ---------- 倒计时 ---------- */
      function start() {
        if (phase !== 'idle' && phase !== 'pause') return;
        if (left <= 0) return;
        endAt = now() + left;
        lastSec = ceilSecs(left);
        phase = 'run';
        ctx.sfx('pop');
        renderCtl();
        loop();
      }
      function pause() {
        if (phase !== 'run') return;
        left = curLeft();
        phase = 'pause';
        halt();
        ctx.sfx('tap');
        renderCtl();
      }
      function reset() {
        halt();
        phase = 'idle';
        result = '';
        total = left = chal.sec * 1000;
        lastSec = -1;
        renderAll();
      }
      function addTen() {
        if (!(phase === 'idle' || phase === 'run' || phase === 'pause') || total >= 3600000) return;
        if (phase === 'run') endAt += 10000; else left += 10000;
        total += 10000;                    /* 圆环按加长后的总时间算，不会一下子“满出来” */
        ctx.sfx('tap');
        paint();
      }
      function timeUp() {
        left = 0;
        phase = 'ask';
        ctx.sfx('buzz');
        ctx.haptic([300, 120, 300, 120, 500]);
        life.after(function () { if (phase === 'ask') ctx.sfx('buzz'); }, 420);
        replay(ringBox, 'jn-shake');
        renderCtl();
      }
      function answer(ok) {
        if (phase !== 'run' && phase !== 'pause' && phase !== 'ask') return;
        var early = phase !== 'ask';
        left = curLeft();
        used = total - left;
        halt();
        phase = 'done';
        result = ok ? 'win' : 'miss';
        if (ok) {
          ctx.sfx('win');
          ctx.haptic([30, 50, 90]);
          ctx.confetti();
        } else ctx.sfx('tap');
        ctx.done({ win: ok, text: ok ? (early ? '提前完成，用时 ' + U.fmtTime(used) : '挑战完成') : '差一点' });
        renderCtl();
      }

      /* ---------- 秒表 ---------- */
      function swToggle() {
        if (sw.phase === 'run') {
          sw.elapsed = swElapsed();
          sw.phase = 'pause';
          halt();
          ctx.sfx('tap');
          if (!sw.reported && sw.elapsed >= 1000) {
            sw.reported = true;
            ctx.done({ text: '用时 ' + fmtSw(sw.elapsed) });
          }
        } else {
          sw.startAt = now();
          sw.phase = 'run';
          ctx.sfx('pop');
          loop();
        }
        renderCtl();
      }
      function swLap() {
        if (sw.phase !== 'run' || sw.laps.length >= 99) return;
        sw.laps.push(swElapsed());
        ctx.sfx('tick');
        ctx.haptic(10);
        renderLaps();
        paint();
      }
      function swReset() {
        halt();
        sw = { phase: 'idle', elapsed: 0, startAt: 0, laps: [], reported: false };
        ctx.sfx('tap');
        renderAll();
      }
      function renderLaps() {
        U.clear(lapsEl);
        if (!sw.laps.length) {
          lapsEl.appendChild(U.el('div.w-timer-lapnone', { text: '跑起来以后点「记圈」，每一段都会记在这里' }));
          return;
        }
        for (var i = sw.laps.length - 1; i >= 0; i--) {
          lapsEl.appendChild(U.el('div.w-timer-lap', [
            U.el('span', { text: '第 ' + (i + 1) + ' 圈' }),
            U.el('b', { text: fmtSw(sw.laps[i] - (i ? sw.laps[i - 1] : 0)) }),
            U.el('span', { text: '累计 ' + fmtSw(sw.laps[i]) })
          ]));
        }
      }

      /* ---------- 按钮 ---------- */
      function big(label, fn, primary) { return btn('.jn-btn.jn-btn--lg.w-timer-main' + (primary ? '' : '.jn-btn--light'), label, fn); }
      function small(label, fn, disabled) {
        var b = btn('.jn-btn.jn-btn--ghost.w-timer-side', label, fn);
        b.disabled = !!disabled;
        return b;
      }
      function renderCtl() {
        U.clear(askEl);
        U.clear(ctlEl);
        box.setAttribute('data-phase', mode === 'countdown' ? phase : sw.phase);
        if (mode === 'stopwatch') {
          U.append(ctlEl, [small('重置', swReset, sw.phase === 'idle'), big(sw.phase === 'run' ? '暂停' : sw.phase === 'pause' ? '继续' : '开始', swToggle, sw.phase !== 'run'), small('记圈', swLap, sw.phase !== 'run')]);
        } else if (phase === 'ask') {
          askEl.appendChild(U.el('div.w-timer-asktext', { text: '时间到，完成了吗？' }));
          U.append(ctlEl, [small('差一点', function () { answer(false); }), big('完成了！', function () { answer(true); }, true)]);
        } else if (phase === 'done') {
          askEl.appendChild(U.el('div.w-timer-asktext', { text: result === 'win' ? '挑战完成，用时 ' + U.fmtTime(used) + '。' : '差一点。再来一次？' }));
          U.append(ctlEl, [small('换一条', nextChallenge), big('再来一次', function () { ctx.sfx('tap'); reset(); }, true)]);
        } else {
          if (phase !== 'idle') askEl.appendChild(btn('.jn-btn.w-timer-early', '提前完成了！', function () { answer(true); }));
          else askEl.appendChild(U.el('div.w-timer-asktext.is-quiet', { text: chal.text ? '看清楚挑战，准备好了就开始' : '准备好了就开始' }));
          U.append(ctlEl, [small('重置', function () { ctx.sfx('tap'); reset(); }, phase === 'idle' && left === chal.sec * 1000),
            big(phase === 'run' ? '暂停' : phase === 'pause' ? '继续' : '开始', phase === 'run' ? pause : start, phase !== 'run'),
            small('+10 秒', addTen)]);
        }
        swapBtn.hidden = !(mode === 'countdown' && phase === 'idle');     /* 做完以后「换一条」在下面那排按钮里 */
        paint();
      }
      function renderAll() {
        U.clear(seg);
        [['countdown', '倒计时'], ['stopwatch', '秒表']].forEach(function (m) {
          seg.appendChild(btn(m[0] === mode ? '.is-on' : '', m[1], function () {
            if (mode === m[0]) return;
            if (phase === 'run') pause();                 /* 切走之前先把正在走的表停住 */
            if (sw.phase === 'run') swToggle();
            mode = m[0];
            ctx.sfx('tap');
            renderAll();
          }));
        });
        box.setAttribute('data-mode', mode);
        if (mode === 'countdown') {
          chText.textContent = chal.text || '倒计时 ' + fmtClock(chal.sec);
          swapBtn.textContent = chal.builtin ? '换一条' : '来条两分钟挑战';
        } else {
          chText.textContent = given || '秒表：比谁快，还是比谁久，你们定';
          renderLaps();
        }
        lapsEl.hidden = mode !== 'stopwatch';
        askEl.hidden = mode === 'stopwatch';
        renderCtl();
        fitRing();
      }

      chal = firstChallenge();
      total = left = chal.sec * 1000;
      renderAll();
      watchSize(box, ctx, fitRing);
      return { destroy: function () { life.kill(); } };
    },

    /* 卡片上的预览：圆环从十秒走到零，变红，再来 */
    preview: function (root, params, ctx) {
      var life = new Life();
      var stopwatch = params.mode === 'stopwatch';
      var ringParts = makeRing();
      var timeEl = U.el('div.w-timer-pvtime');
      var text = cleanText(params.challenge, 60) || (stopwatch ? '秒表' : P.CHALLENGES[0]);
      var box = U.el('div.w-timer-pv', [
        U.el('div.w-timer-pvring', [ringParts.svg, timeEl]),
        U.el('div.w-timer-pvtext', { text: text })
      ]);
      root.appendChild(box);
      pvScale(box, ctx);
      function show(t) {            // t：这一轮演到第几秒
        if (stopwatch) {
          timeEl.textContent = fmtSw(t * 1000).slice(0, -1);
          setRing(ringParts.prog, (t % 12) / 12, true);
        } else {
          var leftMs = Math.max(0, 12 - t) * 1000;
          timeEl.textContent = fmtClock(ceilSecs(leftMs));
          setRing(ringParts.prog, leftMs / 12000, false);
          box.classList.toggle('is-hot', leftMs <= 5000);
        }
      }
      if (ctx.reduced) show(4);
      else {
        var t0 = now();
        life.loop(function () {
          var t = (now() - t0) / 1000;
          if (t > 13.5) { t0 = now(); t = 0; }
          show(Math.min(t, 12));
        });
      }
      return { destroy: function () { life.kill(); } };
    }
  });

  /* ================================================================== *
   * sketch 你画我猜
   * params: { category: 'mix'（默认）| 'basketball' | 'animal' | 'food' | 'action' | 'thing' | 'english',
   *           seconds: 60, players: 3（2–3）, turns: 每人画几次（默认两个人各 3 次、三个人各 2 次） }
   * ================================================================== */

  /** 画板。一笔一笔存下来（撤销、改变大小时重画）；画的时候只补最新的一小段，所以跟手。
   *  每一笔记着落笔时画布的大小 (bw, bh)：画布变了大小，就整体等比缩放、居中重画，不会被拉扁。 */
  function SketchBoard(host, colors) {
    var canvas = U.el('canvas.w-sketch-canvas');
    var g = null, W = 0, H = 0;
    var ops = [];            // { color: 0–3（-1 是橡皮）, w, pts: [x, y, …], bw, bh } 或 { clear: true }
    var cur = null, pid = null, mid = null, locked = false;
    var tool = { color: 0, thick: false, erase: false };
    var onChange = null;
    host.appendChild(canvas);

    function style(op, s) {
      g.globalCompositeOperation = op.color < 0 ? 'destination-out' : 'source-over';
      g.strokeStyle = g.fillStyle = op.color < 0 ? '#000' : colors[op.color];     /* 橡皮是“挖掉”，颜色无所谓 */
      g.lineWidth = op.w * s;
      g.lineCap = 'round';
      g.lineJoin = 'round';
    }
    function dot(x, y, r) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    /* 重画一整笔：先连到第一段的中点，之后每一段都是“以上一个点为控制点、画到下一个中点”的二次曲线，
       和画的时候逐段补上去的结果完全一样，所以撤销重画时线条不会跳。 */
    function drawOp(op) {
      if (op.clear) { g.clearRect(0, 0, W, H); return; }
      var s = Math.min(W / op.bw, H / op.bh);
      var ox = (W - op.bw * s) / 2, oy = (H - op.bh * s) / 2;
      var p = op.pts, n = p.length / 2;
      function X(i) { return ox + p[i * 2] * s; }
      function Y(i) { return oy + p[i * 2 + 1] * s; }
      style(op, s);
      if (n === 1) { dot(X(0), Y(0), op.w * s / 2); return; }
      g.beginPath();
      g.moveTo(X(0), Y(0));
      g.lineTo((X(0) + X(1)) / 2, (Y(0) + Y(1)) / 2);
      for (var i = 1; i < n - 1; i++) g.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
      g.lineTo(X(n - 1), Y(n - 1));
      g.stroke();
    }
    function redraw() {
      if (!g) return;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, W, H);
      ops.forEach(drawOp);
      g.globalCompositeOperation = 'source-over';
    }
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return [U.clamp(e.clientX - r.left, 0, W), U.clamp(e.clientY - r.top, 0, H)];
    }
    function finish() {
      if (!cur) return;
      var p = cur.pts, n = p.length / 2;
      if (n > 1 && mid) {
        style(cur, 1);
        g.beginPath();
        g.moveTo(mid[0], mid[1]);
        g.lineTo(p[n * 2 - 2], p[n * 2 - 1]);
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
      ops.push(cur);
      cur = null;
      pid = null;
      mid = null;
      if (onChange) onChange();
    }
    function down(e) {
      if (locked || cur || !g) return;
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      pid = e.pointerId;
      try { canvas.setPointerCapture(pid); } catch (err) { /* 合成事件没有可捕获的指针 */ }
      var p = pos(e);
      cur = { color: tool.erase ? -1 : tool.color, w: tool.erase ? (tool.thick ? 44 : 24) : (tool.thick ? 11 : 4.5), pts: [p[0], p[1]], bw: W, bh: H };
      mid = p;
      style(cur, 1);
      dot(p[0], p[1], cur.w / 2);
    }
    function move(e) {
      if (!cur || e.pointerId !== pid) return;
      e.preventDefault();
      var list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;     /* 两帧之间漏掉的点也补上，线才圆 */
      if (!list || !list.length) list = [e];
      style(cur, 1);
      for (var i = 0; i < list.length; i++) {
        var p = pos(list[i]);
        var n = cur.pts.length;
        var lx = cur.pts[n - 2], ly = cur.pts[n - 1];
        if (Math.abs(p[0] - lx) + Math.abs(p[1] - ly) < 1.5) continue;
        var m = [(lx + p[0]) / 2, (ly + p[1]) / 2];
        g.beginPath();
        g.moveTo(mid[0], mid[1]);
        if (n === 2) g.lineTo(m[0], m[1]); else g.quadraticCurveTo(lx, ly, m[0], m[1]);
        g.stroke();
        mid = m;
        cur.pts.push(p[0], p[1]);
      }
    }
    function up(e) {
      if (!cur || (e && e.pointerId != null && e.pointerId !== pid)) return;
      finish();
    }
    function stopTouch(e) { if (e.cancelable) e.preventDefault(); }

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    /* 老一些的 iOS 不完全认 touch-action:none，这里再拦一次，画的时候页面不会跟着滚 */
    canvas.addEventListener('touchstart', stopTouch, { passive: false });
    canvas.addEventListener('touchmove', stopTouch, { passive: false });

    return {
      tool: tool,
      resize: function () {
        var w = host.clientWidth, h = host.clientHeight;
        if (w < 20 || h < 20 || (w === W && h === H)) return;
        if (cur) finish();
        W = w;
        H = h;
        g = fitCanvas(canvas, W, H);
        redraw();
      },
      undo: function () {
        if (cur || !ops.length) return false;
        ops.pop();
        redraw();
        return true;
      },
      clear: function () {
        if (cur) finish();
        if (!ops.length || ops[ops.length - 1].clear) return false;
        ops.push({ clear: true });        /* 清空也算一步，点「撤销」能把画找回来 */
        redraw();
        return true;
      },
      lock: function () { if (cur) finish(); locked = true; },
      count: function () { return ops.length; },
      onChange: function (fn) { onChange = fn; }
    };
  }

  JN.registerWidget({
    id: 'sketch',
    name: '你画我猜',
    rules: '轮到的人按住「看词」偷看要画的词，然后在限定时间里画出来：不许写字，不许出声。其他人大声猜。猜对了，画的人和猜的人各得一分，再换下一位。英文一栏要用英文喊出答案。',
    mount: function (root, params, ctx) {
      var life = new Life();
      var names = loadNames(ctx);
      var catIds = P.WORD_CATS.map(function (c) { return c[0]; });
      var cat = catIds.indexOf(params.category) >= 0 ? params.category : 'mix';
      var seconds = U.clamp(parseInt(params.seconds, 10) || 60, 15, 300);
      var n0 = U.clamp(parseInt(params.players, 10) || 3, 2, 3);
      var slots = validSlots(ctx.store.get('on.' + n0, null), [0, 1, 2], 2, 3) || defaultSlots(n0);
      var perPlayer = U.clamp(parseInt(params.turns, 10) || 0, 0, 6);
      var st = null;            // { turn, total, scores, hits, phase: 'ready' | 'draw' | 'after' | 'result', word, peeked, outcome }
      var board = null;
      var deadline = 0, ticker = 0, lastSec = -1, hideTimer = 0, editor = null;
      var timeFill = null, timeNum = null;

      var head = U.el('div.w-sketch-head');
      var body = U.el('div.w-sketch-body');
      var box = U.el('div.w-sketch', [head, body]);
      root.appendChild(box);

      function nm(k) { return names[slots[k]]; }
      function drawer() { return st.turn % slots.length; }
      function duo() { return slots.length === 2; }
      function tinted(node, k) { node.style.setProperty('--c', COLORS[slots[k]]); return node; }

      function nextWord() {
        var list = P.wordsFor(cat);
        var seen = ctx.store.get('seen.' + cat, []);
        if (!Array.isArray(seen)) seen = [];
        var freshIdx = U.range(list.length).filter(function (i) { return seen.indexOf(i) < 0; });
        if (!freshIdx.length) { seen = []; freshIdx = U.range(list.length); }
        var i = U.pick(freshIdx);
        ctx.store.set('seen.' + cat, seen.concat([i]));
        var parts = String(list[i]).split('|');
        return { show: parts[0], gloss: parts[1] || '' };
      }
      function newGame() {
        stopClock();
        st = {
          turn: 0, total: (perPlayer || (slots.length === 2 ? 3 : 2)) * slots.length,
          scores: slots.map(function () { return 0; }), hits: 0,
          phase: 'ready', word: nextWord(), peeked: false, outcome: ''
        };
        render();
      }
      function stopClock() { ticker = life.stop(ticker); }

      function drawHead() {
        U.clear(head);
        var list = U.el('div.w-sketch-players');
        slots.forEach(function (s, k) {
          var on = st.phase !== 'result' && k === drawer();
          list.appendChild(tinted(U.el('span.w-sketch-p' + (on ? '.is-on' : ''), [U.el('i'), U.el('b', { text: nm(k) }), duo() ? null : U.el('em', { text: String(st.scores[k]) })]), k));
        });
        if (duo()) list.appendChild(U.el('span.w-sketch-team', { text: '猜对 ' + st.hits }));
        var chip = btn('.jn-chip.w-sketch-chip', '换人', openPlayers);
        chip.disabled = st.phase === 'draw' || st.phase === 'after';
        U.append(head, [list, chip]);
      }
      function render() {
        drawHead();
        U.clear(body);
        board = null;
        box.setAttribute('data-phase', st.phase);
        if (st.phase === 'ready') viewReady();
        else if (st.phase === 'result') viewResult();
        else viewDraw();
      }

      /* ---------- 准备：按住看词 ---------- */
      function viewReady() {
        var k = drawer();
        var cats = U.el('div.w-sketch-cats');
        P.WORD_CATS.forEach(function (c) {
          cats.appendChild(btn('.jn-chip.w-sketch-cat' + (c[0] === cat ? '.is-on' : ''), c[1], function () {
            if (cat === c[0]) return;
            cat = c[0];
            st.word = nextWord();
            st.peeked = false;
            ctx.sfx('tap');
            render();
          }));
        });
        var wordEl = U.el('div.w-sketch-word', { text: '？？？' });
        var glossEl = U.el('div.w-sketch-gloss');
        var wordBox = U.el('div.w-sketch-wordbox', [wordEl, glossEl]);
        var goBtn = btn('.jn-btn.jn-btn--lg.w-sketch-go', '开始画（' + seconds + ' 秒）', startDraw);
        goBtn.disabled = !st.peeked;
        function show(on) {
          hideTimer = life.cancel(hideTimer);
          wordBox.classList.toggle('is-open', on);
          wordEl.textContent = on ? st.word.show : '？？？';
          glossEl.textContent = on ? st.word.gloss : '';
          if (on && !st.peeked) {
            st.peeked = true;
            goBtn.disabled = false;
          }
        }
        var downAt = 0;
        /* 松手就盖上；但只是轻轻点了一下的话，让词多亮一会儿，不然什么都没看清 */
        function release() {
          if (!downAt) return;
          var held = now() - downAt;
          downAt = 0;
          if (held >= 500) { show(false); return; }
          hideTimer = life.cancel(hideTimer);
          hideTimer = life.after(function () { hideTimer = 0; show(false); }, 1100 - held);
        }
        var peek = U.el('button.w-sketch-peek', {
          text: '按住看词', attrs: { type: 'button' },
          on: {
            pointerdown: function (e) {
              e.preventDefault();
              try { peek.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
              downAt = now();
              show(true);
            },
            pointerup: release,
            pointercancel: release,
            lostpointercapture: release,
            contextmenu: function (e) { e.preventDefault(); },
            /* 键盘或读屏器“点”的时候没有按住这回事：亮一秒多再盖上 */
            click: function (e) {
              if (e.detail !== 0) return;
              show(true);
              hideTimer = life.after(function () { hideTimer = 0; show(false); }, 1300);
            }
          }
        });
        var turnEl = tinted(U.el('div.w-sketch-turn', [U.el('b', { text: nm(k) }), ' 来画']), k);
        U.append(body, [
          cats,
          U.el('div.w-sketch-readybox', [
            turnEl,
            U.el('div.w-sketch-note', { text: '第 ' + (st.turn + 1) + ' / ' + st.total + ' 轮 · 其他人先转过头' }),
            wordBox,
            peek,
            U.el('div.w-sketch-row', [
              btn('.jn-btn.jn-btn--ghost.w-sketch-swap', '换个词', function () { st.word = nextWord(); st.peeked = false; ctx.sfx('tap'); render(); }),
              goBtn
            ])
          ])
        ]);
      }

      /* ---------- 画 ---------- */
      function startDraw() {
        if (st.phase !== 'ready' || !st.peeked) return;
        hideTimer = life.cancel(hideTimer);
        st.phase = 'draw';
        st.outcome = '';
        ctx.sfx('pop');
        render();
        deadline = now() + seconds * 1000;
        lastSec = seconds;
        stopClock();
        ticker = life.every(clock, 200);
        clock();
      }
      function clock() {
        if (st.phase !== 'draw') return;
        var ms = Math.max(0, deadline - now());
        var secs = ceilSecs(ms);
        if (timeFill) timeFill.style.width = (ms / (seconds * 10)).toFixed(1) + '%';
        if (timeNum) timeNum.textContent = String(secs);
        box.classList.toggle('is-hot', secs <= 10);
        if (secs !== lastSec) {
          if (secs <= 10 && secs > 0) { ctx.sfx('tick'); ctx.haptic(8); }
          lastSec = secs;
        }
        if (ms <= 0) endTurn('timeout');
      }
      function toolBtn(cls, label, isOn, fn, aria) {
        return btn('.w-sketch-tool' + cls + (isOn ? '.is-on' : ''), label, fn, { 'aria-label': aria || label, 'aria-pressed': isOn ? 'true' : 'false' });
      }
      function drawTools(host) {
        var t = board.tool;
        U.clear(host);
        ['白', '橙', '蓝', '绿'].forEach(function (cn, i) {
          var b = toolBtn('.is-color', '', !t.erase && t.color === i, function () { t.color = i; t.erase = false; ctx.sfx('tap'); drawTools(host); }, cn + '色');
          b.appendChild(U.el('i'));
          b.style.setProperty('--c', ['var(--ink)', 'var(--p1)', 'var(--p2)', 'var(--p3)'][i]);
          host.appendChild(b);
        });
        /* 粗细：按钮上画一小段当前粗细的线，一眼就知道现在是哪一档，点一下换另一档 */
        var widthBtn = toolBtn('.is-width', '', false, function () { t.thick = !t.thick; ctx.sfx('tap'); drawTools(host); }, t.thick ? '现在是粗笔，点一下换细笔' : '现在是细笔，点一下换粗笔');
        U.append(widthBtn, [U.el('i' + (t.thick ? '.is-thick' : '')), U.el('span', { text: t.thick ? '粗' : '细' })]);
        host.appendChild(widthBtn);
        host.appendChild(toolBtn('', '橡皮', t.erase, function () { t.erase = !t.erase; ctx.sfx('tap'); drawTools(host); }));
      }
      function viewDraw() {
        var k = drawer();
        var done = st.phase === 'after';
        timeFill = U.el('i');
        timeNum = U.el('b', { text: String(seconds) });
        var bar = U.el('div.w-sketch-bar', [
          tinted(U.el('span.w-sketch-who', { text: nm(k) + ' 在画' }), k),
          U.el('div.w-sketch-time', [timeFill]),
          timeNum
        ]);
        var boardEl = U.el('div.w-sketch-board');
        var foot = U.el('div.w-sketch-foot');
        U.append(body, [bar, boardEl, foot]);
        board = SketchBoard(boardEl, [token(box, '--ink', '#f4f6fb'), token(box, '--p1', '#ff7a45'), token(box, '--p2', '#4d7cfe'), token(box, '--p3', '#3ddc97')]);
        if (done) {
          board.lock();
          drawAfter(foot);
          board.resize();
          return;
        }
        var tools = U.el('div.w-sketch-tools');
        drawTools(tools);
        U.append(foot, [
          tools,
          U.el('div.w-sketch-acts', [
            btn('.jn-btn.jn-btn--ghost.w-sketch-act', '撤销', function () { if (board.undo()) ctx.sfx('tap'); }),
            btn('.jn-btn.jn-btn--ghost.w-sketch-act', '清空', function () { if (board.clear()) ctx.sfx('tap'); }),
            btn('.jn-btn.jn-btn--ghost.w-sketch-act', '跳过', function () { endTurn('skip'); }),
            btn('.jn-btn.w-sketch-hit', '猜对了！', function () { endTurn('hit'); })
          ])
        ]);
        board.resize();        /* 工具栏摆好以后再量画板的大小 */
      }
      function endTurn(outcome) {
        if (st.phase !== 'draw') return;
        stopClock();
        st.phase = 'after';
        st.outcome = outcome;
        box.classList.remove('is-hot');
        if (outcome === 'hit') {
          st.hits++;
          if (duo()) st.scores = st.scores.map(function (x) { return x + 1; });
          else st.scores[drawer()]++;
          ctx.sfx('good');
          ctx.haptic(20);
        } else if (outcome === 'timeout') {
          ctx.sfx('buzz');
          ctx.haptic([200, 100, 200]);
        } else ctx.sfx('tap');
        /* 画留在屏幕上（大家还想再笑一会儿），只把下面的工具换成答案 */
        board.lock();
        drawHead();
        box.setAttribute('data-phase', st.phase);
        var foot = body.querySelector('.w-sketch-foot');
        if (foot && board) {
          drawAfter(foot);
          board.resize();
        } else render();
      }
      function drawAfter(foot) {
        var k = drawer();
        var last = st.turn >= st.total - 1;
        var nextLabel = last ? '看结果' : '下一位：' + nm((st.turn + 1) % slots.length);
        var askWho = st.outcome === 'hit' && !duo();
        U.clear(foot);
        foot.appendChild(U.el('div.w-sketch-ans', [
          U.el('span', { text: st.outcome === 'hit' ? '猜对了！答案' : st.outcome === 'timeout' ? '时间到。答案是' : '跳过。答案是' }),
          U.el('b', { text: st.word.show + (st.word.gloss ? '（' + st.word.gloss + '）' : '') })
        ]));
        if (askWho) {
          var row = U.el('div.w-sketch-whorow', [U.el('span', { text: '谁猜对的？' })]);
          slots.forEach(function (s, j) {
            if (j === k) return;
            row.appendChild(tinted(btn('.w-sketch-guesser', nm(j), function () { st.scores[j]++; ctx.sfx('pop'); advance(); }), j));
          });
          foot.appendChild(row);
        } else {
          foot.appendChild(btn('.jn-btn.jn-btn--block.w-sketch-next', nextLabel, function () { ctx.sfx('tap'); advance(); }));
        }
      }
      function advance() {
        if (st.phase !== 'after') return;
        if (st.turn >= st.total - 1) { finish(); return; }
        st.turn++;
        st.phase = 'ready';
        st.word = nextWord();
        st.peeked = false;
        render();
      }

      /* ---------- 结果 ---------- */
      function finish() {
        st.phase = 'result';
        render();
        var text;
        if (duo()) text = st.total + ' 个词猜对 ' + st.hits + ' 个';
        else {
          var max = Math.max.apply(null, st.scores);
          var top = U.range(slots.length).filter(function (i) { return st.scores[i] === max; });
          text = top.length === 1 ? nm(top[0]) + ' 赢了' : '并列第一';
        }
        var good = !duo() || st.hits * 2 >= st.total;      /* 两个人是合作：猜对一半以上才算赢 */
        ctx.sfx(good ? 'win' : 'pop');
        if (good) ctx.confetti();
        ctx.done({ win: good, text: text });
      }
      function viewResult() {
        var title, line;
        var rows = U.el('div.w-sketch-rank');
        if (duo()) {
          var r = st.hits / st.total;
          title = st.total + ' 个词，猜对 ' + st.hits + ' 个';
          line = r >= 0.8 ? '灵魂画手，配上神猜。' : r >= 0.5 ? '还不错。再练练可以组队出道。' : '画的和猜的，总有一个要负责。';
        } else {
          var max = Math.max.apply(null, st.scores);
          var top = U.range(slots.length).filter(function (i) { return st.scores[i] === max; });
          title = top.length === 1 ? nm(top[0]) + ' 赢了！' : top.length === slots.length ? '三个人打平' : top.map(nm).join(' 和 ') + ' 并列第一';
          line = '一共 ' + st.total + ' 个词，猜对 ' + st.hits + ' 个。';
          U.range(slots.length).sort(function (a, b) { return st.scores[b] - st.scores[a]; }).forEach(function (i) {
            rows.appendChild(tinted(U.el('div.w-sketch-rrow' + (st.scores[i] === max ? '.is-top' : ''), [U.el('i'), U.el('b', { text: nm(i) }), U.el('em', { text: st.scores[i] + ' 分' })]), i));
          });
        }
        U.append(body, [U.el('div.w-sketch-result', [
          U.el('div.w-sketch-rtitle', { text: title }),
          U.el('div.w-sketch-rline', { text: line }),
          rows,
          btn('.jn-btn.jn-btn--lg.jn-btn--block', '再来一局', function () { ctx.sfx('tap'); newGame(); })
        ])]);
      }
      function openPlayers() {
        if (editor || st.phase === 'draw' || st.phase === 'after') return;
        editor = openEditor(box, 'w-sketch', {
          title: '谁来玩', note: '2 到 3 个人。名字可以改；换了人就重新开一局。',
          toggle: true, minOn: 2, maxOn: 3, maxLen: 6,
          rows: [0, 1, 2].map(function (s) { return { text: names[s], on: slots.indexOf(s) >= 0, color: COLORS[s], fallback: NAME_DEFAULTS[s] }; }),
          onDone: function (rows) {
            editor = null;
            var on = [];
            rows.forEach(function (r, i) {
              names[i] = r.text;
              if (r.on) on.push(i);
            });
            names = saveNames(ctx, names);
            if (on.length >= 2 && on.join() !== slots.join()) {
              slots = on;
              ctx.store.set('on.' + n0, slots);
              newGame();
            } else render();
          }
        });
      }

      newGame();
      watchSize(box, ctx, function () { if (board) board.resize(); });
      return {
        destroy: function () {
          life.kill();
          if (editor) editor.close();
        }
      };
    },

    /* 卡片上的预览：一支笔自己把一个篮球（然后是一块披萨、一条鱼）画出来 */
    preview: function (root, params, ctx) {
      var life = new Life();
      var canvas = U.el('canvas');
      var tagEl = U.el('div.w-sketch-pvtag');
      var box = U.el('div.w-sketch-pv', [canvas, tagEl]);
      var g = null, W = 0, H = 0;
      var colors = [];
      root.appendChild(box);

      function arc(cx, cy, r, a0, a1, n) {
        var pts = [];
        for (var i = 0; i <= n; i++) {
          var a = a0 + (a1 - a0) * i / n;
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        return pts;
      }
      /* 每幅小画 = 若干笔，每笔 = [颜色序号, 点…]，坐标在 0–1 的方格里 */
      var english = params.category === 'english';
      var DOODLES = [
        { word: english ? 'basketball' : '篮球', strokes: [
          [1, arc(0.5, 0.5, 0.34, -1.6, 4.8, 40)],
          [0, [[0.16, 0.5], [0.84, 0.5]]],
          [0, [[0.5, 0.16], [0.5, 0.84]]],
          [0, arc(0.06, 0.5, 0.32, -0.9, 0.9, 14)],
          [0, arc(0.94, 0.5, 0.32, Math.PI - 0.9, Math.PI + 0.9, 14)]
        ] },
        { word: english ? 'pizza' : '披萨', strokes: [
          [1, [[0.2, 0.26], [0.5, 0.88], [0.8, 0.26]]],
          [1, arc(0.5, 0.52, 0.4, Math.PI + 0.72, TAU - 0.72, 14)],
          [3, arc(0.42, 0.42, 0.045, 0, TAU, 10)],
          [3, arc(0.58, 0.46, 0.045, 0, TAU, 10)],
          [3, arc(0.5, 0.64, 0.045, 0, TAU, 10)]
        ] },
        { word: english ? 'fish' : '鱼', strokes: [
          [2, arc(0.45, 0.5, 0.26, 0.5, TAU - 0.5, 30).map(function (p) { return [p[0], 0.5 + (p[1] - 0.5) * 0.62]; })],
          [2, [[0.68, 0.42], [0.88, 0.3], [0.88, 0.7], [0.68, 0.58]]],
          [0, arc(0.3, 0.46, 0.02, 0, TAU, 8)],
          [3, [[0.42, 0.42], [0.47, 0.5], [0.42, 0.58]]]
        ] }
      ];
      function total(d) { return d.strokes.reduce(function (n, s) { return n + s[1].length; }, 0); }
      /** 把第 di 幅画的前 upto 个点画出来 */
      function paint(di, upto) {
        if (!g) return;
        var d = DOODLES[di];
        var size = Math.min(W, H) * 0.92, ox = (W - size) / 2, oy = (H - size) / 2;
        var left = upto;
        g.clearRect(0, 0, W, H);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.lineWidth = Math.max(2.5, size * 0.03);
        d.strokes.forEach(function (s) {
          if (left <= 1) { left -= s[1].length; return; }
          var n = Math.min(s[1].length, left);
          left -= s[1].length;
          g.strokeStyle = colors[s[0]];
          g.beginPath();
          for (var i = 0; i < n; i++) {
            var x = ox + s[1][i][0] * size, y = oy + s[1][i][1] * size;
            if (i) g.lineTo(x, y); else g.moveTo(x, y);
          }
          g.stroke();
        });
      }
      var di = 0, t = 0, t0 = now(), shown = -1;
      pvScale(box, ctx, function (s) {
        W = Math.max(40, s.w);
        H = Math.max(40, s.h);
        g = fitCanvas(canvas, W, H);
        colors = [token(box, '--ink', '#f4f6fb'), token(box, '--p1', '#ff7a45'), token(box, '--p2', '#4d7cfe'), token(box, '--p3', '#3ddc97')];
        paint(di, ctx.reduced ? total(DOODLES[di]) : Math.floor(t * 30));
      });
      if (ctx.reduced) tagEl.textContent = DOODLES[0].word + '！';
      else {
        life.loop(function () {
          var all = total(DOODLES[di]);
          t = (now() - t0) / 1000;
          var upto = Math.min(all, Math.floor(t * 30));
          if (upto !== shown) { shown = upto; paint(di, upto); }
          tagEl.textContent = upto >= all ? DOODLES[di].word + '！' : '';
          if (t > all / 30 + 1.4) {              /* 画完亮一会儿答案，再换下一幅 */
            t = 0;
            t0 = now();
            shown = -1;
            di = (di + 1) % DOODLES.length;
          }
        });
      }
      return { destroy: function () { life.kill(); } };
    }
  });

  /* ================================================================== *
   * storydice 故事骰子
   * params: { theme: 'any'（默认）| 'hoop' | 'space' | 'spy' | 'trip', count: 6（或 5） }
   * ================================================================== */
  /** 把一个面画进骰子：雪碧图里有这张贴纸就用贴纸配一行小字，没有就只写词；raw 为空画一个问号 */
  function diceFace(node, raw) {
    U.clear(node);
    node.classList.remove('has-art');
    if (raw == null) {
      node.appendChild(U.el('span.w-storydice-q', { text: '?' }));
      return;
    }
    var parts = String(raw).split('|');
    if (parts[1] && U.hasSymbol('art-' + parts[1])) {
      node.classList.add('has-art');
      node.appendChild(U.art(parts[1], 'w-storydice-art'));
      node.appendChild(U.el('span.w-storydice-cap', { text: parts[0] }));
    } else {
      var n = chars(parts[0]).length;
      node.appendChild(U.el('span.w-storydice-word' + (n > 6 ? '.is-xl' : n > 4 ? '.is-l' : ''), { text: parts[0] }));
    }
  }
  /** 用哪几颗骰子：6 颗全上；5 颗时去掉第二颗“东西”，谁、在哪、有什么、出了什么岔子、怎么收场都还在 */
  function diceSet(count) { return count === 5 ? [0, 1, 2, 4, 5] : [0, 1, 2, 3, 4, 5]; }

  JN.registerWidget({
    id: 'storydice',
    name: '故事骰子',
    rules: '掷出几颗骰子，轮流每人说一句，把每一颗都编进同一个故事里，谁也不许跳过。舍不得的骰子点一下可以锁住，再掷其余的。',
    mount: function (root, params, ctx) {
      var life = new Life();
      var themeIds = Object.keys(P.DICE);
      var theme = themeIds.indexOf(params.theme) >= 0 ? params.theme : 'any';
      var count = parseInt(params.count, 10) === 5 ? 5 : 6;
      var set = diceSet(count);
      var dice = [];             // [{ src 用主题里的第几颗, face, locked, el, faceEl, next, stopAt, settled }]
      var rolling = false, rolled = false, told = false;
      var openerIdx = 0, rollTimer = 0;

      var themes = U.el('div.w-storydice-themes');
      var openerText = U.el('span.w-storydice-otext');
      var opener = U.el('button.w-storydice-opener', { attrs: { type: 'button', 'aria-label': '换一句开头' }, on: { click: nextOpener } }, [
        U.el('small', { text: '开头可以这样说（点一下换一句）' }), openerText
      ]);
      var tray = U.el('div.w-storydice-tray');
      var tip = U.el('div.w-storydice-tip');
      var doneBtn = btn('.jn-btn.jn-btn--ghost.w-storydice-done', '讲完了', finish);
      var rollBtn = btn('.jn-btn.jn-btn--lg.w-storydice-roll', '掷骰子', roll);
      var box = U.el('div.w-storydice', [themes, opener, tray, tip, U.el('div.w-storydice-bar', [doneBtn, rollBtn])]);
      root.appendChild(box);

      function faces(d) { return P.DICE[theme].dice[d.src]; }
      function drawThemes() {
        U.clear(themes);
        themeIds.forEach(function (id) {
          themes.appendChild(btn('.jn-chip.w-storydice-theme' + (id === theme ? '.is-on' : ''), P.DICE[id].name, function () {
            if (rolling || id === theme) return;
            theme = id;
            ctx.sfx('tap');
            fresh();
          }));
        });
      }
      function nextOpener() {
        var list = P.DICE[theme].openers;
        openerIdx = (openerIdx + 1) % list.length;
        openerText.textContent = list[openerIdx];
        ctx.sfx('tap');
      }
      function sync() {
        var locked = dice.filter(function (d) { return d.locked; }).length;
        rollBtn.textContent = !rolled ? '掷骰子' : locked === count ? '全锁住了，先解开一颗' : locked ? '重掷没锁的 ' + (count - locked) + ' 颗' : '再掷一次';
        rollBtn.disabled = rolling || locked === count;
        doneBtn.disabled = rolling || !rolled || told;
        tip.textContent = !rolled ? '掷出 ' + count + ' 颗骰子，轮流每人说一句，把每一颗都编进同一个故事里。'
          : told ? '讲完了！再掷一把，换个人开头。'
            : '轮流每人说一句，每一颗都要用上。舍不得的点一下锁住，再掷其余的。';
        dice.forEach(function (d) {
          d.el.classList.toggle('is-locked', d.locked);
          d.el.setAttribute('aria-pressed', d.locked ? 'true' : 'false');
          d.el.setAttribute('aria-label', (d.face ? String(d.face).split('|')[0] : '还没掷') + (d.locked ? '，已锁住' : ''));
        });
      }
      /* 换主题或第一次进来：骰子都是问号，等人来掷 */
      function fresh() {
        rollTimer = life.stop(rollTimer);
        rolling = rolled = told = false;
        U.clear(tray);
        dice = set.map(function (src) {
          var faceEl = U.el('span.w-storydice-face');
          var d = { src: src, face: null, locked: false, faceEl: faceEl };
          d.el = U.el('button.w-storydice-die', { attrs: { type: 'button' }, on: { click: function () { toggleLock(d); } } }, [faceEl, U.el('span.w-storydice-lock', { text: '锁' })]);
          diceFace(faceEl, null);
          tray.appendChild(d.el);
          return d;
        });
        openerIdx = U.randInt(0, P.DICE[theme].openers.length - 1);
        openerText.textContent = P.DICE[theme].openers[openerIdx];
        drawThemes();
        sync();
        layout();
      }
      function toggleLock(d) {
        if (rolling) return;
        if (!rolled) { roll(); return; }          /* 还没掷过：点骰子也算掷 */
        d.locked = !d.locked;
        ctx.sfx('tap');
        ctx.haptic(8);
        sync();
      }
      function roll() {
        if (rolling) return;
        var free = dice.filter(function (d) { return !d.locked; });
        if (!free.length) return;
        rolling = true;
        told = false;
        free.forEach(function (d, j) {
          var list = faces(d);
          do { d.next = U.pick(list); } while (list.length > 1 && d.next === d.face);     /* 重掷一定换一个面 */
          d.stopAt = 520 + j * 150;
          d.settled = false;
        });
        sync();
        ctx.haptic(15);
        if (ctx.reduced) {
          free.forEach(function (d) { d.face = d.next; diceFace(d.faceEl, d.face); });
          landed();
          return;
        }
        var t0 = now();
        free.forEach(function (d) { d.el.classList.add('is-rolling'); });
        rollTimer = life.every(function () {
          var e = now() - t0, moving = 0;
          free.forEach(function (d) {
            if (d.settled) return;
            if (e >= d.stopAt) {
              d.settled = true;
              d.face = d.next;
              diceFace(d.faceEl, d.face);
              d.el.classList.remove('is-rolling');
              replay(d.el, 'is-landed');
              ctx.sfx('pop');
              ctx.haptic(10);
            } else {
              moving++;
              diceFace(d.faceEl, U.pick(faces(d)));
            }
          });
          if (moving) ctx.sfx('tick');
          else {
            rollTimer = life.stop(rollTimer);
            landed();
          }
        }, 80);
      }
      function landed() {
        rolling = false;
        rolled = true;
        sync();
      }
      function finish() {
        if (rolling || !rolled || told) return;
        told = true;
        dice.forEach(function (d) { d.locked = false; });
        sync();
        ctx.sfx('win');
        ctx.haptic([20, 40, 80]);
        ctx.confetti();
        ctx.done({ win: true, text: '编完了一个故事' });
      }
      /* 骰子尽量大：试几种列数，取一颗骰子边长最大的那种 */
      function layout() {
        var w = tray.clientWidth, h = tray.clientHeight;
        if (w < 40 || h < 40) return;
        var gap = 10, best = 0;
        for (var cols = 2; cols <= count; cols++) {
          var rowsN = Math.ceil(count / cols);
          var s = Math.min((w - gap * (cols - 1)) / cols, (h - gap * (rowsN - 1)) / rowsN);
          if (s > best) best = s;
        }
        tray.style.setProperty('--w-storydice-s', Math.floor(U.clamp(best, 44, 150)) + 'px');
      }

      fresh();
      watchSize(box, ctx, layout);
      return { destroy: function () { life.kill(); } };
    },

    /* 卡片上的预览：几颗小骰子排成一排，隔一会儿自己滚一次 */
    preview: function (root, params, ctx) {
      var life = new Life();
      var theme = P.DICE[params.theme] ? params.theme : 'any';
      var set = diceSet(parseInt(params.count, 10) === 5 ? 5 : 6);
      var tray = U.el('div.w-storydice-pvtray');
      var box = U.el('div.w-storydice-pv', [tray]);
      var dice = set.map(function (src, j) {
        var faceEl = U.el('span.w-storydice-face');
        var el = U.el('div.w-storydice-die', [faceEl]);
        tray.appendChild(el);
        /* 预览里骰子很小：只用有贴纸的面，或者四个字以内的词 */
        var all = P.DICE[theme].dice[src];
        var pool = all.filter(function (f) {
          var parts = String(f).split('|');
          return (parts[1] && U.hasSymbol('art-' + parts[1])) || chars(parts[0]).length <= 4;
        });
        return { el: el, faceEl: faceEl, pool: pool.length ? pool : all, stopAt: 4 + j * 2 };
      });
      var step = 0;
      root.appendChild(box);
      pvScale(box, ctx, function (s) {
        /* 摆成一排还是两排：哪种骰子更大用哪种 */
        var n = dice.length, gap = 6, cols = Math.ceil(n / 2);
        var w = (s.w || 320) - 20, h = (s.h || 150) - 14;
        var one = Math.min(h, (w - gap * (n - 1)) / n);
        var two = Math.min((h - gap) / 2, (w - gap * (cols - 1)) / cols);
        var size = Math.max(20, Math.floor(Math.max(one, two)));
        tray.style.setProperty('--w-storydice-s', size + 'px');
        tray.style.maxWidth = two > one ? (cols * size + gap * (cols - 1) + 1) + 'px' : 'none';
      });
      function face(d) { return U.pick(d.pool); }
      dice.forEach(function (d, j) { diceFace(d.faceEl, d.pool[j % d.pool.length]); });
      if (!ctx.reduced) {
        life.every(function () {
          step++;
          if (step > 40) step = 0;                         /* 一轮 40 拍（约 3.6 秒）：前面一小段在滚，其余时间停着给人看 */
          dice.forEach(function (d) {
            var moving = step > 0 && step < d.stopAt;
            d.el.classList.toggle('is-rolling', moving);
            if (moving || step === d.stopAt) diceFace(d.faceEl, face(d));
          });
        }, 90);
      }
      return { destroy: function () { life.kill(); } };
    }
  });
})();
