import Phaser from 'phaser'

export interface VirtualJoystickConfig {
  radius?: number
  thumbRadius?: number
  deadZone?: number
  x: number
  y: number
  touchArea: Phaser.Geom.Rectangle
  fixed?: boolean
  sensitivity?: number
}

export class VirtualJoystick {
  private readonly scene: Phaser.Scene
  private readonly base: Phaser.GameObjects.Arc
  private readonly thumb: Phaser.GameObjects.Arc
  private readonly touchZone: Phaser.GameObjects.Zone
  private readonly radius: number
  private readonly thumbRadius: number
  private readonly deadZone: number
  private readonly sensitivity: number
  private pointerId: number | null = null
  private value = new Phaser.Math.Vector2(0, 0)
  private readonly origin = new Phaser.Math.Vector2()
  private readonly current = new Phaser.Math.Vector2()

  constructor(scene: Phaser.Scene, config: VirtualJoystickConfig) {
    this.scene = scene
    this.radius = config.radius ?? 90
    this.thumbRadius = config.thumbRadius ?? this.radius * 0.45
    this.deadZone = config.deadZone ?? 0.15
    this.sensitivity = config.sensitivity ?? 1

    this.base = scene.add
      .circle(config.x, config.y, this.radius, 0x1e293b, 0.35)
      .setStrokeStyle(4, 0x38bdf8, 0.65)
      .setScrollFactor(0)
      .setDepth(1001)

    this.thumb = scene.add
      .circle(config.x, config.y, this.thumbRadius, 0x38bdf8, 0.8)
      .setStrokeStyle(2, 0x0f172a, 0.8)
      .setScrollFactor(0)
      .setDepth(1002)

    this.touchZone = scene.add.zone(
      config.touchArea.centerX,
      config.touchArea.centerY,
      config.touchArea.width,
      config.touchArea.height,
    )
      .setScrollFactor(0)
      .setInteractive()
      .setDepth(1000)

    this.origin.set(config.fixed ? config.x : config.touchArea.centerX, config.fixed ? config.y : config.touchArea.centerY)

    this.touchZone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (this.pointerId !== null) return
      if (!config.touchArea.contains(pointer.x, pointer.y)) return
      this.assignPointer(pointer, config.fixed)
    })

    scene.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this)
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this)
  }

  get normalizedVector(): Phaser.Math.Vector2 {
    return this.value.clone()
  }

  get magnitude(): number {
    return this.value.length()
  }

  get angle(): number {
    return Phaser.Math.RadToDeg(Math.atan2(this.value.y, this.value.x))
  }

  get isActive(): boolean {
    return this.pointerId !== null && this.magnitude > this.deadZone
  }

  setVisible(visible: boolean) {
    this.base.setVisible(visible)
    this.thumb.setVisible(visible)
    this.touchZone.setVisible(visible)
  }

  destroy() {
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this)
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this)
    this.base.destroy()
    this.thumb.destroy()
    this.touchZone.destroy()
  }

  private assignPointer(pointer: Phaser.Input.Pointer, fixed = true) {
    this.pointerId = pointer.id
    const pointerX = pointer.x
    const pointerY = pointer.y
    if (!fixed) {
      this.origin.set(pointerX, pointerY)
      this.base.setPosition(pointerX, pointerY)
    }
    this.current.set(pointerX, pointerY)
    this.updateValue()
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (this.pointerId !== pointer.id) return
    this.current.set(pointer.x, pointer.y)
    this.updateValue()
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer) {
    if (this.pointerId !== pointer.id) return
    this.pointerId = null
    this.value.set(0, 0)
    this.base.setAlpha(0.35)
    this.thumb.setPosition(this.origin.x, this.origin.y).setAlpha(0.5)
  }

  private updateValue() {
    const direction = this.current.clone().subtract(this.origin)
    const distance = Phaser.Math.Clamp(direction.length(), 0, this.radius)
    if (distance > 0) {
      direction.normalize()
    }
    const normalizedDistance = distance / this.radius
    const scaled = Math.pow(normalizedDistance, this.sensitivity)
    this.value.copy(direction).scale(scaled)
    this.thumb
      .setAlpha(0.9)
      .setPosition(
        this.origin.x + direction.x * (distance * 0.75),
        this.origin.y + direction.y * (distance * 0.75),
      )
  }
}

