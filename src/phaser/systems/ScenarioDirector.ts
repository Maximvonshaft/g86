import Phaser from 'phaser'
import { deadCenterHotelScenario } from '../../data/scenarios/deadCenterHotel'
import type { ScenarioDefinition, StageDefinition } from '../../data/scenarios/deadCenterHotel'
import { gameStore } from '../../state/gameStore'
import type { Player } from '../entities/Player'
import type { EnemySpawner } from './EnemySpawner'
import type { SpecialInfectedDirector } from './SpecialInfectedDirector'
import { randomBetween } from '../utils/random'

interface ScenarioContext {
  scene: Phaser.Scene
  player: Player
  enemySpawner: EnemySpawner
  specialDirector: SpecialInfectedDirector
}

const DEFAULT_SCENARIO = deadCenterHotelScenario

export class ScenarioDirector {
  private readonly context: ScenarioContext
  private readonly scenario: ScenarioDefinition
  private stageIndex = -1
  private stageElapsed = 0
  private nextCommonSpawn = 0
  private nextSpecialSpawn = 0

  constructor(context: ScenarioContext, scenario = DEFAULT_SCENARIO) {
    this.context = context
    this.scenario = scenario
  }

  start() {
    this.advanceStage()
  }

  update(delta: number) {
    const stage = this.getCurrentStage()
    if (!stage) {
      return
    }

    this.stageElapsed += delta

    if (this.stageElapsed >= stage.durationMs) {
      this.advanceStage()
      return
    }

    if (this.stageElapsed >= this.nextCommonSpawn) {
      this.spawnCommons(stage)
      this.scheduleNextCommon()
    }

    if (this.stageElapsed >= this.nextSpecialSpawn) {
      this.spawnSpecials(stage)
      this.scheduleNextSpecial(stage)
    }
  }

  getCurrentStage(): StageDefinition | undefined {
    return this.scenario.stages[this.stageIndex]
  }

  private advanceStage() {
    this.stageIndex += 1
    this.stageElapsed = 0
    const stage = this.getCurrentStage()
    if (!stage) {
      gameStore.setStage({
        id: 'completed',
        name: '救援完成',
        duration: 0,
      })
      this.context.scene.events.emit('scenario-complete')
      return
    }

    gameStore.setStage({
      id: stage.id,
      name: stage.label,
      duration: stage.durationMs,
    })
    this.context.scene.events.emit('scenario-stage-start', stage)

    this.positionPlayerAtNode(stage.nodeId)
    this.context.enemySpawner.stop()
    this.context.enemySpawner.start(() => this.context.player.center.clone())
    this.spawnCommons(stage)
    this.spawnSpecials(stage)
    this.scheduleNextCommon()
    this.scheduleNextSpecial(stage)
  }

  private scheduleNextCommon() {
    const delay = randomBetween(4000, 9000)
    this.nextCommonSpawn = this.stageElapsed + delay
  }

  private scheduleNextSpecial(stage: StageDefinition) {
    if (stage.specialCombos.length === 0) {
      this.nextSpecialSpawn = this.stageElapsed + stage.durationMs + 1
      return
    }
    const delay = randomBetween(12000, 20000)
    this.nextSpecialSpawn = this.stageElapsed + delay
  }

  private spawnCommons(stage: StageDefinition) {
    const count = randomBetween(stage.commonRange[0], stage.commonRange[1])
    this.context.enemySpawner.forceSpawn(Math.max(1, Math.round(count / 5)))
  }

  private spawnSpecials(stage: StageDefinition) {
    stage.specialCombos.forEach((combo) => {
      combo.forEach((type) => {
        this.context.specialDirector.spawnNow(type)
      })
    })
  }

  private positionPlayerAtNode(nodeId: string) {
    const node = this.scenario.nodes.find((n) => n.id === nodeId)
    if (!node) return
    this.context.player.sprite.setPosition(node.position.x, node.position.y)
    this.context.scene.cameras.main.pan(
      node.position.x,
      node.position.y,
      800,
      Phaser.Math.Easing.Sine.Out,
      true,
    )
  }
}

