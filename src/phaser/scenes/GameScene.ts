import Phaser from 'phaser'
import { gameStore, useGameStore } from '../../state/gameStore'
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
import { VirtualButton } from '../input/VirtualButton'
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

type WeaponWheelKey = 'primary' | 'secondary' | 'medkit' | 'stim' | 'throwable'

// 震动反馈函数
const triggerVibration = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

const FALLBACK_SAFE_AREA = { top: 40, right: 60, bottom: 40, left: 60 }

type LayoutContext = {
  width: number
  height: number
  safe: typeof FALLBACK_SAFE_AREA
  safeRect: Phaser.Geom.Rectangle
  usableWidth: number
  usableHeight: number
}

export class GameScene extends Phaser.Scene {
  private player!: Player
  private joysticks!: {
    move: VirtualJoystick
    aim: VirtualJoystick
  }
  private buttons!: {
    shove: VirtualButton
    reload: VirtualButton
  }
  private bulletPool!: BulletPool
  private enemySpawner!: EnemySpawner
  private specialDirector!: SpecialInfectedDirector
  private throwables!: ThrowablesSystem
  private scenarioDirector!: ScenarioDirector
  private weaponSystem!: WeaponSystem
  private statusOverlay?: Phaser.GameObjects.Rectangle
  private abilityHintText?: Phaser.GameObjects.Text
  private weaponWheelButton?: Phaser.GameObjects.Container
  private weaponWheel?: {
    container: Phaser.GameObjects.Container
    background: Phaser.GameObjects.Arc
    segments: Array<{
      key: WeaponWheelKey
      startAngle: number
      endAngle: number
      graphics: Phaser.GameObjects.Graphics
      label: Phaser.GameObjects.Text
    }>
    radius: number
    baseAngle: number
    segmentSpan: number
    activeKey: WeaponWheelKey | null
  }
  private weaponWheelPointerId: number | null = null
  private pendingWeaponWheelSelection: WeaponWheelKey | null = null
  private stimCharges = 2
  private joystickLayout?: ReturnType<typeof this.getJoystickLayout>
  private hazardZones: DamageZone[] = []
  private aimAssistVector = new Phaser.Math.Vector2(1, 0)
  private gamepad?: Phaser.Input.Gamepad.Gamepad
  private hitEmitter?: Phaser.GameObjects.Particles.ParticleEmitter
  private muzzleEmitter?: Phaser.GameObjects.Particles.ParticleEmitter
  private trailEmitter?: Phaser.GameObjects.Particles.ParticleEmitter
  private damageTextGroup?: Phaser.GameObjects.Group
  private unsubscribeApi?: () => void
  private unsubscribeViewport?: () => void
  private hunterPounceCooldownEnd = 0
  private lastShoveAt = -Infinity
  private readonly shoveCooldownMs = 900
  private lastSpecialModeTriggerAt = -Infinity
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
  private playerStatusBar?: {
    container: Phaser.GameObjects.Container
    healthFill: Phaser.GameObjects.Rectangle
    armorFill: Phaser.GameObjects.Rectangle
    armorText: Phaser.GameObjects.Text
    width: number
  }

  constructor() {
    super(SceneKeys.Game)
  }

  create() {
    gameStore.setScene(SceneKeys.Game)
    this.createWorld()
    this.createPlayer()
    this.player.setFaction(usePlayerStore.getState().faction)
    this.createPlayerStatusBar()
    this.createEnemySpawner()
    this.createSpecialDirector()
    this.createThrowables()
    this.createScenarioDirector()
    this.createVirtualControls()
    this.unsubscribeViewport = useGameStore.subscribe((state, prevState) => {
      if (!prevState) {
        return
      }
      const viewport = state.viewport
      const prevViewport = prevState.viewport
      const safeChanged =
        viewport.safeArea.top !== prevViewport.safeArea.top ||
        viewport.safeArea.right !== prevViewport.safeArea.right ||
        viewport.safeArea.bottom !== prevViewport.safeArea.bottom ||
        viewport.safeArea.left !== prevViewport.safeArea.left
      const sizeChanged =
        viewport.width !== prevViewport.width ||
        viewport.height !== prevViewport.height ||
        viewport.displayWidth !== prevViewport.displayWidth ||
        viewport.displayHeight !== prevViewport.displayHeight

      if (safeChanged || sizeChanged) {
        this.handleResize()
      }
    })
    this.createStatusOverlay()
    this.createWeaponWheel()
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
      // 右摇杆移动时自动射击（如果不在特殊模式）
      // 注意：射击频率由 WeaponSystem 内部控制，这里只负责触发
      this.handleAutoShoot()
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
    this.updatePlayerStatusBar()
    this.updateHazardZones(delta)
    this.updateDamageZones(delta)

    this.updateButtonStates()
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

  private createPlayerStatusBar() {
    const width = 140
    const height = 12
    const container = this.add.container(0, 0).setDepth(1004)

    const background = this.add
      .rectangle(0, 0, width + 8, height + 10, 0x041510, 0.68)
      .setOrigin(0.5)
    const border = this.add
      .rectangle(0, 0, width + 8, height + 10)
      .setOrigin(0.5)
      .setStrokeStyle(1.6, 0x22c55e, 0.85)
      .setFillStyle(0, 0)

    const healthFill = this.add
      .rectangle(-width / 2, 0, width, height, 0xef4444, 0.95)
      .setOrigin(0, 0.5)
    const armorFill = this.add
      .rectangle(-width / 2, 0, width, height, 0x94a3b8, 0.6)
      .setOrigin(0, 0.5)
      .setVisible(false)
    const armorText = this.add
      .text(width / 2 + 6, 0, '', {
        fontSize: '12px',
        color: '#cbd5f5',
        fontFamily: 'Inter, sans-serif',
      })
      .setOrigin(0, 0.5)
      .setVisible(false)

    container.add([background, border, healthFill, armorFill, armorText])

    this.playerStatusBar = {
      container,
      healthFill,
      armorFill,
      armorText,
      width,
    }
  }

  private updatePlayerStatusBar() {
    if (!this.playerStatusBar) {
      return
    }

    const { container, healthFill, armorFill, armorText, width } = this.playerStatusBar
    const telemetry = usePlayerStore.getState().telemetry
    const maxHealth = 100
    const maxArmor = 100

    const healthPercent = Phaser.Math.Clamp(telemetry.health / maxHealth, 0, 1)
    healthFill.displayWidth = width * healthPercent
    healthFill.setVisible(healthPercent > 0)

    const armorPercent = Phaser.Math.Clamp(telemetry.armor / maxArmor, 0, 1)
    armorFill.displayWidth = width * armorPercent
    armorFill.setVisible(armorPercent > 0)

    const armorStacks = telemetry.armor > 0 ? Math.max(1, Math.round(telemetry.armor / 25)) : 0
    armorText.setText(armorStacks > 0 ? `x${armorStacks}` : '')
    armorText.setVisible(armorStacks > 0)

    const offsetY = (this.player.sprite.displayHeight ?? 64) * 0.6 + 28
    container.setPosition(this.player.sprite.x, this.player.sprite.y - offsetY)
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
    this.joystickLayout = layout
    this.debugLayout(layout) // 调试布局信息
    this.rebuildJoysticks(layout)
    this.rebuildButtons(layout)
    this.showOperationHints() // 显示操作提示
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
  }

  private showOperationHints() {
    // 为新玩家显示操作提示
    const hints = [
      '🎮 移动摇杆控制角色移动',
      '🎯 瞄准摇杆控制射击方向（自动射击）',
      '🟠 橙色按钮为推击（近战）',
      '🔵 蓝色按钮为换弹'
    ]

    // 逐条显示提示信息
    hints.forEach((hint, index) => {
      this.time.delayedCall(2000 + index * 1500, () => {
        const hudStore = useHudStore.getState()
        hudStore.pushSmartMessage(hint)
      })
    })
  }

  private getLayoutContext(): LayoutContext {
    const viewport = gameStore.getState().viewport
    const width = viewport?.width ?? this.scale.width
    const height = viewport?.height ?? this.scale.height
    const safe = viewport?.safeArea ?? FALLBACK_SAFE_AREA
    const safeRect = new Phaser.Geom.Rectangle(
      safe.left,
      safe.top,
      Math.max(width - safe.left - safe.right, 1),
      Math.max(height - safe.top - safe.bottom, 1),
    )

    return {
      width,
      height,
      safe,
      safeRect,
      usableWidth: safeRect.width,
      usableHeight: safeRect.height,
    }
  }

  private debugLayout(layout: ReturnType<typeof this.getJoystickLayout>) {
    const context = this.getLayoutContext()
    console.log('=== 布局调试信息 ===')
    console.log(
      `画布尺寸: ${context.width} x ${context.height}（SafeArea: L${context.safe.left}, R${context.safe.right}, T${context.safe.top}, B${context.safe.bottom})`,
    )

    console.log('移动摇杆:')
    console.log(`  位置: (${layout.move.x}, ${layout.move.y})`)
    console.log(`  触控区域: [${layout.move.touchArea.x}, ${layout.move.touchArea.y}, ${layout.move.touchArea.width}, ${layout.move.touchArea.height}]`)

    console.log('瞄准摇杆:')
    console.log(`  位置: (${layout.aim.x}, ${layout.aim.y})`)
    console.log(`  触控区域: [${layout.aim.touchArea.x}, ${layout.aim.touchArea.y}, ${layout.aim.touchArea.width}, ${layout.aim.touchArea.height}]`)

    console.log('战斗按钮:')
    Object.entries(layout.buttons).forEach(([name, button]) => {
      console.log(`  ${name}: 位置(${button.x}, ${button.y}), 半径${button.radius}`)
    })

    // 检查重叠
    const moveArea = layout.move.touchArea
    const aimArea = layout.aim.touchArea
    const buttonArea = new Phaser.Geom.Rectangle(
      context.safeRect.x + context.safeRect.width * 0.55,
      context.safeRect.y + context.safeRect.height * 0.5,
      context.safeRect.width * 0.45,
      context.safeRect.height * 0.5,
    )

    const areasOverlap = (a: Phaser.Geom.Rectangle, b: Phaser.Geom.Rectangle) =>
      !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)

    console.log('区域重叠检查:')
    console.log(`  移动摇杆 vs 瞄准摇杆: ${areasOverlap(moveArea, aimArea) ? '重叠!' : '正常'}`)
    console.log(`  移动摇杆 vs 按钮区域: ${areasOverlap(moveArea, buttonArea) ? '重叠!' : '正常'}`)
    console.log(`  瞄准摇杆 vs 按钮区域: ${areasOverlap(aimArea, buttonArea) ? '重叠!' : '正常'}`)
    console.log('==================')
  }

  private getJoystickLayout() {
    const { width, height, safe, safeRect, usableWidth, usableHeight } =
      this.getLayoutContext()

    const shorterSide = Math.min(usableWidth, usableHeight)

    const joystickRadius = Phaser.Math.Clamp(
      Math.floor(shorterSide * 0.072),
      52,
      68,
    )
    const shoveRadius = Phaser.Math.Clamp(
      Math.floor(shorterSide * 0.065),
      35,
      42,
    )
    const reloadRadius = Phaser.Math.Clamp(
      Math.floor(shorterSide * 0.055),
      28,
      35,
    )

    const edgePadding = Math.max(16, Math.floor(shorterSide * 0.02))
    const buttonSpacing = Math.max(
      24,
      Math.floor((shoveRadius + reloadRadius) * 0.4),
    )

    const moveAreaWidth = Math.min(
      usableWidth,
      Math.max(usableWidth * 0.48, joystickRadius * 2 + edgePadding * 2),
    )
    const moveAreaHeight = Math.min(
      usableHeight,
      Math.max(usableHeight * 0.6, joystickRadius * 2 + edgePadding * 3),
    )
    const aimAreaWidth = Math.min(
      usableWidth,
      Math.max(usableWidth * 0.48, joystickRadius * 2 + edgePadding * 2),
    )
    const aimAreaHeight = moveAreaHeight

    const moveArea = new Phaser.Geom.Rectangle(
      safeRect.x,
      height - safe.bottom - moveAreaHeight,
      moveAreaWidth,
      moveAreaHeight,
    )

    const aimArea = new Phaser.Geom.Rectangle(
      width - safe.right - aimAreaWidth,
      height - safe.bottom - aimAreaHeight,
      aimAreaWidth,
      aimAreaHeight,
    )

    const moveX = safe.left + edgePadding + joystickRadius
    const moveY = height - safe.bottom - edgePadding - joystickRadius
    let aimX = width - safe.right - edgePadding - joystickRadius
    const aimY = moveY

    const maxButtonRadius = Math.max(shoveRadius, reloadRadius)
    const requiredRightExtent = joystickRadius + buttonSpacing + maxButtonRadius
    const maxAimX =
      width - safe.right - edgePadding - requiredRightExtent
    const minAimX = Math.max(
      safe.left + usableWidth * 0.55,
      safe.left + edgePadding + joystickRadius,
    )
    aimX = Phaser.Math.Clamp(aimX, minAimX, Math.max(minAimX, maxAimX))

    let shoveButtonX = aimX + joystickRadius + shoveRadius + buttonSpacing
    let shoveButtonY = aimY - joystickRadius - shoveRadius
    let reloadButtonX = aimX + joystickRadius + reloadRadius + buttonSpacing
    const reloadButtonY = aimY

    shoveButtonX = Math.min(
      width - safe.right - edgePadding - shoveRadius,
      shoveButtonX,
    )
    reloadButtonX = Math.min(
      width - safe.right - edgePadding - reloadRadius,
      reloadButtonX,
    )
    shoveButtonY = Math.max(
      safe.top + edgePadding + shoveRadius,
      shoveButtonY,
    )

    const moveSensitivityCurve = (value: number) => {
      const clamped = Phaser.Math.Clamp(value, 0, 1)
      return Math.pow(clamped, 1.08)
    }

    const aimSensitivityCurve = (value: number) => {
      const clamped = Phaser.Math.Clamp(value, 0, 1)
      if (clamped < 0.6) {
        return Math.pow(clamped / 0.6, 0.85) * 0.6
      }
      const highPortion = (clamped - 0.6) / 0.4
      return 0.6 + Math.pow(highPortion, 1.2) * 0.4
    }

    return {
      move: {
        x: moveX,
        y: moveY,
        radius: joystickRadius,
        thumbRadius: Math.floor(joystickRadius * 0.52),
        touchArea: moveArea,
        fixed: true,
        deadZone: 0.09,
        sensitivityCurve: moveSensitivityCurve,
        touchAreaPadding: Math.max(joystickRadius * 1.15, 48),
        visualRangeFactor: 1,
      },
      aim: {
        x: aimX,
        y: aimY,
        radius: joystickRadius,
        thumbRadius: Math.floor(joystickRadius * 0.56),
        touchArea: aimArea,
        fixed: true,
        deadZone: 0.08,
        sensitivityCurve: aimSensitivityCurve,
        touchAreaPadding: Math.max(joystickRadius * 1.3, 60),
        dynamicRecenter: true,
        recenterRadius: joystickRadius * 0.45,
        recenterLerp: 0.35,
        visualRangeFactor: 0.88,
      },
      buttons: {
        shove: {
          x: shoveButtonX,
          y: shoveButtonY,
          radius: shoveRadius,
        },
        reload: {
          x: reloadButtonX,
          y: reloadButtonY,
          radius: reloadRadius,
        },
      },
    }
  }

  private createStatusOverlay() {
    const context = this.getLayoutContext()
    this.statusOverlay = this.add
      .rectangle(0, 0, context.width, context.height, 0xffffff, 0)
      .setScrollFactor(0)
      .setOrigin(0)
      .setDepth(800)
      .setVisible(false)

    this.abilityHintText = this.add
      .text(
        context.width / 2,
        context.height - context.safe.bottom - 80,
        '',
        {
        fontSize: '20px',
        fontFamily: 'Inter, sans-serif',
        color: '#bfdbfe',
        align: 'center',
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(805)
      .setAlpha(0)

    this.layoutOverlay()
  }

  private createWeaponWheel() {
    const context = this.getLayoutContext()
    const shorterSide = Math.min(context.usableWidth, context.usableHeight)
    const radius = Phaser.Math.Clamp(Math.floor(shorterSide * 0.18), 100, 150)
    const buttonRadius = 34
    const button = this.add.container(0, 0).setScrollFactor(0).setDepth(1100)
    const buttonBackground = this.add
      .circle(0, 0, buttonRadius, 0x0f172a, 0.82)
      .setStrokeStyle(2, 0x60a5fa, 0.9)
    const buttonIcon = this.add
      .text(0, 0, '🎯', {
        fontSize: '22px',
        color: '#bfdbfe',
        fontFamily: 'Inter, sans-serif',
      })
      .setOrigin(0.5)
    button.add([buttonBackground, buttonIcon])
    button.setSize(buttonRadius * 2, buttonRadius * 2)
    button.setInteractive(new Phaser.Geom.Circle(0, 0, buttonRadius), Phaser.Geom.Circle.Contains)
    button.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.openWeaponWheel(pointer)
    })

    const container = this.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(1105)
      .setVisible(false)
      .setAlpha(0)

    const background = this.add
      .circle(0, 0, radius, 0x03120c, 0.88)
      .setStrokeStyle(2, 0x22c55e, 0.65)

    container.add(background)

    const segmentDefs: Array<{ key: WeaponWheelKey; label: string }> = [
      { key: 'primary', label: '主武器' },
      { key: 'secondary', label: '副武器' },
      { key: 'medkit', label: '医疗包' },
      { key: 'stim', label: '止痛 ×2' },
      { key: 'throwable', label: '投掷物' },
    ]

    const baseAngle = -Math.PI / 2
    const segmentSpan = Phaser.Math.PI2 / segmentDefs.length
    const segments: Array<{
      key: WeaponWheelKey
      startAngle: number
      endAngle: number
      graphics: Phaser.GameObjects.Graphics
      label: Phaser.GameObjects.Text
    }> = []

    segmentDefs.forEach((def, index) => {
      const startAngle = baseAngle + index * segmentSpan
      const endAngle = startAngle + segmentSpan
      const graphics = this.add.graphics()
      graphics.setScrollFactor(0)
      this.drawWeaponWheelSegment(graphics, radius, startAngle, endAngle, 0x0f172a, 0.55)
      const midAngle = startAngle + segmentSpan / 2
      const labelRadius = radius * 0.62
      const label = this.add
        .text(
          Math.cos(midAngle) * labelRadius,
          Math.sin(midAngle) * labelRadius,
          def.label,
          {
            fontSize: '15px',
            color: '#cbd5f5',
            fontFamily: 'Inter, sans-serif',
          },
        )
        .setOrigin(0.5)
        .setScrollFactor(0)
      container.add(graphics)
      container.add(label)
      segments.push({
        key: def.key,
        startAngle,
        endAngle,
        graphics,
        label,
      })
    })

    this.weaponWheelButton = button
    this.weaponWheel = {
      container,
      background,
      segments,
      radius,
      baseAngle,
      segmentSpan,
      activeKey: null,
    }

    this.layoutWeaponWheel()
  }

  private layoutWeaponWheel() {
    if (!this.weaponWheel) {
      return
    }
    const context = this.getLayoutContext()
    const shorterSide = Math.min(context.usableWidth, context.usableHeight)
    const targetRadius = Phaser.Math.Clamp(Math.floor(shorterSide * 0.18), 96, 150)
    this.weaponWheel.radius = targetRadius
    this.weaponWheel.background.setRadius(targetRadius)

    const layout = this.joystickLayout ?? this.getJoystickLayout()
    const aimConfig = layout?.aim ?? {
      x: context.width - context.safe.right - targetRadius * 1.2,
      y: context.height - context.safe.bottom - targetRadius * 1.2,
      radius: targetRadius * 0.45,
    }

    const aimRadius = aimConfig.radius ?? 0
    const offsetDistance = aimRadius + targetRadius * 0.9
    const offsetAngle = -Math.PI * 0.75
    let posX = aimConfig.x + Math.cos(offsetAngle) * offsetDistance
    let posY = aimConfig.y + Math.sin(offsetAngle) * offsetDistance
    const padding = targetRadius + 18
    posX = Phaser.Math.Clamp(
      posX,
      context.safe.left + padding,
      context.width - context.safe.right - padding,
    )
    posY = Phaser.Math.Clamp(
      posY,
      context.safe.top + padding,
      context.height - context.safe.bottom - padding,
    )

    this.weaponWheel.container.setPosition(posX, posY)
    this.weaponWheelButton?.setPosition(posX, posY)

    const labelRadius = targetRadius * 0.62
    this.weaponWheel.segments.forEach((segment) => {
      const isActive = segment.key === this.weaponWheel!.activeKey
      this.drawWeaponWheelSegment(
        segment.graphics,
        targetRadius,
        segment.startAngle,
        segment.endAngle,
        isActive ? 0x1d4ed8 : 0x0f172a,
        isActive ? 0.85 : 0.55,
      )
      const midAngle = segment.startAngle + this.weaponWheel!.segmentSpan / 2
      segment.label.setPosition(
        Math.cos(midAngle) * labelRadius,
        Math.sin(midAngle) * labelRadius,
      )
      if (segment.key === 'stim') {
        segment.label.setText(`止痛 ×${this.stimCharges}`)
      }
      segment.label.setStyle({
        fontSize: isActive ? '18px' : '15px',
        color: isActive ? '#f8fafc' : '#cbd5f5',
      })
      segment.label.setAlpha(isActive ? 1 : 0.85)
      segment.label.setScale(isActive ? 1.05 : 1)
    })
  }

  private drawWeaponWheelSegment(
    graphics: Phaser.GameObjects.Graphics,
    radius: number,
    startAngle: number,
    endAngle: number,
    color: number,
    alpha: number,
  ) {
    graphics.clear()
    graphics.fillStyle(color, alpha)
    graphics.slice(0, 0, radius, startAngle, endAngle, false)
    graphics.fillPath()
    graphics.lineStyle(2, 0x1f2937, 0.45)
    graphics.slice(0, 0, radius, startAngle, endAngle, false)
    graphics.strokePath()
  }

  private openWeaponWheel(pointer: Phaser.Input.Pointer) {
    if (!this.weaponWheel || this.weaponWheelPointerId !== null) {
      return
    }
    this.layoutWeaponWheel()
    this.weaponWheelPointerId = pointer.id
    this.weaponWheel.container.setVisible(true)
    this.weaponWheel.container.setScale(0.92)
    this.weaponWheel.container.setAlpha(0)
    this.weaponWheelButton?.setScale(0.94)
    this.setWeaponWheelActiveKey(null)
    this.tweens.add({
      targets: this.weaponWheel.container,
      scale: 1,
      alpha: 1,
      duration: 140,
      ease: Phaser.Math.Easing.Cubic.Out,
    })
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onWeaponWheelPointerMove, this)
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onWeaponWheelPointerUp, this)
    this.updateWeaponWheelSelection(pointer)
  }

  private closeWeaponWheel(confirmSelection: boolean) {
    if (!this.weaponWheel) {
      return
    }
    this.pendingWeaponWheelSelection = confirmSelection
      ? this.weaponWheel.activeKey
      : null
    this.weaponWheelPointerId = null
    this.weaponWheelButton?.setScale(1)
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onWeaponWheelPointerMove, this)
    this.input.off(Phaser.Input.Events.POINTER_UP, this.onWeaponWheelPointerUp, this)
    this.processPendingWeaponWheelSelection()
    this.tweens.add({
      targets: this.weaponWheel.container,
      scale: 0.92,
      alpha: 0,
      duration: 120,
      ease: Phaser.Math.Easing.Cubic.In,
      onComplete: () => {
        this.weaponWheel?.container.setVisible(false)
        this.weaponWheel?.container.setScale(1)
        if (!this.pendingWeaponWheelSelection) {
          this.setWeaponWheelActiveKey(null)
        }
      },
    })
  }

  private onWeaponWheelPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.weaponWheelPointerId !== pointer.id) {
      return
    }
    this.updateWeaponWheelSelection(pointer)
  }

  private onWeaponWheelPointerUp(pointer: Phaser.Input.Pointer) {
    if (this.weaponWheelPointerId !== pointer.id) {
      return
    }
    this.updateWeaponWheelSelection(pointer)
    this.closeWeaponWheel(true)
  }

  private updateWeaponWheelSelection(pointer: Phaser.Input.Pointer) {
    if (!this.weaponWheel) {
      return
    }
    const { container, radius, baseAngle, segmentSpan, segments } = this.weaponWheel
    const dx = pointer.x - container.x
    const dy = pointer.y - container.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance < radius * 0.32) {
      this.setWeaponWheelActiveKey(null)
      return
    }

    let angle = Math.atan2(dy, dx) - baseAngle
    angle = Phaser.Math.Angle.Wrap(angle)
    if (angle < 0) {
      angle += Phaser.Math.PI2
    }

    const index = Phaser.Math.Clamp(
      Math.floor(angle / segmentSpan),
      0,
      segments.length - 1,
    )
    const key = segments[index]?.key ?? null
    this.setWeaponWheelActiveKey(key ?? null)
  }

  private setWeaponWheelActiveKey(key: WeaponWheelKey | null) {
    if (!this.weaponWheel) {
      return
    }
    this.weaponWheel.activeKey = key
    const labelRadius = this.weaponWheel.radius * 0.62
    this.weaponWheel.segments.forEach((segment) => {
      const isActive = segment.key === key
      this.drawWeaponWheelSegment(
        segment.graphics,
        this.weaponWheel!.radius,
        segment.startAngle,
        segment.endAngle,
        isActive ? 0x1d4ed8 : 0x0f172a,
        isActive ? 0.85 : 0.55,
      )
      const midAngle = segment.startAngle + this.weaponWheel!.segmentSpan / 2
      segment.label.setPosition(
        Math.cos(midAngle) * labelRadius,
        Math.sin(midAngle) * labelRadius,
      )
      segment.label.setStyle({
        fontSize: isActive ? '18px' : '15px',
        color: isActive ? '#f8fafc' : '#cbd5f5',
      })
      segment.label.setAlpha(isActive ? 1 : 0.85)
      segment.label.setScale(isActive ? 1.05 : 1)
    })
  }

  private processPendingWeaponWheelSelection() {
    const selection = this.pendingWeaponWheelSelection
    if (!selection) {
      return
    }
    this.pendingWeaponWheelSelection = null

    switch (selection) {
      case 'primary': {
        const currentSlot = this.weaponSystem.weaponSummary.slot
        if (currentSlot !== 'primary') {
          this.switchWeapon('primary')
          triggerVibration(18)
          useHudStore.getState().pushSmartMessage('切换至主武器')
        } else {
          useHudStore.getState().pushSmartMessage('已在使用主武器')
        }
        break
      }
      case 'secondary': {
        const currentSlot = this.weaponSystem.weaponSummary.slot
        if (currentSlot !== 'secondary') {
          this.switchWeapon('secondary')
          triggerVibration(18)
          useHudStore.getState().pushSmartMessage('切换至副武器')
        } else {
          useHudStore.getState().pushSmartMessage('已在使用副武器')
        }
        break
      }
      case 'medkit': {
        this.toggleMedkitMode()
        break
      }
      case 'stim': {
        this.useStimPack()
        break
      }
      case 'throwable': {
        this.toggleThrowableMode()
        break
      }
      default:
        break
    }
  }

  private toggleMedkitMode() {
    const hudStore = useHudStore.getState()
    const playerStore = usePlayerStore.getState()
    const nextMode = hudStore.combat.shootMode === 'heal-self' ? 'fire' : 'heal-self'

    if (nextMode === 'heal-self') {
      const healItem = playerStore.inventory.healItem
      if (!healItem.id || healItem.quantity <= 0) {
        hudStore.pushSmartMessage('没有可用的医疗物品')
        triggerVibration([18, 36, 18])
        return
      }
      hudStore.setShootMode('heal-self', {
        abilityActive: true,
        abilityLabel: '治疗',
        isShootButtonEnabled: true,
      })
      hudStore.setContextAction({
        id: 'mode-heal-self',
        label: '按下射击键自我治疗',
        type: 'use-self',
        description: '恢复 35 点生命并进入短暂无敌',
        hint: '松开轮盘返回射击模式',
        showProgressRing: false,
      })
      hudStore.pushSmartMessage('医疗模式已激活')
      triggerVibration([18, 12, 18])
    } else {
      this.resetShootMode()
      hudStore.pushSmartMessage('恢复射击模式')
      triggerVibration(18)
    }
  }

  private toggleThrowableMode() {
    const hudStore = useHudStore.getState()
    const playerStore = usePlayerStore.getState()
    const nextMode = hudStore.combat.shootMode === 'throw' ? 'fire' : 'throw'

    if (nextMode === 'throw') {
      const throwable = playerStore.inventory.throwable
      if (!throwable.id || throwable.quantity <= 0) {
        hudStore.pushSmartMessage('投掷物已耗尽')
        triggerVibration([18, 36, 18])
        return
      }
      hudStore.setShootMode('throw', {
        abilityActive: true,
        abilityLabel: throwable.name || '投掷',
        isShootButtonEnabled: true,
      })
      hudStore.setContextAction({
        id: 'mode-throw',
        label: '按下射击键投掷',
        type: 'throw',
        description: '将当前投掷物抛向瞄准方向',
        hint: '松开轮盘返回射击模式',
        showProgressRing: false,
      })
      hudStore.pushSmartMessage('投掷瞄准模式')
      triggerVibration([22, 14, 22])
    } else {
      this.resetShootMode()
      hudStore.pushSmartMessage('恢复射击模式')
      triggerVibration(18)
    }
  }

  private useStimPack() {
    const hudStore = useHudStore.getState()
    const playerStore = usePlayerStore.getState()
    if (this.stimCharges <= 0) {
      hudStore.pushSmartMessage('止痛药已耗尽')
      triggerVibration([10, 28, 10])
      return
    }
    this.stimCharges -= 1
    const currentHealth = playerStore.telemetry.health
    const newHealth = Math.min(100, currentHealth + 20)
    playerStore.updateTelemetry({ health: newHealth })
    hudStore.pushSmartMessage(`使用止痛药，恢复 20 点生命（剩余 ${this.stimCharges}）`)
    triggerVibration([14, 10, 14])
    this.layoutWeaponWheel()
  }

  private resetShootMode() {
    const hudStore = useHudStore.getState()
    hudStore.setShootMode('fire', {
      abilityActive: false,
      abilityLabel: null,
      isShootButtonEnabled: true,
    })
    hudStore.setContextAction(null)
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
    const layout = this.getJoystickLayout()
    this.joystickLayout = layout
    this.rebuildJoysticks(layout)
    this.rebuildButtons(layout)
    this.layoutOverlay()
    this.layoutWeaponWheel()
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

  private rebuildButtons(layout: ReturnType<typeof this.getJoystickLayout>) {
    if (this.buttons) {
      this.buttons.shove.destroy()
      this.buttons.reload.destroy()
    }

    const context = this.getLayoutContext()

    // 战斗按钮区域 (右侧上半，包含按钮区域)
    const buttonArea = new Phaser.Geom.Rectangle(
      context.safeRect.x + context.safeRect.width * 0.55, // 从可用区域 55% 开始
      context.safeRect.y, // 顶部
      context.safeRect.width * 0.45, // 可用区域 45% 宽度
      context.safeRect.height * 0.5, // 50%高度（包含按钮区域）
    )

    // 为每个按钮创建独立的触控区域，确保不超出按钮区域边界
    const createButtonTouchArea = (x: number, y: number, radius: number) => {
      const touchPadding = 15
      let touchX = x - radius - touchPadding
      let touchY = y - radius - touchPadding
      let touchWidth = (radius + touchPadding) * 2
      let touchHeight = (radius + touchPadding) * 2

      // 确保触控区域不超出按钮区域边界
      touchX = Math.max(buttonArea.x, touchX)
      touchY = Math.max(buttonArea.y, touchY)
      touchWidth = Math.min(buttonArea.x + buttonArea.width - touchX, touchWidth)
      touchHeight = Math.min(buttonArea.y + buttonArea.height - touchY, touchHeight)

      return new Phaser.Geom.Rectangle(touchX, touchY, touchWidth, touchHeight)
    }

    // 创建两个战斗按钮：推击、换弹，使用不同的视觉样式突出重要性
    this.buttons = {
      shove: new VirtualButton(this, {
        x: layout.buttons.shove.x,
        y: layout.buttons.shove.y,
        radius: layout.buttons.shove.radius,
        label: '推击',
        touchArea: createButtonTouchArea(
          layout.buttons.shove.x,
          layout.buttons.shove.y,
          layout.buttons.shove.radius
        ),
        color: 0xea580c, // 橙色 - 高频紧急操作
        borderColor: 0xf97316, // 橙色边框
        onPress: () => this.handleShovePress(),
      }),
      reload: new VirtualButton(this, {
        x: layout.buttons.reload.x,
        y: layout.buttons.reload.y,
        radius: layout.buttons.reload.radius,
        label: '换弹',
        touchArea: createButtonTouchArea(
          layout.buttons.reload.x,
          layout.buttons.reload.y,
          layout.buttons.reload.radius
        ),
        color: 0x1e293b, // 深蓝灰 - 辅助操作
        borderColor: 0x93c5fd, // 信息蓝边框
        onPress: () => this.handleReloadPress(),
      }),
    }
  }

  private layoutOverlay() {
    const context = this.getLayoutContext()
    this.statusOverlay?.setDisplaySize(context.width, context.height)
    this.abilityHintText?.setPosition(
      context.width / 2,
      context.height - context.safe.bottom - 80,
    )
  }

  private handleAutoShoot() {
    const faction = usePlayerStore.getState().faction
    const hudStore = useHudStore.getState()
    const playerStore = usePlayerStore.getState()
    const shootMode = hudStore.combat.shootMode

    if (faction !== 'survivor') {
      return
    }

    // 特殊模式处理（医疗和投掷只在第一次移动时触发一次）
    if (shootMode === 'heal-self') {
      const now = this.time.now
      // 防止重复触发，至少间隔 500ms
      if (now - this.lastSpecialModeTriggerAt < 500) {
        return
      }
      this.lastSpecialModeTriggerAt = now

      // 医疗模式：右摇杆移动时触发自我治疗
      const healItem = playerStore.inventory.healItem
      const currentHealth = playerStore.telemetry.health
      if (healItem.id && healItem.quantity > 0 && currentHealth < 100) {
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
      }
      return
    }

    if (shootMode === 'throw') {
      const now = this.time.now
      // 防止重复触发，至少间隔 500ms
      if (now - this.lastSpecialModeTriggerAt < 500) {
        return
      }
      this.lastSpecialModeTriggerAt = now

      // 投掷模式：右摇杆移动时触发投掷
      const throwable = playerStore.inventory.throwable
      if (throwable.id && throwable.quantity > 0) {
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
      }
      return
    }

    // 正常射击模式：右摇杆移动时自动射击
    if (hudStore.combat.isShootButtonEnabled) {
      this.player.fireOnce(this.aimAssistVector)
    }
  }


  private handleShovePress() {
    const faction = usePlayerStore.getState().faction
    const hudStore = useHudStore.getState()

    if (faction !== 'survivor') {
      return
    }

    const success = this.performShove()
    if (success) {
      // 成功推击：强烈震动，强调力量感
      triggerVibration([50, 20, 30])
    } else {
      // 冷却中：轻微震动提示
      triggerVibration([10, 5, 10])
      hudStore.pushSmartMessage('推击冷却中')
    }
  }

  private handleReloadPress() {
    const faction = usePlayerStore.getState().faction
    const hudStore = useHudStore.getState()

    if (faction !== 'survivor') {
      return
    }

    const reloading = this.player.startReload()
    if (reloading) {
      // 开始换弹：中等强度震动
      triggerVibration([20, 15, 20])
      hudStore.pushSmartMessage('开始换弹')
    } else {
      // 无法换弹：轻微提示震动
      triggerVibration([8, 4, 8])
    }
  }

  private updateButtonStates() {
    if (!this.buttons) return

    const faction = usePlayerStore.getState().faction
    const hudStore = useHudStore.getState()
    const combat = hudStore.combat

    // 更新推击按钮（冷却进度）- 高频紧急操作，橙色主题
    const shoveCooldownPercent = combat.shoveCooldownMs && combat.shoveCooldownRemainingMs > 0
      ? 1 - combat.shoveCooldownRemainingMs / combat.shoveCooldownMs
      : 0
    const shoveEnabled = faction === 'survivor' && combat.shoveCooldownRemainingMs <= 0

    this.buttons.shove.setProgress(shoveCooldownPercent)
    this.buttons.shove.setEnabled(shoveEnabled)

    // 根据推击状态调整颜色
    if (!shoveEnabled) {
      // 冷却中：深橙色
      this.buttons.shove.setColor(0x9a3412, 0xc2410c)
    } else {
      // 可用：亮橙色
      this.buttons.shove.setColor(0xea580c, 0xf97316)
    }

    // 更新换弹按钮（换弹进度）- 辅助操作，蓝色主题
    if (combat.isReloading && combat.reloadDurationMs) {
      const reloadPercent = combat.reloadElapsedMs / combat.reloadDurationMs
      this.buttons.reload.setProgress(reloadPercent)
      // 换弹中：亮蓝色进度环
      this.buttons.reload.setColor(0x1e293b, 0x3b82f6)
    } else {
      this.buttons.reload.setProgress(0)
      // 默认状态：深蓝灰
      this.buttons.reload.setColor(0x1e293b, 0x93c5fd)
    }
    this.buttons.reload.setEnabled(faction === 'survivor' && !combat.isReloading)
  }

  private onShutdown() {
    if (this.unsubscribeViewport) {
      this.unsubscribeViewport()
      this.unsubscribeViewport = undefined
    }
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    window.removeEventListener('hud:action', this.onHudAction)
    if (this.joysticks) {
      this.joysticks.move.destroy()
      this.joysticks.aim.destroy()
    }
    if (this.buttons) {
      this.buttons.shove.destroy()
      this.buttons.reload.destroy()
    }
    if (this.weaponWheelButton) {
      this.weaponWheelButton.destroy(true)
      this.weaponWheelButton = undefined
    }
    if (this.weaponWheel) {
      this.weaponWheel.container.destroy(true)
      this.weaponWheel = undefined
    }
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onWeaponWheelPointerMove, this)
    this.input.off(Phaser.Input.Events.POINTER_UP, this.onWeaponWheelPointerUp, this)
    if (this.playerStatusBar) {
      this.playerStatusBar.container.destroy()
      this.playerStatusBar = undefined
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

    switch (detail.action) {
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
