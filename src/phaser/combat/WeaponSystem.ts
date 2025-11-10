import Phaser from 'phaser'
import { BulletPool } from './bulletPool'

export interface WeaponDefinition {
  id: string
  displayName: string
  fireRate: number
  damage: number
  projectileSpeed: number
  spread: number
  automatic: boolean
  magazineSize: number
  reloadTime: number
}

interface WeaponRuntimeState extends WeaponDefinition {
  ammoInMagazine: number
  isReloading: boolean
  lastShotAt: number
  reloadStartedAt: number
}

export type WeaponSlot = 'primary' | 'secondary'

export class WeaponSystem {
  private readonly scene: Phaser.Scene
  private readonly bulletPool: BulletPool
  private readonly loadout: Record<WeaponSlot, WeaponRuntimeState>
  private activeSlot: WeaponSlot = 'primary'

  constructor(
    scene: Phaser.Scene,
    bulletPool: BulletPool,
    primary: WeaponDefinition,
    secondary: WeaponDefinition,
  ) {
    this.scene = scene
    this.bulletPool = bulletPool
    this.loadout = {
      primary: this.createState(primary),
      secondary: this.createState(secondary),
    }
  }

  get activeWeapon(): WeaponRuntimeState {
    return this.loadout[this.activeSlot]
  }

  get weaponSummary() {
    const { id, ammoInMagazine, magazineSize, displayName } = this.activeWeapon
    return {
      id,
      displayName,
      ammoInMagazine,
      magazineSize,
      slot: this.activeSlot,
    }
  }

  switchWeapon(slot: WeaponSlot) {
    if (this.activeSlot === slot) return
    this.activeSlot = slot
  }

  tryFire(
    origin: Phaser.Math.Vector2,
    direction: Phaser.Math.Vector2,
    ownerId: string,
  ) {
    const weapon = this.activeWeapon
    if (weapon.isReloading || weapon.ammoInMagazine <= 0) {
      this.queueReload(weapon)
      return false
    }

    const now = this.scene.time.now
    const fireInterval = 1000 / weapon.fireRate
    if (now - weapon.lastShotAt < fireInterval) {
      return false
    }

    const spreadAngle =
      weapon.spread > 0
        ? Phaser.Math.FloatBetween(-weapon.spread, weapon.spread)
        : 0

    const velocity = direction
      .clone()
      .normalize()
      .rotate(Phaser.Math.DEG_TO_RAD * spreadAngle)
      .scale(weapon.projectileSpeed)

    this.bulletPool.fireBullet({
      x: origin.x,
      y: origin.y,
      velocityX: velocity.x,
      velocityY: velocity.y,
      damage: weapon.damage,
      ownerId,
    })

    weapon.ammoInMagazine -= 1
    weapon.lastShotAt = now
    if (weapon.ammoInMagazine <= 0) {
      this.queueReload(weapon)
    }
    return true
  }

  update(_: number) {
    const now = this.scene.time.now
    Object.values(this.loadout).forEach((weapon) => {
      if (!weapon.isReloading) return
      const elapsed = now - weapon.reloadStartedAt
      if (elapsed >= weapon.reloadTime) {
        weapon.ammoInMagazine = weapon.magazineSize
        weapon.isReloading = false
        weapon.reloadStartedAt = 0
        weapon.lastShotAt = now
      }
    })
  }

  startReload(slot: WeaponSlot = this.activeSlot) {
    const weapon = this.loadout[slot]
    if (weapon.isReloading) return false
    if (weapon.ammoInMagazine === weapon.magazineSize) return false
    this.queueReload(weapon)
    return true
  }

  cancelReload(slot: WeaponSlot = this.activeSlot) {
    const weapon = this.loadout[slot]
    if (!weapon.isReloading) return
    weapon.isReloading = false
    weapon.reloadStartedAt = 0
  }

  getReloadProgress(slot: WeaponSlot = this.activeSlot) {
    const weapon = this.loadout[slot]
    if (!weapon.isReloading) {
      return {
        duration: weapon.reloadTime,
        elapsed: 0,
        isReloading: false,
      }
    }
    const now = this.scene.time.now
    const elapsed = Phaser.Math.Clamp(
      now - weapon.reloadStartedAt,
      0,
      weapon.reloadTime,
    )
    return {
      duration: weapon.reloadTime,
      elapsed,
      isReloading: true,
    }
  }

  private queueReload(weapon: WeaponRuntimeState) {
    if (weapon.isReloading) {
      return
    }
    weapon.isReloading = true
    weapon.reloadStartedAt = this.scene.time.now
  }

  private createState(definition: WeaponDefinition): WeaponRuntimeState {
    return {
      ...definition,
      ammoInMagazine: definition.magazineSize,
      isReloading: false,
      lastShotAt: 0,
      reloadStartedAt: 0,
    }
  }
}

