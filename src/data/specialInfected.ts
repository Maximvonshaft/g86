export type SpecialInfectedId =
  | 'boomer'
  | 'hunter'
  | 'smoker'
  | 'jockey'
  | 'charger'
  | 'spitter'
  | 'tank'
  | 'witch'

export type AbilityType =
  | 'vomit'
  | 'pounce'
  | 'tongue'
  | 'ride'
  | 'charge'
  | 'acid'
  | 'rock'
  | 'enrage'

export interface AbilityDefinition {
  id: AbilityType
  name: string
  description: string
  cooldown: number
  range: number
  duration?: number
  damage?: number
  knockback?: number
  areaRadius?: number
  projectileSpeed?: number
  specialSpeed?: number
}

export interface SpecialInfectedDefinition {
  id: SpecialInfectedId
  displayName: string
  tacticalRole: string
  health: number
  movementSpeed: number
  sprintSpeed?: number
  armor?: number
  ability: AbilityDefinition
}

export const SPECIAL_INFECTED_DEFS: Record<
  SpecialInfectedId,
  SpecialInfectedDefinition
> = {
  boomer: {
    id: 'boomer',
    displayName: 'Boomer',
    tacticalRole: '远程骚扰，制造混乱，为其他特感创造机会',
    health: 50,
    movementSpeed: 175,
    ability: {
      id: 'vomit',
      name: '呕吐胆汁',
      description:
        '在扇形范围喷吐胆汁，命中幸存者后召唤尸潮并遮挡视野。',
      cooldown: 9000,
      range: 260,
      duration: 15000,
      damage: 0,
      areaRadius: 220,
    },
  },
  hunter: {
    id: 'hunter',
    displayName: 'Hunter',
    tacticalRole: '高机动突袭，专精压制落单幸存者',
    health: 250,
    movementSpeed: 300,
    sprintSpeed: 700,
    ability: {
      id: 'pounce',
      name: '高速飞扑',
      description: '蓄力后高速飞扑，命中造成持续压制与高额伤害。',
      cooldown: 6000,
      range: 480,
      damage: 25,
      duration: 1800,
      knockback: 180,
      specialSpeed: 720,
    },
  },
  smoker: {
    id: 'smoker',
    displayName: 'Smoker',
    tacticalRole: '远程控制，分离队伍，制造地形击杀机会',
    health: 250,
    movementSpeed: 210,
    ability: {
      id: 'tongue',
      name: '长舌拖拽',
      description: '发射长舌捆绑幸存者并拖拽，撞击障碍会受额外伤害。',
      cooldown: 7000,
      range: 520,
      damage: 8,
      duration: 2600,
      knockback: 120,
    },
  },
  jockey: {
    id: 'jockey',
    displayName: 'Jockey',
    tacticalRole: '地形操控，强制位移破坏幸存者阵型',
    health: 325,
    movementSpeed: 250,
    ability: {
      id: 'ride',
      name: '骑乘控制',
      description: '跳上幸存者骑乘并改变其移动方向，造成持续伤害。',
      cooldown: 8000,
      range: 220,
      damage: 12,
      duration: 5000,
    },
  },
  charger: {
    id: 'charger',
    displayName: 'Charger',
    tacticalRole: '强力破阵，冲散队形，一对一压制',
    health: 600,
    movementSpeed: 250,
    sprintSpeed: 500,
    ability: {
      id: 'charge',
      name: '直线冲锋',
      description: '蓄力后直线冲锋，抓取并撞击一路的幸存者。',
      cooldown: 6500,
      range: 600,
      damage: 15,
      knockback: 220,
      duration: 1800,
      specialSpeed: 520,
    },
  },
  spitter: {
    id: 'spitter',
    displayName: 'Spitter',
    tacticalRole: '区域控制，逼迫幸存者走位',
    health: 100,
    movementSpeed: 210,
    ability: {
      id: 'acid',
      name: '喷射酸液',
      description: '在目标区域生成持续伤害的酸液池，迫使幸存者离开。',
      cooldown: 7000,
      range: 560,
      damage: 68,
      duration: 8000,
      areaRadius: 200,
    },
  },
  tank: {
    id: 'tank',
    displayName: 'Tank',
    tacticalRole: '终极武力，高额伤害，需要团队集火处理',
    health: 3200,
    movementSpeed: 210,
    armor: 0.2,
    ability: {
      id: 'rock',
      name: '投掷巨石',
      description: '投掷巨石造成冲击波，并伴随强力近战击飞。',
      cooldown: 5000,
      range: 700,
      damage: 60,
      knockback: 320,
      projectileSpeed: 620,
      areaRadius: 140,
    },
  },
  witch: {
    id: 'witch',
    displayName: 'Witch',
    tacticalRole: '环境威胁，被激怒后极其危险',
    health: 1000,
    movementSpeed: 300,
    ability: {
      id: 'enrage',
      name: '愤怒追击',
      description: '保持被动，若被激怒将高速冲刺并造成致命打击。',
      cooldown: 0,
      range: 120,
      damage: 120,
      knockback: 280,
      duration: 6000,
    },
  },
}

