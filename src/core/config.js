/* ============================================================
 * config —— 全部数值、概率、名字库、文本模板
 * 规格要求：逻辑中不得硬编码平衡数值，一律在此调整（附录 B 为起点）。
 * 事件定义见 events-data.js（同属 config 区块）。
 * ============================================================ */
(function (G) {
  'use strict';
  const FX = (G.FX = G.FX || {});

  FX.CONFIG = {
    schemaVersion: 1,
    gameVersion: '0.1.0-stage1',
    yearsPerTurn: 5,
    startYear: 1,

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
      baseGain: { 1: 12, 2: 20, 3: 60 },
      lifespan: { 0: [70], 1: [110], 2: [200, 225, 250], 3: [450, 500, 560] },
      power: {
        0: [0.5],
        1: [2, 3, 4, 5, 7, 9, 12, 15, 19],
        2: [40, 55, 75],
        3: [300, 400, 550],
      },
      // 每年消耗 [灵谷, 灵石]
      upkeep: { 0: [1, 0], 1: [1, 2], 2: [2, 12], 3: [5, 60] },
      seclusionStoneExtra: 0.5,
    },

    /* ---------- 灵根 ---------- */
    roots: {
      types: ['single', 'dual', 'triple', 'quad', 'penta', 'mutant'],
      names: { single: '单灵根', dual: '双灵根', triple: '三灵根', quad: '四灵根', penta: '五灵根', mutant: '变异灵根', none: '无灵根' },
      speed: { single: 1.5, dual: 1.25, triple: 1.0, quad: 0.75, penta: 0.55, mutant: 1.3 },
      breakMod: { single: 10, dual: 5, triple: 0, quad: -5, penta: -10, mutant: 5 },
      weight: { single: 2, dual: 10, triple: 28, quad: 33, penta: 24, mutant: 3 },
      score: { single: 5, mutant: 5, dual: 4, triple: 3, quad: 2, penta: 1 },
      count: { single: 1, dual: 2, triple: 3, quad: 4, penta: 5, mutant: 1 },
      elements: ['金', '木', '水', '火', '土'],
      mutants: ['雷', '冰', '风'],
      mutantTraits: { 雷: '战力加成 20%', 冰: '炼丹成丹率加 10%', 风: '历练风险降低 40%' },
      mutantPower: 1.2,
      mutantAlchemy: 0.1,
      mutantTravelRisk: 0.6,
      mutantBase: 0.03,
      mutantParent: 0.05,
      // 无灵根（凡人）概率
      mortalBothRoot: 0.08,
      mortalOneMortal: 0.25,
      mortalBothMortal: 0.6,
      inheritK: 0.25,
      inheritMinFactor: 0.2,
      aptitudeSd: 12,
      aptitudeMin: 5,
      aptitudeMax: 98,
      elementBonus: 0.1, // 五行对产出的小修正
    },

    /* ---------- 功法 ---------- */
    techniques: {
      yellow_general: { name: '青木养元诀', grade: '黄', mult: 1.0, elements: [], breakBonus: 0, desc: '黄阶通用功法，五行不拘' },
      xuan_broken: { name: '玄水归元经（残）', grade: '玄', mult: 1.15, elements: ['水', '金'], breakBonus: 3, capMajor: 2, capStage: 3, desc: '玄阶残缺功法，筑基后期之后无法继续，需补全残卷' },
      yellow_complete: { name: '散修炼体诀', grade: '黄', mult: 1.0, elements: ['土', '火'], breakBonus: 2, desc: '黄阶完整功法' },
    },
    fitMin: 0.8,
    fitMax: 1.25,
    fitBreakMax: 8,

    /* ---------- 修炼 ---------- */
    cultivation: {
      aptBase: 0.7,
      aptRange: 0.6,
      caveBonus: [0, 0, 0.15, 0.3, 0.5, 0.8], // 按洞府等级索引，0 级无洞府
      qijuBonus: 0.3,
      dutyCoef: { seclusion: 1.0, travel: 0.5, other: 0.25 },
      oldAgeCoef: 0.6,
      mentorBonus: 0.1,
      mentorMaxStudents: 3,
    },

    /* ---------- 突破 ---------- */
    breakthrough: {
      minor: { base: 70, failLoss: 0.1 },
      zhuji: { base: 35, pill: 25, noPillPenalty: 25, failLossMin: 0.3, failLossMax: 0.5, deathChance: 0.08 },
      jindan: { base: 20, pill: 20, minCave: 3, failLossMin: 0.3, failLossMax: 0.5, deathChance: 0.15 },
      aptitudeFactor: 0.3,
      caveBonus: 8,
      caveBonusMinLevel: 3,
      guardianBonus: 7,
      accumPerYear: 2,
      accumMax: 10,
      failPenalty: 5,
      restYears: 5,
      min: 5,
      max: 90,
      majorMax: 85,
      guardianDeathFactor: 0.5,
      heavyInjuryYears: 5,
    },

    /* ---------- 人口与生命 ---------- */
    life: {
      adultAge: 16,
      rootTestAge: 6,
      childAge: 5,
      oldFrac: 0.2,
      marryMin: 18,
      marryMax: 40,
      fertileMaxMother: 45,
      birthChance: 0.08,
      birthRealmMult: { 0: 1, 1: 1, 2: 0.5, 3: 0.2 },
      maxChildren: 5,
      deathInfant: 0.005,
      deathAdult: 0.0015,
      deathOldMax: 0.02,
      deathOldFrac: 0.4,
      heavyInjuryDeath: 0.02,
      famineDeath: 0.01,      // 按缺粮比例乘算
      famineDeathWeak: 0.05,  // 孩童、凡人
      lightInjuryYears: 2,
      heavyInjuryYears: 5,
      // 自行婚配：未婚适龄者每年与外人成婚的概率
      marryOutsiderChance: 0.09,
      marryInternalChance: 0.05,
      daughterUxorilocal: 0.5, // 女儿招赘的概率，否则外嫁离族
      outsiderMortalChance: 0.55,
      generationsBan: 3,
    },

    /* ---------- 历练 ---------- */
    travel: {
      injury: 0.08,
      heavyShare: 0.3,
      death: 0.01,
      fortune: 0.06,
      cautiousFactor: 0.7,
      rewards: [
        { kind: 'herb', min: 3, max: 8, w: 4 },
        { kind: 'stone', min: 20, max: 60, w: 4 },
        { kind: 'rareHerb', min: 1, max: 1, w: 1.5 },
        { kind: 'qiju', min: 1, max: 2, w: 1.5 },
      ],
    },

    /* ---------- 性格 ---------- */
    traits: {
      list: ['谨慎', '孝顺', '贪婪', '正直', '孤傲', '仁慈', '野心勃勃'],
      desc: {
        谨慎: '历练受伤与死亡约 0.7 倍，少提冒险请求',
        孝顺: '忠诚基线 +10，更愿协助培养后辈',
        贪婪: '私吞私售倾向约 2 倍，私财增长快',
        正直: '会举报贪墨，受处置不公打击更大',
        孤傲: '只愿修炼类差事，同辈关系易恶化，突破率 +3%',
        仁慈: '不愿执行严厉家规，威望增长快',
        野心勃勃: '争继承与资源的请求约 2 倍，受压制时忠诚下降快',
      },
      exclusive: [['谨慎', '野心勃勃'], ['仁慈', '贪婪'], ['孝顺', '孤傲']],
      filialLoyalty: 10,
      proudBreak: 3,
      greedyWeight: 2,
      ambitiousWeight: 2,
    },

    /* ---------- 自主行为 ---------- */
    autonomy: {
      baseChance: 0.12,
      capFrac: 0.15,
      capMin: 2,
      leaveLoyalty: 30,
      leaveTurns: 3,
      leaveMaxPerTurn: 1,
      loyaltyDrift: 2,
      requestExpireTurns: 1,
      maxRelations: 6,
      closeThreshold: 40,
      feudThreshold: -40,
    },

    /* ---------- 建筑 ---------- */
    buildings: {
      ancestral: { name: '宗祠', min: 1, max: 5, cost: 80, upkeep: 2, desc: '每级忠诚基线 +2，决定族谱容量' },
      field: { name: '灵田', min: 0, max: 5, cost: 100, upkeep: 3, desc: '每级年产灵谷 15；可划药田改产灵药 2' },
      mine: { name: '灵矿', min: 0, max: 5, cost: 160, upkeep: 5, desc: '每级年产灵石 14、矿材 3' },
      shop: { name: '坊市商铺', min: 0, max: 5, cost: 120, upkeep: 4, desc: '每级基础年收 16 灵石，并出售库存' },
      cave: { name: '洞府与灵脉', min: 0, max: 5, cost: 200, upkeep: 6, desc: '修炼环境 0/15%/30%/50%/80%' },
      alchemy: { name: '炼丹房', min: 0, max: 3, cost: 220, upkeep: 8, desc: '每位炼丹者每年开炉数 = 等级' },
      library: { name: '藏经阁', min: 0, max: 4, cost: 180, upkeep: 4, desc: '限制可供养功法（阶段 3 起生效）', locked: true },
      array: { name: '护族大阵', min: 0, max: 4, cost: 300, upkeep: 10, desc: '防守战力加成（阶段 3 起生效）', locked: true },
    },
    upgradeGrowth: 1.8,
    upgradeOreFrom: 3,
    upgradeOrePerLevel: 5,

    /* ---------- 经济 ---------- */
    economy: {
      fieldGrain: 15,
      fieldHerb: 2,
      mineStone: 14,
      mineOre: 3,
      fallenMineEff: 0.5,
      shopBase: 16,
      shopSellCapPerLevel: 30,
      managerBonus: 0.1,
      slotsPerLevel: 3, // 每级建筑可容纳的有效人手
      laborYield: { field: 4, industry: 4, shop: 4 }, // 每名在岗人手的基础产出（灵谷/灵石/灵石）
      industryUpkeepCut: 0.05,
      industryUpkeepMax: 0.1,
      prices: { grain: 1, herb: 4, ore: 3, qiju: 25, rareHerb: 60 },
      priceSwing: 0.2,
      grainCapBase: 120,
      grainCapPerField: 80,
      grainRot: 0.1,
      grainReserveYears: 2,
      caps: { stone: 999999, grain: 99999, herb: 9999, ore: 9999, rareHerb: 99, qiju: 999, heal: 999, zhuji: 99, ningdan: 99, yanshou: 99 },
      alchemy: { herb: 3, stone: 5, baseRate: 0.6, perLevel: 0.1, elementBonus: 0.05, zhujiStone: 40 },
      deficitLoyalty: 2,
      deficitSupport: 2,
      deficitEff: 0.5,
      famineHealthChance: 0.1,
    },

    /* ---------- 坊市（区域集市）---------- */
    market: {
      // 每回合开年刷新的货架
      staples: [
        { item: 'grain', qty: 200, price: 1.2 },
        { item: 'herb', qty: 30, price: 5 },
        { item: 'qiju', qty: 6, price: 30 },
        { item: 'heal', qty: 4, price: 20 },
      ],
      rare: [
        { item: 'zhuji', price: 420, w: 3 },
        { item: 'rareHerb', price: 90, w: 4 },
        { item: 'recipeZhuji', price: 350, w: 2 },
        { item: 'yanshou', price: 900, w: 0.6 },
        { item: 'ningdan', price: 2400, w: 0.4 },
      ],
      rareSlotsBase: 1,
      rareSlotsPerShop: 0.5,
      priceSwing: 0.2,
      sellRatio: 0.7, // 向坊市卖货的折价
    },

    items: {
      stone: '灵石', grain: '灵谷', herb: '灵药', ore: '矿材', rareHerb: '稀有灵药',
      qiju: '聚气丹', heal: '疗伤丹', zhuji: '筑基丹', ningdan: '凝丹丹药', yanshou: '延寿丹',
      recipeZhuji: '筑基丹方',
    },
    yanshouYears: [10, 6, 3],

    /* ---------- 差事 ---------- */
    duties: {
      seclusion: { name: '闭关修炼', cultivator: true },
      travel: { name: '外出历练', cultivator: true },
      field: { name: '管理灵田', mortalOk: true },
      shop: { name: '经营坊市', mortalOk: true },
      alchemy: { name: '炼丹炼器', cultivator: true },
      industry: { name: '管理家族产业', mortalOk: true }, // 灵矿人手 + 维护费减免
      guard: { name: '驻守家族驻地', cultivator: true },
      diplomacy: { name: '执行外交任务', locked: true },
      mentor: { name: '协助培养后辈', cultivator: true },
    },
    dutyContribution: { seclusion: 1, travel: 2, field: 2, shop: 2, alchemy: 3, industry: 2, guard: 2, diplomacy: 2, mentor: 2 },

    /* ---------- 家主与分支 ---------- */
    leadership: {
      newHeadPrestige: 40,
      headRealmBonus: { 0: -10, 1: 0, 2: 15, 3: 30 },
      prestigeDrift: 1,
      supportBase: 55,
      supportDrift: 1,
      lowSupport: 25,
      accHigh: 65,
      accMid: 45,
      interimPrestige: 10,
      resistBase: 0.5,
      ancestorWarnings: [30, 15, 5],
      abdicateMinAcceptance: 45,
    },

    /* ---------- 家规 ---------- */
    rules: {
      cooldownTurns: 4,
      changePrestige: 8,
      changeSupportMin: 5,
      changeSupportMax: 10,
      succession: {
        primogeniture: { name: '嫡系优先', mainBonus: 0.4, sideTarget: -10, mainTarget: 5, desc: '嫡系候选人评分 +40%；旁支支持度缓慢下降' },
        merit: { name: '唯才是举', mainBonus: 0, sideTarget: 0, mainTarget: -5, desc: '只看修为、资质、威望；落选嫡系不满' },
        elders: { name: '长老推举', mainBonus: 0.15, sideTarget: 0, mainTarget: 0, desc: '太上长老与长辈推举；长辈不足时退化为嫡系优先' },
      },
      allocation: {
        concentrate: { name: '集中培养', focusMult: 1.25, otherMult: 0.9, otherLoyalty: -1, dutyEff: 1, desc: '重点对象（≤2）修炼 +25%，其余 -10% 且忠诚缓降' },
        contribution: { name: '按贡献分配', focusMult: 1, otherMult: 1, otherLoyalty: 0, dutyEff: 1.05, desc: '按贡献分配丹药，全族差事效率 +5%' },
        balanced: { name: '均衡培养', focusMult: 1, otherMult: 0.9, otherLoyalty: 0, dutyEff: 1, supportBonus: 5, desc: '平分丹药，支持度稳定；修炼效率 -10%' },
      },
      foreign: {
        low: { name: '低调守成', edge: -15, shop: 0.9, hostile: 0.7, prestige: 0.7, desc: '锋芒 -15；商铺 -10%；敌意事件约 0.7 倍' },
        trade: { name: '开放贸易', edge: 5, shop: 1.25, hostile: 1, prestige: 1, desc: '商铺 +25%；锋芒 +5' },
        expand: { name: '积极扩张', edge: 25, shop: 1, hostile: 1.5, prestige: 1.3, desc: '扩张机会多；锋芒 +25；声望增长 1.3 倍' },
      },
      maxFocus: 2,
    },

    /* ---------- 锋芒 ---------- */
    edge: { powerMax: 40, industryMax: 30, maxStep: 3, residueDecay: 0.3, neighborPower: 140 },

    /* ---------- 外部势力（阶段 1 仅作关系值，阶段 3 起独立演化）---------- */
    factions: {
      zhao: { name: '赵家', tier: 3, core: [{ name: '赵承岳', major: 2, stage: 2, age: 150 }], rel: -10 },
      lin: { name: '林家', tier: 2, core: [{ name: '林远山', major: 1, stage: 9, age: 95 }], rel: 10 },
      qingxuan: { name: '青玄宗', tier: 5, core: [{ name: '青玄真人', major: 3, stage: 2, age: 210 }], rel: 0 },
    },
    tierPower: [0, 30, 60, 140, 260, 700, 1500, 3500],

    /* ---------- 出身 ---------- */
    origins: {
      market: {
        name: '坊市小族', blurb: '经商起家，钱多人弱',
        elderStage: 7, elderProgress: 0.3,
        family: { adults: 3, youths: 3 },
        resources: { stone: 600, grain: 100, herb: 6, qiju: 5 },
        buildings: { ancestral: 1, field: 1, shop: 2 },
        technique: 'yellow_general',
        rel: { zhao: 0, lin: 20, qingxuan: 0 },
        edge: 15,
        rules: { succession: 'primogeniture', allocation: 'contribution', foreign: 'trade' },
        eventMods: { E04: 2 },
      },
      fallen: {
        name: '没落世家', blurb: '守着残缺传承，穷且有旧仇',
        elderStage: 8, elderProgress: 0.4,
        family: { adults: 3, youths: 2 },
        resources: { stone: 150, grain: 60, herb: 2, qiju: 3 },
        buildings: { ancestral: 2, field: 1, mine: 1, library: 1 },
        technique: 'xuan_broken',
        rel: { zhao: -40, lin: 0, qingxuan: 5 },
        edge: 25,
        rules: { succession: 'primogeniture', allocation: 'concentrate', foreign: 'low' },
        eventMods: { E19: 1.5, E27: 1.5 },
        lowMine: true,
      },
      hermit: {
        name: '山野散修之后', blurb: '老祖强而家底薄',
        elderStage: 9, elderProgress: 1.0,
        family: { adults: 1, youths: 1 },
        resources: { stone: 200, grain: 40, herb: 0, qiju: 2 },
        buildings: { ancestral: 1, cave: 2 },
        technique: 'yellow_complete',
        elderArtifact: 1.2,
        rel: { zhao: 0, lin: 0, qingxuan: 0 },
        edge: 10,
        rules: { succession: 'merit', allocation: 'concentrate', foreign: 'low' },
        eventMods: {},
      },
    },
    elderAge: 50,
    elderAptitude: [55, 75],

    /* ---------- 事件抽取 ---------- */
    eventDraw: {
      maxPerTurn: 2,
      chanceFirst: 0.75,
      chanceSecond: 0.4,
      repeatCategoryHalve: 2,
      dryBoost: 1.5,
      dryTurns: 2,
    },

    /* ---------- 评级 ---------- */
    rating: {
      yearsDiv: 12, yearsMax: 25,
      realmScore: { '1': 4, '2-1': 10, '2-2': 13, '2-3': 16, '3-1': 20, '3-2': 23, '3-3': 25 },
      popDiv: 3, popMax: 15,
      buildDiv: 3, buildMax: 15,
      prestigeDiv: 100, prestigeMax: 10,
      milestoneMax: 10,
      grades: [[85, 'S', '名载仙史的修仙世家'], [70, 'A', '一流修仙世家'], [50, 'B', '一方望族'], [30, 'C', '立足一隅的小族'], [0, 'D', '昙花一现']],
    },
    familyPrestige: { start: 100, min: 0, max: 1000 },

    /* ---------- 名字库 ---------- */
    names: {
      surnames: ['陈', '李', '王', '张', '周', '吴', '郑', '孙', '沈', '韩', '杨', '许', '何', '吕', '施', '孔', '曹', '严', '华', '金', '魏', '陶', '姜', '谢', '邹', '柏', '窦', '章', '云', '苏', '潘', '葛', '范', '彭', '鲁', '韦', '马', '方', '俞', '任', '袁', '柳', '唐', '薛', '雷', '贺', '倪', '汤', '殷', '罗', '毕', '郝', '安', '常', '乐', '于', '傅', '齐', '康', '伍', '余', '顾', '孟', '黄', '穆', '萧', '尹', '姚', '邵', '汪', '祁', '毛', '狄', '米', '贝', '明', '计', '成', '戴', '宋', '庞', '熊', '纪', '舒', '屈', '项', '祝', '董', '梁', '杜', '阮', '蓝', '闵', '季', '贾', '路', '江', '童', '颜', '郭', '梅', '盛', '林', '钟', '徐', '邱', '骆', '高', '夏', '蔡', '田', '樊', '胡', '凌', '霍', '虞', '万', '柯', '管', '卢', '莫', '房', '解', '应', '宗', '丁', '宣', '邓', '单', '杭', '洪', '包', '左', '石', '崔', '龚', '程', '邢', '裴', '陆', '荣', '翁', '荀', '甄', '曲', '封', '储', '靳', '段', '巫', '焦', '谷', '车', '侯', '全', '班', '秋', '仲', '宫', '宁', '仇', '甘', '厉', '祖', '武', '符', '刘', '景', '詹', '龙', '叶', '司', '黎', '白', '蒲', '卓', '蔺', '池', '乔', '闻', '党', '翟', '谭', '申', '冉', '雍', '桑', '温', '庄', '晏', '瞿', '易', '慕', '连', '习', '艾', '向', '古', '廖', '终', '居', '步', '耿', '文', '欧阳', '上官', '司马', '东方', '慕容', '诸葛', '令狐', '独孤', '南宫'],
      familySurnames: ['陈', '沈', '韩', '顾', '陆', '萧', '叶', '秦', '苏', '温', '谢', '姜', '宁', '江', '方'],
      male: ['承', '景', '修', '远', '岳', '鸿', '昭', '恒', '玄', '文', '仲', '朗', '泽', '舟', '澈', '衡', '渊', '琮', '霖', '弘', '骁', '钧', '烨', '铮', '嵩', '岚', '晟', '湛', '睿', '彦', '墨', '谦', '尧', '寒', '珩', '峻', '荣', '启', '屹', '奕'],
      female: ['婉', '清', '瑶', '雪', '芷', '若', '岚', '菱', '絮', '玥', '璃', '韵', '漪', '绾', '素', '蘅', '湘', '青', '霜', '微', '宁', '萱', '茵', '黛', '容', '舒', '妍', '蓁', '筠', '桐', '笙', '棠', '鸢', '琬', '芸', '纨', '瑾', '婵', '娥', '琴'],
      generation: ['德', '守', '明', '允', '世', '永', '宗', '传', '继', '思', '绍', '兴', '光', '耀', '敬', '承'],
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
