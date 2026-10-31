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
    schemaVersion: 5,
    gameVersion: '0.3.2-xianye3',
    startYear: 300,
    daysPerMonth: 30,
    monthsPerYear: 12,
    daysPerYear: 360,
    money: '符钱',

    /* ---------- 境界 ----------
     * 胎息、练炁、筑基、紫府、洞玄、金丹……（金丹之后的元神、返虚、纯阳、合道不在本版）
     * 练炁九层（练炁九返）没有关隘，壮大胎息到头便转入下一层；筑基、紫府、洞玄各分三重。 */
    realms: {
      // major: 0 凡人 1 胎息 2 练炁 3 筑基 4 紫府 5 洞玄 6 金丹
      names: ['凡人', '胎息', '练炁', '筑基', '紫府', '洞玄', '金丹'],
      // 胥都天的尊称：练炁称羽士，紫府称高功，洞玄称链师，金丹、元神称真人
      titles: { 2: '羽士', 4: '高功', 5: '链师', 6: '真人' },
      stageNames: {
        0: [''],
        1: [''],
        2: ['一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层'],
        3: ['一重', '二重', '三重'],
        4: ['一重', '二重', '三重'],
        5: ['一重', '二重', '三重'],
        6: ['一重'],
      },
      stageTitles: {
        3: ['炁海生化', '大小如意', '龟蛇相抱'],
        4: ['万妙归根', '超脱分形', '换魂消魄'],
        5: ['龙虎炉鼎', '摄取五精', '先天金汞'],
        6: ['身根成象'],
      },
      maxStage: { 0: 1, 1: 1, 2: 9, 3: 3, 4: 3, 5: 3, 6: 1 },
      // 凡人这一格积的是“气感”，胎息这一格是“胎息壮大”，此后才是修为
      need: {
        0: [40],
        1: [30],
        2: [30, 40, 50, 60, 70, 80, 90, 100, 110],
        3: [600, 900, 1300],
        4: [2400, 3200, 4400],
        5: [6000, 8000, 10000],
        6: [Infinity],
      },
      // 全年专心修炼的基础值
      baseGain: { 0: 10, 1: 15, 2: 20, 3: 30, 4: 60, 5: 100, 6: 150 },
      // 寿元：凡人百年之内；胎息寿一百五；筑基三重二百出头；紫府三重三百；金丹千五
      lifespan: {
        0: [70],
        1: [150],
        2: [150, 150, 150, 150, 150, 155, 155, 160, 160],
        3: [190, 200, 215],
        4: [250, 275, 300],
        5: [400, 450, 500],
        6: [1500],
      },
      power: {
        0: [0.5],
        1: [1.2],
        2: [2, 3, 4, 5, 7, 9, 12, 15, 19],
        3: [40, 55, 75],
        4: [150, 200, 260],
        5: [400, 520, 680],
        6: [2000],
      },
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
     * 练炁术：决定采气属相与真炁品阶；真炁七阶及以上才能筑上品道基，四至六阶中品，三阶及以下下品。
     * 开府真法：筑基三重圆满后开辟紫府的必需之物，品第决定紫府异象。 */
    techniques: {
      linghe: { kind: 'lianqi', name: '灵鹤吐纳导引术', tier: 2, attrs: ['清', '柔'], opp: ['烈', '浊'], mult: 0.95, price: 60, desc: '散修手里最常见的劣等练炁术' },
      guiyuan: { kind: 'lianqi', name: '归元子练炁要诀', tier: 3, attrs: ['清', '阳'], opp: ['阴', '浊'], mult: 1.0, price: 150, desc: '品秩不高，胜在中正平和' },
      chiyang: { kind: 'lianqi', name: '赤阳炼炁诀', tier: 4, attrs: ['阳', '烈'], opp: ['寒', '阴'], mult: 1.05, price: 450, desc: '采阳烈之气' },
      xuanshui: { kind: 'lianqi', name: '玄水真炁法', tier: 5, attrs: ['寒', '柔'], opp: ['烈', '阳'], mult: 1.05, price: 700, desc: '采寒柔之气' },
      dingjin: { kind: 'lianqi', name: '三炁照神术', tier: 3, attrs: ['刚', '烈'], opp: ['寒', '浊'], mult: 1.0, price: 300, desc: '玄真派根本法门，可从练炁一直修到紫府；所生锭金真炁是三阶中品，采金锐之气' },
      handou: { kind: 'lianqi', name: '寒斗真炁', tier: 7, attrs: ['寒', '阴'], opp: ['阳', '烈'], mult: 1.15, price: 2600, desc: '酷烈的高阶真炁，可筑上品道基' },
      ziqing: { kind: 'lianqi', name: '紫清真炁', tier: 9, attrs: ['清', '阳'], opp: ['浊'], mult: 1.25, price: 8000, desc: '九阶上品真炁，玄门世族秘传，南域罕见' },
      kaifu_low: { kind: 'kaifu', name: '玄关开府篇', grade: 1, mult: 1.0, price: 1600, desc: '下乘开府真法，开出的紫府异象下等' },
      kaifu_mid: { kind: 'kaifu', name: '三元开府真法', grade: 2, mult: 1.1, price: 4500, desc: '中乘开府真法，可开中等紫府异象' },
      kaifu_high: { kind: 'kaifu', name: '太清开府真经', grade: 3, mult: 1.25, price: 12000, desc: '上乘开府真法，可开上等紫府异象，向来只在大派世族间流转' },
      sanqi_kaifu: { kind: 'kaifu', name: '三炁照神术·紫府篇', grade: 1, mult: 1.0, price: 1200, desc: '三炁照神术的后半部，讲开辟紫府；玄真派弟子筑基后向长老房请授' },
    },
    tierNames: ['', '一阶', '二阶', '三阶', '四阶', '五阶', '六阶', '七阶', '八阶', '九阶'],
    gradeNames: ['', '下乘', '中乘', '上乘'],
    daojiNames: ['', '下品道基', '中品道基', '上品道基'],
    yixiangNames: ['', '下等紫府异象', '中等紫府异象', '上等紫府异象'],
    daojiTiers: [4, 7], // 真炁阶数 ≥4 中品、≥7 上品
    switchLoss: 0.3, // 练炁途中改修别的练炁术，真炁性质不同，修为折三成

    /* ---------- 修炼 ---------- */
    cultivation: {
      aptBase: 0.7,
      aptRange: 0.6,
      qiMult: [0.4, 0.6, 0.85, 1.0, 1.2, 1.45], // 按地点灵机等级 0–5
      outsiderQi: { sect: 1, clan: 1 },          // 外人在宗门山门、家族驻地只能借到山门外的灵机
      qijuBonus: 0.3,
      qijuDays: 90,          // 一颗中孚丹管三个月
      oldAgeCoef: 0.6,
      injury: { light: 0.6, heavy: 0.2 },
      npcDiligence: [0.55, 0.9], // NPC 一年里真正用在修炼上的比例
      consultFrac: [0.04, 0.09], // 请教一次得到的修为（占当前所需）
      // 以符钱修行：符钱由虚空灵气铸成，属“元”，人人可炼，只是奢费；胎息还炼不了外物
      coin: { qi: 3, perYear: { 2: 60, 3: 240, 4: 800, 5: 2000, 6: 5000 } },
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
      // 小境界里需要外药的几重：键为“大境界.当前重数”
      minorNeeds: {
        '3.2': { item: 'danmusha', qty: 1, why: '龟蛇相抱须借全真外药' },
        '4.2': { item: 'yusui', qty: 1, why: '换魂消魄须外药添力' },
        '5.1': { item: 'wujing', qty: 5, why: '摄取五精须集齐五份先天五行之精' },
      },
      daojiMod: [0, -5, 3, 12],
      yixiangMod: [0, -5, 3, 12],
      daojiPower: [1, 0.9, 1.0, 1.15],
      aptitudeFactor: 0.3,
      qiBonus: 8,
      qiBonusMin: 4,
      accumPerYear: 2,
      accumMax: 10,
      failPenalty: 5,
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
      npcAccident: 0.004,       // NPC 每年意外身亡（乘以所在地危险度修正）
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
      },
      linkExtra: 0.35,     // 在最小连通树之外多连的比例
      daysPerUnit: 4,      // 地图上一格的赶路天数
      travelEncounterPerDanger: 0.06, // 每段路每级危险度的遭遇概率
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
        key: 'xuanzhen', name: '玄真派', type: 'sect', tier: 1, seat: '小甘山', tech: 'dingjin', blurb: '小甘山上的小宗，派中最高不过洞玄链师，传闻是玉宸派下辖的数百道脉之一',
        library: [{ tech: 'dingjin' }, { tech: 'sanqi_kaifu', minMajor: 3 }, { tech: 'chiyang', merit: 150, note: '派中收着的外派抄本' }],
        join: { minMajor: 1, base: 55, maxAge: 60 },
      },
      {
        key: 'wuguang', name: '五光宗', type: 'sect', tier: 2, seat: '五光宗', tech: 'chiyang', blurb: '南域勉强算得上玄门正统的二流宗门，宗中有元神真君驻世，不问俗务',
        library: [{ tech: 'chiyang' }, { tech: 'kaifu_low', minMajor: 3 }, { tech: 'kaifu_mid', merit: 260, minMajor: 3 }, { tech: 'handou', merit: 320 }],
        join: { minMajor: 2, base: 15, maxAge: 40 },
      },
      {
        key: 'huashen', name: '花神府', type: 'sect', tier: 2, seat: '花神府', tech: 'xuanshui', blurb: '南域二流大宗，不定期开「撷芳宴」招收散修，只取最后活下来的几人',
        library: [{ tech: 'xuanshui' }, { tech: 'kaifu_low', minMajor: 3 }, { tech: 'kaifu_mid', merit: 260, minMajor: 3 }, { tech: 'handou', merit: 320 }],
        join: { closed: '花神府只在「撷芳宴」上收人，眼下没有开宴' },
      },
      { key: 'jingu', name: '金谷墟市', type: 'league', seat: 'town', blurb: '洞玄散修怀悟洞主在浮玉泊所建的墟市，南域散修多在此交易' },
      { key: 'miaonan', name: '苗南峰', type: 'evil', seat: 'hide', blurb: '魔道流寇，苗南老祖带着几个弟子在路上收买路符钱' },
    ],

    factionTypes: {
      sect: { name: '宗门' },
      clan: { name: '修道家族', library: [{ tech: 'guiyuan' }, { tech: 'kaifu_low', merit: 120, minMajor: 3 }] },
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
      taskMerit: { 1: 1, 2: 2, 3: 4, 4: 8, 5: 12, 6: 20 },
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
        { item: 'zhuji', merit: 40, minMajor: 2, clan: true },
        { item: 'danmusha', merit: 90, minMajor: 3, clan: true },
        { item: 'yanshou', merit: 120, minMajor: 3 },
        { item: 'fuqi2', merit: 150, minMajor: 3 },
        { item: 'yusui', merit: 220, minMajor: 4 },
        { item: 'wujing', merit: 160, minMajor: 4 },
        { item: 'ningdan', merit: 900, minMajor: 5, minTier: 2 },
      ],
      // 门中职位：按境界自然升任，掌门另由推举或接任。俸禄按职位加成
      posts: { sect: ['弟子', '执事', '长老', '掌门'], clan: ['族人', '管事', '族老', '家主'], minMajor: [0, 3, 4], stipendMult: [1, 1.5, 2.5, 4] },
      // 修为远超掌门时，门中推举你接任：至少紫府，且高出掌门 tuijuGap 个小境界；推辞后 tuijuAgain 年内不再提
      tuijuMinMajor: 4, tuijuGap: 3, tuijuAgain: 20,
      // 每年的俸禄：符钱按大境界，宗门再按品级加成；练炁以上另发中孚丹
      stipend: {
        sect: { stone: [0, 6, 24, 60, 200, 500, 1200], tierMult: [0, 1, 1.5], qiju: 2 },
        clan: { stone: [0, 6, 18, 45, 150, 400, 1000], qiju: 1 },
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
        upperGift: { 1: 'tech:handou', 2: 'tech:handou', 3: 'tech:kaifu_high', 4: 'yusui', 5: 'wujing', 6: 'wujing' } },
      // 打退过的劫修记了仇，修为跟得上时每年有这个概率找上门
      revenge: { chance: 0.04, rankGap: 4 },
    },

    /* ---------- 洞府 ----------
     * 筑基以后可在荒野、险地开辟洞府：在自家洞府里灵机高一级（至多 5 级），闭关被打扰的机会只剩两成。只能有一处。 */
    dongfu: { minMajor: 3, minQi: 3, cost: { 3: 3000, 4: 8000, 5: 20000 }, qiBonus: 1, disturbMult: 0.2 },

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
      fuqi1: { name: '下品符器', price: 350, desc: '带在身上斗法战力 ×1.25（只算最好的一件）', power: 1.25 },
      fuqi2: { name: '中品符器', price: 1500, desc: '带在身上斗法战力 ×1.6（只算最好的一件）', power: 1.6 },
      herb: { name: '灵草', price: 5, desc: '寻常灵草，可卖钱' },
      rareHerb: { name: '人面芝', price: 60, desc: '生在阴气浓郁之地的珍贵外药，可卖钱' },
      beastCore: { name: '妖物内丹', price: 25, desc: '斗杀妖物所得，可卖钱' },
      beastHide: { name: '妖物皮骨', price: 8, desc: '斗杀妖物所得，可卖钱' },
    },
    usable: ['qiju', 'heal', 'yanshou'],
    loot: ['herb', 'rareHerb', 'beastCore', 'beastHide'],
    yanshouYears: [6, 4, 2],
    /* 坊市：staples 是常备货，每年补足；rare 是稀罕货，每年有 slots 个格子，各有 chance 的机会上架。
     * 南域虽穷，练炁、筑基用得上的东西在金谷墟市总能买到；紫府以上的外药才要看年景。
     * 宗门山门的货架是卖给外人的，门下弟子另有长老房库藏（见 house）。 */
    market: {
      city: {
        staples: [{ item: 'heal', qty: [1, 3] }],
        rare: [{ item: 'tech:linghe', w: 2 }, { item: 'tech:guiyuan', w: 1 }],
        slots: 1, chance: 0.6,
      },
      town: {
        staples: [
          { item: 'qiju', qty: [3, 8] },
          { item: 'heal', qty: [2, 6] },
          { item: 'zhuji', qty: [1, 2] },
          { item: 'danmusha', qty: [1, 1] },
          { item: 'fuqi1', qty: [1, 1] },
          { item: 'tech:linghe', qty: [1, 1] },
          { item: 'tech:guiyuan', qty: [1, 1] },
          { item: 'tech:kaifu_low', qty: [1, 1] },
        ],
        rare: [
          { item: 'yusui', w: 2 },
          { item: 'wujing', w: 2, qty: [1, 3] },
          { item: 'yanshou', w: 1 },
          { item: 'fuqi2', w: 1 },
          { item: 'tech:chiyang', w: 1 },
          { item: 'tech:xuanshui', w: 1 },
          { item: 'ningdan', w: 0.4 },
          { item: 'tech:handou', w: 0.3 },
          { item: 'tech:kaifu_mid', w: 0.3 },
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
      priceSwing: 0.2,
      sellRatio: 0.7,
      // 托金谷墟市代寻：稀罕货今年没上架，也可以加价托人去别处寻，过些时日一定送到
      order: { placeType: 'town', fee: 0.5, days: 360, slowDays: { ningdan: 1080, wujing: 540 } },
    },

    /* ---------- 行动 ---------- */
    actions: {
      cultivateDays: [30, 90, 180, 360, 1800, 3600],
      // 营生的酬劳按大境界翻倍：筑基修士当供奉，身价远非练炁可比
      workPayMult: [0.6, 0.8, 1, 3, 8, 20, 50],
      coinDays: [90, 360],
      exploreDays: [10, 30],
      restDays: [30, 90, 180],
      work: {
        city: { name: '给凡人国当供奉', days: 30, stone: [2, 5], perRank: 0.6 },
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
      dangerPower: [1, 2.5, 5, 9, 16, 40],
      beastSwing: [0.6, 1.4],
      winChanceMin: 5,
      winChanceMax: 95,
      fleeBase: 55,
      fleePerApt: 0.25,
      lossHeavyShare: 0.4,
      deathWhenOutmatched: 0.15, // 重伤且对手战力 ≥ 2 倍时
      troubleStoneFrac: [0.1, 0.3],
      // 按危险度 0–5 的妖物、鬼物、天魔
      beastNames: [['野狼', '山魈'], ['青鳞蛇', '赤灵彩鹦'], ['铁背熊精', '赤目妖狼'], ['行尸', '金纹豹妖'], ['阴马', '下位天魔'], ['恶嗔阴魔', '朱厌大妖']],
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
