import Phaser from 'phaser'
import type { SpecialInfectedId } from '../../data/specialInfected'
import { SpecialInfected } from '../entities/SpecialInfected'

export interface SpecialSpawnOrder {
  type: SpecialInfectedId
  position?: Phaser.Math.Vector2
  delay?: number
}

export class SpecialInfectedDirector {
  readonly group: Phaser.Physics.Arcade.Group
  private readonly scene: Phaser.Scene
  private readonly targetProvider: () => Phaser.Math.Vector2
  private pendingQueue: SpecialSpawnOrder[] = []

  constructor(
    scene: Phaser.Scene,
    targetProvider: () => Phaser.Math.Vector2,
  ) {
    this.scene = scene
    this.targetProvider = targetProvider
    this.group = scene.physics.add.group({
      runChildUpdate: false,
      maxSize: 16,
    })
  }

  scheduleSpawn(order: SpecialSpawnOrder) {
    const normalizedDelay =
      order.delay !== undefined ? this.scene.time.now + order.delay : undefined
    this.pendingQueue.push({
      ...order,
      delay: normalizedDelay,
    })
  }

  spawnNow(type: SpecialInfectedId, position?: Phaser.Math.Vector2) {
    const infected = SpecialInfected.create(this.scene, type)
    this.scene.add.existing(infected)
    this.scene.physics.add.existing(infected)
    const body = infected.body as Phaser.Physics.Arcade.Body | null
    if (body) {
      body.allowGravity = false
      body.collideWorldBounds = true
    }
    this.group.add(infected)
    const spawnPosition =
      position ??
      this.targetProvider().clone().add(
        new Phaser.Math.Vector2(
          Phaser.Math.Between(-600, 600),
          Phaser.Math.Between(-600, 600),
        ),
      )
    infected.spawn(spawnPosition.x, spawnPosition.y)
    return infected
  }

  update(time: number) {
    this.flushQueue(time)
    const target = this.targetProvider()
    this.group.children.each((child) => {
      const infected = child as SpecialInfected
      infected.updateAI(target)
      return false
    })
  }

  private flushQueue(time: number) {
    if (this.pendingQueue.length === 0) return
    const ready = this.pendingQueue.filter((order) => {
      if (!order.delay) return true
      return order.delay <= time
    })
    ready.forEach((order) => {
      this.spawnNow(order.type, order.position)
    })
    this.pendingQueue = this.pendingQueue.filter((order) => !ready.includes(order))
  }

  clear() {
    this.group.clear(true, true)
  }
}

