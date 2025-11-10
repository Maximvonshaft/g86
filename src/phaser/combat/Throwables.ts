import Phaser from 'phaser'
import { DamageZone } from '../effects/DamageZone'
import { TextureKeys } from '../constants'

export type ThrowableType = 'molotov' | 'shock'

interface ThrowableConfig {
  texture: string
  speed: number
  fuseMs: number
  damageZone: {
    color: number
    borderColor: number
    radius: number
    durationMs: number
    totalDamage: number
  }
}

const THROWABLE_CONFIGS: Record<ThrowableType, ThrowableConfig> = {
  molotov: {
    texture: TextureKeys.Molotov,
    speed: 720,
    fuseMs: 500,
    damageZone: {
      color: 0xf97316,
      borderColor: 0xfb923c,
      radius: 180,
      durationMs: 6000,
      totalDamage: 220,
    },
  },
  shock: {
    texture: TextureKeys.Shock,
    speed: 820,
    fuseMs: 450,
    damageZone: {
      color: 0x7c3aed,
      borderColor: 0xc084fc,
      radius: 200,
      durationMs: 3000,
      totalDamage: 40,
    },
  },
}

interface ThrowableProjectile {
  throwableType: ThrowableType
  spawnAt: number
  fuseMs: number
}

type ThrowableSprite = Phaser.Physics.Arcade.Sprite & ThrowableProjectile

export interface ActiveDamageZone {
  zone: DamageZone
  type: ThrowableType
}

export class ThrowablesSystem {
  private readonly scene: Phaser.Scene
  private readonly projectiles: Phaser.Physics.Arcade.Group
  private damageZones: ActiveDamageZone[] = []

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.projectiles = scene.physics.add.group({
      maxSize: 12,
      runChildUpdate: false,
    })
  }

  throw(
    type: ThrowableType,
    origin: Phaser.Math.Vector2,
    direction: Phaser.Math.Vector2,
  ) {
    const config = THROWABLE_CONFIGS[type]
    const projectile = this.projectiles.get(
      origin.x,
      origin.y,
      config.texture,
    ) as ThrowableSprite | null
    if (!projectile) return

    projectile.throwableType = type
    projectile.spawnAt = this.scene.time.now
    projectile.fuseMs = config.fuseMs
    projectile
      .setActive(true)
      .setVisible(true)
      .setPosition(origin.x, origin.y)
      .setDepth(30)
      .setScale(0.65)

    const normalized = direction.clone().normalize()
    const body = projectile.body as Phaser.Physics.Arcade.Body
    body.setAllowGravity(false)
    body.setDrag(0, 0)
    body.setVelocity(
      normalized.x * config.speed,
      normalized.y * config.speed,
    )
  }

  update(delta: number) {
    const now = this.scene.time.now
    this.projectiles.children.each((child) => {
      const projectile = child as ThrowableSprite
      if (!projectile.active) return false
      const elapsed = now - projectile.spawnAt
      const speed =
        projectile.body instanceof Phaser.Physics.Arcade.Body
          ? projectile.body.velocity.length()
          : 0
      if (elapsed >= projectile.fuseMs || speed < 50) {
        this.explode(projectile)
      }
      return false
    })

    this.damageZones = this.damageZones.filter((entry) => {
      entry.zone.update(delta)
      return entry.zone.isActive()
    })
  }

  getZones() {
    return this.damageZones
  }

  private explode(projectile: ThrowableSprite) {
    const config = THROWABLE_CONFIGS[projectile.throwableType]
    const { x, y } = projectile
    this.damageZones.push({
      type: projectile.throwableType,
      zone: new DamageZone(this.scene, x, y, {
        ...config.damageZone,
      }),
    })
    if (projectile.throwableType === 'shock') {
      this.scene.events.emit('throwable-shock', { x, y, radius: 220 })
    }
    projectile.setActive(false)
    projectile.setVisible(false)
    const body = projectile.body as Phaser.Physics.Arcade.Body | undefined
    body?.stop()
    projectile.setPosition(-9999, -9999)
  }
}

