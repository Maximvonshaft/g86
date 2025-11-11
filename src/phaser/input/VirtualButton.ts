import Phaser from 'phaser'

export interface VirtualButtonConfig {
  x: number
  y: number
  radius?: number
  label: string
  touchArea?: Phaser.Geom.Rectangle
  color?: number
  borderColor?: number
  disabledColor?: number
  onPress?: () => void
  onRelease?: () => void
}

export class VirtualButton {
  private readonly scene: Phaser.Scene
  private readonly base: Phaser.GameObjects.Arc
  private readonly labelText: Phaser.GameObjects.Text
  private readonly touchZone: Phaser.GameObjects.Zone
  private readonly progressRing?: Phaser.GameObjects.Graphics
  private readonly radius: number
  private pointerId: number | null = null
  private isEnabled = true
  private progress = 0
  private readonly color: number
  private readonly borderColor: number
  private readonly disabledColor: number
  private readonly onPress?: () => void
  private readonly onRelease?: () => void

  constructor(scene: Phaser.Scene, config: VirtualButtonConfig) {
    this.scene = scene
    this.radius = config.radius ?? 50
    this.color = config.color ?? 0x27a844 // 霓虹绿
    this.borderColor = config.borderColor ?? 0x39ff14
    this.disabledColor = config.disabledColor ?? 0x4b5563
    this.onPress = config.onPress
    this.onRelease = config.onRelease

    // 创建基础圆形
    this.base = scene.add
      .circle(config.x, config.y, this.radius, 0x0a0a0a, 0.85)
      .setStrokeStyle(2, this.borderColor, 0.65)
      .setScrollFactor(0)
      .setDepth(1003)

    // 创建标签文本
    this.labelText = scene.add
      .text(config.x, config.y, config.label, {
        fontSize: `${Math.floor(this.radius * 0.32)}px`,
        fontFamily: 'Digital-7, Orbitron, Inter, sans-serif',
        color: '#39FF14',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1004)
      .setStroke('#0a0a0a', 2)

    // 创建进度环（用于冷却/换弹）
    this.progressRing = scene.add.graphics()
    this.progressRing.setScrollFactor(0)
    this.progressRing.setDepth(1002)

    // 创建触摸区域
    const touchArea =
      config.touchArea ??
      new Phaser.Geom.Rectangle(
        config.x - this.radius - 20,
        config.y - this.radius - 20,
        (this.radius + 20) * 2,
        (this.radius + 20) * 2,
      )

    this.touchZone = scene.add
      .zone(touchArea.centerX, touchArea.centerY, touchArea.width, touchArea.height)
      .setScrollFactor(0)
      .setInteractive()
      .setDepth(1000)

    this.touchZone.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (this.pointerId !== null || !this.isEnabled) return
      if (!touchArea.contains(pointer.x, pointer.y)) return
      this.handlePress(pointer)
    })

    scene.input.on(Phaser.Input.Events.POINTER_UP, this.handleRelease, this)
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this)

    this.updateVisuals()
    this.updateProgressRing()
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled
    this.updateVisuals()
  }

  setProgress(progress: number) {
    this.progress = Phaser.Math.Clamp(progress, 0, 1)
    this.updateProgressRing()
  }

  setLabel(label: string) {
    this.labelText.setText(label)
  }

  setColor(color: number, borderColor?: number) {
    ;(this as any).color = color
    if (borderColor !== undefined) {
      ;(this as any).borderColor = borderColor
    }
    this.updateVisuals()
  }

  setVisible(visible: boolean) {
    this.base.setVisible(visible)
    this.labelText.setVisible(visible)
    this.touchZone.setVisible(visible)
    if (this.progressRing) {
      this.progressRing.setVisible(visible)
    }
  }

  destroy() {
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.handleRelease, this)
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this)
    this.base.destroy()
    this.labelText.destroy()
    this.touchZone.destroy()
    this.progressRing?.destroy()
  }

  private handlePress(pointer: Phaser.Input.Pointer) {
    this.pointerId = pointer.id
    this.base.setScale(0.96)
    this.base.setAlpha(0.9)
    this.labelText.setAlpha(0.9)

    // 触发震动反馈
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(18)
    }

    this.onPress?.()
  }

  private handleRelease(pointer: Phaser.Input.Pointer) {
    if (this.pointerId !== pointer.id) return
    this.pointerId = null
    this.base.setScale(1)
    this.base.setAlpha(1)
    this.labelText.setAlpha(1)

    this.onRelease?.()
  }

  private handleMove(pointer: Phaser.Input.Pointer) {
    if (this.pointerId !== pointer.id) return
    // 如果手指移出按钮区域，释放按钮
    const distance = Phaser.Math.Distance.Between(
      pointer.x,
      pointer.y,
      this.base.x,
      this.base.y,
    )
    if (distance > this.radius + 30) {
      this.handleRelease(pointer)
    }
  }

  private updateVisuals() {
    const currentColor = this.isEnabled ? this.color : this.disabledColor
    const currentBorderColor = this.isEnabled ? this.borderColor : this.disabledColor
    const alpha = this.isEnabled ? 1 : 0.45

    this.base.setFillStyle(currentColor, 0.85)
    this.base.setStrokeStyle(2, currentBorderColor, 0.65)
    this.base.setAlpha(alpha)
    this.labelText.setAlpha(alpha)
    this.labelText.setColor(this.isEnabled ? '#39FF14' : '#9ca3af')
  }

  private updateProgressRing() {
    if (!this.progressRing) return

    this.progressRing.clear()
    const x = this.base.x
    const y = this.base.y
    const radius = this.radius + 3

    if (this.progress > 0 && this.progress < 1) {
      // 绘制进度环（从顶部开始，顺时针）
      this.progressRing.lineStyle(4, 0xffb700, 0.85) // 琥珀黄
      const startAngle = Phaser.Math.DEG_TO_RAD * -90 // 顶部
      const endAngle = startAngle + Phaser.Math.DEG_TO_RAD * (360 * this.progress)

      // 使用 Phaser Graphics API 绘制圆弧
      this.progressRing.beginPath()
      this.progressRing.arc(x, y, radius, startAngle, endAngle, false)
      this.progressRing.strokePath()
    } else if (this.progress >= 1) {
      // 进度完成时绘制完整圆环
      this.progressRing.lineStyle(4, 0x39ff14, 0.85) // 霓虹绿
      this.progressRing.strokeCircle(x, y, radius)
    }
  }
}

