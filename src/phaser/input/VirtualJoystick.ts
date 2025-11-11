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
  sensitivityCurve?: (normalized: number) => number
  touchAreaPadding?: number
  dynamicRecenter?: boolean
  recenterRadius?: number
  recenterLerp?: number
  visualRangeFactor?: number
}

export class VirtualJoystick {
  private readonly scene: Phaser.Scene
  private readonly base: Phaser.GameObjects.Arc
  private readonly innerRing: Phaser.GameObjects.Arc
  private readonly thumb: Phaser.GameObjects.Arc
  private readonly touchZone: Phaser.GameObjects.Zone
  private readonly radius: number
  private readonly thumbRadius: number
  private readonly deadZone: number
  private readonly sensitivity: number
  private readonly sensitivityCurve: (normalized: number) => number
  private readonly isFixed: boolean
  private readonly dynamicRecenter: boolean
  private readonly recenterRadius: number
  private readonly recenterLerp: number
  private readonly touchBounds: Phaser.Geom.Rectangle
  private readonly baseCenter = new Phaser.Math.Vector2()
  private readonly visualRangeFactor: number
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
    this.sensitivityCurve =
      config.sensitivityCurve ?? ((normalized: number) => Math.pow(normalized, this.sensitivity))
    this.isFixed = config.fixed ?? true
    this.dynamicRecenter = config.dynamicRecenter ?? false
    this.recenterRadius = config.recenterRadius ?? this.radius * 0.35
    this.recenterLerp = Phaser.Math.Clamp(config.recenterLerp ?? 0.25, 0.05, 0.6)
    this.visualRangeFactor = Phaser.Math.Clamp(config.visualRangeFactor ?? 0.85, 0.6, 1)

    this.base = scene.add
      .circle(config.x, config.y, this.radius, 0x0a1a0f, 0.35)
      .setStrokeStyle(3, 0x39ff14, 0.35)
      .setScrollFactor(0)
      .setDepth(1001)

    this.innerRing = scene.add
      .circle(config.x, config.y, this.radius * 0.62, 0x0a1a0f, 0)
      .setStrokeStyle(2, 0x39ff14, 0.45)
      .setScrollFactor(0)
      .setDepth(1001)

    this.thumb = scene.add
      .circle(config.x, config.y, this.thumbRadius, 0x39ff14, 0.65)
      .setStrokeStyle(2, 0x073f14, 0.9)
      .setScrollFactor(0)
      .setDepth(1002)

    const baseTouchArea = Phaser.Geom.Rectangle.Clone(config.touchArea)
    const padding = config.touchAreaPadding ?? Math.max(32, this.radius * 0.9)
    this.touchBounds = new Phaser.Geom.Rectangle(
      baseTouchArea.x - padding,
      baseTouchArea.y - padding,
      baseTouchArea.width + padding * 2,
      baseTouchArea.height + padding * 2,
    )

    this.touchZone = scene.add
      .zone(this.touchBounds.centerX, this.touchBounds.centerY, this.touchBounds.width, this.touchBounds.height)
      .setScrollFactor(0)
      .setInteractive()
      .setDepth(1000)

    const defaultOriginX = this.isFixed ? config.x : baseTouchArea.centerX
    const defaultOriginY = this.isFixed ? config.y : baseTouchArea.centerY
    this.origin.set(defaultOriginX, defaultOriginY)
    this.baseCenter.set(defaultOriginX, defaultOriginY)
    this.setVisualPosition(defaultOriginX, defaultOriginY)

    this.touchZone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (this.pointerId !== null) return
      if (!this.touchBounds.contains(pointer.x, pointer.y)) return
      this.assignPointer(pointer, this.isFixed)
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
    this.innerRing.setVisible(visible)
    this.thumb.setVisible(visible)
    this.touchZone.setVisible(visible)
  }

  destroy() {
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this)
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this)
    this.base.destroy()
    this.innerRing.destroy()
    this.thumb.destroy()
    this.touchZone.destroy()
  }

  private assignPointer(pointer: Phaser.Input.Pointer, fixed = true) {
    this.pointerId = pointer.id
    const pointerX = pointer.x
    const pointerY = pointer.y
    if (!fixed) {
      this.origin.set(pointerX, pointerY)
      this.baseCenter.set(pointerX, pointerY)
      this.setVisualPosition(pointerX, pointerY)
    }
    this.current.set(pointerX, pointerY)
    this.updateValue()
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (this.pointerId !== pointer.id) return
    if (!this.touchBounds.contains(pointer.x, pointer.y)) {
      this.handlePointerUp(pointer)
      return
    }
    this.current.set(pointer.x, pointer.y)
    this.updateValue()
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer) {
    if (this.pointerId !== pointer.id) return
    this.pointerId = null
    this.value.set(0, 0)
    this.origin.copy(this.baseCenter)
    this.setVisualPosition(this.baseCenter.x, this.baseCenter.y)
    this.base.setAlpha(0.35)
    this.innerRing.setAlpha(0.55)
    this.thumb.setPosition(this.origin.x, this.origin.y).setAlpha(0.5)
  }

  private updateValue() {
    if (this.dynamicRecenter && this.pointerId !== null) {
      const offsetX = this.current.x - this.baseCenter.x
      const offsetY = this.current.y - this.baseCenter.y
      const offsetLength = Math.hypot(offsetX, offsetY)

      let targetX = this.baseCenter.x
      let targetY = this.baseCenter.y
      if (offsetLength > 0) {
        const clampedLength = Math.min(offsetLength, this.recenterRadius)
        const scale = clampedLength / offsetLength
        targetX += offsetX * scale
        targetY += offsetY * scale
      }

      this.origin.x = Phaser.Math.Linear(this.origin.x, targetX, this.recenterLerp)
      this.origin.y = Phaser.Math.Linear(this.origin.y, targetY, this.recenterLerp)
      this.setVisualPosition(this.origin.x, this.origin.y)
    }

    const direction = this.current.clone().subtract(this.origin)
    const distance = Phaser.Math.Clamp(direction.length(), 0, this.radius)
    if (distance > 0) {
      direction.normalize()
    }
    const normalizedDistance = distance / this.radius
    const scaled = Phaser.Math.Clamp(this.sensitivityCurve(normalizedDistance), 0, 1)
    this.value.copy(direction).scale(scaled)

    const visualDistance = distance * this.visualRangeFactor
    this.thumb
      .setAlpha(0.9)
      .setPosition(
        this.origin.x + direction.x * visualDistance,
        this.origin.y + direction.y * visualDistance,
      )
    this.base.setAlpha(0.45)
    this.innerRing.setAlpha(0.75)
  }

  private setVisualPosition(x: number, y: number) {
    this.base.setPosition(x, y)
    this.innerRing.setPosition(x, y)
    this.thumb.setPosition(x, y)
  }
}

