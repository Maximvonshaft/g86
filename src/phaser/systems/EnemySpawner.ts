import Phaser from 'phaser'
import { Infected, type InfectedConfig } from '../entities/Infected'

interface SpawnConfig {
  poolSize: number
  spawnRadius: number
  spawnInterval: number
  initialDelay: number
}

export class EnemySpawner {
  private readonly scene: Phaser.Scene
  readonly enemies: Phaser.Physics.Arcade.Group
  private readonly spawnConfig: SpawnConfig
  private readonly infectedConfig: InfectedConfig
  private spawnEvent?: Phaser.Time.TimerEvent
  private spawnLoopEvent?: Phaser.Time.TimerEvent
  private target?: () => Phaser.Math.Vector2

  constructor(
    scene: Phaser.Scene,
    infectedConfig: InfectedConfig,
    spawnConfig: SpawnConfig,
  ) {
    this.scene = scene
    this.infectedConfig = infectedConfig
    this.spawnConfig = spawnConfig

    this.enemies = scene.physics.add.group({
      maxSize: spawnConfig.poolSize,
      runChildUpdate: false,
    })
  }

  start(getTargetPosition: () => Phaser.Math.Vector2) {
    this.target = getTargetPosition
    this.stop()
    this.spawnEvent = this.scene.time.addEvent({
      delay: this.spawnConfig.initialDelay,
      callback: () => {
        this.spawnWave(1 + Phaser.Math.Between(2, 4))
        this.spawnLoopEvent = this.scene.time.addEvent({
          delay: this.spawnConfig.spawnInterval,
          loop: true,
          callback: () => this.spawnWave(Phaser.Math.Between(1, 3)),
        })
      },
    })
  }

  stop() {
    this.spawnEvent?.remove(false)
    this.spawnLoopEvent?.remove(false)
    this.spawnEvent = undefined
    this.spawnLoopEvent = undefined
  }

  update() {
    if (!this.target) return
    const targetPosition = this.target()
    this.enemies.children.each((child) => {
      const infected = child as Infected
      infected.updateAI(targetPosition)
      return false
    })
  }

  forceSpawn(count: number) {
    this.spawnWave(count)
  }

  private spawnWave(count: number) {
    if (!this.target) return
    for (let i = 0; i < count; i += 1) {
      this.spawnSingle()
    }
  }

  private spawnSingle() {
    let enemy = this.enemies.getFirstDead(
      false,
    ) as unknown as Infected | null
    if (!enemy) {
      if (this.enemies.getLength() >= this.spawnConfig.poolSize) {
        return
      }
      enemy = new Infected(this.scene, 0, 0, this.infectedConfig)
      this.scene.add.existing(enemy)
      this.scene.physics.add.existing(enemy)
      const body = enemy.body as Phaser.Physics.Arcade.Body | null
      if (body) {
        body.allowGravity = false
        body.collideWorldBounds = true
      }
      this.enemies.add(enemy)
    }
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
    const radius = this.spawnConfig.spawnRadius
    const target = this.target ? this.target() : new Phaser.Math.Vector2(0, 0)
    const x = target.x + Math.cos(angle) * radius
    const y = target.y + Math.sin(angle) * radius
    enemy.spawn(x, y)
  }
}

