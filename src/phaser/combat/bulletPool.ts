import Phaser from 'phaser'
import { TextureKeys } from '../constants'

export interface BulletConfig {
  x: number
  y: number
  velocityX: number
  velocityY: number
  damage: number
  ownerId: string
  lifespan?: number
}

export interface BulletFiredEvent extends BulletConfig {
  bullet: Bullet
}

class Bullet extends Phaser.Physics.Arcade.Image {
  damage = 10
  ownerId = ''
  lifespan = 1000
  birth = 0
  lastTrailAt = 0

  fire({
    x,
    y,
    velocityX,
    velocityY,
    damage,
    ownerId,
    lifespan = 1000,
  }: BulletConfig) {
    this.setActive(true)
    this.setVisible(true)
    this.setPosition(x, y)
    this.setVelocity(velocityX, velocityY)
    this.damage = damage
    this.ownerId = ownerId
    this.lifespan = lifespan
    this.birth = this.scene.time.now
    this.lastTrailAt = this.birth
    this.setRotation(Math.atan2(velocityY, velocityX))
  }
}

export class BulletPool extends Phaser.Physics.Arcade.Group {
  private readonly trailInterval = 45

  constructor(scene: Phaser.Scene) {
    super(scene.physics.world, scene, {
      classType: Bullet,
      maxSize: 150,
      runChildUpdate: false,
    })
  }

  fireBullet(config: BulletConfig) {
    const bullet = this.get() as Bullet | null
    if (!bullet) {
      return
    }
    if (!bullet.active) {
      bullet.setTexture(TextureKeys.Bullet)
      bullet.setScale(0.5)
      const body = bullet.body as Phaser.Physics.Arcade.Body | null
      if (body) {
        body.allowGravity = false
      }
      bullet.setDepth(10)
    }
    bullet.fire(config)
    this.scene.events.emit('bullet-fired', { ...config, bullet })
  }

  update(time: number) {
    this.children.each((gameObject) => {
      const bullet = gameObject as Bullet
      if (!bullet.active) {
        return false
      }
      const exceededLifespan = time - bullet.birth > bullet.lifespan
      if (exceededLifespan) {
        this.killBullet(bullet)
        return false
      }
      if (time - bullet.lastTrailAt >= this.trailInterval) {
        bullet.lastTrailAt = time
        this.scene.events.emit('bullet-trail', bullet.x, bullet.y, bullet.body?.velocity)
      }
      return false
    })
  }

  killBullet(bullet: Bullet) {
    bullet.setActive(false)
    bullet.setVisible(false)
    bullet.setVelocity(0, 0)
  }
}

export type BulletSprite = Bullet

