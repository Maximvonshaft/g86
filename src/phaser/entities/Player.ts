import Phaser from 'phaser'
import { usePlayerStore, type PlayerFaction } from '../../state/playerStore'
import { TextureKeys } from '../constants'
import { BulletPool } from '../combat/bulletPool'
import { WeaponSystem } from '../combat/WeaponSystem'
import type {
  WeaponDefinition,
  WeaponSlot,
} from '../combat/WeaponSystem'

export interface PlayerConfig {
  speed: number
  id: string
  primaryWeapon: WeaponDefinition
  secondaryWeapon: WeaponDefinition
}

export class Player {
  readonly sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  readonly weaponSystem: WeaponSystem
  private readonly scene: Phaser.Scene
  private readonly id: string
  private readonly moveVector = new Phaser.Math.Vector2()
  private readonly aimVector = new Phaser.Math.Vector2(1, 0)
  private readonly speed: number
  private pounceActive = false
  private pounceDirection = new Phaser.Math.Vector2(1, 0)
  private pounceSpeed = 0
  private pounceEndTime = 0

  constructor(
    scene: Phaser.Scene,
    physics: Phaser.Physics.Arcade.ArcadePhysics,
    bulletPool: BulletPool,
    config: PlayerConfig,
  ) {
    this.scene = scene
    this.speed = config.speed
    this.id = config.id
    this.sprite = physics.add
      .sprite(0, 0, TextureKeys.Player)
      .setScale(0.9)
      .setDepth(5)
      .setCollideWorldBounds(true)

    this.weaponSystem = new WeaponSystem(
      scene,
      bulletPool,
      config.primaryWeapon,
      config.secondaryWeapon,
    )
  }

  get center(): Phaser.Math.Vector2 {
    return this.sprite.getCenter()
  }

  updateMovement(vector: Phaser.Math.Vector2) {
    this.moveVector.copy(vector)
  }

  updateAim(vector: Phaser.Math.Vector2) {
    if (vector.lengthSq() > 0.0001) {
      this.aimVector.copy(vector)
    }
  }

  update(delta: number) {
    const now = this.scene.time.now

    const direction = this.moveVector.clone()
    if (direction.length() > 1) {
      direction.normalize()
    }
    if (this.pounceActive) {
      this.sprite.setVelocity(
        this.pounceDirection.x * this.pounceSpeed,
        this.pounceDirection.y * this.pounceSpeed,
      )
      this.sprite.setRotation(
        Math.atan2(this.pounceDirection.y, this.pounceDirection.x),
      )
      if (now >= this.pounceEndTime) {
        this.endHunterPounce()
      }
    } else {
      const velocity = direction.scale(this.speed)
      this.sprite.setVelocity(velocity.x, velocity.y)
      const targetAngle = Math.atan2(this.aimVector.y, this.aimVector.x)
      this.sprite.setRotation(targetAngle)
    }

    const faction = usePlayerStore.getState().faction
    if (faction === 'survivor' && this.aimVector.length() > 0.2) {
      this.weaponSystem.tryFire(
        this.sprite.getCenter(),
        this.aimVector,
        this.id,
      )
    }

    this.weaponSystem.update(delta)
    usePlayerStore
      .getState()
      .updateWeaponSummary(this.weaponSystem.weaponSummary)
    this.persistTelemetry()
  }

  switchWeapon(slot: WeaponSlot) {
    this.weaponSystem.switchWeapon(slot)
  }

  fireOnce(direction?: Phaser.Math.Vector2): boolean {
    const vector = direction?.clone() ?? this.aimVector.clone()
    if (vector.lengthSq() === 0) {
      vector.set(1, 0)
    }
    return this.weaponSystem.tryFire(this.sprite.getCenter(), vector, this.id)
  }

  startReload(): boolean {
    return this.weaponSystem.startReload()
  }

  setFaction(faction: PlayerFaction) {
    const texture =
      faction === 'infected' ? TextureKeys.Infected : TextureKeys.Player
    this.sprite.setTexture(texture)
    if (faction !== 'infected') {
      this.endHunterPounce()
    }
  }

  startHunterPounce(speed: number, duration: number, direction: Phaser.Math.Vector2) {
    if (this.pounceActive) {
      return false
    }
    if (direction.lengthSq() === 0) {
      return false
    }
    this.pounceActive = true
    this.pounceDirection.copy(direction).normalize()
    this.pounceSpeed = speed
    this.pounceEndTime = this.scene.time.now + duration
    return true
  }

  endHunterPounce(resetVelocity = true) {
    if (!this.pounceActive) {
      return
    }
    this.pounceActive = false
    if (resetVelocity) {
      this.sprite.setVelocity(0, 0)
    }
  }

  isHunterPouncing() {
    return this.pounceActive
  }

  applyDamage(amount: number) {
    const { health } = usePlayerStore.getState().telemetry
    const newHealth = Math.max(0, health - amount)
    usePlayerStore.getState().updateTelemetry({ health: newHealth })
    if (amount > 0) {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(50)
      }
      this.scene.cameras.main.shake(120, 0.003)
    }
    this.scene.tweens.add({
      targets: this.sprite,
      tint: 0xff4444,
      yoyo: true,
      repeat: 1,
      duration: 120,
      onComplete: () => this.sprite.clearTint(),
    })
  }

  private persistTelemetry() {
    const center = this.sprite.getCenter()
    usePlayerStore.getState().updateTelemetry({
      position: { x: center.x, y: center.y },
      rotation: this.sprite.rotation,
    })
  }
}

