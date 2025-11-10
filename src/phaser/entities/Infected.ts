import Phaser from 'phaser'
import { TextureKeys } from '../constants'

export interface InfectedConfig {
  speed: number
  maxHealth: number
  damage: number
  attackCooldown: number
}

export class Infected extends Phaser.Physics.Arcade.Sprite {
  private readonly config: InfectedConfig
  private lastAttackAt = 0
  private currentHealth: number

  constructor(scene: Phaser.Scene, x: number, y: number, config: InfectedConfig) {
    super(scene, x, y, TextureKeys.Infected)
    this.config = config
    this.currentHealth = config.maxHealth
    this.setScale(0.7)
  }

  spawn(x: number, y: number) {
    this.currentHealth = this.config.maxHealth
    this.lastAttackAt = 0
    this.body?.reset(x, y)
    this.setActive(true)
    this.setVisible(true)
    this.setVelocity(0, 0)
  }

  receiveDamage(amount: number): boolean {
    this.currentHealth -= amount
    if (this.currentHealth <= 0) {
      this.die()
      return true
    }
    this.setTintFill(0xf97316)
    this.scene.time.delayedCall(80, () => this.clearTint())
    return false
  }

  updateAI(target: Phaser.Math.Vector2) {
    if (!this.active) return
    const direction = target.clone().subtract(this.getCenter())
    const distance = direction.length()
    if (distance === 0) return

    const normalized = direction.normalize()
    const velocity = normalized.scale(this.config.speed)
    this.setVelocity(velocity.x, velocity.y)
    this.setRotation(Math.atan2(normalized.y, normalized.x))

    if (distance < 48) {
      this.tryAttack()
    }
  }

  private tryAttack() {
    const now = this.scene.time.now
    if (now - this.lastAttackAt < this.config.attackCooldown) {
      return
    }
    this.lastAttackAt = now
    this.scene.events.emit('infected-attack', this.config.damage)
  }

  private die() {
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 120,
      onComplete: () => {
        this.setActive(false)
        this.setVisible(false)
        this.setAlpha(1)
        this.setPosition(-9999, -9999)
      },
    })
  }
}

