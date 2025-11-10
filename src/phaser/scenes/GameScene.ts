import Phaser from 'phaser'
import { gameStore } from '../../state/gameStore'
import { usePlayerStore } from '../../state/playerStore'
import { useHudStore } from '../../state/hudStore'
import {
  BulletPool,
  type BulletFiredEvent,
  type BulletSprite,
} from '../combat/bulletPool'
import {
  WeaponSystem,
  type WeaponDefinition,
  type WeaponSlot,
} from '../combat/WeaponSystem'
import {
  ThrowablesSystem,
  type ThrowableType,
} from '../combat/Throwables'
import { TextureKeys, SceneKeys } from '../constants'
import { VirtualJoystick } from '../input/VirtualJoystick'
import { Player } from '../entities/Player'
import { EnemySpawner } from '../systems/EnemySpawner'
import { Infected } from '../entities/Infected'
import type { SpecialAbilityPayload } from '../entities/SpecialInfected'
import { SpecialInfectedDirector } from '../systems/SpecialInfectedDirector'
import { ScenarioDirector } from '../systems/ScenarioDirector'
import { DamageZone, type DamageZoneOptions } from '../effects/DamageZone'
import { SPECIAL_INFECTED_DEFS } from '../../data/specialInfected'
import type { StageDefinition } from '../../data/scenarios/deadCenterHotel'
import { apiClient, type GameEvent } from '../../services/api/client'

type HudActionDetail = {
  action: 'shoot' | 'shove' | 'reload'
}

export class GameScene extends Phaser.Scene {
  private player!: Player
  private joysticks!: {
    move: VirtualJoystick
    aim: VirtualJoystick
  }
  private bulletPool!: BulletPool
  private enemySpawner!: EnemySpawner
  private specialDirector!: SpecialInfectedDirector
  private throwables!: ThrowablesSystem
  private scenarioDirector!: ScenarioDirector
  private weaponSystem!: WeaponSystem
  private statusOverlay?: Phaser.GameObjects.Rectangle
  private abilityHintText?: Phaser.GameObjects.Text
  private hazardZones: DamageZone[] = []
  private aimAssistVector = new Phaser.Math.Vector2(1, 0)
  private gamepad?: Phaser.Input.Gamepad.Gamepad
  private hitEmitter?: Phaser.GameObjects.Particles.ParticleEmitter
  private muzzleEmitter?: Phaser.GameObjects.Particles.ParticleEmitter
  private trailEmitter?: Phaser.GameObjects.Particles.ParticleEmitter
  private damageTextGroup?: Phaser.GameObjects.Group
  private unsubscribeApi?: () => void
  private hunterPounceCooldownEnd = 0
  private lastShoveAt = -Infinity
  private readonly shoveCooldownMs = 900
  private readonly onHudAction = (event: Event) => this.handleHudAction(event)
  private readonly onSpecialAbilityEvent = (payload: SpecialAbilityPayload) =>
    this.onSpecialAbility(payload)
  private readonly onShockBlastEvent = (payload: {
    x: number
    y: number
    radius: number
  }) => this.handleShockBlast(payload)
  private readonly onInfectedAttack = (damage: number) =>
    this.player.applyDamage(damage)
  private readonly onScenarioStageStart = (stage: StageDefinition) =>
    this.flashStatusOverlay(0x3b82f6, 1200, stage.label)
  private readonly onScenarioComplete = () =>
    this.flashStatusOverlay(0x22c55e, 1500, '撤离成功')

  constructor() {
    super(SceneKeys.Game)
  }

  create() {
    gameStore.setScene(SceneKeys.Game)
    this.createWorld()
    this.createPlayer()
    this.player.setFaction(usePlayerStore.getState().faction)
    this.createEnemySpawner()
    this.createSpecialDirector()
    this.createThrowables()
    this.createScenarioDirector()
    this.createVirtualControls()
    this.createStatusOverlay()
    this.bindHudEvents()
    if (this.input.gamepad) {
      this.input.gamepad.once('connected', (pad: Phaser.Input.Gamepad.Gamepad) => {
        this.gamepad = pad
      })
    }
    this.setupCollisions()
    this.registerInputs()
    this.events.on('special-ability', this.onSpecialAbilityEvent)
    this.events.on('throwable-shock', this.onShockBlastEvent)
    this.events.on('scenario-stage-start', this.onScenarioStageStart, this)
    this.events.on('scenario-complete', this.onScenarioComplete, this)
    this.events.on('bullet-fired', this.onBulletFired, this)
    this.events.on('bullet-trail', this.onBulletTrail, this)
    this.unsubscribeApi = apiClient.subscribeEvents(
      '/api/game/events',
      (event) => this.handleServerEvent(event),
    )
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this)
    this.events.once(Phaser.Scenes.Events.DESTROY, this.onShutdown, this)
  }

  update(_: number, delta: number) {
    if (gameStore.getState().isPaused) {
      this.syncHudState()
      return
    }

    let moveVector = this.joysticks.move.normalizedVector.clone()
    let aimVector = this.joysticks.aim.normalizedVector.clone()

    if (this.gamepad && this.gamepad.connected) {
      const padMove = new Phaser.Math.Vector2(
        this.gamepad.axes.length > 0 ? this.gamepad.axes[0].value : 0,
        this.gamepad.axes.length > 1 ? this.gamepad.axes[1].value : 0,
      )
      if (padMove.lengthSq() > 0.05) {
        moveVector = padMove
      }
      const padAim = new Phaser.Math.Vector2(
        this.gamepad.axes.length > 2 ? this.gamepad.axes[2].value : 0,
        this.gamepad.axes.length > 3 ? this.gamepad.axes[3].value : 0,
      )
      if (padAim.lengthSq() > 0.05) {
        aimVector = padAim
      }
    }

    this.player.updateMovement(moveVector)
    if (aimVector.lengthSq() > 0.0004) {
      this.aimAssistVector.lerp(aimVector, 0.25)
    } else {
      this.aimAssistVector.scale(0.85)
    }
    this.player.updateAim(this.aimAssistVector.clone())
    this.player.update(delta)
    this.throwables.update(delta)
    this.bulletPool.update(this.time.now)
    this.enemySpawner.update()
    this.specialDirector.update(this.time.now)
    this.scenarioDirector.update(delta)
    this.updateHazardZones(delta)
    this.updateDamageZones(delta)

    this.syncHudState()
  }

  private createWorld() {
    const floor = this.add.tileSprite(0, 0, 4096, 4096, TextureKeys.Floor)
    floor.setOrigin(0.5)
    floor.setAlpha(0.9)
    this.physics.world.setBounds(-1500, -1500, 3000, 3000)
    this.cameras.main.setBackgroundColor('#020617')
    this.cameras.main.setZoom(0.8)
    this.cameras.main.setLerp(0.16, 0.16)

    this.hitEmitter = this.add.particles(0, 0, TextureKeys.Bullet, {
      speed: { min: 140, max: 240 },
      scale: { start: 0.45, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 220,
      blendMode: Phaser.BlendModes.ADD,
      gravityY: 0,
      quantity: 10,
      emitting: false,
      tint: [0xf97316, 0xfbbf24],
    }) as Phaser.GameObjects.Particles.ParticleEmitter
    ;(
      this.hitEmitter as unknown as { manager?: { setDepth?: (depth: number) => void } }
    ).manager?.setDepth?.(55)

    this.trailEmitter = this.add.particles(0, 0, TextureKeys.Bullet, {
      lifespan: 260,
      alpha: { start: 0.6, end: 0 },
      scale: { start: 0.35, end: 0 },
      tint: [0x38bdf8, 0x0ea5e9],
      gravityY: 0,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
      quantity: 1,
    }) as Phaser.GameObjects.Particles.ParticleEmitter
    ;(
      this.trailEmitter as unknown as { manager?: { setDepth?: (depth: number) => void } }
    ).manager?.setDepth?.(30)

    this.muzzleEmitter = this.add.particles(0, 0, TextureKeys.Bullet, {
      lifespan: 140,
      speed: { min: 200, max: 360 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      quantity: 8,
      emitting: false,
      tint: [0xfacc15, 0xf97316],
      blendMode: Phaser.BlendModes.ADD,
      gravityY: 0,
    }) as Phaser.GameObjects.Particles.ParticleEmitter
    ;(
      this.muzzleEmitter as unknown as { manager?: { setDepth?: (depth: number) => void } }
    ).manager?.setDepth?.(60)

    this.damageTextGroup = this.add.group({
      classType: Phaser.GameObjects.Text,
      maxSize: 24,
      runChildUpdate: false,
    })
  }

  private createPlayer() {
    this.bulletPool = new BulletPool(this)
    const weaponPrimary: WeaponDefinition = {
      id: 'ar',
      displayName: 'M416 Carbine',
      fireRate: 9,
      damage: 16,
      projectileSpeed: 1200,
      spread: 3,
      automatic: true,
      magazineSize: 30,
      reloadTime: 1600,
    }
    const weaponSecondary: WeaponDefinition = {
      id: 'pistol',
      displayName: 'Ranger Pistol',
      fireRate: 4,
      damage: 24,
      projectileSpeed: 900,
      spread: 1.5,
      automatic: false,
      magazineSize: 12,
      reloadTime: 1200,
    }

    this.player = new Player(this, this.physics, this.bulletPool, {
      speed: 320,
      id: 'player-local',
      primaryWeapon: weaponPrimary,
      secondaryWeapon: weaponSecondary,
    })

    this.weaponSystem = this.player.weaponSystem

    const telemetry = usePlayerStore.getState().telemetry
    usePlayerStore
      .getState()
      .updateLoadout({
        primaryWeapon: weaponPrimary.id,
        secondaryWeapon: weaponSecondary.id,
        throwable: null,
      })
    this.player.sprite.setPosition(telemetry.position.x, telemetry.position.y)
    this.cameras.main.startFollow(this.player.sprite, true)
  }

  private createEnemySpawner() {
    this.enemySpawner = new EnemySpawner(
      this,
      {
        speed: 160,
        maxHealth: 60,
        damage: 10,
        attackCooldown: 900,
      },
      {
        poolSize: 40,
        spawnRadius: 1200,
        spawnInterval: 4200,
        initialDelay: 2000,
      },
    )
    this.enemySpawner.start(() => this.player.center.clone())
  }

  private createSpecialDirector() {
    this.specialDirector = new SpecialInfectedDirector(
      this,
      () => this.player.center.clone(),
    )
  }

  private createThrowables() {
    this.throwables = new ThrowablesSystem(this)
  }

  private createScenarioDirector() {
    this.scenarioDirector = new ScenarioDirector({
      scene: this,
      player: this.player,
      enemySpawner: this.enemySpawner,
      specialDirector: this.specialDirector,
    })
    this.scenarioDirector.start()
    void apiClient.get('/api/game/scenario').catch((error) =>
      console.warn('Scenario fetch placeholder failed', error),
    )
  }

  private createVirtualControls() {
    const layout = this.getJoystickLayout()
    this.rebuildJoysticks(layout)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
  }

  private getJoystickLayout() {
    const { width, height } = this.scale
    const padding = 120
    const moveArea = new Phaser.Geom.Rectangle(
      0,
      height * 0.45,
      width * 0.5,
      height * 0.55,
    )
    const aimArea = new Phaser.Geom.Rectangle(
      width * 0.5,
      height * 0.45,
      width * 0.5,
      height * 0.55,
    )
    return {
      move: {
        x: padding,
        y: height - padding,
        touchArea: moveArea,
        fixed: true,
        sensitivity: 1,
      },
      aim: {
        x: width - padding,
        y: height - padding,
        touchArea: aimArea,
        fixed: true,
        sensitivity: 1.25,
      },
    }
  }

  private createStatusOverlay() {
    this.statusOverlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff, 0)
      .setScrollFactor(0)
      .setOrigin(0)
      .setDepth(800)
      .setVisible(false)

    this.abilityHintText = this.add
      .text(this.scale.width / 2, this.scale.height - 120, '', {
        fontSize: '20px',
        fontFamily: 'Inter, sans-serif',
        color: '#bfdbfe',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(805)
      .setAlpha(0)

    this.layoutOverlay()
  }

  private setupCollisions() {
    this.physics.add.overlap(
      this.bulletPool,
      this.enemySpawner.enemies,
      this.handleBulletHitEnemy,
      undefined,
      this,
    )
    this.physics.add.overlap(
      this.bulletPool,
      this.specialDirector.group,
      this.handleBulletHitEnemy,
      undefined,
      this,
    )

    this.physics.add.overlap(
      this.player.sprite,
      this.enemySpawner.enemies,
      this.handleEnemyHitPlayer,
      undefined,
      this,
    )
    this.physics.add.overlap(
      this.player.sprite,
      this.specialDirector.group,
      this.handleEnemyHitPlayer,
      undefined,
      this,
    )

    this.events.on('infected-attack', this.onInfectedAttack)
  }

  private registerInputs() {
    const keyboard = this.input.keyboard
    if (!keyboard) return
    keyboard.on('keydown-ONE', () => this.switchWeapon('primary'))
    keyboard.on('keydown-TWO', () => this.switchWeapon('secondary'))
    keyboard.on('keydown-Q', () => {
      const next: WeaponSlot =
        this.weaponSystem.weaponSummary.slot === 'primary'
          ? 'secondary'
          : 'primary'
      this.switchWeapon(next)
    })
    keyboard.on('keydown-E', () => this.useThrowable('molotov'))
    keyboard.on('keydown-R', () => this.useThrowable('shock'))
    keyboard.on('keydown-F', () => this.toggleFaction())
    keyboard.on('keydown-SPACE', () => this.activateInfectedSkill())
    keyboard.on('keydown-ESC', () => this.togglePause())
  }

  private handleBulletHitEnemy: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    bulletObject,
    enemyObject,
  ) => {
    const enemy = enemyObject as Infected
    const bullet = bulletObject as BulletSprite
    this.bulletPool.killBullet(bullet)
    enemy.receiveDamage?.(bullet.damage)
    this.hitEmitter?.explode(8, enemy.x, enemy.y)
    this.showDamageText(enemy.x, enemy.y - 10, bullet.damage)
  }

  private handleEnemyHitPlayer: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback =
    (_playerObject, enemyObject) => {
      const faction = usePlayerStore.getState().faction
      if (faction === 'infected' && this.player.isHunterPouncing()) {
        const enemy = enemyObject as Infected
        const ability = SPECIAL_INFECTED_DEFS.hunter.ability
        const damage = ability.damage ?? 25
        enemy.receiveDamage?.(damage)
        this.hitEmitter?.explode(12, enemy.x, enemy.y)
        this.showDamageText(enemy.x, enemy.y - 12, damage)
        this.player.endHunterPounce()
        return
      }
      this.player.applyDamage(8)
    }

  private onBulletFired(payload: BulletFiredEvent) {
    const direction = new Phaser.Math.Vector2(payload.velocityX, payload.velocityY)
    if (direction.lengthSq() === 0) {
      return
    }
    direction.normalize()
    const muzzleOffset = direction.clone().scale(24)
    const flashX = payload.x - muzzleOffset.x
    const flashY = payload.y - muzzleOffset.y
    this.muzzleEmitter?.emitParticleAt(flashX, flashY, 8)
    this.trailEmitter?.emitParticleAt(payload.x, payload.y, 2)
  }

  private onBulletTrail(x: number, y: number) {
    this.trailEmitter?.emitParticleAt(x, y, 1)
  }

  private showDamageText(x: number, y: number, amount: number) {
    if (!this.damageTextGroup) {
      return
    }
    const value = Math.round(amount)
    const text =
      (this.damageTextGroup.get(
        x,
        y,
        value.toString(),
      ) as Phaser.GameObjects.Text | null) ??
      this.add.text(x, y, value.toString(), {})

    text.setStyle({
      fontFamily: 'Inter, sans-serif',
      fontSize: '22px',
      color: '#f97316',
      stroke: '#0b0f16',
      strokeThickness: 3,
    })
    text.setDepth(2000)
    text.setAlpha(1)
    text.setPosition(x, y)
    text.setActive(true)
    text.setVisible(true)

    this.damageTextGroup.add(text)
    this.tweens.add({
      targets: text,
      y: y - 32,
      alpha: 0,
      duration: 380,
      ease: Phaser.Math.Easing.Quadratic.Out,
      onComplete: () => {
        this.damageTextGroup?.killAndHide(text)
        text.setActive(false)
        text.setVisible(false)
      },
    })
  }

  private switchWeapon(slot: WeaponSlot) {
    this.player.switchWeapon(slot)
  }

  private useThrowable(type: ThrowableType) {
    const store = usePlayerStore.getState()
    if (store.faction !== 'survivor') return
    const aim = this.joysticks.aim.normalizedVector
    const direction =
      aim.lengthSq() > 0.01 ? aim.clone().normalize() : new Phaser.Math.Vector2(1, 0)
    this.throwables.throw(type, this.player.center, direction)
  }

  private updateHazardZones(delta: number) {
    this.hazardZones = this.hazardZones.filter((zone) => {
      zone.update(delta)
      if (!zone.isActive()) {
        return false
      }
      if (zone.contains(this.player.center)) {
        this.player.applyDamage(zone.sampleDamage(delta))
      }
      return true
    })
  }

  private updateDamageZones(delta: number) {
    const zones = this.throwables.getZones()
    zones.forEach(({ zone: damageZone, type }) => {
      if (!damageZone.isActive()) return
      if (type === 'molotov') {
        this.applyZoneToGroup(
          damageZone,
          this.enemySpawner.enemies,
          delta,
          false,
        )
        this.applyZoneToGroup(
          damageZone,
          this.specialDirector.group,
          delta,
          false,
        )
      } else if (type === 'shock') {
        this.applyZoneToGroup(
          damageZone,
          this.enemySpawner.enemies,
          delta,
          true,
        )
        this.applyZoneToGroup(
          damageZone,
          this.specialDirector.group,
          delta,
          true,
        )
      }
    })
  }

  private applyZoneToGroup(
    zone: DamageZone,
    group: Phaser.Physics.Arcade.Group,
    delta: number,
    stun = false,
  ) {
    group.children.each((child) => {
      const enemy = child as Infected
      if (!enemy.active) return false
      const center = new Phaser.Math.Vector2(enemy.x, enemy.y)
      if (zone.contains(center)) {
        const damage = zone.sampleDamage(delta)
        enemy.receiveDamage(damage)
        if (stun) {
          enemy.setVelocity(0, 0)
          enemy.setTint(0xa855f7)
          this.time.delayedCall(200, () => enemy.clearTint())
        }
      }
      return false
    })
  }

  private spawnHazardZone(
    position: Phaser.Types.Math.Vector2Like,
    options: DamageZoneOptions,
  ) {
    const vector = new Phaser.Math.Vector2(position.x ?? 0, position.y ?? 0)
    const zone = new DamageZone(this, vector.x, vector.y, options)
    this.hazardZones.push(zone)
  }

  private flashStatusOverlay(color: number, duration: number, label?: string) {
    if (!this.statusOverlay) return
    this.statusOverlay.setFillStyle(color, 0.28)
    this.statusOverlay.setAlpha(0.35)
    this.statusOverlay.setVisible(true)
    if (this.abilityHintText) {
      this.abilityHintText.setText(label ?? '')
      this.abilityHintText.setAlpha(label ? 1 : 0)
    }
    this.tweens.add({
      targets: this.statusOverlay,
      alpha: { from: 0.35, to: 0 },
      duration,
      ease: Phaser.Math.Easing.Sine.Out,
      onComplete: () => {
        this.statusOverlay?.setAlpha(0)
        this.statusOverlay?.setVisible(false)
        this.abilityHintText?.setAlpha(0)
      },
    })
  }

  private toggleFaction() {
    const store = usePlayerStore.getState()
    const next = store.faction === 'survivor' ? 'infected' : 'survivor'
    store.setFaction(next)
    this.player.setFaction(next)
    this.flashStatusOverlay(
      next === 'infected' ? 0x22c55e : 0x38bdf8,
      900,
      next === 'infected' ? '感染者模式' : '幸存者模式',
    )
  }

  private togglePause() {
    const nextState = !gameStore.getState().isPaused
    gameStore.setPaused(nextState)
    this.physics.world.isPaused = nextState
    this.time.paused = nextState
  }

  private activateInfectedSkill() {
    const store = usePlayerStore.getState()
    if (store.faction !== 'infected') return
    const ability = SPECIAL_INFECTED_DEFS.hunter.ability
    const now = this.time.now
    if (now < this.hunterPounceCooldownEnd) {
      const remaining = Math.ceil((this.hunterPounceCooldownEnd - now) / 1000)
      this.flashStatusOverlay(0xf97316, 600, `冷却中 ${remaining}s`)
      return
    }
    const aim = this.joysticks.aim.normalizedVector
    const direction =
      aim.lengthSq() > 0.01 ? aim.clone().normalize() : new Phaser.Math.Vector2(1, 0)
    const speed = ability.specialSpeed ?? 720
    const duration = ability.duration ?? 1800
    if (this.player.startHunterPounce(speed, duration, direction)) {
      this.hunterPounceCooldownEnd = now + ability.cooldown
      this.cameras.main.shake(120, 0.004)
      this.trailEmitter?.emitParticleAt(
        this.player.center.x,
        this.player.center.y,
        4,
      )
    }
  }

  private handleShockBlast(payload: { x: number; y: number; radius: number }) {
    this.cameras.main.flash(180, 124, 58, 237, false)
    this.slowGroupWithinRadius(this.enemySpawner.enemies, payload)
    this.slowGroupWithinRadius(this.specialDirector.group, payload)
  }

  private handleServerEvent(event: GameEvent) {
    if (event.type === 'stage-sync' && event.payload) {
      const payload = event.payload as Partial<{
        id: string
        name: string
        remaining: number
      }>
      if (payload.id && payload.name && payload.remaining !== undefined) {
        gameStore.setStage({
          id: payload.id,
          name: payload.name,
          duration: Math.max(payload.remaining, 0),
        })
      }
    }
  }

  private slowGroupWithinRadius(
    group: Phaser.Physics.Arcade.Group,
    payload: { x: number; y: number; radius: number },
  ) {
    group.children.each((child) => {
      const enemy = child as Infected
      if (!enemy.active) return false
      const distance = Phaser.Math.Distance.Between(
        enemy.x,
        enemy.y,
        payload.x,
        payload.y,
      )
      if (distance <= payload.radius) {
        const body = enemy.body as Phaser.Physics.Arcade.Body | undefined
        if (body) {
          body.velocity.scale(0.2)
        }
        enemy.setTint(0x7dd3fc)
        this.time.delayedCall(400, () => enemy.clearTint())
      }
      return false
    })
  }

  private onSpecialAbility(payload: SpecialAbilityPayload) {
    const { ability, attacker, targetPosition } = payload
    switch (ability.id) {
      case 'vomit': {
        this.flashStatusOverlay(
          0x65a30d,
          ability.duration ?? 1500,
          '被胆汁覆盖！',
        )
        this.enemySpawner.forceSpawn(12)
        break
      }
      case 'pounce': {
        const direction = targetPosition
          .clone()
          .subtract(attacker.getCenter())
          .normalize()
        const speed = ability.specialSpeed ?? 720
        attacker.setVelocity(direction.x * speed, direction.y * speed)
        this.time.delayedCall(ability.duration ?? 800, () =>
          attacker.setVelocity(0, 0),
        )
        if (
          Phaser.Math.Distance.BetweenPoints(
            targetPosition,
            this.player.center,
          ) < 80
        ) {
          this.player.applyDamage(ability.damage ?? 20)
          this.cameras.main.shake(150, 0.01)
        }
        break
      }
      case 'tongue': {
        const duration = ability.duration ?? 1500
        this.flashStatusOverlay(0x93c5fd, duration, '被拖拽')
        this.player.applyDamage(ability.damage ?? 10)
        this.tweens.add({
          targets: this.player.sprite,
          x: attacker.x,
          y: attacker.y,
          duration,
          ease: Phaser.Math.Easing.Sine.InOut,
        })
        break
      }
      case 'ride': {
        this.flashStatusOverlay(0x312e81, ability.duration ?? 1800, 'Jockey 控制')
        const totalTicks = Math.max(
          1,
          Math.floor((ability.duration ?? 3000) / 500),
        )
        const damagePerTick = (ability.damage ?? 12) / totalTicks
        this.time.addEvent({
          delay: 500,
          repeat: totalTicks - 1,
          callback: () => this.player.applyDamage(damagePerTick),
        })
        break
      }
      case 'charge': {
        const direction = targetPosition
          .clone()
          .subtract(attacker.getCenter())
          .normalize()
        const speed = ability.specialSpeed ?? 520
        attacker.setVelocity(direction.x * speed, direction.y * speed)
        this.time.delayedCall(ability.duration ?? 1400, () =>
          attacker.setVelocity(0, 0),
        )
        if (
          Phaser.Math.Distance.BetweenPoints(
            attacker.getCenter(),
            this.player.center,
          ) < ability.range
        ) {
          this.player.applyDamage((ability.damage ?? 15) * 1.5)
          this.cameras.main.shake(200, 0.015)
        }
        break
      }
      case 'acid': {
        this.spawnHazardZone(targetPosition, {
          color: 0x15803d,
          borderColor: 0x22c55e,
          radius: ability.areaRadius ?? 200,
          durationMs: ability.duration ?? 8000,
          totalDamage: ability.damage ?? 68,
        })
        break
      }
      case 'rock': {
        const radius = ability.areaRadius ?? 140
        this.spawnHazardZone(targetPosition, {
          color: 0x4b5563,
          borderColor: 0x94a3b8,
          radius,
          durationMs: 2000,
          totalDamage: ability.damage ?? 60,
        })
        if (
          Phaser.Math.Distance.BetweenPoints(
            targetPosition,
            this.player.center,
          ) <= radius
        ) {
          this.player.applyDamage(ability.damage ?? 60)
          this.cameras.main.shake(220, 0.02)
        }
        break
      }
      case 'enrage': {
        this.flashStatusOverlay(0xea580c, 700, '女巫暴怒！')
        if (
          Phaser.Math.Distance.BetweenPoints(
            attacker.getCenter(),
            this.player.center,
          ) < ability.range
        ) {
          this.player.applyDamage(ability.damage ?? 120)
        }
        break
      }
      default:
        break
    }
  }

  private handleResize() {
    this.rebuildJoysticks(this.getJoystickLayout())
    this.layoutOverlay()
  }

  private rebuildJoysticks(layout: ReturnType<typeof this.getJoystickLayout>) {
    if (this.joysticks) {
      this.joysticks.move.destroy()
      this.joysticks.aim.destroy()
    }
    this.joysticks = {
      move: new VirtualJoystick(this, layout.move),
      aim: new VirtualJoystick(this, layout.aim),
    }
  }

  private layoutOverlay() {
    this.statusOverlay?.setDisplaySize(this.scale.width, this.scale.height)
    this.abilityHintText?.setPosition(
      this.scale.width / 2,
      this.scale.height - 120,
    )
  }

  private onShutdown() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    window.removeEventListener('hud:action', this.onHudAction)
    if (this.joysticks) {
      this.joysticks.move.destroy()
      this.joysticks.aim.destroy()
    }
    this.events.off('infected-attack', this.onInfectedAttack)
    this.events.off('special-ability', this.onSpecialAbilityEvent)
    this.events.off('throwable-shock', this.onShockBlastEvent)
    this.events.off('scenario-stage-start', this.onScenarioStageStart, this)
    this.events.off('scenario-complete', this.onScenarioComplete, this)
    this.events.off('bullet-fired', this.onBulletFired, this)
    this.events.off('bullet-trail', this.onBulletTrail, this)
    this.enemySpawner?.stop()
    this.hazardZones.forEach((zone) => zone.destroy())
    this.hazardZones = []
    this.unsubscribeApi?.()
  }

  private bindHudEvents() {
    window.addEventListener('hud:action', this.onHudAction)
    useHudStore.getState().clearSmartMessages()
    this.syncHudState()
  }

  private handleHudAction(event: Event) {
    const detail = (event as CustomEvent<HudActionDetail>).detail
    if (!detail) {
      return
    }

    const faction = usePlayerStore.getState().faction
    const hudStore = useHudStore.getState()
    const playerStore = usePlayerStore.getState()
    const shootMode = hudStore.combat.shootMode

    switch (detail.action) {
      case 'shoot': {
        if (faction !== 'survivor') {
          return
        }
        if (shootMode === 'heal-self') {
          const healItem = playerStore.inventory.healItem
          const currentHealth = playerStore.telemetry.health
          if (!healItem.id || healItem.quantity <= 0) {
            hudStore.pushSmartMessage('没有可用的医疗物品')
            hudStore.setShootMode('fire', { abilityActive: false, abilityLabel: null })
            hudStore.setContextAction(null)
            break
          }
          if (currentHealth >= 100) {
            hudStore.pushSmartMessage('生命值已满')
            hudStore.setShootMode('fire', { abilityActive: false, abilityLabel: null })
            hudStore.setContextAction(null)
            break
          }
          const healAmount = 35
          const newHealth = Math.min(100, currentHealth + healAmount)
          playerStore.updateTelemetry({ health: newHealth })
          playerStore.updateInventory({
            healItem: {
              ...healItem,
              quantity: Math.max(0, healItem.quantity - 1),
            },
          })
          this.cameras.main.flash(150, 57, 255, 140, false)
          hudStore.pushSmartMessage(`恢复生命 +${Math.round(newHealth - currentHealth)}`)
          hudStore.setShootMode('fire', { abilityActive: false, abilityLabel: null })
          hudStore.setContextAction(null)
          break
        }
        if (shootMode === 'throw') {
          const throwable = playerStore.inventory.throwable
          if (!throwable.id || throwable.quantity <= 0) {
            hudStore.pushSmartMessage('投掷物已耗尽')
            hudStore.setShootMode('fire', { abilityActive: false, abilityLabel: null })
            hudStore.setContextAction(null)
            break
          }
          const type = throwable.id as ThrowableType
          this.useThrowable(type)
          playerStore.updateInventory({
            throwable: {
              ...throwable,
              quantity: Math.max(0, throwable.quantity - 1),
            },
          })
          hudStore.pushSmartMessage(`${throwable.name || '投掷物'} 已投出`)
          hudStore.setShootMode('fire', { abilityActive: false, abilityLabel: null })
          hudStore.setContextAction(null)
          break
        }
        const fired = this.player.fireOnce(this.aimAssistVector)
        if (!fired) {
          hudStore.pushSmartMessage('武器准备中或正在换弹')
        }
        break
      }
      case 'reload': {
        if (faction !== 'survivor') {
          return
        }
        const reloading = this.player.startReload()
        if (reloading) {
          hudStore.pushSmartMessage('开始换弹')
        }
        break
      }
      case 'shove': {
        if (faction !== 'survivor') {
          return
        }
        const success = this.performShove()
        if (!success) {
          hudStore.pushSmartMessage('推击冷却中')
        }
        break
      }
      default:
        break
    }

    this.syncHudState()
  }

  private performShove(): boolean {
    const now = this.time.now
    if (now - this.lastShoveAt < this.shoveCooldownMs) {
      return false
    }
    this.lastShoveAt = now

    const origin = this.player.center.clone()
    const radius = 140
    const pushForce = 420

    const applyToGroup = (group: Phaser.Physics.Arcade.Group) => {
      group.children.each((child) => {
        const enemy = child as Infected
        if (!enemy.active) {
          return false
        }
        const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, origin.x, origin.y)
        if (distance > radius) {
          return false
        }
        const body = enemy.body as Phaser.Physics.Arcade.Body | undefined
        if (!body) {
          return false
        }
        const direction = new Phaser.Math.Vector2(enemy.x - origin.x, enemy.y - origin.y)
        if (direction.lengthSq() === 0) {
          direction.set(Phaser.Math.FloatBetween(-0.5, 0.5), Phaser.Math.FloatBetween(-0.5, 0.5))
        }
        direction.normalize().scale(pushForce)
        body.setVelocity(direction.x, direction.y)
        enemy.setTint(0xffffff)
        this.time.delayedCall(120, () => enemy.clearTint())
        return false
      })
    }

    applyToGroup(this.enemySpawner.enemies)
    applyToGroup(this.specialDirector.group)

    this.cameras.main.shake(120, 0.007)

    const hudStore = useHudStore.getState()
    hudStore.pushSmartMessage('推击击退周围目标')
    hudStore.setCombatState({
      shoveCooldownMs: this.shoveCooldownMs,
      shoveCooldownRemainingMs: this.shoveCooldownMs,
    })

    return true
  }

  private syncHudState() {
    if (!this.weaponSystem) {
      return
    }

    const hudStore = useHudStore.getState()
    const playerStore = usePlayerStore.getState()
    const reloadInfo = this.weaponSystem.getReloadProgress()
    const activeWeapon = this.weaponSystem.activeWeapon
    const faction = playerStore.faction
    const now = this.time.now
    const shoveRemaining =
      this.lastShoveAt === -Infinity
        ? 0
        : Math.max(0, this.shoveCooldownMs - (now - this.lastShoveAt))

    let shootMode = hudStore.combat.shootMode
    let shootEnabled = true

    const healItem = playerStore.inventory.healItem
    const throwableItem = playerStore.inventory.throwable

    if (shootMode === 'heal-self') {
      const canHeal =
        faction === 'survivor' &&
        Boolean(healItem.id) &&
        healItem.quantity > 0 &&
        playerStore.telemetry.health < 100
      shootEnabled = canHeal
      if (!canHeal) {
        shootMode = 'fire'
        hudStore.setShootMode('fire', { abilityActive: false, abilityLabel: null })
        hudStore.setContextAction(null)
      }
    } else if (shootMode === 'throw') {
      const canThrow =
        faction === 'survivor' &&
        Boolean(throwableItem.id) &&
        throwableItem.quantity > 0
      shootEnabled = canThrow
      if (!canThrow) {
        shootMode = 'fire'
        hudStore.setShootMode('fire', { abilityActive: false, abilityLabel: null })
        hudStore.setContextAction(null)
      }
    }

    if (shootMode === 'fire') {
      shootEnabled =
        faction === 'survivor' &&
        !reloadInfo.isReloading &&
        activeWeapon.ammoInMagazine > 0
    }

    hudStore.setCombatState({
      isReloading: reloadInfo.isReloading,
      reloadDurationMs: reloadInfo.duration,
      reloadElapsedMs: reloadInfo.elapsed,
      shoveCooldownMs: this.shoveCooldownMs,
      shoveCooldownRemainingMs: shoveRemaining,
      shootMode,
      isShootButtonEnabled: shootEnabled,
    })
  }
}
