import Phaser from 'phaser'
import {
  SPECIAL_INFECTED_DEFS,
  type SpecialInfectedDefinition,
  type SpecialInfectedId,
} from '../../data/specialInfected'
import { Infected, type InfectedConfig } from './Infected'

export interface SpecialAbilityPayload {
  ability: SpecialInfectedDefinition['ability']
  attacker: SpecialInfected
  targetPosition: Phaser.Math.Vector2
  definition: SpecialInfectedDefinition
}

const cloneDefinition = (
  definition: SpecialInfectedDefinition,
): SpecialInfectedDefinition => ({
  ...definition,
  ability: { ...definition.ability },
})

const createBaseConfig = (
  definition: SpecialInfectedDefinition,
): InfectedConfig => ({
  speed: definition.movementSpeed,
  maxHealth: definition.health,
  damage: definition.ability.damage ?? 12,
  attackCooldown: 900,
})

export class SpecialInfected extends Infected {
  readonly definition: SpecialInfectedDefinition
  private abilityReadyAt = 0

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    definition: SpecialInfectedDefinition,
  ) {
    super(scene, x, y, createBaseConfig(definition))
    this.definition = definition
    this.setScale(this.definition.id === 'tank' ? 1.4 : 1)
    this.setDepth(6)
    if (this.definition.id === 'boomer') {
      this.setTint(0x7dd3fc)
    }
    if (this.definition.id === 'witch') {
      this.setAlpha(0.85)
    }
  }

  static create(scene: Phaser.Scene, type: SpecialInfectedId) {
    const def = cloneDefinition(SPECIAL_INFECTED_DEFS[type])
    return new SpecialInfected(scene, 0, 0, def)
  }

  spawn(x: number, y: number) {
    super.spawn(x, y)
    this.abilityReadyAt = this.scene.time.now + 1200
  }

  updateAI(target: Phaser.Math.Vector2) {
    if (!this.active) return
    const now = this.scene.time.now
    const ability = this.definition.ability
    const current = this.getCenter()
    const distance = Phaser.Math.Distance.BetweenPoints(current, target)

    if (this.definition.id === 'witch' && !this.visible) {
      return
    }

    if (distance > ability.range * 0.9) {
      const direction = target.clone().subtract(current)
      const normalized = direction.normalize()
      const velocity = normalized.scale(this.definition.movementSpeed)
      this.setVelocity(velocity.x, velocity.y)
      this.setRotation(Math.atan2(normalized.y, normalized.x))
      return
    }

    if (now >= this.abilityReadyAt) {
      this.triggerAbility(target)
      this.abilityReadyAt = now + ability.cooldown
    } else {
      this.setVelocity(0, 0)
    }
  }

  private triggerAbility(targetPosition: Phaser.Math.Vector2) {
    const payload: SpecialAbilityPayload = {
      ability: this.definition.ability,
      attacker: this,
      targetPosition,
      definition: this.definition,
    }
    this.scene.events.emit('special-ability', payload)
  }
}

