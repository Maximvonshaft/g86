/**
 * 性能优化工具函数
 * 专业游戏工作室标准
 */

/**
 * 触觉反馈系统
 */
export const hapticFeedback = {
  /**
   * 轻微振动 - 用于常规按钮点击
   */
  light: () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }
  },
  
  /**
   * 中等振动 - 用于重要操作
   */
  medium: () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([15, 10, 15])
    }
  },
  
  /**
   * 强烈振动 - 用于警告或关键操作
   */
  heavy: () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([20, 15, 20, 15, 20])
    }
  },
  
  /**
   * 成功反馈
   */
  success: () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([10, 5, 10])
    }
  },
  
  /**
   * 错误反馈
   */
  error: () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([30, 20, 30])
    }
  },
}

/**
 * 防抖函数 - 优化高频事件
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }
    
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(later, wait)
  }
}

/**
 * 节流函数 - 限制执行频率
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean
  let lastResult: ReturnType<T>
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      lastResult = func(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
    return lastResult
  }
}

/**
 * 请求动画帧节流 - 最优性能
 */
export function rafThrottle<T extends (...args: any[]) => any>(
  func: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null
  
  return function executedFunction(...args: Parameters<T>) {
    if (rafId !== null) {
      return
    }
    
    rafId = requestAnimationFrame(() => {
      func(...args)
      rafId = null
    })
  }
}

/**
 * 检测设备性能等级
 */
export function getDevicePerformanceTier(): 'low' | 'medium' | 'high' {
  if (typeof window === 'undefined') return 'medium'
  
  // 检查硬件并发数
  const cores = navigator.hardwareConcurrency || 2
  
  // 检查内存 (如果可用)
  const memory = (navigator as any).deviceMemory || 4
  
  // 检查连接速度
  const connection = (navigator as any).connection
  const effectiveType = connection?.effectiveType || '4g'
  
  // 综合判断
  if (cores >= 8 && memory >= 8 && effectiveType === '4g') {
    return 'high'
  } else if (cores >= 4 && memory >= 4) {
    return 'medium'
  } else {
    return 'low'
  }
}

/**
 * 自适应帧率目标
 */
export function getTargetFPS(): 30 | 60 | 120 {
  const tier = getDevicePerformanceTier()
  
  switch (tier) {
    case 'high':
      return 120
    case 'medium':
      return 60
    default:
      return 30
  }
}

/**
 * 优化的动画帧循环
 */
export class AnimationLoop {
  private rafId: number | null = null
  private callback: (delta: number) => void
  private lastTime: number = 0
  private targetFPS: number
  private frameInterval: number
  
  constructor(callback: (delta: number) => void, targetFPS?: number) {
    this.callback = callback
    this.targetFPS = targetFPS || getTargetFPS()
    this.frameInterval = 1000 / this.targetFPS
  }
  
  start() {
    this.lastTime = performance.now()
    this.loop()
  }
  
  private loop = () => {
    const currentTime = performance.now()
    const delta = currentTime - this.lastTime
    
    // 只在达到目标帧间隔时执行
    if (delta >= this.frameInterval) {
      this.lastTime = currentTime - (delta % this.frameInterval)
      this.callback(delta)
    }
    
    this.rafId = requestAnimationFrame(this.loop)
  }
  
  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
}

/**
 * 检测触摸设备
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (navigator as any).msMaxTouchPoints > 0
  )
}

/**
 * 检测横屏模式
 */
export function isLandscape(): boolean {
  if (typeof window === 'undefined') return false
  
  return window.innerWidth > window.innerHeight
}

/**
 * 获取安全区域信息
 */
export function getSafeAreaInsets() {
  if (typeof window === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }
  
  const computedStyle = getComputedStyle(document.documentElement)
  
  return {
    top: parseInt(computedStyle.getPropertyValue('--safe-area-top') || '0', 10),
    right: parseInt(computedStyle.getPropertyValue('--safe-area-right') || '0', 10),
    bottom: parseInt(computedStyle.getPropertyValue('--safe-area-bottom') || '0', 10),
    left: parseInt(computedStyle.getPropertyValue('--safe-area-left') || '0', 10),
  }
}

/**
 * 屏幕方向锁定 (仅横屏)
 */
export async function lockOrientationLandscape(): Promise<boolean> {
  if (typeof screen === 'undefined' || !screen.orientation) {
    return false
  }
  
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: 'landscape' | 'landscape-primary' | 'landscape-secondary') => Promise<void>
    }
    if (typeof orientation.lock !== 'function') {
      return false
    }

    await orientation.lock('landscape')
    return true
  } catch (error) {
    console.warn('无法锁定屏幕方向:', error)
    return false
  }
}

/**
 * 进入全屏模式
 */
export async function enterFullscreen(element?: HTMLElement): Promise<boolean> {
  const target = element || document.documentElement
  
  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen()
    } else if ((target as any).webkitRequestFullscreen) {
      await (target as any).webkitRequestFullscreen()
    } else if ((target as any).msRequestFullscreen) {
      await (target as any).msRequestFullscreen()
    }
    return true
  } catch (error) {
    console.warn('无法进入全屏:', error)
    return false
  }
}

/**
 * 退出全屏模式
 */
export async function exitFullscreen(): Promise<boolean> {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen()
    } else if ((document as any).webkitExitFullscreen) {
      await (document as any).webkitExitFullscreen()
    } else if ((document as any).msExitFullscreen) {
      await (document as any).msExitFullscreen()
    }
    return true
  } catch (error) {
    console.warn('无法退出全屏:', error)
    return false
  }
}

/**
 * 唤醒锁定 (防止屏幕休眠)
 */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if ('wakeLock' in navigator) {
    try {
      const wakeLock = await navigator.wakeLock.request('screen')
      return wakeLock
    } catch (error) {
      console.warn('无法获取唤醒锁定:', error)
      return null
    }
  }
  return null
}

/**
 * 性能监控
 */
export class PerformanceMonitor {
  private fps: number = 0
  private frameCount: number = 0
  private lastTime: number = 0
  private callback?: (fps: number) => void
  
  constructor(callback?: (fps: number) => void) {
    this.callback = callback
    this.lastTime = performance.now()
  }
  
  update() {
    this.frameCount++
    const currentTime = performance.now()
    
    // 每秒更新一次FPS
    if (currentTime >= this.lastTime + 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime))
      this.frameCount = 0
      this.lastTime = currentTime
      
      if (this.callback) {
        this.callback(this.fps)
      }
    }
  }
  
  getFPS(): number {
    return this.fps
  }
}

/**
 * 批量DOM更新优化
 */
export function batchDOMUpdates(updates: Array<() => void>) {
  requestAnimationFrame(() => {
    updates.forEach(update => update())
  })
}

/**
 * 图像预加载
 */
export async function preloadImages(urls: string[]): Promise<HTMLImageElement[]> {
  return Promise.all(
    urls.map(url => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = url
      })
    })
  )
}

/**
 * 内存使用情况
 */
export function getMemoryUsage() {
  if ('memory' in performance) {
    const memory = (performance as any).memory
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
    }
  }
  return null
}
