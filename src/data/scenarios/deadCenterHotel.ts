import type { SpecialInfectedId } from '../specialInfected'

export interface MapNodeDefinition {
  id: string
  label: string
  position: { x: number; y: number }
  radius: number
}

export interface StageDefinition {
  id: string
  label: string
  nodeId: string
  durationMs: number
  description: string
  trigger: 'auto' | 'enter-node' | 'time' | 'interaction'
  specialCombos: SpecialInfectedId[][]
  commonRange: [number, number]
}

export interface ScenarioDefinition {
  id: string
  name: string
  nodes: MapNodeDefinition[]
  stages: StageDefinition[]
}

export const deadCenterHotelScenario: ScenarioDefinition = {
  id: 'dead-center-hotel',
  name: '死亡中心：旅馆',
  nodes: [
    { id: 'safehouse', label: '安全屋', position: { x: -600, y: 0 }, radius: 220 },
    { id: 'corridor', label: '旅馆走廊', position: { x: -200, y: 80 }, radius: 260 },
    { id: 'first-horde', label: '汽车警报区', position: { x: 200, y: 60 }, radius: 280 },
    { id: 'room-search', label: '房间搜索区', position: { x: 520, y: -120 }, radius: 300 },
    { id: 'stair-defense', label: '应急楼梯', position: { x: 820, y: -260 }, radius: 240 },
    { id: 'second-horde', label: '屋顶集结', position: { x: 1120, y: -420 }, radius: 340 },
    { id: 'rooftop', label: '屋顶求救点', position: { x: 1420, y: -540 }, radius: 320 },
    { id: 'evac', label: '撤离区', position: { x: 1720, y: -620 }, radius: 280 },
  ],
  stages: [
    {
      id: 'stage-safehouse',
      label: '初始安全屋',
      nodeId: 'safehouse',
      durationMs: 30000,
      description: '整理装备，离开安全屋后触发旅程。',
      trigger: 'auto',
      specialCombos: [],
      commonRange: [0, 5],
    },
    {
      id: 'stage-corridor',
      label: '走廊清理',
      nodeId: 'corridor',
      durationMs: 90000,
      description: '进入走廊后出现 Boomer 骚扰。',
      trigger: 'enter-node',
      specialCombos: [['boomer']],
      commonRange: [10, 15],
    },
    {
      id: 'stage-first-horde',
      label: '第一次尸潮',
      nodeId: 'first-horde',
      durationMs: 90000,
      description: '触发汽车警报引来大规模尸潮，Boomer + Hunter 协同。',
      trigger: 'interaction',
      specialCombos: [['boomer', 'hunter']],
      commonRange: [30, 50],
    },
    {
      id: 'stage-room-search',
      label: '房间搜索',
      nodeId: 'room-search',
      durationMs: 150000,
      description: '搜集补给时随机出现 Smoker 伏击。',
      trigger: 'time',
      specialCombos: [['smoker']],
      commonRange: [15, 25],
    },
    {
      id: 'stage-stair-defense',
      label: '应急楼梯防守',
      nodeId: 'stair-defense',
      durationMs: 90000,
      description: '楼梯间遭遇 Hunter + Smoker 组合压制。',
      trigger: 'enter-node',
      specialCombos: [['hunter'], ['smoker']],
      commonRange: [20, 30],
    },
    {
      id: 'stage-second-horde',
      label: '第二次尸潮',
      nodeId: 'second-horde',
      durationMs: 90000,
      description: '屋顶等待救援时出现双 Boomer 搭配 Hunter 的强烈进攻。',
      trigger: 'time',
      specialCombos: [['boomer', 'boomer'], ['hunter']],
      commonRange: [40, 60],
    },
    {
      id: 'stage-rooftop',
      label: '屋顶救援',
      nodeId: 'rooftop',
      durationMs: 120000,
      description: '所有特感类型都有可能出现，准备最终撤离。',
      trigger: 'time',
      specialCombos: [
        ['boomer', 'spitter'],
        ['charger'],
        ['jockey'],
        ['smoker'],
      ],
      commonRange: [50, 70],
    },
    {
      id: 'stage-evac',
      label: '安全屋逃脱',
      nodeId: 'evac',
      durationMs: 45000,
      description: '抵达撤离区域，完成关卡。',
      trigger: 'auto',
      specialCombos: [['tank'], ['witch']],
      commonRange: [20, 40],
    },
  ],
}

