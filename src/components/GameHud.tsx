import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './GameHud.css'
import { useGameStore } from '../state/gameStore'
import {
  type InventoryItemState,
  type PlayerInventoryState,
  usePlayerStore,
} from '../state/playerStore'
import { useHudStore } from '../state/hudStore'

const triggerVibration = (pattern: number | number[]) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

const formatSeconds = (ms: number) => {
  if (ms <= 0) return '0.0s'
  return `${(ms / 1000).toFixed(1)}s`
}

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value))

const getHealthClassName = (percent: number) => {
  if (percent >= 0.5) return 'ok'
  if (percent >= 0.25) return 'warning'
  return 'danger'
}

interface GameHudProps {
  className?: string
}

interface HealthBarProps {
  label: string
  value: number
  max: number
  showValue?: boolean
}

const HealthBar = ({ label, value, max, showValue = true }: HealthBarProps) => {
  const percent = clamp(max === 0 ? 0 : value / max)
  const className = `hud-health-bar ${getHealthClassName(percent)}`

  return (
    <div className={className}>
      <div className="hud-health-bar__label">
        {label}
        {showValue && <span className="hud-health-bar__value">{Math.round(value)}</span>}
      </div>
      <div className="hud-health-bar__track">
        <div
          className="hud-health-bar__fill"
          style={{ width: `${percent * 100}%` }}
        />
      </div>
    </div>
  )
}

const AmmoReadout = () => {
  const weaponSummary = usePlayerStore((state) => state.weaponSummary)
  const percent = weaponSummary.magazineSize
    ? clamp(weaponSummary.ammoInMagazine / weaponSummary.magazineSize)
    : 0

  return (
    <div className="hud-ammo">
      <div className="hud-ammo__name">{weaponSummary.displayName}</div>
      <div className="hud-ammo__count">
        <span className="hud-ammo__current">{weaponSummary.ammoInMagazine}</span>
        <span className="hud-ammo__divider">/</span>
        <span className="hud-ammo__max">{weaponSummary.magazineSize}</span>
      </div>
      <div className="hud-ammo__track">
        <div
          className="hud-ammo__fill"
          style={{ width: `${percent * 100}%` }}
        />
      </div>
    </div>
  )
}

const TeammateStatusList = () => {
  const teammates = useHudStore((state) => state.teammates)

  return (
    <div className="hud-teammates">
      {teammates.map((teammate) => {
        const percent = teammate.maxHealth
          ? clamp(teammate.health / teammate.maxHealth)
          : 0
        const statusClass = `hud-teammate hud-teammate--${teammate.status}`
        const highlightClass = teammate.isHighlighted
          ? 'hud-teammate--highlight'
          : ''

        return (
          <div key={teammate.id} className={`${statusClass} ${highlightClass}`}>
            <div className="hud-teammate__avatar" />
            <div className="hud-teammate__info">
              <div className="hud-teammate__name">{teammate.name}</div>
              <div className="hud-teammate__health-track">
                <div
                  className="hud-teammate__health-fill"
                  style={{ width: `${percent * 100}%` }}
                />
              </div>
              {teammate.specialHint && (
                <div className="hud-teammate__hint">{teammate.specialHint}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface CombatClusterProps {
  onAction: (action: 'shoot' | 'shove' | 'reload') => void
}

const CombatCluster = ({ onAction }: CombatClusterProps) => {
  const combat = useHudStore((state) => state.combat)
  const shootLabel = useMemo(() => {
    switch (combat.shootMode) {
      case 'heal-self':
        return '对自己使用'
      case 'throw':
        return '投掷'
      default:
        return '射击'
    }
  }, [combat.shootMode])

  const shovePercent = combat.shoveCooldownMs
    ? clamp(1 - combat.shoveCooldownRemainingMs / combat.shoveCooldownMs)
    : 1

  const reloadPercent = combat.reloadDurationMs
    ? clamp(combat.reloadElapsedMs / combat.reloadDurationMs)
    : 0

  return (
    <div className="hud-combat">
      <button
        className={`hud-button hud-button--primary ${combat.isShootButtonEnabled ? '' : 'disabled'}`}
        onClick={() => onAction('shoot')}
        disabled={!combat.isShootButtonEnabled}
      >
        <span className="hud-button__label">{shootLabel}</span>
        {combat.abilityActive && combat.abilityLabel && (
          <span className="hud-button__badge">{combat.abilityLabel}</span>
        )}
      </button>
      <button className="hud-button hud-button--secondary" onClick={() => onAction('shove')}>
        <span className="hud-button__label">推击</span>
        <div className="hud-button__progress-ring" style={{ ['--progress' as string]: shovePercent }} />
      </button>
      <button
        className={`hud-button hud-button--secondary ${combat.isReloading ? 'is-reloading' : ''}`}
        onClick={() => onAction('reload')}
      >
        <span className="hud-button__label">换弹</span>
        {combat.isReloading && (
          <div
            className="hud-button__progress-ring"
            style={{ ['--progress' as string]: reloadPercent }}
          />
        )}
      </button>
    </div>
  )
}

interface StrategicClusterProps {
  inventory: PlayerInventoryState
  shootMode: 'fire' | 'heal-self' | 'throw'
  onSelectHeal: () => void
  onSelectThrowable: () => void
}

const StrategicCluster = ({
  inventory,
  shootMode,
  onSelectHeal,
  onSelectThrowable,
}: StrategicClusterProps) => {
  const weaponSummary = usePlayerStore((state) => state.weaponSummary)
  const isHealActive = shootMode === 'heal-self'
  const isThrowActive = shootMode === 'throw'
  const healDisabled = !inventory.healItem.id || inventory.healItem.quantity <= 0
  const throwDisabled = !inventory.throwable.id || inventory.throwable.quantity <= 0

  return (
    <div className="hud-strategic">
      <button className="hud-strategic__swap" data-weapon-slot={weaponSummary.slot} type="button">
        <span className="hud-strategic__label">切换武器</span>
        <span className="hud-strategic__value">当前：{weaponSummary.slot === 'primary' ? '主武器' : '副武器'}</span>
      </button>
      <div className="hud-strategic__slots">
        <button
          type="button"
          className={`hud-slot-button hud-slot hud-slot--heal ${isHealActive ? 'hud-slot--active' : ''}`}
          onClick={onSelectHeal}
          disabled={healDisabled}
        >
          <span className="hud-slot__label">医疗</span>
          <span className="hud-slot__value">{formatInventoryLabel(inventory.healItem)}</span>
        </button>
        <button
          type="button"
          className={`hud-slot-button hud-slot hud-slot--throwable ${isThrowActive ? 'hud-slot--active' : ''}`}
          onClick={onSelectThrowable}
          disabled={throwDisabled}
        >
          <span className="hud-slot__label">投掷</span>
          <span className="hud-slot__value">{formatInventoryLabel(inventory.throwable)}</span>
        </button>
      </div>
    </div>
  )
}

const formatInventoryLabel = (item: InventoryItemState) => {
  if (!item.id) return '无'
  return `${item.name} x${item.quantity}`
}

const ContextActionPanel = () => {
  const contextAction = useHudStore((state) => state.contextAction)

  if (!contextAction) return null

  const percent = clamp(contextAction.progress ?? 0)

  return (
    <div className="hud-context">
      <button className="hud-context__button">
        <span className="hud-context__label">{contextAction.label}</span>
        {contextAction.description && (
          <span className="hud-context__description">{contextAction.description}</span>
        )}
        {contextAction.showProgressRing && (
          <div
            className="hud-context__progress"
            style={{ ['--progress' as string]: percent }}
          />
        )}
      </button>
      {contextAction.hint && (
        <div className="hud-context__hint">{contextAction.hint}</div>
      )}
    </div>
  )
}

const SmartMessageTicker = () => {
  const smartMessages = useHudStore((state) => state.smartMessages)
  if (smartMessages.length === 0) return null

  return (
    <div className="hud-smart-messages">
      {smartMessages.map((message, index) => (
        <div key={index} className="hud-smart-messages__item">
          {message}
        </div>
      ))}
    </div>
  )
}

export const GameHud = ({ className }: GameHudProps) => {
  const telemetry = usePlayerStore((state) => state.telemetry)
  const faction = usePlayerStore((state) => state.faction)
  const inventory = usePlayerStore((state) => state.inventory)
  const currentStageName = useGameStore((state) => state.currentStageName)
  const stageDuration = useGameStore((state) => state.stageDuration)
  const stageStartedAt = useGameStore((state) => state.stageStartedAt)
  const combat = useHudStore((state) => state.combat)
  const setShootMode = useHudStore((state) => state.setShootMode)
  const setContextAction = useHudStore((state) => state.setContextAction)
  const tickCooldowns = useHudStore((state) => state.tickCooldowns)
  const pushSmartMessage = useHudStore((state) => state.pushSmartMessage)
  const [now, setNow] = useState(() => Date.now())
  const tickerRef = useRef(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      const current = Date.now()
      const delta = current - tickerRef.current
      tickerRef.current = current
      setNow(current)
      tickCooldowns(delta)
    }, 120)

    return () => {
      clearInterval(interval)
    }
  }, [tickCooldowns])

  const stageTimeRemaining = useMemo(() => {
    if (!stageStartedAt) return 0
    return Math.max(stageDuration - (now - stageStartedAt), 0)
  }, [now, stageDuration, stageStartedAt])

  const resetShootMode = useCallback(() => {
    setShootMode('fire', { abilityActive: false, abilityLabel: null })
    setContextAction(null)
  }, [setContextAction, setShootMode])

  const handleSelectHeal = useCallback(() => {
    const nextMode = combat.shootMode === 'heal-self' ? 'fire' : 'heal-self'
    if (nextMode === 'heal-self') {
      if (!inventory.healItem.id || inventory.healItem.quantity <= 0) {
        pushSmartMessage('没有可用的医疗物品')
        triggerVibration([18, 36, 18])
        return
      }
      setShootMode('heal-self', {
        abilityActive: true,
        abilityLabel: '治疗',
        isShootButtonEnabled: true,
      })
      setContextAction({
        id: 'mode-heal-self',
        label: '按下射击键自我治疗',
        type: 'use-self',
        description: '恢复 35 点生命并进入短暂无敌',
        hint: '再次点击医疗槽可退出',
        showProgressRing: false,
      })
      pushSmartMessage('医疗模式已激活')
      triggerVibration([18, 12, 18])
    } else {
      resetShootMode()
      pushSmartMessage('恢复射击模式')
      triggerVibration(18)
    }
  }, [combat.shootMode, inventory.healItem.id, inventory.healItem.quantity, pushSmartMessage, resetShootMode, setContextAction, setShootMode])

  const handleSelectThrowable = useCallback(() => {
    const nextMode = combat.shootMode === 'throw' ? 'fire' : 'throw'
    if (nextMode === 'throw') {
      if (!inventory.throwable.id || inventory.throwable.quantity <= 0) {
        pushSmartMessage('投掷物已耗尽')
        triggerVibration([18, 36, 18])
        return
      }
      setShootMode('throw', {
        abilityActive: true,
        abilityLabel: inventory.throwable.name || '投掷',
        isShootButtonEnabled: true,
      })
      setContextAction({
        id: 'mode-throw',
        label: '按下射击键投掷',
        type: 'throw',
        description: '将当前投掷物抛向瞄准方向',
        hint: '再次点击投掷槽退出',
        showProgressRing: false,
      })
      pushSmartMessage('投掷瞄准模式')
      triggerVibration([22, 14, 22])
    } else {
      resetShootMode()
      pushSmartMessage('恢复射击模式')
      triggerVibration(18)
    }
  }, [combat.shootMode, inventory.throwable.id, inventory.throwable.name, inventory.throwable.quantity, pushSmartMessage, resetShootMode, setContextAction, setShootMode])

  useEffect(() => {
    if (combat.shootMode === 'heal-self' && (!inventory.healItem.id || inventory.healItem.quantity <= 0)) {
      resetShootMode()
      pushSmartMessage('医疗物品耗尽，自动退出医疗模式')
    }
    if (combat.shootMode === 'throw' && (!inventory.throwable.id || inventory.throwable.quantity <= 0)) {
      resetShootMode()
      pushSmartMessage('投掷物耗尽，自动退出投掷模式')
    }
  }, [combat.shootMode, inventory.healItem.id, inventory.healItem.quantity, inventory.throwable.id, inventory.throwable.quantity, pushSmartMessage, resetShootMode])

  useEffect(() => {
    if (faction !== 'survivor' && combat.shootMode !== 'fire') {
      resetShootMode()
    }
  }, [combat.shootMode, faction, resetShootMode])

  const handleHudAction = useCallback(
    (action: 'shoot' | 'shove' | 'reload') => {
      triggerVibration(action === 'shoot' ? [26, 18, 26] : 18)
      window.dispatchEvent(
        new CustomEvent('hud:action', {
          detail: { action },
        }),
      )

      let message: string | null = null
      if (action === 'shoot') {
        if (combat.shootMode === 'heal-self') {
          message = '执行自我治疗'
        } else if (combat.shootMode === 'throw') {
          message = '尝试投掷'
        } else {
          message = '开火'
        }
      } else if (action === 'shove') {
        message = '近战推击'
      } else if (action === 'reload') {
        message = '战术换弹'
      }
      if (message) {
        pushSmartMessage(message)
      }
    },
    [combat.shootMode, pushSmartMessage],
  )

  const rootClassName = ['hud-root', className].filter(Boolean).join(' ')

  return (
    <div className={rootClassName}>
      <div className="hud-layer hud-layer--top">
        <div className="hud-player-status">
          <HealthBar label="生命" value={telemetry.health} max={100} />
          <HealthBar label="护甲" value={telemetry.armor} max={100} />
          <div className="hud-player-faction">
            {faction === 'survivor' ? '幸存者' : '感染者'}
          </div>
        </div>
        <div className="hud-stage-info">
          <div className="hud-stage-info__name">{currentStageName ?? '未知阶段'}</div>
          <div className="hud-stage-info__timer">{formatSeconds(stageTimeRemaining)}</div>
        </div>
        <SmartMessageTicker />
      </div>

      <div className="hud-layer hud-layer--left">
        <div className="hud-joystick-ghost">
          <div className="hud-joystick-ghost__inner" />
        </div>
        <TeammateStatusList />
      </div>

      <div className="hud-layer hud-layer--right">
        <CombatCluster onAction={handleHudAction} />
      </div>

      <div className="hud-layer hud-layer--top-right">
        <StrategicCluster
          inventory={inventory}
          shootMode={combat.shootMode}
          onSelectHeal={handleSelectHeal}
          onSelectThrowable={handleSelectThrowable}
        />
      </div>

      <div className="hud-layer hud-layer--center">
        <AmmoReadout />
      </div>

      <ContextActionPanel />
    </div>
  )
}

