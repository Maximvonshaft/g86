import Phaser from 'phaser'
import { gameStore } from '../../state/gameStore'
import { SceneKeys, TextureKeys } from '../constants'

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Preload)
  }

  init() {
    gameStore.setScene(SceneKeys.Preload)
  }

  preload() {
    this.createPlaceholderTextures()

    const loadingText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'LOADING…', {
        fontSize: '48px',
        fontFamily: 'Inter, sans-serif',
        color: '#E0F2FE',
      })
      .setOrigin(0.5)

    this.time.delayedCall(300, () => {
      loadingText.setText('READY')
    })
  }

  create() {
    gameStore.setReady(true)
    this.scene.start(SceneKeys.Menu)
  }

  private createPlaceholderTextures() {
    const graphics = this.add.graphics({ x: 0, y: 0 })
    graphics.setVisible(false)

    graphics.fillStyle(0x38bdf8)
    graphics.fillCircle(48, 48, 44)
    graphics.lineStyle(6, 0x0f172a, 0.75)
    graphics.strokeCircle(48, 48, 44)
    graphics.generateTexture(TextureKeys.Player, 96, 96)
    graphics.clear()

    graphics.fillStyle(0x10b981)
    graphics.fillCircle(40, 40, 36)
    graphics.lineStyle(6, 0x064e3b, 0.7)
    graphics.strokeCircle(40, 40, 36)
    graphics.generateTexture(TextureKeys.Infected, 80, 80)
    graphics.clear()

    graphics.fillStyle(0x0f172a)
    graphics.fillRect(0, 0, 32, 32)
    graphics.generateTexture(TextureKeys.Bullet, 32, 32)
    graphics.clear()

    graphics.fillStyle(0xf97316)
    graphics.fillCircle(36, 36, 34)
    graphics.lineStyle(4, 0x7c2d12, 0.9)
    graphics.strokeCircle(36, 36, 34)
    graphics.generateTexture(TextureKeys.Molotov, 72, 72)
    graphics.clear()

    graphics.fillStyle(0x64748b)
    graphics.fillCircle(32, 32, 30)
    graphics.lineStyle(5, 0x0f172a, 0.9)
    graphics.strokeCircle(32, 32, 30)
    graphics.generateTexture(TextureKeys.Rock, 64, 64)
    graphics.clear()

    graphics.fillStyle(0xa855f7)
    graphics.fillCircle(28, 28, 26)
    graphics.lineStyle(4, 0xc084fc, 0.9)
    graphics.strokeCircle(28, 28, 26)
    graphics.generateTexture(TextureKeys.Shock, 56, 56)
    graphics.clear()

    graphics.fillStyle(0x22c55e)
    graphics.fillCircle(48, 48, 46)
    graphics.lineStyle(4, 0x16a34a, 0.9)
    graphics.strokeCircle(48, 48, 46)
    graphics.generateTexture(TextureKeys.Acid, 96, 96)
    graphics.clear()

    graphics.fillStyle(0x1f2937)
    graphics.fillRect(0, 0, 512, 512)
    graphics.lineStyle(2, 0x374151)
    for (let x = 0; x < 512; x += 64) {
      graphics.lineBetween(x, 0, x, 512)
    }
    for (let y = 0; y < 512; y += 64) {
      graphics.lineBetween(0, y, 512, y)
    }
    graphics.generateTexture(TextureKeys.Floor, 512, 512)
    graphics.destroy()
  }
}

