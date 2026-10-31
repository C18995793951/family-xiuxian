/* ============================================================
 * config —— 全部数值、概率、名字库、文本模板
 * 逻辑中不得硬编码平衡数值，一律在此调整。
 * 遭遇定义见 encounters.js（同属 config 区块）。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});

  FX.CONFIG = {
    schemaVersion: 2,
    gameVersion: '0.2.0-solo1',
    startYear: 300,
    daysPerMonth: 30,
    monthsPerYear: 12,
    daysPerYear: 360,

    /* ---------- 境界 ---------- */
    realms: {
      // major: 0 凡人 1 炼气 2 筑基 3 金丹
      names: ['凡人', '炼气', '筑基', '金丹'],
      stageNames: {
        1: ['一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层'],
        2: ['初期', '中期', '后期'],
        3: ['初期', '中期', '后期'],
      },
      maxStage: { 0: 0, 1: 9, 2: 3, 3: 3 },
      need: {
        1: [30, 40, 50, 60, 70, 80, 90, 100, 110],
        2: [600, 900, 1300],
        3: [4000, 6000, Infinity],
      },
      // 全年专心修炼的基础修为
      baseGain: { 1: 20, 2: 30, 3: 80 },
      lifespan: { 0: [70], 1: [110], 2: [200, 225, 250], 3: [450, 500, 560] },
      power: {
        0: [0.5],
        1: [2, 3, 4, 5, 7, 9, 12, 15, 19],
        2: [40, 55, 75],
        3: [300, 400, 550],
      },
    },

    /* ---------- 灵根 ---------- */
    roots: {
      types: ['single', 'dual', 'triple', 'quad', 'penta', 'mutant'],
      names: { single: '单灵根', dual: '双灵根', triple: '三灵根', quad: '四灵根', penta: '五灵根', mutant: '变异灵根', none: '无灵根' },
      speed: { single: 1.5, dual: 1.25, triple: 1.0, quad: 0.75, penta: 0.55, mutant: 1.3 },
      breakMod: { single: 10, dual: 5, triple: 0, quad: -5, penta: -10, mutant: 5 },
      weight: { single: 2, dual: 10, triple: 28, quad: 33, penta: 24, mutant: 3 },
      count: { single: 1, dual: 2, triple: 3, quad: 4, penta: 5, mutant: 1 },
      elements: ['金', '木', '水', '火', '土'],
      mutants: ['雷', '冰', '风'],
      mutantTraits: { 雷: '斗法战力 +20%', 冰: '心性沉静，突破 +3%', 风: '逃遁成功率 +15%' },
      mutantPower: 1.2,
      mutantIceBreak: 3,
      mutantWindFlee: 15,
      aptitudeMin: 5,
      aptitudeMax: 98,
    },

    /* ---------- 功法 ---------- */
    techniques: {
      yellow_general: { name: '青木养元诀', grade: '黄', mult: 1.0, elements: [], breakBonus: 0, price: 80, desc: '黄阶通用功法，五行不拘' },
      yellow_complete: { name: '散修炼体诀', grade: '黄', mult: 1.0, elements: ['土', '火'], breakBonus: 2, price: 120, desc: '黄阶完整功法，偏土火' },
      yellow_water: { name: '寒潭静心诀', grade: '黄', mult: 1.05, elements: ['水', '木'], breakBonus: 1, price: 160, desc: '黄阶上品，偏水木' },
      xuan_broken: { name: '玄水归元经（残）', grade: '玄', mult: 1.15, elements: ['水', '金'], breakBonus: 3, capMajor: 2, capStage: 3, price: 900, desc: '玄阶残卷，筑基后期之后无法继续' },
      xuan_fire: { name: '离火炼真经', grade: '玄', mult: 1.25, elements: ['火', '金'], breakBonus: 5, price: 2400, desc: '玄阶功法，偏火金，宗门秘传' },
    },
    fitMin: 0.8,
    fitMax: 1.25,
    fitBreakMax: 8,

    /* ---------- 修炼 ---------- */
    cultivation: {
      aptBase: 0.7,
      aptRange: 0.6,
      qiMult: [0.4, 0.6, 0.85, 1.0, 1.2, 1.45], // 按地点灵气等级 0–5
      outsiderQi: { sect: 1, clan: 1 },          // 外人在宗门/家族驻地只能借到山门外的灵气
      qijuBonus: 0.3,
      qijuDays: 90,          // 一颗聚气丹管三个月
      oldAgeCoef: 0.6,
      injury: { light: 0.6, heavy: 0.2 },
      npcDiligence: [0.55, 0.9], // NPC 一年里真正用在修炼上的比例
      consultFrac: [0.04, 0.09], // 请教一次得到的修为（占当前所需）
    },

    /* ---------- 突破 ---------- */
    breakthrough: {
      minor: { base: 70, failLoss: 0.1, days: 30 },
      zhuji: { base: 35, pill: 25, noPillPenalty: 25, failLossMin: 0.3, failLossMax: 0.5, deathChance: 0.08, days: 90 },
      jindan: { base: 20, pill: 20, minQi: 4, failLossMin: 0.3, failLossMax: 0.5, deathChance: 0.15, days: 180 },
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
      heavyInjuryDays: 720,
      npcTryChance: 0.5,
      npcPill: { sect: 0.5, clan: 0.3, league: 0.15, evil: 0.2, none: 0.08 },
    },

    /* ---------- 伤病与寿元 ---------- */
    life: {
      adultAge: 16,
      lightInjuryDays: 90,
      heavyInjuryDays: 540,
      restHealMult: 2,          // 静养时伤愈速度
      healPillDays: 120,        // 一颗疗伤丹抵多少天伤势
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
        正直: '不屑旁门左道，邪修更厌恶此人',
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

    /* ---------- 世界生成 ---------- */
    world: {
      gridW: 10, gridH: 8,
      // 每类地点的数量、灵气、危险度
      placeTypes: {
        town: { name: '坊市', count: 3, qi: [1, 2], danger: [0, 0], market: true, work: true },
        sect: { name: '宗门', count: 2, qi: [3, 4], danger: [0, 0], market: true },
        clan: { name: '家族驻地', count: 3, qi: [2, 3], danger: [0, 1] },
        wild: { name: '山野', count: 7, qi: [1, 3], danger: [1, 3] },
        danger: { name: '险地', count: 3, qi: [3, 5], danger: [3, 5] },
      },
      linkExtra: 0.35,     // 在最小连通树之外多连的比例
      daysPerUnit: 4,      // 地图上一格的赶路天数
      travelEncounterPerDanger: 0.06, // 每段路每级危险度的遭遇概率
      npcCount: 80,
      factionMembers: { sect: [12, 16], clan: [6, 9], league: [5, 7], evil: [4, 6] },
      looseMin: 14,        // 至少保留的散修数
      looseMoveChance: 0.25,
    },

    factionTypes: {
      sect: { name: '宗门', count: 2, stipend: 24, tierPower: 5 },
      clan: { name: '家族', count: 3, stipend: 12, tierPower: 3 },
      league: { name: '散修盟', count: 1, stipend: 0, tierPower: 2 },
      evil: { name: '邪修', count: 1, stipend: 0, tierPower: 3 },
    },

    /* ---------- 出身 ---------- */
    origins: {
      loose: {
        name: '山野散修', blurb: '无门无派，来去自由，家底最薄',
        realm: { major: 1, stage: 1 }, stone: 30, technique: 'yellow_complete', place: 'town', faction: null,
        inv: { qiju: 1 },
      },
      clan: {
        name: '小族子弟', blurb: '出身一个小修仙家族，每年有份例，但家族与人结怨也会牵连到你',
        realm: { major: 1, stage: 2 }, stone: 60, technique: 'yellow_general', place: 'clan', faction: 'clan',
        inv: { qiju: 2, heal: 1 },
      },
      sect: {
        name: '宗门外门弟子', blurb: '入了宗门外门，灵气充足、份例稳定，但要为宗门出力',
        realm: { major: 1, stage: 1 }, stone: 15, technique: 'yellow_water', place: 'sect', faction: 'sect',
        inv: { heal: 1 },
      },
    },

    /* ---------- 物品与坊市 ---------- */
    items: {
      qiju: { name: '聚气丹', price: 30, desc: '服用后三个月修炼速度 +30%' },
      heal: { name: '疗伤丹', price: 20, desc: '加快伤势恢复' },
      zhuji: { name: '筑基丹', price: 420, desc: '冲击筑基时成功率 +25%，没有则 −25%' },
      ningdan: { name: '凝丹灵物', price: 2400, desc: '结金丹的必需之物，冲关时耗掉一份，成功率 +20%。只在坊市、宗门的货架上偶尔出现（每年换货），约 2400 灵石' },
      yanshou: { name: '延寿丹', price: 900, desc: '寿元 +10 年（每人至多 3 颗，效果递减）' },
      herb: { name: '灵草', price: 5, desc: '寻常灵草，可卖钱' },
      rareHerb: { name: '稀有灵药', price: 60, desc: '难得的灵药，可卖钱' },
      beastCore: { name: '妖兽内丹', price: 25, desc: '斗杀妖兽所得，可卖钱' },
      beastHide: { name: '妖兽皮骨', price: 8, desc: '斗杀妖兽所得，可卖钱' },
    },
    yanshouYears: [10, 6, 3],
    market: {
      staples: [
        { item: 'qiju', qty: [3, 8] },
        { item: 'heal', qty: [2, 6] },
      ],
      rare: [
        { item: 'zhuji', w: 3 },
        { item: 'yanshou', w: 0.6 },
        { item: 'ningdan', w: 0.3 },
        { item: 'tech:yellow_water', w: 1.5 },
        { item: 'tech:yellow_complete', w: 1.5 },
        { item: 'tech:xuan_broken', w: 0.5 },
      ],
      rareSlots: { town: 1, sect: 2 },
      rareChance: 0.6,
      priceSwing: 0.2,
      sellRatio: 0.7,
    },

    /* ---------- 行动 ---------- */
    actions: {
      cultivateDays: [30, 90, 180, 360, 1800, 3600],
      exploreDays: [10, 30],
      restDays: [30, 90, 180],
      work: {
        town: { name: '坊市打杂', days: 30, stone: [3, 6], perRank: 0.5 },
        sect: { name: '宗门杂役', days: 30, stone: [4, 8], perRank: 0.8, memberOnly: true },
        clan: { name: '家族差事', days: 30, stone: [3, 6], perRank: 0.6, memberOnly: true },
      },
      befriendDays: 7,
      consultDays: 15,
      seclusionDisturb: 0.004, // 闭关时每月、每级危险度被打扰的概率
    },

    /* ---------- 遭遇（游历）----------
     * 基础权重；具体由地点类型、危险度、灵气修正。
     * 原则一：多数时候什么都不发生。原则二：有些努力没有回报。 */
    encounter: {
      weights: {
        nothing: 48,
        herb: 16,
        beast: 6,      // × 危险度
        meet: 9,
        rumor: 5,
        trouble: 3,    // × (危险度 + 1)
        fortune: 2.5,  // × 灵气 / 3；野心勃勃者略高
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
    },

    /* ---------- 评定 ---------- */
    rating: {
      grades: [[85, '甲', '名动一方的大修士'], [68, '乙', '小有名气的修士'], [45, '丙', '寻常修士'], [25, '丁', '默默无闻'], [0, '戊', '仙路未启']],
      perRank: 5, extraMax: 5,
    },

    /* ---------- 名字库 ---------- */
    names: {
      surnames: ['陈', '李', '王', '张', '周', '吴', '郑', '孙', '沈', '韩', '杨', '许', '何', '吕', '施', '孔', '曹', '严', '华', '金', '魏', '陶', '姜', '谢', '邹', '柏', '章', '云', '苏', '潘', '葛', '范', '彭', '鲁', '韦', '马', '方', '俞', '任', '袁', '柳', '唐', '薛', '雷', '贺', '倪', '汤', '殷', '罗', '毕', '郝', '安', '常', '乐', '于', '傅', '齐', '康', '伍', '余', '顾', '孟', '黄', '穆', '萧', '尹', '姚', '邵', '汪', '祁', '毛', '狄', '明', '戴', '宋', '庞', '熊', '纪', '舒', '屈', '项', '祝', '董', '梁', '杜', '阮', '蓝', '季', '贾', '路', '江', '童', '颜', '郭', '梅', '盛', '林', '钟', '徐', '邱', '骆', '高', '夏', '蔡', '田', '樊', '胡', '凌', '霍', '虞', '万', '柯', '管', '卢', '莫', '房', '石', '崔', '龚', '程', '邢', '裴', '陆', '荣', '翁', '甄', '封', '段', '巫', '焦', '谷', '车', '侯', '宫', '宁', '甘', '厉', '武', '符', '刘', '景', '龙', '叶', '黎', '白', '卓', '池', '乔', '闻', '谭', '温', '庄', '晏', '易', '慕', '连', '艾', '古', '廖', '文', '欧阳', '上官', '司马', '东方', '慕容', '诸葛', '令狐', '独孤', '南宫'],
      clanSurnames: ['陈', '沈', '韩', '顾', '陆', '萧', '叶', '秦', '苏', '温', '谢', '姜', '宁', '江', '方', '赵', '林'],
      male: ['承', '景', '修', '远', '岳', '鸿', '昭', '恒', '玄', '文', '仲', '朗', '泽', '舟', '澈', '衡', '渊', '琮', '霖', '弘', '骁', '钧', '烨', '铮', '嵩', '岚', '晟', '湛', '睿', '彦', '墨', '谦', '尧', '寒', '珩', '峻', '荣', '启', '屹', '奕'],
      female: ['婉', '清', '瑶', '雪', '芷', '若', '岚', '菱', '絮', '玥', '璃', '韵', '漪', '绾', '素', '蘅', '湘', '青', '霜', '微', '宁', '萱', '茵', '黛', '容', '舒', '妍', '蓁', '筠', '桐', '笙', '棠', '鸢', '琬', '芸', '纨', '瑾', '婵', '娥', '琴'],
      place: {
        town: { a: ['青石', '落霞', '白沙', '云来', '柳溪', '望江', '平安', '流金'], b: ['坊', '镇', '集', '坊市'] },
        sect: { a: ['青玄', '天剑', '紫霄', '玄灵', '碧落', '凌云'], b: ['宗', '门', '阁', '派'] },
        clan: { b: ['家堡', '氏山庄', '家坞'] },
        wild: { a: ['黑风', '云雾', '松涛', '断崖', '寒溪', '乱石', '野狐', '青竹', '老鸦', '鹿鸣', '雁回', '赤土'], b: ['岭', '谷', '林', '坡', '涧', '原', '山'] },
        danger: { a: ['万妖', '血煞', '幽冥', '焚天', '葬剑', '蛟龙'], b: ['山脉', '古战场', '沼泽', '火山', '深渊', '潭'] },
      },
      league: ['散修盟', '逍遥盟', '同道会'],
      evil: ['血影教', '阴煞门', '黑骨帮'],
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
