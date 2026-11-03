/* ============================================================
 * config —— 全部数值、概率、名字库、文本模板
 * 逻辑中不得硬编码平衡数值，一律在此调整。
 * 遭遇定义见 encounters.js（同属 config 区块）。
 *
 * 世界与设定取自鹓扶君《仙业》（东弥州南域一带）：境界、地名、宗门、物产只用设定事实，
 * 文字一律自写，不搬原文。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});

  FX.CONFIG = {
    schemaVersion: 12,
    gameVersion: '0.10.1-xianye10',
    startYear: 300,
    daysPerMonth: 30,
    monthsPerYear: 12,
    daysPerYear: 360,
    money: '符钱',

    /* ---------- 境界 ----------
     * 胎息、练炁、筑基、紫府、洞玄、金丹、元神、返虚、纯阳、合道、大冶（原著：金丹之后，粉碎元神十二重障关，
     * 窥破返虚之谜，渡纯阳风、火、雷三灾，便是合道；合道称道君，再过九难，仙业自显，寿与天齐，便是大冶仙人）。
     * 元神十二重障关：成就元神时破开第一重、显化法相（极少数天骄能连破两重）；此后每一重都是参悟的水磨功夫，
     *   感悟够了法力自然而动、粉碎障关，绝无祸患；初几重易破，越往后越难，坐关动辄数十载。破尽十二重为元神功满。
     * 返虚：在关隘前自判道途，十二迷障、九等轮转、玄中三限三选一。道劫总量不增不减，关数越少每一关越酷烈，
     *   却越省时日，将来渡纯阳三灾劫力也轻些、多一层天运。破障要以灵脉护住法躯，否则有「失道之祸」。
     * 合道九难：道君再过九重劫难，才一步步道与身合，功成飞仙。
     * 每过一道大关都定一回根底的成色：筑基定道基，开紫府定异象，洞玄三重定先天金汞，结丹定金丹品第，
     * 成就元神定法相。前面的成色一路影响后面（原著里颜熙真人是低阶真炁、下等道基、下等异象、末等金汞，
     * 照样逆反根果证得返虚，可见成色只定难易，不定生死）。
     * 金丹三重：身根成象、渐法九还、神中有形；丹分九品，九品黄白金丹最次，一品龙虎金丹最高。
     * 元神法相分下、中、上、至四等。元神要有一处「地」（灵机六级的灵窟福地）才成得了；返虚要先开辟一座洞天。
     * 练炁九层（练炁九返）没有关隘，壮大胎息到头便转入下一层；筑基、紫府、洞玄各分三重。 */
    realms: {
      // major: 0 凡人 1 胎息 2 练炁 3 筑基 4 紫府 5 洞玄 6 金丹 7 元神 8 返虚 9 纯阳 10 合道 11 大冶
      names: ['凡人', '胎息', '练炁', '筑基', '紫府', '洞玄', '金丹', '元神', '返虚', '纯阳', '合道', '大冶'],
      // 胥都天的尊称：练炁称羽士，紫府称高功，洞玄称炼师，金丹、元神称真人，返虚、纯阳称真君，合道称道君，大冶称仙人
      titles: { 2: '羽士', 4: '高功', 5: '炼师', 6: '真人', 7: '真人', 8: '真君', 9: '真君', 10: '道君', 11: '仙人' },
      stageNames: {
        0: [''],
        1: [''],
        2: ['一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层'],
        3: ['一重', '二重', '三重'],
        4: ['一重', '二重', '三重'],
        5: ['一重', '二重', '三重'],
        6: ['一重', '二重', '三重'],
        // 元神：几重 = 已破几重障关
        7: ['一重', '二重', '三重', '四重', '五重', '六重', '七重', '八重', '九重', '十重', '十一重', '十二重'],
        // 返虚的小境界随所选道途而定，名字另算（见 characters.js 的 P.realmName）
        8: ['', '', '', '', '', '', '', '', '', '', '', '', ''],
        9: ['一重', '二重', '三重'],
        // 合道：已过几难
        10: ['', '过一难', '过二难', '过三难', '过四难', '过五难', '过六难', '过七难', '过八难'],
        11: [''],
      },
      stageTitles: {
        3: ['炁海生化', '大小如意', '龟蛇相抱'],
        4: ['万妙归根', '超脱分形', '换魂消魄'],
        5: ['龙虎炉鼎', '摄取五精', '先天金汞'],
        6: ['身根成象', '渐法九还', '神中有形'],
        7: ['法相天成', '', '', '', '', '功成其半', '', '', '', '', '', '元神功满'],
        8: ['', '', '', '', '', '', '', '', '', '', '', '', '迷障尽破'],
        // 纯阳三重以三灾为界：渡过风灾初成纯阳，再渡火灾、雷灾
        9: ['风灾已渡', '火灾已渡', '雷灾已渡'],
        10: ['与道合真', '', '', '', '', '', '', '', ''],
        11: ['仙业自显'],
      },
      maxStage: { 0: 1, 1: 1, 2: 9, 3: 3, 4: 3, 5: 3, 6: 3, 7: 12, 8: 13, 9: 3, 10: 9, 11: 1 },
      // 凡人这一格积的是“气感”，胎息这一格是“胎息壮大”，此后才是修为
      need: {
        0: [40],
        1: [30],
        2: [30, 40, 50, 60, 70, 80, 90, 100, 110],
        3: [600, 900, 1300],
        4: [2400, 3200, 4400],
        5: [6000, 8000, 10000],
        6: [24000, 30000, 36000],
        // 元神：从一重修到二重……修到十二重的“感悟”；初几重易破，越往后越是水磨功夫
        7: [5000, 6000, 7500, 9000, 11000, 14000, 18000, 23000, 29000, 37000, 47000, 60000],
        // 返虚：十二迷障按这张表；九等轮转、玄中三限按道途打折（见 fanxuPaths.need）
        8: [20000, 22000, 25000, 28000, 32000, 36000, 41000, 46000, 52000, 58000, 65000, 72000, 60000],
        9: [300000, 300000, 300000],
        10: [400000, 450000, 500000, 560000, 620000, 700000, 780000, 870000, 960000],
        11: [Infinity],
      },
      // 返虚三途：gates 是这一途要过关的小境界（在第几段修满时有一关），其余几段修满自动接续。
      // need：修为折算；base：每关基础成功率；death：每关失败时失道之祸的身死机会；
      // zai / zaiDeath：将来渡纯阳三灾时，劫力削减（成功率加成）和失败时身死机会的倍数
      fanxuPaths: {
        shier: { name: '十二迷障', short: '迷障', unit: '障', gates: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], need: 1, base: 56, death: 0.04, zai: 0, zaiDeath: 1,
          desc: '十二重劫关次第消受，最稳妥，也最费时日。世间修道人多半选这一途' },
        jiudeng: { name: '九等轮转', short: '轮转', unit: '等', gates: [1, 2, 4, 5, 6, 8, 9, 10, 12], need: 0.75, base: 42, death: 0.08, zai: 8, zaiDeath: 0.75,
          desc: '十二番劫数骤减作九番，每一关艰险激增，酷烈倍常；省下许多时日，将来渡纯阳三灾劫力轻些、多一层天运' },
        sanxian: { name: '玄中三限', short: '三限', unit: '限', gates: [4, 8, 12], need: 0.5, base: 26, death: 0.16, zai: 18, zaiDeath: 0.5, needItem: 'xuanzhong', minXiang: 3,
          desc: '又称天考。只三重劫关，难到无可想象，却至少省下数千载苦功；以此证就返虚的称「御极子」，是返虚境界的无名之君' },
      },
      fanxuPathOrder: ['shier', 'jiudeng', 'sanxian'],
      // 全年专心修炼的基础值
      baseGain: { 0: 10, 1: 15, 2: 20, 3: 30, 4: 60, 5: 100, 6: 150, 7: 300, 8: 600, 9: 800, 10: 1500, 11: 2000 },
      // 寿元：凡人百年之内；胎息寿一百五；筑基三重二百出头；紫府三重三百；金丹千五；元神三千起、每破一重障关命寿拔高一筹；
      // 返虚六千起；纯阳一万二；道君十万（原著：道君要寄身一方天宇才近乎无尽）；九难过尽、仙业自显，才寿与天齐
      lifespan: {
        0: [70],
        1: [150],
        2: [150, 150, 150, 150, 150, 155, 155, 160, 160],
        3: [190, 200, 215],
        4: [250, 275, 300],
        5: [400, 450, 500],
        6: [1500, 1500, 1500],
        7: [3000, 3100, 3200, 3300, 3400, 3500, 3600, 3700, 3800, 3900, 4000, 4200],
        8: [6000, 6150, 6300, 6450, 6600, 6750, 6900, 7050, 7200, 7350, 7500, 7650, 8000],
        9: [12000, 12000, 12000],
        10: [100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000],
        11: [100000000],
      },
      power: {
        0: [0.5],
        1: [1.2],
        2: [2, 3, 4, 5, 7, 9, 12, 15, 19],
        3: [40, 55, 75],
        4: [150, 200, 260],
        5: [400, 520, 680],
        6: [2000, 2600, 3400],
        7: [6000, 6600, 7300, 8000, 8800, 9700, 10700, 11800, 13000, 14300, 15700, 17000],
        8: [18000, 19500, 21000, 22500, 24500, 26500, 28500, 31000, 33500, 36000, 39000, 42000, 45000],
        9: [50000, 65000, 80000],
        10: [300000, 330000, 360000, 400000, 440000, 480000, 530000, 580000, 640000],
        11: [1000000],
      },
      // 金丹九品：成丹时按道基、紫府异象、资质定品；品第影响斗法与冲击元神
      danPinNames: ['', '一品龙虎金丹', '二品金丹', '三品金丹', '四品金丹', '五品金丹', '六品金丹', '七品金丹', '八品金丹', '九品黄白金丹'],
      danPinPower: 0.06,   // 每高（低）一品，战力 ±6%（以五品为准）
      danPinBreak: 3,      // 每高（低）一品，冲击元神成功率 ±3（以五品为准）
      // 先天金汞（洞玄三重）：修到第三重时按道基、紫府异象和一点机缘定等第，是成丹之基
      jinhongNames: ['', '末等先天金汞', '下等先天金汞', '中等先天金汞', '上等先天金汞'],
      jinhongBreak: [0, -6, -2, 3, 10], // 结丹成功率修正
      // 元神法相：成就元神时按金丹品第和一点机缘定等，前古诸真分作下、中、上、至四等
      xiangNames: ['', '下等法相', '中等法相', '上等法相', '至等法相'],
      xiangPower: 0.12,    // 每高（低）一等，战力 ±12%（以中等为准）
      xiangBreak: 5,       // 每高（低）一等，冲击返虚成功率 ±5（以中等为准）
    },

    /* ---------- 资质 ----------
     * 此世修行不讲灵根，看资质、心性与机缘。资质影响悟胎息、修炼快慢与冲关。 */
    aptitude: { min: 5, max: 95, npcMean: 45, playerMean: 50, sd: 15 },

    /* ---------- 采气属相 ----------
     * 天地灵气属相万千，这里只取八种。练炁士只能炼化与自家练炁术相合的灵气，
     * 采到相反属相的灵气非但炼不动，反而伤身；符钱属“元”，人人可用。
     * 紫府能纯化灵机，到了紫府便不太挑属相；金丹诸气浑成，不再为采气所困。 */
    attrs: ['清', '浊', '阳', '阴', '刚', '柔', '烈', '寒'],
    attrFit: { match: 1.25, neutral: 0.8, opp: 0.3, coin: 1.0, zifu: 1.0, jindan: 1.2 },

    /* ---------- 功法 ----------
     * 练炁术：决定采气属相与所成真炁。照原著，世间真炁分九阶三十六品，每阶又分下、中、上、至四品，
     *   一阶下品最次、九阶至品最高；练炁时胎息只沾染几分真炁的性质，到冲筑基时才把一身胎息炼成真炁，此后再不能换。
     *   真炁七阶及以上才能筑上品道基，四至六阶中品，三阶及以下下品。qi 是所成真炁的名目，pin 0–3 对应下、中、上、至品。
     *   原著出处：锭金真炁（玄真派，三阶中品）、赤鬽真炁（血莲宗，五阶中品）、景翼真炁（六阶下品）、洞灵元煞（八阶上品）、
     *   奇殃母精（怙照宗，九阶下品）、大无相常融真炁（颜熙留在南域的天外道藏，九阶下品）、大洞玉真（天池姜氏，九阶中品）、
     *   紫清真炁（上虞艾氏，九阶上品）、皇素玉真（赤明派，原著称世间真炁中的极品）。其余几门的名目是游戏拟的。
     * 开府真法：筑基三重圆满后开辟紫府的必需之物，品第决定紫府异象。 */
    techniques: {
      linghe: { kind: 'lianqi', name: '灵鹤吐纳导引术', tier: 2, pin: 0, qi: '鹤息真炁', attrs: ['清', '柔'], opp: ['烈', '浊'], mult: 0.95, price: 60, desc: '散修手里最常见的劣等练炁术' },
      guiyuan: { kind: 'lianqi', name: '归元子练炁要诀', tier: 3, pin: 0, qi: '归元真炁', attrs: ['清', '阳'], opp: ['阴', '浊'], mult: 1.0, price: 150, desc: '品秩不高，胜在中正平和' },
      chiyang: { kind: 'lianqi', name: '赤阳炼炁诀', tier: 4, pin: 1, qi: '赤阳真炁', attrs: ['阳', '烈'], opp: ['寒', '阴'], mult: 1.05, price: 450, desc: '采阳烈之气，五光宗的根本练炁法' },
      xuanshui: { kind: 'lianqi', name: '玄水真炁法', tier: 5, pin: 0, qi: '玄水真炁', attrs: ['寒', '柔'], opp: ['烈', '阳'], mult: 1.05, price: 700, desc: '采寒柔之气，花神府的根本练炁法' },
      dingjin: { kind: 'lianqi', name: '三炁照神术', tier: 3, pin: 1, qi: '锭金真炁', attrs: ['刚', '烈'], opp: ['寒', '浊'], mult: 1.0, price: 300, desc: '玄真派根本法门，可从练炁一直修到紫府；所成锭金真炁采金锐之气' },
      chimei: { kind: 'lianqi', name: '赤鬽血炁法', tier: 5, pin: 1, qi: '赤鬽真炁', attrs: ['阴', '烈'], opp: ['清', '阳'], mult: 1.07, price: 1100, desc: '南域魔宗血莲宗的练炁法，有抄本流落在金谷墟市。真炁带着血煞之气，斗法凶狠' },
      jingyi: { kind: 'lianqi', name: '景翼飞真法', tier: 6, pin: 0, qi: '景翼真炁', attrs: ['阳', '柔'], opp: ['阴', '浊'], mult: 1.1, price: 1600, desc: '正统仙道的练炁法，真炁轻灵。品秩只算中等，筑不成上品道基，将来丹品也难好' },
      handou: { kind: 'lianqi', name: '寒斗真炁', tier: 7, pin: 1, qi: '寒斗真炁', attrs: ['寒', '阴'], opp: ['阳', '烈'], mult: 1.15, price: 2600, desc: '以酷烈著称的上品真炁，打进人体内如伏蛇潜藏、寒意噬心，可筑上品道基' },
      dongling: { kind: 'lianqi', name: '洞灵元煞经', tier: 8, pin: 2, qi: '洞灵元煞', attrs: ['阴', '浊'], opp: ['清', '阳'], mult: 1.2, price: 5200, desc: '炼四方煞气入体的上品练炁法，成就筑基时引得煞气投体、半山落叶。南域极少见' },
      ziqing: { kind: 'lianqi', name: '紫清真炁', tier: 9, pin: 2, qi: '紫清真炁', attrs: ['清', '阳'], opp: ['浊'], mult: 1.25, price: 8000, desc: '上虞艾氏的家传练炁法，所成胎息幽耽玄妙、五气灿然，少有真炁比得上。玄门世族秘传，南域罕见' },
      // 下面几门只在腹地的世家、大派里流传（NPC 用；主角到腹地已是金丹，用不上了），大无相常融真炁另见颜熙道藏
      qiyang: { kind: 'lianqi', name: '奇殃母精', tier: 9, pin: 0, qi: '奇殃母精', attrs: ['阴', '柔'], opp: ['阳', '烈'], mult: 1.22, price: 0, desc: '怙照宗长老传下的练炁法，真炁洞畅幽冥、分形散影，出入有无都是等闲小事' },
      dadongyu: { kind: 'lianqi', name: '神烈飞决崇玄内法', tier: 9, pin: 1, qi: '大洞玉真', attrs: ['刚', '清'], opp: ['浊', '柔'], mult: 1.24, price: 0, desc: '天池姜氏的不传之秘，修出的大洞玉真名列前茅' },
      huangsu: { kind: 'lianqi', name: '冲虚至德道君食神炁义解', tier: 9, pin: 3, qi: '皇素玉真', attrs: ['清', '阳'], opp: ['浊', '阴'], mult: 1.3, price: 0, desc: '赤明派冲虚至德道君亲传，所成皇素玉真是世间真炁中的极品，就是赤明弟子也少有得传的' },
      wuxiang: { kind: 'lianqi', name: '大无相常融真炁', tier: 9, pin: 0, qi: '大无相常融真炁', attrs: [], opp: [], any: true, mult: 1.2, price: 0, desc: '空空道人观摩大自在天魔王作大变化时所创，千般变化、万种属相，什么灵气都采得，从不相冲。颜熙真人在天外得来，留在南域做了机缘。修成《散景敛形术》非它不可' },
      kaifu_low: { kind: 'kaifu', name: '玄关开府篇', grade: 1, mult: 1.0, price: 1600, desc: '下乘开府真法，开出的紫府异象下等' },
      kaifu_mid: { kind: 'kaifu', name: '三元开府真法', grade: 2, mult: 1.1, price: 4500, desc: '中乘开府真法，可开中等紫府异象' },
      kaifu_high: { kind: 'kaifu', name: '太清开府真经', grade: 3, mult: 1.25, price: 12000, desc: '上乘开府真法，可开上等紫府异象，向来只在大派世族间流转' },
      sanqi_kaifu: { kind: 'kaifu', name: '三炁照神术·紫府篇', grade: 1, mult: 1.0, price: 1200, desc: '三炁照神术的后半部，讲开辟紫府；玄真派弟子筑基后向长老房请授' },
      // 金丹以后的道书：结丹后修行全凭它（不必研习，手里有就用最好的一部）
      dao_low: { kind: 'dao', name: '温养金丹法', grade: 1, mult: 1.2, price: 30000, desc: '温养金丹、积蓄元神的寻常道书，中域坊市常备；比下乘开府真法强，不如上乘的' },
      dao_mid: { kind: 'dao', name: '九转还丹诀', grade: 2, mult: 1.35, price: 90000, desc: '讲金丹九还、炼神还虚的中乘道书，中域坊市常备，大派长老房可用道功换' },
      dao_high: { kind: 'dao', name: '太上元神真解', grade: 3, mult: 1.6, price: 250000, desc: '直指元神、返虚的根本道典，只在八派六宗的真传之间流转' },
      // 玉宸二十五正法（三经、五典、八功、九书）里三经之首，原著称“玄中经箓，其位最崇”
      xuanzhongjing: { kind: 'dao', name: '玄中太无自然开元经箓', grade: 4, mult: 1.9, price: 0, desc: '玉宸二十五正法中三经之首，九州之冠的修道宝典。只在道录殿，四院大比的魁首凭符诏可取，上宗弟子要立下海量功劳才换得' },

      /* 道术与神通（kind: 'shu'）：照原著，正统仙道里道术分下、中、上三乘，道术之上才是神通；
       * 金丹真人的法力才撑得起神通的损耗，洞玄以下斗法只能用道术。玉宸派的八功九书是神通里的无上大神通。
       * rank：1 下乘、2 中乘、3 上乘、4 神通、5 无上大神通。type：atk 攻伐、def 护身、dun 遁法、xiu 辅助修行（可以兼几类）。
       * 得了玉简还要参习：入门、小成、中成、大成，越往上越见威能。
       * 下乘、中乘里「庚金剑气术」是游戏拟的名目，其余名目都出自原著。 */
      qijia: { kind: 'shu', rank: 1, type: ['def'], minMajor: 1, name: '气甲术', price: 15, desc: '以胎息、真炁结一层气甲护身。下乘道术里最常见的一门，坊市里十几枚符钱就能买到' },
      xuejia: { kind: 'shu', rank: 1, type: ['def'], minMajor: 1, name: '血甲术', price: 25, desc: '以自身血气凝甲，比气甲术凶些，伤身也多些' },
      gengjin: { kind: 'shu', rank: 1, type: ['atk'], minMajor: 1, name: '庚金剑气术', price: 30, desc: '把真炁炼作一缕金锐之气伤人，下乘道术里的寻常杀伐手段' },
      hufeng: { kind: 'shu', rank: 1, type: ['dun'], minMajor: 1, name: '小呼风唤雾术', price: 20, desc: '呼风唤雾，遮人耳目，逃遁时好用' },
      jinren: { kind: 'shu', rank: 1, type: ['dun', 'def'], minMajor: 1, name: '金人代形', price: 40, desc: '临危时化出一具金人替身挡灾，本体趁机脱身' },
      jiexing: { kind: 'shu', rank: 2, type: ['atk'], minMajor: 2, name: '解形遁变之术', price: 900, desc: '附在所驱之物上，可出幽入冥、形随影变、分化无穷，叫人防不胜防' },
      sanjing: { kind: 'shu', rank: 3, type: ['dun'], minMajor: 2, name: '散景敛形术', price: 0, needQi: 'wuxiang', desc: '劫仙之祖为补“大无相常融真炁”的不足而创，地阙金章隐沦部里排名前首的敛形之法：遮掩一身气机血气，洞玄炼师也难窥破行藏，功行足时连草木金石的气机都仿得出。不以大无相常融真炁为根基修不成' },
      dongjing: { kind: 'shu', rank: 2, type: ['xiu'], minMajor: 2, name: '动静雷音导引术', price: 1200, desc: '五光宗辅助练炁的导引法门。练炁时修炼速度 +12%（大成时）', xiu: { cult: { majors: [2], mult: 0.12 } } },
      dari: { kind: 'shu', rank: 3, type: ['atk', 'def'], minMajor: 2, name: '先天大日神光', price: 26000, desc: '能攻能守的上乘道术：放出去如一轮天日巡空，荡灭一切；收回来以神光裹住身躯，辟邪护命。无需外物引子，只是极难修持' },
      sishan: { kind: 'shu', rank: 3, type: ['xiu', 'atk'], minMajor: 3, name: '四山斗决', price: 20000, desc: '玉宸派长赢院弟子筑基三重时多选它来破紫府壁障：修到中成，神意可勘破虚空迷障。冲紫府成功率 +12（大成时），也是一门护道杀伐之术', xiu: { brk: { zifu: 12 } } },
      pili: { kind: 'shu', rank: 3, type: ['dun'], minMajor: 2, name: '霹雳飞雷遁法', price: 24000, desc: '玉宸上真所创的上乘遁法，化作雷光遁走，真炁足够时一日千里' },
      jiguang: { kind: 'shu', rank: 3, type: ['dun'], minMajor: 2, name: '极光大遁', price: 24000, need: 'ganyin', desc: '怙照宗的上乘遁法，遁速冠绝同侪。入门要一块干银星矿作引子' },
      xiaoyuanci: { kind: 'shu', rank: 3, type: ['atk'], minMajor: 5, name: '小元磁神光', price: 30000, desc: '从先天魔宗大神通「上极元磁仙光」拆分简化而来，正合洞玄修为使用，极克剑修' },
      zqsl_up: { kind: 'shu', rank: 3, type: ['atk'], minMajor: 2, name: '紫清神雷·上卷', price: 30000, desc: '玉宸四大神通雷法之首「紫清神雷」被前辈拆成上下两卷，只修上卷时是一门上乘道术，正合金丹以下斗法。成丹后得了下卷，两卷合一才是神通' },
      shenlie: { kind: 'shu', rank: 3, type: ['atk'], minMajor: 2, name: '神烈剑经', price: 26000, desc: '一部上乘剑经，赤明派剑修多从它入门' },
      zqsl: { kind: 'shu', rank: 4, type: ['atk'], minMajor: 6, name: '紫清神雷', price: 0, merge: 'zqsl_up', desc: '上下两卷合一的紫清神雷，长于破煞炼魔，叱咤之音震荡百里。要先修过上卷，进境从上卷接着算' },
      beidou: { kind: 'shu', rank: 4, type: ['atk'], minMajor: 6, name: '北斗罡雷', price: 0, desc: '玉宸除太乙神雷之外杀力最盛的四大神通雷法之一。非有缘法、根性的弟子不授' },
      wuyin: { kind: 'shu', rank: 4, type: ['atk'], minMajor: 6, name: '五阴擒拿大手印', price: 0, desc: '怙照宗的神通。南域万宝楼当年错收了这门神通放在楼里卖，一夜之间满楼覆灭' },
      jianqi: { kind: 'shu', rank: 4, type: ['atk'], minMajor: 6, name: '剑气雷音', price: 0, merge: 'shenlie', desc: '赤明派剑修的神通境界：剑气破空时隐有雷音。要先修过神烈剑经，进境接着算' },
      taiyi: { kind: 'shu', rank: 5, type: ['atk'], minMajor: 7, name: '太乙神雷', price: 0, desc: '玉宸八功九书之首，九州四海从来排第一的杀伐神通，中乙剑派的剑术、先天魔宗的魔功都不及它' },
      xukong: { kind: 'shu', rank: 5, type: ['def', 'dun'], minMajor: 6, name: '虚空大罗法', price: 0, desc: '玉宸八功之一。施展时身形化入虚空，神光打来也只是穿身而过' },
      meihua: { kind: 'shu', rank: 5, type: ['xiu'], minMajor: 6, name: '梅花易数', price: 0, desc: '玉宸八功里的占验法：明天理、得凶吉、预未来。冲元神及以上各关成功率 +8（大成时）', xiu: { brk: { yuanshen: 8, zhangguan: 8, fanxu: 8, mizhang: 8, chunyang: 8, sanzai: 8, hedao: 8, jiunan: 8 } } },
      lianjian: { kind: 'shu', rank: 5, type: ['atk'], minMajor: 7, name: '炼剑成丝', price: 0, merge: 'jianqi', desc: '赤明派剑道的极境之一，剑炼成丝，无物不断。要先修过剑气雷音' },
    },
    tierNames: ['', '一阶', '二阶', '三阶', '四阶', '五阶', '六阶', '七阶', '八阶', '九阶'],
    qiPinNames: ['下品', '中品', '上品', '至品'],
    // 真炁品秩（1–36）在斗法里的分量：练炁、筑基全凭真炁，紫府、洞玄减半，金丹诸气浑成后不再单算
    qiPower: { mid: 14, per: 0.012, majors: { 2: 1, 3: 1, 4: 0.5, 5: 0.5 } },
    gradeNames: ['', '下乘', '中乘', '上乘', '玄门至典'],
    shuRankNames: ['', '下乘道术', '中乘道术', '上乘道术', '神通', '无上大神通'],
    daojiNames: ['', '下品道基', '中品道基', '上品道基'],
    yixiangNames: ['', '下等紫府异象', '中等紫府异象', '上等紫府异象'],
    daojiTiers: [4, 7], // 真炁阶数 ≥4 中品、≥7 上品
    yanxiCang: 0.06, // 南域遗府破禁深入时，撞上颜熙真人天外道藏的机会（一生一回）
    switchLoss: 0.3, // 练炁途中改修别的练炁术，真炁性质不同，修为折三成

    /* ---------- 修炼 ---------- */
    cultivation: {
      aptBase: 0.7,
      aptRange: 0.6,
      qiMult: [0.4, 0.6, 0.85, 1.0, 1.2, 1.45, 1.75, 2.1], // 按地点灵机等级 0–7：六级是灵窟福地，七级只有自家洞天
      outsiderQi: { sect: 1, clan: 1, bigsect: 2 },          // 外人在宗门山门、家族驻地只能借到山门外的灵机
      qijuBonus: 0.3,
      qijuDays: 90,          // 一颗中孚丹管三个月
      oldAgeCoef: 0.6,
      injury: { light: 0.6, heavy: 0.2 },
      npcDiligence: [0.55, 0.9], // NPC 一年里真正用在修炼上的比例
      consultFrac: [0.04, 0.09], // 请教一次得到的修为（占当前所需）
      // 以符钱修行：符钱由虚空灵气铸成，属“元”，人人可炼，只是奢费；胎息还炼不了外物
      coin: { qi: 3, perYear: { 2: 60, 3: 240, 4: 800, 5: 2000, 6: 5000, 7: 12000, 8: 30000, 9: 60000, 10: 100000, 11: 150000 } },
    },

    /* ---------- 突破 ----------
     * taixi：凡人悟胎息气感。“死生畏怖，神明自得”，近年里在生死之间走过一遭的人更容易悟得。
     * 胎息壮大到头、手上有练炁术，便自然转入练炁（没有关隘）；没有练炁术就只能停在胎息。
     * zhuji：练炁九层圆满，胎息转为真炁、筑下道基。
     * zifu：筑基三重圆满，凭开府真法开辟紫府。
     * dongxuan：紫府三重圆满，调和水火，铸龙虎炉鼎。
     * jindan：洞玄三重圆满，凭凝丹大药结丹。紫府以上每破大境，都有天罚降下。 */
    breakthrough: {
      minor: { base: 70, failLoss: 0.1, days: 30 },
      // 悟胎息不是越试越难，而是屡次参悟渐有心得：每失败一次 +4%，最多 +24%
      taixi: { base: 20, aptFactor: 0.5, lifeDeath: 20, lifeDeathYears: 3, failLossMin: 0.3, failLossMax: 0.5, deathChance: 0, restYears: 1, days: 30, mild: true, failBonus: 4, failBonusCap: 24 },
      zhuji: { base: 35, pillItem: 'zhuji', pill: 25, failLossMin: 0.3, failLossMax: 0.5, deathChance: 0.05, days: 90 },
      zifu: { base: 30, failLossMin: 0.3, failLossMax: 0.5, deathChance: 0.06, days: 180, tianfa: true },
      dongxuan: { base: 25, failLossMin: 0.3, failLossMax: 0.5, deathChance: 0.08, days: 180, tianfa: true },
      jindan: { base: 20, needItem: 'ningdan', minQi: 4, failLossMin: 0.3, failLossMax: 0.5, deathChance: 0.15, days: 360, tianfa: true },
      // 元神：要有一处「地」——在灵机六级、你用得上的灵窟福地里冲关（大派山门、福地洞府）
      // 元神、返虚屡败渐有心得（不越败越难）：每败一次 +4，最多 +20
      yuanshen: { base: 22, minQi: 6, failLossMin: 0.2, failLossMax: 0.4, deathChance: 0.12, days: 720, tianfa: true, failBonus: 4, failBonusCap: 20 },
      // 元神十二重障关：感悟够了法力自然而动，粉碎障关，绝无祸患（原著）。没破开只是白坐了一回关，丢些感悟、歇一年。
      // 基础成功率随重数递减：第二重 base，此后每重 -perStage
      zhangguan: { base: 80, perStage: 4, failLossMin: 0.1, failLossMax: 0.2, deathChance: 0, days: 360, mild: true, restYears: 1, failBonus: 6, failBonusCap: 30 },
      // 成就元神时连破两重障关的机会（按法相：至等、上等），原著说近九成九的人只破得开第一重
      twoGates: { 4: 0.5, 3: 0.1 },
      // 返虚：先开辟一座洞天，在自家洞天里冲关，冲关前自判道途（见 realms.fanxuPaths）
      fanxu: { base: 20, failLossMin: 0.2, failLossMax: 0.4, deathChance: 0.08, days: 1080, tianfa: true, failBonus: 4, failBonusCap: 20 },
      // 返虚破障：要以灵脉护住法躯（自家洞天，或你用得上的灵窟）。失败便是「失道之祸」：轻则走火入魔、修为丧失过半，
      // 重则元灵迷失、沦为守尸之鬼。base、deathChance 按道途（fanxuPaths）；deathByQi：灵脉越好越保得元灵不迷
      mizhang: { failLossMin: 0.5, failLossMax: 0.6, days: 720, restYears: 3, failBonus: 4, failBonusCap: 16, minQi: 6, deathByQi: { 6: 1.3, 7: 1 }, tiangu: { chance: 8, death: 0.4, qi: 9 } },
      // 纯阳三灾：渡风灾初成纯阳，再渡火灾、雷灾。三灾临头千难万难，八派六宗的真传也只敢困守洞天枯坐，在自家洞天里才渡得
      chunyang: { base: 22, failLossMin: 0.2, failLossMax: 0.4, deathChance: 0.1, days: 1080, tianfa: true, failBonus: 5, failBonusCap: 25, zai: '风灾' },
      sanzai: { base: 24, failLossMin: 0.2, failLossMax: 0.4, deathChance: 0.1, days: 1080, tianfa: true, failBonus: 5, failBonusCap: 25 },
      // 合道：三灾渡尽，与道合真，成就道君
      hedao: { base: 15, failLossMin: 0.2, failLossMax: 0.4, deathChance: 0.08, days: 1800, tianfa: true, failBonus: 4, failBonusCap: 24 },
      // 合道九难：道君再过九重劫难，一步步道与身合；九难过尽，功成飞仙，仙业自显（大冶）
      jiunan: { base: 32, perStage: 1, failLossMin: 0.2, failLossMax: 0.35, deathChance: 0.06, days: 3600, tianfa: true, failBonus: 4, failBonusCap: 24 },
      sanzaiNames: ['风灾', '火灾', '雷灾'],
      xuduZai: 10,      // 渡三灾时还留着胥都大丹：天运青睐，消弭些灾数
      // 小境界里需要外药的几重：键为“大境界.当前重数”
      minorNeeds: {
        '3.2': { item: 'danmusha', qty: 1, why: '龟蛇相抱须借全真外药' },
        '4.2': { item: 'yusui', qty: 1, why: '换魂消魄须外药添力' },
        '5.1': { item: 'wujing', qty: 5, why: '摄取五精须集齐五份先天五行之精' },
      },
      daojiMod: [0, -5, 3, 12],
      yixiangMod: [0, -5, 3, 12],
      yuanshenPill: 12, // 冲击元神时点上定神玄香
      xuduPill: 20,     // 冲击元神时服下胥都大丹
      daojiPower: [1, 0.9, 1.0, 1.15],
      aptitudeFactor: 0.3,
      qiBonus: 8,
      qiBonusMin: 4,
      accumPerYear: 2,
      accumMax: 10,
      // 冲关屡败渐有心得（各关一样）：每败一次 +4，至多 +20；悟胎息、障关等另设的照各自的
      failBonus: 4,
      failBonusCap: 20,
      restYears: 3,
      min: 5,
      max: 90,
      majorMax: 85,
      npcTryChance: 0.5,
      // NPC 手上有没有冲关用的丹药外药（按势力）
      npcPill: { sect: 0.5, clan: 0.3, league: 0.2, evil: 0.2, none: 0.08 },
      npcKaifu: [0, 0.6, 0.3, 0.1], // NPC 开府真法品第的分布
    },

    /* ---------- 伤病与寿元 ---------- */
    life: {
      adultAge: 16,
      lightInjuryDays: 90,
      heavyInjuryDays: 540,
      restHealMult: 2,          // 静养时伤愈速度
      healPillDays: 120,        // 一颗小白阳丹抵多少天伤势
      heavyInjuryDeathYear: 0.03,
      heavyDongtianMult: 0.25,  // 在自家洞天里养伤，重伤恶化的几率乘这个
      heavyDongfuMult: 0.5,     // 在自家洞府里
      npcAccident: 0.004,       // NPC 每年意外身亡（乘以所在地危险度修正）
      npcAccidentRealm: [1, 1, 1, 0.7, 0.5, 0.35, 0.2, 0.08], // 按大境界打折：凡人/胎息/练炁照旧，筑基起递减，元神以后只剩一成不到
      oldFrac: 0.2,
    },

    /* ---------- 性格 ---------- */
    traits: {
      list: ['谨慎', '孝顺', '贪婪', '正直', '孤傲', '仁慈', '野心勃勃'],
      desc: {
        谨慎: '遭遇险境时更易全身而退',
        孝顺: '重情义，结交长辈更容易',
        贪婪: '见利忘义，交易与结交时更计较',
        正直: '不屑旁门左道，魔道中人更厌恶此人',
        孤傲: '难以结交，突破率 +3%',
        仁慈: '与人为善，结交更容易',
        野心勃勃: '不甘人下，常冒险求机缘',
      },
      exclusive: [['谨慎', '野心勃勃'], ['仁慈', '贪婪'], ['孝顺', '孤傲']],
      proudBreak: 3,
      cautiousFlee: 10,
    },

    /* ---------- 关系 ---------- */
    relations: {
      maxPerPerson: 12,
      closeThreshold: 40,
      feudThreshold: -40,
      consultMin: 30,
    },

    /* ---------- 世界生成：东弥州南域 ----------
     * 南域是东弥州有名的穷土，灵机匮乏，没有大派，只有几家二流宗门和许多小宗、凡人小国。 */
    world: {
      region: '东弥州 · 南域',
      gridW: 10, gridH: 8,
      // 每类地点的数量、灵机、危险度；fixed 为本类前几处的固定地名
      placeTypes: {
        city: { name: '凡人国', count: 3, qi: [0, 1], danger: [0, 0], market: true, work: true, fixed: ['容国', '丹粟国', '郑国'] },
        town: { name: '仙道墟市', count: 1, qi: [1, 2], danger: [0, 0], market: true, work: true, fixed: ['浮玉泊'] },
        sect: { name: '宗门山门', count: 3, qi: [3, 4], danger: [0, 0], market: true },
        clan: { name: '修道家族', count: 2, qi: [2, 3], danger: [0, 1] },
        wild: { name: '荒山野岭', count: 7, qi: [1, 3], danger: [1, 3], fixed: ['炀山'] },
        danger: { name: '险地', count: 3, qi: [3, 5], danger: [3, 5], fixed: ['地渊'] },
        // 以下只在东弥州腹地（南域以北）出现，由 outer 固定生成
        mart: { name: '大坊市', count: 0, market: true, work: true },
        bigsect: { name: '大派山门', count: 0 },
        sea: { name: '海外', count: 0 },
      },
      /* 东弥州腹地：南域以北，中间隔着万里荒原，金丹真人驾遁光才过得去。方位照原著：
       *   玉宸派本宗在东域宵明大泽（天地造化灵窟，九殿所在）；东域有二十余大国，景国是其一；
       *   赤明派据北域鹿台山，北域诸国（赵国、曹国等）在它治下；鹤鸣山是火霞门旧址，上空有流火宏化洞天的遗迹；
       *   怙照宗山门在西域极西处，西域灵气充裕、魔修横行，九危山顶有一池「琼胎阳罡」；
       *   东海是龙宫所在，颜熙真君的洞天也开在东海。
       * 只有“中域坊市”这个地名是本游戏自拟的（原著里中域着墨很少）。 */
      outer: {
        gate: { minMajor: 6, days: 60, why: '南域与中域之间隔着万里荒原，金丹真人驾遁光才过得去' },
        places: [
          { key: 'zhongyu', name: '中域坊市', type: 'mart', region: '中域', x: 5, y: -3, qi: 3, danger: 0, attr: '清', blurb: '东弥州中域往来的大坊市，各域修士都在此交易' },
          { key: 'jingguo', name: '景国', type: 'city', region: '东域', x: 10, y: -3, qi: 1, danger: 0, attr: '清', blurb: '东域二十余大国之一，境内的生米潭景都观是玉宸派下辖的道脉' },
          { key: 'yuchen', name: '宵明大泽', type: 'bigsect', region: '东域', x: 12, y: -6, qi: 6, danger: 0, attr: '清', blurb: '玉宸派本宗所在，一口天地造化灵窟，九殿都设在这里' },
          { key: 'donghai', name: '东海', type: 'sea', region: '东海', x: 15, y: -4, qi: 5, danger: 6, attr: '寒', blurb: '无尽东海，龙宫雄踞其中；返虚真君多在海外开辟洞天' },
          { key: 'zhao', name: '赵国', type: 'city', region: '北域', x: 5, y: -8, qi: 1, danger: 0, attr: '阳', blurb: '北域小国，在赤明派治下' },
          { key: 'chiming', name: '鹿台山', type: 'bigsect', region: '北域', x: 7, y: -11, qi: 6, danger: 0, attr: '烈', blurb: '赤明派山门，占着一座灵窟' },
          { key: 'fudi', name: '鹤鸣山', type: 'wild', region: '北域', x: 9, y: -9, qi: 6, danger: 5, attr: '烈', blurb: '火霞门旧址，灵脉还在，上空悬着流火宏化洞天的遗迹；无主之地，可开洞府' },
          { key: 'jiuwei', name: '九危山', type: 'danger', region: '西域', x: 1, y: -6, qi: 6, danger: 6, attr: '刚', blurb: '西域险地，峰顶相传有一池琼胎阳罡；天魔潮时魔物从这里涌出' },
          { key: 'huzhao', name: '怙照宗', type: 'bigsect', region: '西域', x: -3, y: -7, qi: 6, danger: 0, attr: '阴', blurb: '魔道六宗之一的山门，在西域极西处' },
        ],
        links: [['gate', 'zhongyu'], ['zhongyu', 'jingguo'], ['jingguo', 'yuchen'], ['zhongyu', 'yuchen'], ['yuchen', 'donghai'], ['zhongyu', 'zhao'], ['zhao', 'chiming'], ['chiming', 'fudi'], ['fudi', 'yuchen'], ['zhongyu', 'jiuwei'], ['jiuwei', 'huzhao'], ['zhao', 'jiuwei']],
        // 上一版的地名 → 现在的键（旧存档迁移用）
        oldNames: { '中域坊市': 'zhongyu', '玉宸派': 'yuchen', '赤明派': 'chiming', '怙照宗': 'huzhao', '九危山': 'jiuwei', '东域福地': 'fudi', '东海': 'donghai' },
      },
      linkExtra: 0.35,     // 在最小连通树之外多连的比例
      daysPerUnit: 4,      // 地图上一格的赶路天数
      travelEncounterPerDanger: 0.035, // 每段路每级危险度的遭遇概率
      travelMemberMult: 0.5,           // 宗门、家族中人赶路：有师门撑腰，劫修妖物多半不来招惹
      npcCount: 80,
      factionMembers: { sect: [12, 16], clan: [6, 9], league: [5, 7], evil: [4, 6] },
      looseMin: 14,        // 至少保留的散修数
      looseMoveChance: 0.25,
    },

    // 宗门按“品级”给人：tier 1 小宗（掌门洞玄），tier 2 二流宗门（掌门金丹，宗中另有元神真君闭关不出）
    // seat：宗门写山门名；town 为墟市；hide 为荒僻或凶险之地（改名为势力名）
    factionDefs: [
      // library：长老房能请授的功法（merit 为所需道功，0 即白给；minMajor 为最低大境界）
      // join：拜入条件。base 基础成功率；maxAge 年龄上限；closed 表示眼下不收人
      {
        key: 'xuanzhen', name: '玄真派', type: 'sect', tier: 1, seat: '小甘山', tech: 'dingjin', blurb: '小甘山上的小宗，派中最高不过洞玄炼师，传闻是玉宸派下辖的数百道脉之一',
        library: [{ tech: 'dingjin' }, { tech: 'sanqi_kaifu', minMajor: 3 }, { tech: 'chiyang', merit: 150, note: '派中收着的外派抄本' }, { tech: 'qijia' }, { tech: 'gengjin', merit: 5 }, { tech: 'jiexing', merit: 60, minMajor: 2 }],
        join: { minMajor: 1, base: 55, maxAge: 60 },
      },
      {
        key: 'wuguang', name: '五光宗', type: 'sect', tier: 2, seat: '五光宗', tech: 'chiyang', blurb: '南域勉强算得上玄门正统的二流宗门，宗中有元神真君驻世，不问俗务',
        library: [{ tech: 'chiyang' }, { tech: 'kaifu_low', minMajor: 3 }, { tech: 'kaifu_mid', merit: 260, minMajor: 3 }, { tech: 'handou', merit: 320 }, { tech: 'gengjin' }, { tech: 'dongjing', merit: 80, minMajor: 2 }],
        join: { minMajor: 2, base: 15, maxAge: 40 },
      },
      {
        key: 'huashen', name: '花神府', type: 'sect', tier: 2, seat: '花神府', tech: 'xuanshui', blurb: '南域二流大宗，不定期开「撷芳宴」招收散修，只取最后活下来的几人',
        library: [{ tech: 'xuanshui' }, { tech: 'kaifu_low', minMajor: 3 }, { tech: 'kaifu_mid', merit: 260, minMajor: 3 }, { tech: 'handou', merit: 320 }, { tech: 'hufeng' }, { tech: 'jinren', merit: 20 }],
        join: { closed: '花神府只在「撷芳宴」上收人，眼下没有开宴' },
      },
      { key: 'jingu', name: '金谷墟市', type: 'league', seat: 'town', blurb: '洞玄散修怀悟洞主在浮玉泊所建的墟市，南域散修多在此交易', leader: 'huaiwu' },
      // 八派六宗（tier 3）：只在东弥州腹地，金丹以后才见得到。掌门是元神真人，另有返虚、纯阳真君与道君闭关不出
      {
        key: 'yuchen', name: '玉宸派', type: 'sect', tier: 3, outer: true, tech: 'ziqing', techs: { ziqing: 2, dadongyu: 2, dongling: 2, handou: 3 },
        blurb: '玄门八派之一。本宗占着东域宵明大泽这口灵窟，设九殿；另有青阳、长赢、白商、玄英四大下院教导弟子。玄真派这样的小宗只是它下辖的数百道脉之一，道脉出身的金丹真人可凭道脉符书改投',
        transferNote: '落籍白商院（四大下院里最不看出身的一院）',
        library: [{ tech: 'dao_low' }, { tech: 'dao_mid', merit: 3000 }, { tech: 'dao_high', merit: 12000, minMajor: 7 },
          { tech: 'sishan', merit: 800 }, { tech: 'pili', merit: 1500 }, { tech: 'zqsl_up', merit: 2000, minDaoji: 2 },
          { tech: 'zqsl', merit: 6000, minMajor: 6, minPin: 4, needTech: 'zqsl_up' }, { tech: 'beidou', merit: 9000, minMajor: 6, minPin: 3 },
          // zf：玉宸二十五正法（三经、五典、八功、九书），收在道录殿；四院大比魁首凭道录殿符诏可任取一门
          { tech: 'xukong', merit: 30000, minMajor: 6, minPin: 2, zf: '八功' }, { tech: 'meihua', merit: 25000, minMajor: 6, minPin: 3, zf: '八功' },
          { tech: 'taiyi', merit: 40000, minMajor: 7, minXiang: 3, zf: '八功' }, { tech: 'xuanzhongjing', merit: 80000, minMajor: 7, minXiang: 3, zf: '三经' }],
        join: { minMajor: 6, base: 5, daomai: 'xuanzhen' },
      },
      {
        key: 'chiming', name: '赤明派', type: 'sect', tier: 3, outer: true, tech: 'ziqing', techs: { ziqing: 3, huangsu: 0.3, dongling: 2, handou: 3 },
        blurb: '玄门八派之一，据北域鹿台山，北域诸国都在它治下。真传多出自玄门世族，收外人只看金丹品第',
        library: [{ tech: 'dao_low' }, { tech: 'dao_mid', merit: 3000 }, { tech: 'dao_high', merit: 12000, minMajor: 7 },
          { tech: 'shenlie', merit: 1500 }, { tech: 'dari', merit: 2500 }, { tech: 'jianqi', merit: 7000, minMajor: 6, needTech: 'shenlie' },
          { tech: 'lianjian', merit: 35000, minMajor: 7, needTech: 'jianqi' }],
        join: { minMajor: 6, base: 15, pin: 8 },
      },
      {
        key: 'huzhao', name: '怙照宗', type: 'sect', tier: 3, outer: true, tech: 'qiyang', techs: { qiyang: 3, dongling: 3, handou: 2 },
        blurb: '魔道六宗之一，山门在西域极西处，与玉宸、赤明「二玄」在东弥州维持着玄魔平衡。行事酷烈，当年南域的万宝楼错卖了它一门神通，一夜之间满楼覆灭。收人不问出身，只是正直之人入不了它的门',
        library: [{ tech: 'dao_low' }, { tech: 'dao_mid', merit: 2500 }, { tech: 'dao_high', merit: 10000, minMajor: 7 },
          { tech: 'jiguang', merit: 1500 }, { tech: 'xiaoyuanci', merit: 2500, minMajor: 5 }, { tech: 'wuyin', merit: 7000, minMajor: 6 }],
        join: { minMajor: 6, base: 40, refuseTrait: '正直' },
      },
      { key: 'miaonan', name: '苗南峰', type: 'evil', seat: 'hide', blurb: '魔道流寇，苗南老祖带着几个弟子在路上收买路符钱', leader: 'miaonan' },
    ],

    /* ---------- 原著人物 ----------
     * 只放配角，境界、身份照原著；他们和别的 NPC 一样修炼、老去、陨落。
     * realm 为 [大境界, 重数]；faction 为势力键；role 为 leader 时接任该势力之主。 */
    notables: [
      { key: 'huaiwu', name: '怀悟洞主', sex: 'M', realm: [5, 3], age: 330, faction: 'jingu', role: 'leader', daoji: 2, yixiang: 2, jinhong: 2,
        gear: [{ name: '怀悟洞', slot: 'def', grade: 4, jin: 33 }, { name: '飞剑', slot: 'atk', grade: 3, jin: 28 }], arts: { jiexing: 4, jinren: 3 },
        bio: '南域有名的散修炼师，洞玄三重。当年冲入洞玄时一力压服了三大邪魔散修，在浮玉泊建起金谷墟市。' },
      { key: 'miaonan', name: '苗南老祖', sex: 'M', realm: [3, 3], age: 170, faction: 'miaonan', role: 'leader', traits: ['贪婪'],
        gear: [{ name: '五方升阳旗', slot: 'atk', grade: 5, jin: 42, ling: 40 }], arts: { xuejia: 4, hufeng: 4 },
        bio: '苗南峰的魔道流寇，筑基三重，手执一面「五方升阳旗」，带着苗南七子在路上收买路符钱。几回被紫府高功出手追杀都逃得性命，丹粟国几家小门派都要看他脸色。' },
      { key: 'junyao', name: '君尧', sex: 'M', realm: [7, 7], age: 520, faction: 'yuchen', role: 'elder', tech: 'ziqing', aptitude: 95, daoji: 3, yixiang: 3, jinhong: 4, danPin: 1, xiang: 4,
        gear: [{ name: '元都斩魔剑', slot: 'atk', grade: 6, jin: 58 }, { name: '紫弥宝衣', slot: 'def', grade: 3, jin: 30 }, { name: '玉景飞宫', slot: 'dun', grade: 5, jin: 46 }], arts: { zqsl: 4, beidou: 4, xukong: 3 },
        bio: '玉宸派道子，上届丹元大会的魁首，玉宸派里上一个得了「斗法胜」名号的人。成道前曾在天外觅得一篇上乘开府真法，如今被称作宇内元神第一。' },
      { key: 'yanxi', name: '颜熙', sex: 'M', realm: [8, 10], age: 2600, placeKey: 'donghai', tech: 'linghe', aptitude: 40, daoji: 1, yixiang: 1, jinhong: 1, danPin: 9, xiang: 2,
        gear: [{ name: '飞剑', slot: 'atk', grade: 5, jin: 50 }, { name: '宝衣', slot: 'def', grade: 5, jin: 45 }, { name: '云舟', slot: 'dun', grade: 5, jin: 50 }], arts: { dari: 4, pili: 4 },
        bio: '南域散修出身的真君。道书里记着他是低阶真炁、下等道基、下等紫府异象、末等先天金汞，却逆反根果，一路证得元神、返虚，在东海开辟了「舜烈碧云源固」洞天，与东海龙族牵连甚深；如今迷障已破了九重，离纯阳不远了。九州四海的散修里只出了这一个颜熙。' },
    ],

    factionTypes: {
      sect: { name: '宗门' },
      clan: { name: '修道家族', library: [{ tech: 'guiyuan' }, { tech: 'kaifu_low', merit: 120, minMajor: 3 }, { tech: 'qijia' }, { tech: 'xuejia', merit: 5 }] },
      league: { name: '墟市' },
      evil: { name: '魔道' },
    },

    /* ---------- 宗门、家族的底蕴 ----------
     * 玄真派设刑房、功德房、奉事房、饲灵房、长老房五房：根本法门向长老房请授即可；
     * 道术、外药要靠给宗门立功，由功德房记下道功，再去长老房换取。差事和符诏由奉事房派发。
     * 家族照此办理，只是库藏薄些。 */
    house: {
      meritName: '道功',
      // 奉事房差事每月记的道功，按大境界
      taskMerit: { 1: 1, 2: 2, 3: 4, 4: 8, 5: 12, 6: 20, 7: 40, 8: 60, 9: 90, 10: 120, 11: 150 },
      // 领符诏除妖：对手按你的战力定，打赢了才记道功（差事道功 × meritMult）
      mission: { days: 60, meritMult: 4, stone: [10, 30], powerSwing: [0.4, 1.0] },
      // 功德房收的东西，每件记多少道功
      submit: { beastCore: 3, rareHerb: 5 },
      manualRate: 15, // 献上本门没有的道书抄本：每 15 符钱的价值记 1 道功，每部只记一次
      learnDays: 10,
      joinDays: 15,
      // 长老房库藏：merit 道功；minMajor 最低大境界；minTier 只有二流宗门才有；clan 家族库藏也有
      store: [
        { item: 'qiju', merit: 3, clan: true },
        { item: 'heal', merit: 2, clan: true },
        { item: 'fuqi1', merit: 30 },
        { item: 'fayi1', merit: 25 },
        { item: 'suo1', merit: 25 },
        { item: 'zhuji', merit: 40, minMajor: 2, clan: true },
        { item: 'danmusha', merit: 90, minMajor: 3, clan: true },
        { item: 'yanshou', merit: 120, minMajor: 3 },
        { item: 'fuqi2', merit: 150, minMajor: 3 },
        { item: 'fayi2', merit: 140, minMajor: 3 },
        { item: 'suo2', merit: 140, minMajor: 3 },
        { item: 'yusui', merit: 220, minMajor: 4 },
        { item: 'wujing', merit: 160, minMajor: 4 },
        { item: 'ningdan', merit: 900, minMajor: 5, minTier: 2 },
        { item: 'yunhua', merit: 450, minMajor: 5, minTier: 2 },
        { item: 'tianyou', merit: 300, minMajor: 5, minTier: 2 },
        { item: 'minghe', merit: 350, minMajor: 5, minTier: 2 },
        { item: 'xuanshi', merit: 350, minMajor: 5, minTier: 2 },
        { item: 'qiming', merit: 300, minMajor: 5, minTier: 2 },
        { item: 'laoxian', merit: 250, minMajor: 5, minTier: 2 },
        { item: 'zhanranfa', merit: 1500, minMajor: 5, minTier: 2 },
        { item: 'fuqi3', merit: 1500, minMajor: 6, minTier: 3 },
        { item: 'fayi3', merit: 1400, minMajor: 6, minTier: 3 },
        { item: 'suo3', merit: 1400, minMajor: 6, minTier: 3 },
        { item: 'miluo', merit: 400, minMajor: 6, minTier: 3 },
        { item: 'lingtian', merit: 30000, minMajor: 8, minTier: 3 },
        { item: 'chenshan', merit: 1200, minMajor: 6, only: 'yuchen' },
        { item: 'ziyi', merit: 1200, minMajor: 6, only: 'yuchen' },
        { item: 'yujing', merit: 6000, minMajor: 6, only: 'yuchen' },
        { item: 'ganyin', merit: 600, minMajor: 2, only: 'huzhao' },
        { item: 'dingshen', merit: 2000, minMajor: 6, minTier: 3 },
        { item: 'zhengyang', merit: 500, minMajor: 6, minTier: 3 },
        { item: 'dadong', merit: 3000, minMajor: 7, minTier: 3 },
        { item: 'xuanzhong', merit: 20000, minMajor: 7, minTier: 3 },
        { item: 'tiangu', merit: 8000, minMajor: 8, only: 'yuchen' },
      ],
      // 捐输：八派六宗的门人可向功德殿捐献符钱折算道功（每份 donateStone 符钱折 donateMerit 道功）
      donate: { minTier: 3, stone: 10000, merit: 200 },
      /* 玉宸九殿（照原著）：功德殿批功，道兵殿培育力士神将、符甲傀儡，丹符殿炼丹制符（龙进阁向东州道脉分发丹符），
       * 灵宝殿打造法宝器物，道录殿收藏经书典籍与二十五正法，大知殿是辈分极高的上真清修之所，玄教殿主刑罚戒律，
       * 十方殿掌杂事灵机（以道功换宵明大泽的灵地），周行殿总摄门中诸事、殿主向来由道子亲任。
       * 元神以后入殿任长老，返虚为副殿主，纯阳以上为殿主；职权随职位加重（rank 1–3）。转殿要隔 every 年。
       * 职权的数值是游戏拟的。 */
      halls: {
        order: ['gongde', 'daobing', 'danfu', 'lingbao', 'daolu', 'dazhi', 'xuanjiao', 'shifang', 'zhouxing'],
        every: 60, days: 30,
        rankNames: ['', '长老', '副殿主', '殿主'],
        defs: {
          gongde: { name: '功德殿', duty: '批功', perk: '捐输、上交折道功多 25%（副殿主 50%、殿主 75%）' },
          daobing: { name: '道兵殿', duty: '培育力士神将、符甲傀儡，伐山破庙、涤荡妖氛', perk: '有力士神将随行：斗法战力 ×1.08（副殿主 ×1.16、殿主 ×1.24）' },
          danfu: { name: '丹符殿', duty: '炼丹制符，向东州道脉分发丹药符箓', perk: '长老房兑换丹药灵物少花 20%；每 10 年分得一枚大洞精玉（副殿主 7 年、殿主 5 年）', dadongYears: [0, 10, 7, 5] },
          lingbao: { name: '灵宝殿', duty: '打造法宝器物（紫弥宝衣、玉景飞宫都出自此殿）', perk: '给法器祭炼禁制、炼形少花 30%（副殿主 40%、殿主 50%）' },
          daolu: { name: '道录殿', duty: '收藏前古以来的经书典籍，二十五正法在此', perk: '长老房传功少花 30% 道功（副殿主 40%、殿主 50%），参习道术快 30%（40%、50%）' },
          dazhi: { name: '大知殿', duty: '辈分极高、不好打理俗务的上真清修之所', perk: '不理俗务，专心清修：修炼速度 +10%（副殿主 20%、殿主 30%）', minMajor: 8 },
          xuanjiao: { name: '玄教殿', duty: '主刑罚戒律', perk: '执掌刑罚，劫修、仇家多半不敢招惹：遇上的机会减半' },
          shifang: { name: '十方殿', duty: '掌杂事灵机，分派灵地、职司', perk: '在宵明大泽分得一座灵岛：在宵明大泽修行灵机 +1；俸禄 ×1.5' },
          zhouxing: { name: '周行殿', duty: '总摄门中诸事，殿主由道子亲任', perk: '俸禄翻倍；长老房兑换少花 10%', minXiang: 3, needShida: true },
        },
      },
      // 门中职位：按境界自然升任，掌门另由推举或接任。俸禄按职位加成
      posts: { sect: ['弟子', '执事', '长老', '掌门'], clan: ['族人', '管事', '族老', '家主'], minMajor: [0, 3, 4], stipendMult: [1, 1.5, 1.8, 2.5] },
      // 修为远超掌门时，门中推举你接任：至少紫府，且高出掌门 tuijuGap 个小境界；推辞后 tuijuAgain 年内不再提
      tuijuMinMajor: 4, tuijuGap: 3, tuijuAgain: 20,
      // 每年的俸禄：符钱按大境界，宗门再按品级加成；练炁到洞玄另发中孚丹。
      // 俸禄只够贴补日用，涨得慢、有上限：关隘外药、法器这些大开销仍要自己挣、拿道功换（cap 是一年至多多少符钱）
      stipend: {
        sect: { stone: [0, 6, 24, 60, 120, 220, 400, 800, 1500, 2500, 3500, 5000], tierMult: [0, 1, 1.5, 2], qiju: 2, qijuMaxMajor: 5, cap: 10000 },
        clan: { stone: [0, 6, 18, 45, 100, 180, 320, 650, 1200, 2000, 2800, 4000], qiju: 1, qijuMaxMajor: 5, cap: 8000 },
      },
    },

    /* ---------- 天下大事 ----------
     * 日期开局就由种子排好，提前几年就有风声，玩家可以预先准备，不是只靠撞上。
     * 地渊开启：玄真派奉事房发地渊符诏，人人都可进去，越深越险、所得越好。
     * 撷芳宴：花神府招收散修，交了供奉连斗三场，活到最后的拜入花神府。
     * 道脉校考：玉宸派每三十年派巡照道人来查校道脉；玄真派弟子按同辈排名得上、中、下考，上考荐入玉宸派听讲。 */
    saga: {
      notice: 3,
      diyuan: { name: '地渊开启', every: [12, 20], first: [4, 8], years: 1, place: '地渊', days: 90, minMajor: 2,
        outerHerb: [2, 4], outerHurt: 0.3, midSwing: [0.6, 1.0], deepSwing: [1.0, 1.6], merit: { outer: 3, middle: 6, deep: 10 }, npcDeaths: [0, 3] },
      xiefang: { name: '花神府撷芳宴', every: [18, 30], first: [5, 12], years: 1, faction: 'huashen', minMajor: 2, rounds: 3, days: 30,
        fee: { base: 300, perRank: 60 }, foeRank: [-2, 0], loserDies: 0.5 },
      jiaokao: { name: '玉宸派道脉校考', every: [30, 30], first: [10, 16], years: 1, faction: 'xuanzhen', days: 30, peerAge: 25,
        tingjiangDays: 1080, tingjiangGain: 0.25, upperMerit: 20, midMerit: 10, midQiju: 4,
        // 上考的下赐按境界：练炁得可筑上品道基的练炁术，筑基得上乘开府真法，紫府得玉髓，洞玄得先天五行之精。
        // 凝丹大药不白给：玄真派弟子要托金谷墟市代寻，或下地渊深处去取
        upperGift: { 1: 'tech:handou', 2: 'tech:handou', 3: 'tech:kaifu_high', 4: 'yusui', 5: 'zhanranfa', 6: 'wujing' } },
      // 打退过的劫修记了仇，修为跟得上时每年有这个概率找上门
      revenge: { chance: 0.04, rankGap: 4 },
      // 天魔潮：天魔从地渊、九危山一带涌出，玉宸派发敕令召各家修士镇守；紫府以上可赴
      tianmo: { name: '天魔潮', every: [40, 70], first: [6, 14], years: 2, places: ['地渊', '九危山'], days: 180, minMajor: 4,
        guardStone: { 4: 1500, 5: 4000, 6: 12000, 7: 30000, 8: 60000 }, guardMerit: 30, guardHurt: 0.25, headSwing: [0.8, 1.4], headMerit: 80, npcDeaths: [2, 5] },
      // 丹元大会：胥都天八派六宗的金丹天骄争雄斗法的法会，开期随胥都天气运而定，或隔数百年、或隔千载。
      // 只有八派六宗的金丹门人能去，由本门从山门遣送。连斗四场，可随时认输离场，按胜场排名次；魁首得胥都大丹
      danyuan: { name: '丹元大会', every: [120, 200], first: [200, 320], years: 1, major: 6, tier: 3, days: 90,
        rounds: 4, foeBase: 2600, foeMult: [1.4, 1.9, 2.5, 3.2],
        foes: ['斗枢派', '太符宫', '中乙剑派', '北极苑', '阴景派', '九真教', '神御宗', '血河宗', '先天魔宗', '瘟癀宗', '玄酆洞', '玉宸派', '赤明派', '怙照宗'],
        // 按胜场：0 落选，1–2 有名次，3 前列，4 魁首
        reward: [{ merit: 40 }, { merit: 150, zhengyang: 1 }, { merit: 300, zhengyang: 2, miluo: 1 }, { merit: 600, zhengyang: 3, dingshen: 1, huanghua: 1, dadong: 1 }, { merit: 1200, xudu: 1, zhengyang: 3, huanghua: 1, dadong: 3 }] },
      // 玉宸四院大比：青阳、长赢、白商、玄英四大下院的年轻弟子在齐云山比斗，前十为「十大弟子」、拜入上宗，
      // 魁首得道录殿符诏，可从二十五正法里任取一门。本游戏里玉宸门人金丹以后才见得到，便让年轻的金丹门人赴会
      dabi: { name: '玉宸四院大比', every: [40, 70], first: [5, 25], years: 1, faction: 'yuchen', major: 6, maxAge: 700, days: 60,
        rounds: 5, foeBase: 2000, foeMult: [1, 1.25, 1.6, 2.0, 2.6], yuan: ['青阳院', '长赢院', '白商院', '玄英院'],
        // 按胜场：3 场以上入十大弟子，5 场全胜为魁首
        reward: [{ merit: 30 }, { merit: 100 }, { merit: 200 }, { merit: 500 }, { merit: 900 }, { merit: 1500, dulu: 1 }], shida: 3 },
      // 流火宏化洞天：旁门纯阳火霞老祖开辟的下等洞天，漂泊万载后落回胥都天，悬在鹤鸣山上空。
      // 玉宸派与赤明派赌斗三场赢下了它，每隔些年门户显世，玉宸门人可入内寻造化（原著里是四院弟子去，这里金丹以上的门人才放进去）
      liuhuo: { name: '流火宏化洞天显世', every: [20, 35], first: [8, 20], years: 3, place: '鹤鸣山', faction: 'yuchen', minMajor: 6, days: 120,
        outerStone: { 6: 6000, 7: 15000, 8: 30000 }, outerGain: { 6: 2000, 7: 5000, 8: 8000 }, outerHurt: 0.25,
        midSwing: [0.7, 1.05], midGain: { 6: 5000, 7: 12000, 8: 20000 },
        deepSwing: [1.0, 1.5], deepGain: { 6: 9000, 7: 25000, 8: 40000 }, npcDeaths: [0, 2] },
      // 拜谒颜熙真君：元神以后到东海求问返虚之道。真君肯不肯见看缘法，不见的话十年后可再去
      yanxi: { minMajor: 7, chance: 45, again: 10, gain: 10000, fanxu: 8 },
    },

    /* ---------- 洞府 ----------
     * 筑基以后可在荒野、险地开辟洞府：在自家洞府里灵机高一级（至多 5 级），闭关被打扰的机会只剩两成。只能有一处。 */
    dongfu: { minMajor: 3, minQi: 3, cost: { 3: 3000, 4: 8000, 5: 20000, 6: 100000 }, qiBonus: 1, disturbMult: 0.2 },
    // 洞天：元神真人在东海开辟一方洞天，是冲击返虚的根基；在自家洞天里灵机七级
    dongtian: { minMajor: 7, placeType: 'sea', cost: 200000, days: 1080, qi: 7 },

    /* ---------- 出身 ---------- */
    origins: {
      mortal: {
        name: '凡人求仙', blurb: '容国一个十六岁的凡俗少年，胎息都未证得，只听过仙人的传闻。最难的开局',
        realm: { major: 0, stage: 1 }, stone: 20, technique: null, place: 'city', placeName: '容国', faction: null,
        inv: {},
      },
      loose: {
        name: '南域散修', blurb: '刚证得胎息，揣着一卷劣等练炁术，无门无派，来去自由',
        realm: { major: 1, stage: 1 }, stone: 40, technique: 'linghe', place: 'town', faction: null,
        inv: { qiju: 1 },
      },
      clan: {
        name: '修道家族子弟', blurb: '出身南域一个小修道家族，每年有份例，但家族与人结怨也会牵连到你',
        realm: { major: 2, stage: 2 }, stone: 60, technique: 'guiyuan', place: 'clan', faction: 'clan',
        inv: { qiju: 2, heal: 1 },
      },
      sect: {
        name: '玄真派弟子', blurb: '小甘山玄真派门下，可借山门灵机，每年领俸禄，修本派根本法门三炁照神术；立了功可去长老房换外药',
        realm: { major: 2, stage: 1 }, stone: 15, technique: 'dingjin', place: 'sect', faction: 'sect', factionKey: 'xuanzhen',
        inv: { heal: 1 },
      },
    },

    /* ---------- 物品与坊市 ---------- */
    items: {
      qiju: { name: '中孚丹', price: 30, desc: '练炁士常用的修行丹丸，服后三个月修炼速度 +30%' },
      heal: { name: '小白阳丹', price: 20, desc: '护住内腑、调理伤势，加快伤势恢复' },
      zhuji: { name: '大造元珠', price: 420, desc: '补益元炁的外药，冲击筑基时服下，成功率 +25%', where: '金谷墟市常备；宗门、家族弟子可用道功换' },
      danmusha: { name: '丹母砂', price: 900, desc: '全真外药。筑基二重修到三重「龟蛇相抱」时必须用上一枚', where: '金谷墟市常备；宗门、家族弟子可用道功换' },
      yusui: { name: '玉髓', price: 2000, desc: '紫府二重修到三重「换魂消魄」时必须用上一份', where: '宗门弟子可用道功换；金谷墟市多数年份有货，没货时可在浮玉泊托人代寻' },
      wujing: { name: '先天五行之精', price: 3000, desc: '洞玄一重修到二重「摄取五精」须集齐五份，填入龙虎炉鼎', where: '宗门弟子可用道功换；金谷墟市多数年份有货，没货时可在浮玉泊托人代寻' },
      ningdan: { name: '凝丹大药', price: 8000, desc: '结金丹的必需之物，冲关时耗掉一份', where: '在浮玉泊托金谷墟市代寻，约三年一定送到；五光宗、花神府弟子可用道功换；货架上偶尔也有' },
      yanshou: { name: '紫明流珠', price: 1200, desc: '天地大药，服下添寿六年（每人至多 3 颗，效果递减）' },
      // 符器、法器：到手就收进「法器」一栏（gear 是它的底子）。攻伐、护身、遁行三类各用最好的一件
      fuqi1: { name: '飞剑（下品符器）', price: 350, desc: '一炼形、十道禁制的下品飞剑，材质还经得起再炼形一次', gear: { name: '飞剑', slot: 'atk', grade: 1, jin: 10, cap: 2 } },
      fuqi2: { name: '飞剑（中品符器）', price: 1500, desc: '二炼形、二十道禁制的中品飞剑', gear: { name: '飞剑', slot: 'atk', grade: 2, jin: 20, cap: 3 } },
      fuqi3: { name: '飞剑（上品符器）', price: 40000, desc: '三炼形、三十道禁制，大派真传才配得起；材质还够金丹真人以本命精血祭成法器', gear: { name: '飞剑', slot: 'atk', grade: 3, jin: 30, cap: 4 } },
      fayi1: { name: '法衣（下品符器）', price: 300, desc: '织进十道禁制的法衣，落败时少受重伤', gear: { name: '法衣', slot: 'def', grade: 1, jin: 10, cap: 2 } },
      fayi2: { name: '法衣（中品符器）', price: 1400, desc: '二十道禁制的中品法衣', gear: { name: '法衣', slot: 'def', grade: 2, jin: 20, cap: 3 } },
      fayi3: { name: '法衣（上品符器）', price: 36000, desc: '三十道禁制的上品法衣', gear: { name: '法衣', slot: 'def', grade: 3, jin: 30, cap: 4 } },
      suo1: { name: '飞梭（下品符器）', price: 300, desc: '代步的飞梭，赶路快些，逃起来也容易些', gear: { name: '飞梭', slot: 'dun', grade: 1, jin: 10, cap: 2 } },
      suo2: { name: '飞梭（中品符器）', price: 1400, desc: '二十道禁制的中品飞梭', gear: { name: '飞梭', slot: 'dun', grade: 2, jin: 20, cap: 3 } },
      suo3: { name: '飞梭（上品符器）', price: 36000, desc: '三十道禁制的上品飞梭', gear: { name: '飞梭', slot: 'dun', grade: 3, jin: 30, cap: 4 } },
      chenshan: { name: '沉山印', price: 30000, desc: '玉宸上宗下赐门人的上品符器，一印压下如山岳倾倒', gear: { name: '沉山印', slot: 'atk', grade: 3, jin: 30, cap: 4 } },
      ziyi: { name: '紫弥宝衣', price: 30000, desc: '玉宸派的独门手笔，上品符器。下院里得了它的，无一例外都是被上宗看重的人', gear: { name: '紫弥宝衣', slot: 'def', grade: 3, jin: 30, cap: 4 } },
      yujing: { name: '玉景飞宫', price: 400000, desc: '玉宸派灵宝殿炼给门人的飞宫，下品法器，生有器灵。遁速极快，守御也强。到手要先炼化器灵', gear: { name: '玉景飞宫', slot: 'dun', grade: 4, jin: 40, cap: 5, ling: 10 } },
      // 宝材：粗胚的材质决定能打入多少禁制；把宝材熔进去重铸，才能再往上炼形
      miluo: { name: '弥罗铁', price: 20000, desc: '世间修士梦寐以求的粗胚材器。熔进一件符器、法器里重铸，材质上限高一品', where: '中域坊市常备；八派六宗弟子可用道功换' },
      huanghua: { name: '黄华秘髓', price: 90000, desc: '有价无市的宝材，熔进去材质上限高两品', where: '中域坊市偶尔有；丹元大会前列、流火宏化洞天深处' },
      lingtian: { name: '灵天素景精金', price: 0, desc: '传说中的宝材，熔进去材质便够祭成道器', where: '八派六宗库藏，返虚真君才换得到' },
      ganyin: { name: '干银星矿', price: 30000, desc: '旷世奇珍，修极光大遁入门的引子', where: '怙照宗库藏；中域坊市偶尔有' },
      dingshen: { name: '定神玄香', price: 60000, desc: '冲击元神时点上，安定心神，成功率 +12（冲关时耗掉）', where: '中域坊市常备；八派六宗弟子可用道功换' },
      zhengyang: { name: '正阳丹砂', price: 20000, desc: '推升丹力的真砂，没有隐患。金丹真人服下一枚，修为 +2500（只对金丹有用）', where: '中域坊市常备；八派六宗弟子可用道功换' },
      dongtianji: { name: '洞天残基', price: 0, desc: '从流火宏化洞天深处剥下的一块洞天根基。开辟洞天时用上，省一半符钱、一年工夫（用时耗掉）', where: '流火宏化洞天深处' },
      xudu: { name: '胥都大丹', price: 0, desc: '胥都天气运所凝的大丹，只赐丹元大会魁首。冲击元神时服下成功率 +20；已成元神的，服下修为 +30000', where: '只有丹元大会的魁首才有' },
      // 金丹十三味大药里的六门外药（见 dayao）：结丹时耗掉
      yunhua: { name: '云华龙膏', price: 9000, desc: '凝丹六门外药之一，多出在海外龙族出没之处', where: '海外寻药；金谷墟市可托人代寻；二流以上宗门库藏可用道功换' },
      tianyou: { name: '天游泥', price: 6000, desc: '凝丹六门外药之一，荒山险地的深处偶尔采得', where: '荒山、险地寻药；金谷墟市可托人代寻；二流以上宗门库藏可用道功换' },
      minghe: { name: '明合砂', price: 7000, desc: '凝丹六门外药之一，生在灵机浓郁的险地', where: '险地寻药；金谷墟市可托人代寻；二流以上宗门库藏可用道功换' },
      xuanshi: { name: '玄室水', price: 7000, desc: '凝丹六门外药之一，出在幽深的地窟、海眼', where: '险地、海外寻药；金谷墟市可托人代寻；二流以上宗门库藏可用道功换' },
      qiming: { name: '七明九光芝', price: 6000, desc: '凝丹六门外药之一，长在深山向阳处的灵芝', where: '荒山寻药；金谷墟市可托人代寻；二流以上宗门库藏可用道功换' },
      laoxian: { name: '老仙须', price: 5000, desc: '凝丹六门外药之一，老藤古木上垂下的须', where: '荒山寻药；金谷墟市可托人代寻；二流以上宗门库藏可用道功换' },
      zhanranfa: { name: '湛然虚精炁修法', price: 0, book: true, desc: '凝丹七门内药里最后一味「湛然虚精炁」的修法。各门各派都不记在书简上，只由师长口传（书不会耗掉）', where: '玄真弟子道脉校考评上考时由玉宸派传下；二流以上宗门的长老口传，要重道功' },
      // 元神至药：前古聿升帝所创的丹宝，助人更快感悟元神之妙，且无后患。正虚道廷手里最多，八派六宗也存着些
      dadong: { name: '大洞精玉', price: 250000, desc: '元神第一外药。元神真人服下一枚，感悟大进：修为 +本重所需的三成（不越过本重圆满），没有后患', where: '八派六宗库藏，元神真人以道功换；丹元大会前列；中域坊市难得一见' },
      // 返虚三途里的「玄中三限」要先吃透它的经义
      xuanzhong: { name: '玄中三限经义', price: 0, book: true, desc: '讲返虚天考之法的玄书。有它，又有上等以上的元神法相，冲返虚时才能选「玄中三限」一途（书不会耗掉）', where: '八派六宗库藏，元神真人以重道功换' },
      // 宵明大泽灵窟的中枢正位，又名先天奇府、太乙含真：宇宙间最适宜突破返虚道劫的场地
      dulu: { name: '道录殿符诏', price: 0, desc: '玉宸四院大比魁首所得的鱼形符诏。凭它进道录殿，从二十五正法里任取一门，不论道功、品第（取了便收回）', where: '只有玉宸四院大比的魁首才有' },
      tiangu: { name: '天谷符诏', price: 0, desc: '玉宸派准你进宵明大泽灵窟「天谷」破一回返虚迷障的符诏：天谷护住法躯，失道之祸大减（在宵明大泽破障时自动用掉）', where: '玉宸派库藏，返虚真君以道功换' },
      herb: { name: '灵草', price: 5, desc: '寻常灵草，可卖钱' },
      rareHerb: { name: '人面芝', price: 60, desc: '生在阴气浓郁之地的珍贵外药，可卖钱' },
      beastCore: { name: '妖物内丹', price: 25, desc: '斗杀妖物所得，可卖钱' },
      beastHide: { name: '妖物皮骨', price: 8, desc: '斗杀妖物所得，可卖钱' },
    },
    usable: ['qiju', 'heal', 'yanshou', 'zhengyang', 'xudu', 'dadong'],
    dadongFrac: 0.3,

    /* ---------- 金丹十三味大药（见 dayao.js）---------- */
    dayao: {
      total: 13,
      wai: ['yunhua', 'tianyou', 'minghe', 'xuanshi', 'qiming', 'laoxian'],
      // 七门内药：在洞玄三重温养 years 年自然凝成（× (1.3 − 资质/100)）
      nei: {
        shenfu: { name: '神符火', years: 10, fast: 'def', desc: '融形炼质之火，唯肉身血气鼎沸者凝得出，至极能有九尺九寸高（有护身道术练到小成，快一倍）' },
        sanqi: { name: '三奇焰', years: 3, desc: '精、炁、神三者混合，起复依元根、存照躯壳' },
        wugong: { name: '五宫雷', years: 4, need: 'wujing', desc: '身内五行气息所化，专能荡秽化污；摄取五精时用了先天五行之精的，自然显化' },
        yuding: { name: '玉鼎风', years: 5, desc: '真阳、真性混合，归于气穴，可以开窍点灵' },
        shengren: { name: '圣人土', years: 8, desc: '厚德载物的一味内药，要沉住性子温养' },
        zhengnian: { name: '正念锋', years: 9, desc: '念头凝成的一点锋芒，心志不坚的凝不出' },
        zhanran: { name: '湛然虚精炁', years: 6, need: 'zhanranfa', desc: '七门内药的最后一味，是不传之秘；得了修法再温养才凝得出' },
      },
      aptYears: [1.3],
      seekMajor: 5, seekDays: 90,
      seekChance: { wild: 0.4, danger: 0.5, sea: 0.5 },
      where: { wild: ['qiming', 'laoxian', 'tianyou'], danger: ['minghe', 'xuanshi', 'tianyou'], sea: ['yunhua', 'xuanshi'] },
      hurt: { danger: 0.2, sea: 0.25 },
      pinBonus: [[13, 3], [9, 2], [5, 1]], // 采得几味以上，金丹品第高几档
      capWithout: 4,  // 十三味不齐，至多丹成四品
      breakPer: 0.8,  // 冲金丹：每味 +0.8
      // NPC 结丹时采得几味（按出身：散修、小宗、二流、大派）
      npc: { 0: [0, 5], 1: [2, 8], 2: [4, 11], 3: [8, 13] },
    },

    /* ---------- 法器 ----------
     * 照原著的祭器法：一方粗胚先「炼形」洗去杂芜，才能铭刻禁制。炼形一次，至多十道禁制，便是下品符器；
     * 再炼形一次又能打入十道，便是中品，以此类推。上品符器之上是法器（生出真识、有器灵），再往上是道器。
     * 粗胚的材质决定能炼形几次（cap），熔进宝材重铸可以抬高。
     * 别人的法器器灵不认你，要先炼化（ling 0–100），没炼化完只发挥得出一部分威能。
     * 原著称「三器三宝」：仙人之下是符器、法器、道器；仙人之上是纯均灵宝、上玄真宝、先天至宝（游戏只做到道器）。 */
    gear: {
      gradeNames: ['', '下品符器', '中品符器', '上品符器', '下品法器', '中品法器', '上品法器', '道器'],
      slotNames: { atk: '攻伐', def: '护身', dun: '遁行' },
      maxGrade: 7,
      atk: [1, 1.25, 1.6, 2.2, 2.9, 3.7, 4.6, 6.0],        // 攻伐：斗法战力倍数（满禁制时）
      def: [1, 1.08, 1.16, 1.28, 1.42, 1.58, 1.76, 2.1],   // 护身：斗法战力倍数
      defHurt: [0, 0.1, 0.18, 0.26, 0.36, 0.46, 0.56, 0.7], // 护身：落败时重伤、身死的机会减去几成
      dunFlee: [0, 6, 10, 15, 22, 28, 34, 42],             // 遁行：逃遁成功率加成
      dunTravel: [0, 0.06, 0.12, 0.18, 0.26, 0.33, 0.4, 0.5], // 遁行：赶路省下几成时日
      jinCost: [0, 20, 80, 400, 3000, 8000, 20000, 60000], // 祭炼一道禁制的符钱
      jinDays: [0, 4, 8, 15, 40, 60, 90, 150],             // 祭炼一道禁制的天数
      lianCost: [0, 0, 300, 3000, 60000, 150000, 400000, 1500000], // 炼形到这一品的符钱
      lianDays: [0, 0, 60, 180, 720, 1080, 1800, 3600],
      minMajor: [0, 2, 3, 4, 6, 6, 7, 9],  // 祭炼这一品的禁制、炼形到这一品要的境界（法器要金丹法力和本命精血；道器只有纯阳、道君掌控得了）
      // 境界不够的人驱策高品法器费力不讨好：金丹以下用法器、纯阳以下用道器，只发挥得出这几成
      underUse: 0.4,
      lingDays: [0, 0, 0, 0, 720, 1080, 1440, 2880], // 金丹真人把一件外来法器的器灵炼化到底要的天数；境界越高越快
      capMax: 6,       // 寻常宝材至多把材质抬到上品法器
      matCap: { miluo: 1, huanghua: 2, lingtian: 7 },
      value: [0, 300, 1500, 40000, 300000, 800000, 2000000, 8000000],
      sellRatio: 0.5,
      lootChance: 0.35, // 打退劫修时缴获其随身一件法器的机会
      // NPC 随身法器的称呼（游戏拟的通称）
      names: { atk: ['飞剑', '雷珠', '法印', '金锤', '飞刀'], def: ['法衣', '宝衣', '法罩', '宝圈'], dun: ['飞梭', '云舟', '遁界符'] },
    },
    /* ---------- 道术与神通的进境 ---------- */
    arts: {
      levelNames: ['未入门', '入门', '小成', '中成', '大成'],
      levelFrac: [0, 0.25, 0.5, 0.75, 1],
      // 各进境累计要参习的天数（按资质、境界折算），按 rank
      // 原著里大派真传多是在元神第七重障关前后才把一门神通修到大成，无上大神通入门还要更慢
      xp: { 1: [20, 60, 150, 300], 2: [45, 135, 320, 640], 3: [180, 720, 1800, 3600], 4: [720, 3600, 14400, 36000], 5: [7200, 21600, 54000, 108000] },
      rankBase: [0, 1, 2, 3, 6, 7], // 境界高出这一档，参习就快些（每高一个大境界 +25%）
      practiceDays: [90, 360, 1800, 3600],
      atk: [0, 0.1, 0.22, 0.45, 0.9, 1.6],      // 大成时斗法战力 +几成（只算最好的一门）
      def: [0, 0.05, 0.1, 0.2, 0.35, 0.6],
      defHurt: [0, 0.1, 0.18, 0.3, 0.45, 0.6],
      dunFlee: [0, 6, 12, 20, 28, 38],
      dunTravel: [0, 0.05, 0.1, 0.2, 0.3, 0.4],
    },
    zhengyangGain: 2500,
    xuduGain: 30000,
    loot: ['herb', 'rareHerb', 'beastCore', 'beastHide'],
    yanshouYears: [6, 4, 2],
    /* 坊市：staples 是常备货，每年补足；rare 是稀罕货，每年有 slots 个格子，各有 chance 的机会上架。
     * 南域虽穷，练炁、筑基用得上的东西在金谷墟市总能买到；紫府以上的外药才要看年景。
     * 宗门山门的货架是卖给外人的，门下弟子另有长老房库藏（见 house）。 */
    market: {
      city: {
        staples: [{ item: 'heal', qty: [1, 3] }],
        rare: [{ item: 'tech:linghe', w: 2 }, { item: 'tech:guiyuan', w: 1 }, { item: 'tech:qijia', w: 1 }, { item: 'tech:hufeng', w: 1 }],
        slots: 1, chance: 0.6,
      },
      town: {
        staples: [
          { item: 'qiju', qty: [3, 8] },
          { item: 'heal', qty: [2, 6] },
          { item: 'zhuji', qty: [1, 2] },
          { item: 'danmusha', qty: [1, 1] },
          { item: 'fuqi1', qty: [1, 1] },
          { item: 'fayi1', qty: [1, 1] },
          { item: 'suo1', qty: [1, 1] },
          { item: 'tech:qijia', qty: [1, 1] },
          { item: 'tech:xuejia', qty: [1, 1] },
          { item: 'tech:gengjin', qty: [1, 1] },
          { item: 'tech:hufeng', qty: [1, 1] },
          { item: 'tech:jinren', qty: [1, 1] },
          { item: 'tech:linghe', qty: [1, 1] },
          { item: 'tech:guiyuan', qty: [1, 1] },
          { item: 'tech:kaifu_low', qty: [1, 1] },
        ],
        rare: [
          { item: 'yusui', w: 2 },
          { item: 'wujing', w: 2, qty: [1, 3] },
          { item: 'yanshou', w: 1 },
          { item: 'fuqi2', w: 1 },
          { item: 'fayi2', w: 0.8 },
          { item: 'suo2', w: 0.8 },
          { item: 'tech:jiexing', w: 0.6 },
          { item: 'tech:dari', w: 0.15 },
          { item: 'tech:chiyang', w: 1 },
          { item: 'tech:xuanshui', w: 1 },
          { item: 'ningdan', w: 0.4 },
          { item: 'tech:handou', w: 0.3 },
          { item: 'tech:chimei', w: 0.5 }, { item: 'tech:jingyi', w: 0.4 }, { item: 'tech:dongling', w: 0.12 },
          { item: 'tech:kaifu_mid', w: 0.3 },
          { item: 'yunhua', w: 0.3 }, { item: 'tianyou', w: 0.4 }, { item: 'minghe', w: 0.4 },
          { item: 'xuanshi', w: 0.4 }, { item: 'qiming', w: 0.4 }, { item: 'laoxian', w: 0.4 },
        ],
        slots: 3, chance: 0.8,
      },
      sect: {
        staples: [
          { item: 'qiju', qty: [2, 5] },
          { item: 'heal', qty: [2, 4] },
          { item: 'zhuji', qty: [0, 1] },
        ],
        rare: [
          { item: 'danmusha', w: 2 },
          { item: 'fuqi1', w: 2 },
          { item: 'yusui', w: 1 },
          { item: 'wujing', w: 1 },
          { item: 'yanshou', w: 0.5 },
          { item: 'fuqi2', w: 0.5 },
          { item: 'tech:kaifu_low', w: 0.5 },
          { item: 'ningdan', w: 0.2 },
        ],
        slots: 2, chance: 0.6,
      },
      // 中域坊市：金丹以后用得上的东西常备
      mart: {
        staples: [
          { item: 'qiju', qty: [10, 20] },
          { item: 'heal', qty: [5, 10] },
          { item: 'fuqi2', qty: [1, 2] },
          { item: 'fayi2', qty: [1, 2] },
          { item: 'suo2', qty: [1, 2] },
          { item: 'miluo', qty: [1, 2] },
          { item: 'tech:jiexing', qty: [1, 1] },
          { item: 'tech:dongjing', qty: [1, 1] },
          { item: 'ningdan', qty: [1, 2] },
          { item: 'wujing', qty: [3, 6] },
          { item: 'yusui', qty: [1, 3] },
          { item: 'dingshen', qty: [1, 1] },
          { item: 'zhengyang', qty: [2, 4] },
          { item: 'tech:dao_low', qty: [1, 1] },
          { item: 'tech:dao_mid', qty: [1, 1] },
          { item: 'tech:kaifu_high', qty: [1, 1] },
        ],
        rare: [{ item: 'fuqi3', w: 2 }, { item: 'fayi3', w: 1.5 }, { item: 'suo3', w: 1.5 }, { item: 'yanshou', w: 2, qty: [1, 3] }, { item: 'tech:ziqing', w: 1 },
          { item: 'huanghua', w: 0.8 }, { item: 'ganyin', w: 0.6 }, { item: 'tech:dari', w: 0.8 }, { item: 'tech:xiaoyuanci', w: 0.6 }, { item: 'tech:sishan', w: 0.5 }, { item: 'dadong', w: 0.5 }],
        slots: 3, chance: 0.7,
      },
      priceSwing: 0.2,
      sellRatio: 0.7,
      // 托金谷墟市代寻：稀罕货今年没上架，也可以加价托人去别处寻，过些时日一定送到
      order: { placeType: 'town', fee: 0.5, days: 360, slowDays: { ningdan: 1080, wujing: 540 } },
    },

    /* ---------- 行动 ---------- */
    actions: {
      cultivateDays: [30, 90, 180, 360, 1800, 3600],
      untilFullMax: 36000, // “闭关到圆满”一次至多一百年
      // 营生的酬劳按大境界翻倍：筑基修士当供奉，身价远非练炁可比
      workPayMult: [0.6, 0.8, 1, 3, 8, 20, 50, 120, 300, 600, 1000, 1500],
      coinDays: [90, 360],
      exploreDays: [10, 30],
      restDays: [30, 90, 180],
      work: {
        city: { name: '给凡人国当供奉', days: 30, stone: [2, 5], perRank: 0.6 },
        mart: { name: '在中域坊市替人坐镇', days: 30, stone: [4, 8], perRank: 0.6 },
        town: { name: '墟市帮工', days: 30, stone: [3, 6], perRank: 0.5 },
        sect: { name: '去奉事房领差事', days: 30, stone: [4, 8], perRank: 0.8, memberOnly: true, merit: true },
        clan: { name: '领家族差事', days: 30, stone: [3, 6], perRank: 0.6, memberOnly: true, merit: true },
      },
      befriendDays: 7,
      consultDays: 15,
      seclusionDisturb: 0.004, // 闭关时每月、每级危险度被打扰的概率
    },

    /* ---------- 遭遇（游历）----------
     * 基础权重；具体由地点类型、危险度、灵机修正。
     * 原则一：多数时候什么都不发生。原则二：有些努力没有回报。 */
    encounter: {
      robberDare: 0.6, // 劫修只劫境界战力不到自己六成的人
      weights: {
        nothing: 48,
        herb: 16,
        beast: 6,      // × 危险度
        meet: 9,
        rumor: 5,
        trouble: 3,    // × (危险度 + 1)
        fortune: 2.5,  // × 灵机 / 3；野心勃勃者略高
      },
      townWeights: { nothing: 46, meet: 22, rumor: 10, trouble: 6, herb: 0, beast: 0, fortune: 1 },
      longFactor: 1.6,         // 长游历（30 天）除“无事”外的权重倍率
      fortuneCooldownDays: 1800, // 五年内奇遇最多一次，多出的降为普通收获
      herbQty: [1, 4],
      rareHerbChance: 0.15,
      dangerPower: [1, 2.5, 5, 9, 16, 40, 1800, 6000], // 六、七级是东弥州腹地的凶地，金丹、元神才去得
      beastDare: 30,    // 赶路、闭关时，妖物战力不到你的 1/30 就不敢来扰（自己去游历另说）
      beastSwing: [0.6, 1.4],
      winChanceMin: 5,
      winChanceMax: 95,
      fleeBase: 55,
      fleePerApt: 0.25,
      lossHeavyShare: 0.4,
      deathWhenOutmatched: 0.15, // 重伤且对手战力 ≥ 2 倍时
      troubleStoneFrac: [0.1, 0.3],
      // 按危险度 0–5 的妖物、鬼物、天魔
      beastNames: [['野狼', '山魈'], ['青鳞蛇', '赤灵彩鹦'], ['铁背熊精', '赤目妖狼'], ['行尸', '金纹豹妖'], ['阴马', '下位天魔'], ['恶嗔阴魔', '朱厌大妖'], ['上位天魔', '千年老蛟'], ['天魔化身', '太古凶兽']],
    },

    /* ---------- 评定 ---------- */
    rating: {
      grades: [[85, '甲', '名动南域的真人'], [68, '乙', '一方高功'], [45, '丙', '筑基道人'], [25, '丁', '寻常羽士'], [0, '戊', '仙路未启']],
      perRank: 4, extraMax: 5,
    },

    /* ---------- 名字库 ---------- */
    names: {
      surnames: ['陈', '李', '王', '张', '周', '吴', '郑', '孙', '沈', '韩', '杨', '许', '何', '吕', '施', '孔', '曹', '严', '华', '金', '魏', '陶', '姜', '邹', '柏', '章', '云', '苏', '潘', '葛', '范', '彭', '鲁', '韦', '马', '方', '俞', '任', '袁', '柳', '唐', '薛', '雷', '贺', '倪', '汤', '殷', '罗', '毕', '郝', '安', '常', '乐', '于', '傅', '齐', '康', '伍', '余', '顾', '孟', '黄', '穆', '萧', '尹', '姚', '邵', '汪', '祁', '毛', '狄', '明', '戴', '宋', '庞', '熊', '纪', '舒', '屈', '项', '祝', '董', '梁', '杜', '阮', '蓝', '季', '贾', '路', '江', '童', '容', '郭', '梅', '盛', '林', '钟', '徐', '邱', '骆', '高', '夏', '蔡', '田', '樊', '胡', '凌', '霍', '虞', '万', '柯', '管', '卢', '莫', '房', '石', '崔', '龚', '程', '邢', '裴', '陆', '荣', '翁', '甄', '封', '段', '巫', '焦', '谷', '车', '侯', '宫', '宁', '甘', '厉', '武', '符', '刘', '景', '龙', '叶', '黎', '白', '卓', '池', '闻', '谭', '温', '庄', '易', '慕', '连', '古', '廖', '文', '欧阳', '上官', '司马', '东方', '慕容', '诸葛', '令狐', '独孤', '南宫'],
      // 南域的修道家族：容氏是容国王族，族中有筑基老祖；童家是容国的大族
      clanSurnames: ['容', '童', '沈', '韩', '顾', '陆', '萧', '秦', '苏', '温', '姜', '宁', '江', '方', '林'],
      male: ['承', '景', '修', '远', '岳', '鸿', '昭', '恒', '玄', '文', '仲', '朗', '泽', '舟', '澈', '衡', '渊', '琮', '霖', '弘', '骁', '钧', '烨', '铮', '嵩', '岚', '晟', '湛', '睿', '彦', '墨', '谦', '尧', '寒', '峻', '荣', '启', '屹', '奕', '拓'],
      female: ['婉', '清', '瑶', '雪', '芷', '若', '岚', '菱', '絮', '玥', '璃', '韵', '漪', '绾', '素', '蘅', '湘', '青', '霜', '微', '宁', '萱', '茵', '黛', '容', '舒', '妍', '筠', '桐', '笙', '棠', '鸢', '琬', '芸', '纨', '瑾', '婵', '娥', '琴', '锦'],
      place: {
        city: { a: ['危雍', '戚方', '团阳', '景', '曹', '焦', '庾'], b: ['国'] },
        town: { a: ['金谷', '青石', '落霞', '白沙'], b: ['墟市', '集'] },
        sect: { a: ['神火', '罗浮', '人形'], b: ['崖', '剑派', '寺'] },
        clan: { b: ['氏别府', '氏山庄', '家坞'] },
        wild: { a: ['乌云', '松涛', '断崖', '寒溪', '乱石', '野狐', '青竹', '老鸦', '鹿鸣', '雁回', '赤土', '阴风', '负刍'], b: ['岭', '谷', '林', '坡', '涧', '原', '山', '峰'] },
        danger: { a: ['赤灵', '罗暗', '幽冥', '鬼哭', '葬剑', '蛟龙', '尸解'], b: ['野林', '黑水', '古战场', '沼泽', '深渊', '潭'] },
      },
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
