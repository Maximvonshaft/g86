import Phaser from 'phaser'
export interface DamageZoneOptions {
  color: number
  borderColor: number
  radius: number
  durationMs: number
  totalDamage: number
  pulse?: boolean
}

export class DamageZone {
  private readonly graphic: Phaser.GameObjects.Arc
  private readonly position: Phaser.Math.Vector2
  readonly radius: number
  readonly dps: number
  private readonly duration: number
  private elapsed = 0
  private active = true

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    options: DamageZoneOptions,
  ) {
    this.radius = options.radius
    this.duration = options.durationMs
    this.dps = options.totalDamage / (options.durationMs / 1000)
    this.position = new Phaser.Math.Vector2(x, y)
    this.graphic = scene.add
      .circle(x, y, options.radius, options.color, 0.4)
      .setStrokeStyle(3, options.borderColor, 0.95)
      .setDepth(2)

    if (options.pulse !== false) {
      scene.tweens.add({
        targets: this.graphic,
        scale: { from: 0.92, to: 1.04 },
        yoyo: true,
        repeat: -1,
        duration: 600,
        ease: Phaser.Math.Easing.Sine.InOut,
      })
    }
  }

  update(delta: number) {
    if (!this.active) return
    this.elapsed += delta
    if (this.elapsed >= this.duration) {
      this.destroy()
    }
  }

  contains(point: Phaser.Math.Vector2) {
    return (
      Phaser.Math.Distance.BetweenPoints(this.position, point) <=
      this.radius
    )
  }

  sampleDamage(delta: number) {
    return (this.dps * delta) / 1000
  }

  isActive() {
    return this.active
  }

  destroy() {
    if (!this.active) return
    this.active = false
    this.graphic.destroy()
  }
}

