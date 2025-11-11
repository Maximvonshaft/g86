import Phaser from 'phaser'
import type {
  SafeAreaInsets,
  ViewportBounds,
  ViewportState,
} from '../../state/gameStore'

export const DESIGN_WIDTH = 1920
export const DESIGN_HEIGHT = 1080
export const MIN_WIDTH = 1600
export const MIN_HEIGHT = 900
export const MAX_WIDTH = 2340
export const MAX_HEIGHT = 1080
export const WIDE_SCREEN_THRESHOLD = 2.0
export const MAX_SCREEN_RATIO = 2.17

const BASE_SAFE_HORIZONTAL = 96
const BASE_SAFE_VERTICAL = 40
const WIDE_SAFE_HORIZONTAL = 128
const WIDE_SAFE_VERTICAL = 56

const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 }

export interface ViewportMetrics {
  width: number
  height: number
  displayWidth: number
  displayHeight: number
  scaleX: number
  scaleY: number
  safeAreaLogical: SafeAreaInsets
  safeAreaPx: SafeAreaInsets
  deviceSafeAreaPx: SafeAreaInsets
  bounds: ViewportBounds
}

const clamp01 = (value: number) => Phaser.Math.Clamp(value, 0, 1)

const lerp = (start: number, end: number, t: number) =>
  Phaser.Math.Linear(start, end, clamp01(t))

const CSS_SAFE_AREA_PROPS = {
  top: '--safe-area-top',
  right: '--safe-area-right',
  bottom: '--safe-area-bottom',
  left: '--safe-area-left',
} as const

export const getVisualViewportInsets = (): SafeAreaInsets => {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return { ...ZERO_INSETS }
  }

  const vv = window.visualViewport
  const left = vv.offsetLeft
  const top = vv.offsetTop
  const right = Math.max(0, window.innerWidth - vv.width - left)
  const bottom = Math.max(0, window.innerHeight - vv.height - top)

  return {
    top,
    right,
    bottom,
    left,
  }
}

const parseCssLength = (value: string): number => {
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export const getCssSafeAreaInsets = (): SafeAreaInsets => {
  if (typeof window === 'undefined') {
    return { ...ZERO_INSETS }
  }

  const style = getComputedStyle(document.documentElement)
  return {
    top: parseCssLength(style.getPropertyValue(CSS_SAFE_AREA_PROPS.top)),
    right: parseCssLength(style.getPropertyValue(CSS_SAFE_AREA_PROPS.right)),
    bottom: parseCssLength(style.getPropertyValue(CSS_SAFE_AREA_PROPS.bottom)),
    left: parseCssLength(style.getPropertyValue(CSS_SAFE_AREA_PROPS.left)),
  }
}

export const mergeDeviceSafeArea = (
  a: SafeAreaInsets,
  b: SafeAreaInsets,
): SafeAreaInsets => ({
  top: Math.max(a.top, b.top),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom),
  left: Math.max(a.left, b.left),
})

export const calculateSafeArea = (
  scaleManager: Phaser.Scale.ScaleManager,
  deviceSafeAreaPx: SafeAreaInsets = ZERO_INSETS,
): ViewportMetrics => {
  const gameSize = scaleManager.gameSize
  const displaySize = scaleManager.displaySize

  const scaleX =
    gameSize.width > 0 ? displaySize.width / gameSize.width : 1
  const scaleY =
    gameSize.height > 0 ? displaySize.height / gameSize.height : 1

  const ratio =
    displaySize.height > 0
      ? displaySize.width / displaySize.height
      : gameSize.width / Math.max(gameSize.height, 1)

  const t =
    MAX_SCREEN_RATIO > WIDE_SCREEN_THRESHOLD
      ? clamp01((ratio - WIDE_SCREEN_THRESHOLD) / (MAX_SCREEN_RATIO - WIDE_SCREEN_THRESHOLD))
      : 0

  const horizontalMargin = lerp(BASE_SAFE_HORIZONTAL, WIDE_SAFE_HORIZONTAL, t)
  const verticalMargin = lerp(BASE_SAFE_VERTICAL, WIDE_SAFE_VERTICAL, t)

  const toLogicalX = (value: number) => value / Math.max(scaleX, 0.0001)
  const toLogicalY = (value: number) => value / Math.max(scaleY, 0.0001)

  const safeAreaLogical: SafeAreaInsets = {
    top: verticalMargin + toLogicalY(deviceSafeAreaPx.top),
    right: horizontalMargin + toLogicalX(deviceSafeAreaPx.right),
    bottom: verticalMargin + toLogicalY(deviceSafeAreaPx.bottom),
    left: horizontalMargin + toLogicalX(deviceSafeAreaPx.left),
  }

  const safeAreaPx: SafeAreaInsets = {
    top: safeAreaLogical.top * scaleY,
    right: safeAreaLogical.right * scaleX,
    bottom: safeAreaLogical.bottom * scaleY,
    left: safeAreaLogical.left * scaleX,
  }

  const viewPortRect = scaleManager.getViewPort()
  const bounds: ViewportBounds = {
    x: viewPortRect ? viewPortRect.x : 0,
    y: viewPortRect ? viewPortRect.y : 0,
    width: viewPortRect ? viewPortRect.width : displaySize.width,
    height: viewPortRect ? viewPortRect.height : displaySize.height,
  }

  return {
    width: gameSize.width,
    height: gameSize.height,
    displayWidth: displaySize.width,
    displayHeight: displaySize.height,
    scaleX,
    scaleY,
    safeAreaLogical,
    safeAreaPx,
    deviceSafeAreaPx,
    bounds,
  }
}

export const buildViewportState = (
  metrics: ViewportMetrics,
): Partial<ViewportState> => ({
  width: metrics.width,
  height: metrics.height,
  displayWidth: metrics.displayWidth,
  displayHeight: metrics.displayHeight,
  scale: Math.min(metrics.scaleX, metrics.scaleY),
  safeArea: metrics.safeAreaLogical,
  safeAreaPx: metrics.safeAreaPx,
  deviceSafeAreaPx: metrics.deviceSafeAreaPx,
  bounds: metrics.bounds,
})



