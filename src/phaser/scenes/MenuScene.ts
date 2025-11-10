import Phaser from 'phaser'
import { gameStore } from '../../state/gameStore'
import { SceneKeys } from '../constants'

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Menu)
  }

  create() {
    gameStore.setScene(SceneKeys.Menu)

    const { width, height } = this.scale
    const title = this.add
      .text(width / 2, height / 2 - 80, 'DEADLOCK PROTOTYPE', {
        fontSize: '56px',
        fontFamily: 'Inter, sans-serif',
        color: '#F8FAFC',
        stroke: '#0f172a',
        strokeThickness: 6,
      })
      .setOrigin(0.5)

    const startLabel = this.add
      .text(width / 2, height / 2 + 40, 'Tap or press ENTER to deploy', {
        fontSize: '28px',
        fontFamily: 'Inter, sans-serif',
        color: '#38bdf8',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

    startLabel.on('pointerup', () => this.launchGame())

    const keyboard = this.input.keyboard
    if (keyboard) {
      keyboard.once('keydown-ENTER', () => this.launchGame())
    }

    this.tweens.add({
      targets: [title, startLabel],
      alpha: { from: 0.4, to: 1 },
      duration: 1200,
      repeat: -1,
      yoyo: true,
    })
  }

  private launchGame() {
    this.scene.start(SceneKeys.Game)
  }
}

