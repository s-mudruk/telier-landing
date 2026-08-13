import { useEffect } from 'react'
import Lenis from 'lenis'
import { clamp } from './scene-timing.js'

/* точка входа одна: App импортирует всё из scroll.js */
export { clamp, sceneStyle } from './scene-timing.js'

/* один жест колеса или свайпа даёт один переход, свободной прокрутки нет */
/* скролл живёт в контейнере .snap, документ не скроллится: браузер не может
   ни сдвинуть страницу сам, ни сломать раскладку пересчётом dvh */

const FRAME_SUBS = new Set()

/* контейнер скролла, ставится в useSmoothScroll; фолбэки на window нужны
   подписчикам, чей эффект монтируется раньше */
let SCROLLER = null

const scrollTop = () => (SCROLLER ? SCROLLER.scrollTop : window.scrollY)

const viewH = () => (SCROLLER ? SCROLLER.clientHeight : window.innerHeight)

const jumpTo = (y) => {
  if (SCROLLER) SCROLLER.scrollTop = y
  else window.scrollTo(0, y)
}

/* плавный сдвиг контейнера, для подводки плашки к клавиатуре */
export function nudgeScroll(delta) {
  SCROLLER?.scrollBy({ top: delta, behavior: 'smooth' })
}

/* кривая перехода между экранами */
const EASE_IN_OUT_SINE = (t) => -(Math.cos(Math.PI * t) - 1) / 2

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* подписка на кадр, возвращает отписку */
export function onFrame(cb) {
  FRAME_SUBS.add(cb)
  return () => FRAME_SUBS.delete(cb)
}

/* прогресс sticky-трека 0..1 */
export function trackProgress(el) {
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  const total = rect.height - viewH()
  return total > 0 ? clamp(-rect.top / total, 0, 1) : 0
}

/* ============ Горизонтальная лента: доводка карточки ============ */

/* лента листается колесом, свайпом и мышью, доводка в центр только на узком экране */
const RAIL = {
  media: '(max-width: 860px)', // где доводка вообще работает
  idleMs: 110, // тишина в потоке scroll, после которой жест считается законченным
  duration: 0.42, // секунды на доводку
  minShiftPx: 2, // ближе этого карточка уже стоит на месте
  dragSlopPx: 3, // сдвиг, после которого протяжка считается начатой
}

export function attachRailSnap(el) {
  if (!el) return () => {}

  const soft = !prefersReducedMotion()
  let idle = 0
  let raf = 0
  let held = false /* палец на ленте: пока не отпустил, не доводим */

  const stop = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  /* ближайшая точка покоя */
  const target = () => {
    const cards = el.children
    if (!cards.length || !window.matchMedia(RAIL.media).matches) return null
    const max = Math.max(el.scrollWidth - el.clientWidth, 0)
    let best = null
    let bestGap = Infinity
    for (const card of cards) {
      const want = card.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2
      const pos = clamp(want, 0, max)
      const gap = Math.abs(pos - el.scrollLeft)
      if (gap < bestGap) {
        bestGap = gap
        best = pos
      }
    }
    return best
  }

  const settle = () => {
    const to = target()
    if (to === null) return
    const from = el.scrollLeft
    const shift = to - from
    if (Math.abs(shift) < RAIL.minShiftPx) return
    if (!soft) {
      el.scrollLeft = to
      return
    }
    const started = performance.now()
    const ms = RAIL.duration * 1000
    stop()
    const step = (now) => {
      const t = clamp((now - started) / ms, 0, 1)
      el.scrollLeft = from + shift * EASE_IN_OUT_SINE(t)
      raf = t < 1 ? requestAnimationFrame(step) : 0
    }
    raf = requestAnimationFrame(step)
  }

  const onScroll = () => {
    if (raf) return /* ведём ленту сами, свой же scroll за жест не считаем */
    clearTimeout(idle)
    idle = setTimeout(() => {
      if (!held) settle()
    }, RAIL.idleMs)
  }

  const grab = () => {
    held = true
    stop()
    clearTimeout(idle)
  }

  const drop = () => {
    held = false
    onScroll()
  }

  /* протяжка мышью, палец и трекпад листают ленту сами */
  let drag = null

  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    drag = { x: e.clientX, from: el.scrollLeft }
    grab()
    el.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    if (!el.classList.contains('is-dragging') && Math.abs(dx) < RAIL.dragSlopPx) return
    el.classList.add('is-dragging')
    el.scrollLeft = drag.from - dx
  }

  const onPointerUp = (e) => {
    if (!drag) return
    drag = null
    el.classList.remove('is-dragging')
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId)
    drop()
  }

  const noDefault = (e) => e.preventDefault()

  const passive = { passive: true }
  el.addEventListener('scroll', onScroll, passive)
  el.addEventListener('wheel', stop, passive)
  el.addEventListener('touchstart', grab, passive)
  el.addEventListener('touchend', drop, passive)
  el.addEventListener('touchcancel', drop, passive)
  el.addEventListener('pointerdown', onPointerDown, passive)
  el.addEventListener('pointermove', onPointerMove, passive)
  el.addEventListener('pointerup', onPointerUp, passive)
  el.addEventListener('pointercancel', onPointerUp, passive)
  el.addEventListener('dragstart', noDefault)

  return () => {
    stop()
    clearTimeout(idle)
    el.classList.remove('is-dragging')
    el.removeEventListener('scroll', onScroll, passive)
    el.removeEventListener('wheel', stop, passive)
    el.removeEventListener('touchstart', grab, passive)
    el.removeEventListener('touchend', drop, passive)
    el.removeEventListener('touchcancel', drop, passive)
    el.removeEventListener('pointerdown', onPointerDown, passive)
    el.removeEventListener('pointermove', onPointerMove, passive)
    el.removeEventListener('pointerup', onPointerUp, passive)
    el.removeEventListener('pointercancel', onPointerUp, passive)
    el.removeEventListener('dragstart', noDefault)
  }
}

/* ============ Пошаговый скролл: один жест на экран ============ */

const STOP_SECTION_SELECTOR = '.panel'
const STOP_TRACK_SELECTOR = '.product-track'
const SCENE_SELECTOR = '.stage-shots img'

const STEP = {
  baseDuration: 0.95, // секунды на один экран, дальше по корню из дистанции
  minDuration: 0.9,
  maxDuration: 1.3,
  wheelThreshold: 18, // порог жеста после нормализации дельты
  gestureGapMs: 80, // тишина, после которой поток колеса это новый жест
  touchThreshold: 42, // px свайпа
  tolerancePx: 4,
  nestedScrollMinPx: 24, // меньший запас хода за скроллер не считаем
  watchdogSlackMs: 350, // запас сторожа поверх длительности перехода
}

/* нормализация дельты: строка это 100/6 px, страница это экран */
const LINE_HEIGHT = 100 / 6
function normalizeDelta(event) {
  const mode = event.deltaMode
  if (mode === 1) return { x: event.deltaX * LINE_HEIGHT, y: event.deltaY * LINE_HEIGHT }
  if (mode === 2) return { x: event.deltaX * window.innerWidth, y: event.deltaY * viewH() }
  return { x: event.deltaX, y: event.deltaY }
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

export const isEditable = (el) =>
  !!el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')

/* жест внутри своего скроллера отдаём ему; порог обязателен: у ленты карточек
   overflow-y вычисляется в auto и пара пикселей переполнения съедала бы колесо */
/* подъём строго до главного контейнера, сам контейнер жестам не отдаём */
function insideScrollable(target, dy) {
  let el = target instanceof Element ? target : null
  while (el && el !== SCROLLER && el !== document.body && el !== document.documentElement) {
    if (el.hasAttribute?.('data-lenis-prevent')) return true
    const room = el.scrollHeight - el.clientHeight
    if (room >= STEP.nestedScrollMinPx && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
      const ahead = dy > 0 ? room - el.scrollTop : el.scrollTop
      if (ahead >= STEP.nestedScrollMinPx) return true
    }
    el = el.parentElement
  }
  return false
}

/* остановки: границы секций и центры сцен внутри sticky-трека */
/* верх .snap совпадает с верхом окна, иначе все остановки уедут */
function measureStops(lenis) {
  const vh = viewH()
  const limit = Math.max(
    typeof lenis?.limit === 'number' ? lenis.limit : (SCROLLER ? SCROLLER.scrollHeight : document.documentElement.scrollHeight) - vh,
    0,
  )
  const scroll = scrollTop()
  const stops = []
  const add = (v) => {
    const x = clamp(Math.round(v), 0, limit)
    if (!stops.some((q) => Math.abs(q - x) <= STEP.tolerancePx)) stops.push(x)
  }

  add(0)
  document.querySelectorAll(STOP_SECTION_SELECTOR).forEach((el) => {
    const top = el.getBoundingClientRect().top + scroll
    add(top)
    /* секция выше экрана (бывает на мобильных), тогда доступен и её низ */
    if (el.offsetHeight > vh + STEP.tolerancePx) add(top + el.offsetHeight - vh)
  })
  document.querySelectorAll(STOP_TRACK_SELECTOR).forEach((el) => {
    const top = el.getBoundingClientRect().top + scroll
    const span = el.offsetHeight - vh
    if (span <= 0) return add(top)
    const scenes = Math.max(el.querySelectorAll(SCENE_SELECTOR).length, 2)
    for (let i = 0; i < scenes; i++) add(top + (span * i) / (scenes - 1))
  })

  stops.sort((a, b) => a - b)
  return stops
}

function createStepScroller(lenis) {
  const soft = !!lenis
  let busy = false
  let busyUntil = 0
  let activeDir = 0
  let pending = 0
  let acc = 0
  let lastEventAt = 0
  let ready = true
  let firedDir = 0
  let touchY = 0
  let touchX = 0
  let touchFired = false

  /* единственное место, где снимаются и наш флаг, и lock у Lenis */
  const release = () => {
    busy = false
    activeDir = 0
    pending = 0
    if (soft && (lenis.isLocked || lenis.isScrolling === 'smooth')) lenis.reset()
  }

  /* ресайз окна, поворот и скролл мимо степпера сбивают позицию с остановки:
     после затишья мгновенный возврат к ближайшей, клавиатура не считается */
  let realignTimer = 0

  const realign = () => {
    if (busy || isEditable(document.activeElement)) return
    const stops = measureStops(lenis)
    if (!stops.length) return
    const y = scrollTop()
    let best = stops[0]
    for (const s of stops) if (Math.abs(s - y) < Math.abs(best - y)) best = s
    if (Math.abs(best - y) <= STEP.tolerancePx) return
    if (soft) lenis.scrollTo(best, { immediate: true, force: true })
    else jumpTo(best)
  }

  const onViewportResize = () => {
    clearTimeout(realignTimer)
    realignTimer = setTimeout(realign, 140)
  }

  const finish = () => {
    busy = false
    activeDir = 0
    if (!pending) return
    const dir = pending
    pending = 0
    move(dir)
  }

  const drive = (target, onComplete) => {
    const from = scrollTop()
    const distance = Math.abs(target - from)
    if (distance < 1) {
      onComplete?.()
      return
    }
    if (!soft) {
      jumpTo(target)
      onComplete?.()
      return
    }
    const duration = clamp(
      STEP.baseDuration * Math.sqrt(distance / viewH()),
      STEP.minDuration,
      STEP.maxDuration,
    )
    busy = true
    activeDir = target > from ? 1 : -1
    /* потолок жизни флага: если анимация не доиграет, снимет tick */
    busyUntil = performance.now() + duration * 1000 + STEP.watchdogSlackMs
    lenis.scrollTo(target, {
      duration,
      easing: EASE_IN_OUT_SINE,
      lock: true,
      force: true,
      userData: { step: true },
      onComplete: () => {
        finish()
        onComplete?.()
      },
    })
  }

  const scrollToHero = (onComplete) => {
    release()
    const stops = measureStops(lenis)
    if (!stops.length) {
      onComplete?.()
      return
    }
    drive(stops[0], onComplete)
  }

  /* dir: 1 вниз, -1 вверх, 'start' и 'end' в начало и в конец страницы */
  const move = (dir) => {
    const stops = measureStops(lenis)
    if (!stops.length) return
    const y = scrollTop()
    if (dir === 'start') return drive(stops[0])
    if (dir === 'end') return drive(stops[stops.length - 1])
    const next =
      dir > 0
        ? stops.find((s) => s > y + STEP.tolerancePx)
        : [...stops].reverse().find((s) => s < y - STEP.tolerancePx)
    if (next === undefined) return
    drive(next)
  }

  const request = (dir) => {
    if (dir === 'start' || dir === 'end') {
      release()
      return move(dir)
    }
    if (busy) {
      /* разворот на середине: рвём анимацию и едем в новую сторону */
      if (dir !== activeDir) {
        release()
        return move(dir)
      }
      pending = dir /* в ту же сторону копим не больше одного жеста */
      return
    }
    move(dir)
  }

  const onWheel = (e) => {
    if (e.ctrlKey) return /* пинч-зум */
    const { x, y } = normalizeDelta(e)
    if (Math.abs(x) > Math.abs(y)) return /* горизонтальный жест не наш */
    if (insideScrollable(e.target, y)) return
    if (e.cancelable) e.preventDefault()

    const now = performance.now()
    if (now - lastEventAt > STEP.gestureGapMs) {
      acc = 0
      ready = true /* поток прервался, начался новый жест */
    }
    lastEventAt = now
    /* инерция не меняет знак, значит обратная дельта это новый жест */
    if (!ready && y !== 0 && Math.sign(y) !== firedDir) {
      acc = 0
      ready = true
    }
    if (!ready) return /* хвост инерции уже отработавшего жеста */
    acc += y
    if (Math.abs(acc) < STEP.wheelThreshold) return
    const dir = acc > 0 ? 1 : -1
    acc = 0
    ready = false
    firedDir = dir
    request(dir)
  }

  const onTouchStart = (e) => {
    const t = e.touches[0]
    if (!t) return
    touchY = t.clientY
    touchX = t.clientX
    touchFired = false
  }

  const onTouchMove = (e) => {
    const t = e.touches[0]
    if (!t) return
    const dy = touchY - t.clientY /* палец вверх даёт следующий экран */
    const dx = touchX - t.clientX
    if (Math.abs(dx) > Math.abs(dy)) return
    if (insideScrollable(e.target, dy)) return
    if (e.cancelable) e.preventDefault()
    if (touchFired || Math.abs(dy) < STEP.touchThreshold) return
    touchFired = true
    request(dy > 0 ? 1 : -1)
  }

  const onTouchEnd = () => {
    touchFired = false
  }

  const onKeyDown = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (!SCROLL_KEYS.has(e.key)) return
    if (isEditable(e.target)) return
    /* пробел на кнопке или ссылке отдаём самому элементу */
    if (e.key === ' ' && e.target instanceof Element && e.target.closest('button, a[href]')) return
    e.preventDefault()
    if (e.key === 'Home') return request('start')
    if (e.key === 'End') return request('end')
    const up = e.key === 'ArrowUp' || e.key === 'PageUp' || (e.shiftKey && e.key.trim() === '')
    request(up ? -1 : 1)
  }

  const onVisibility = () => {
    if (document.hidden) release()
  }

  const active = { passive: false, capture: true }
  const passive = { passive: true, capture: true }
  window.addEventListener('wheel', onWheel, active)
  window.addEventListener('touchstart', onTouchStart, passive)
  window.addEventListener('touchmove', onTouchMove, active)
  window.addEventListener('touchend', onTouchEnd, passive)
  window.addEventListener('touchcancel', onTouchEnd, passive)
  window.addEventListener('keydown', onKeyDown, active)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('resize', onViewportResize)
  window.visualViewport?.addEventListener('resize', onViewportResize)
  /* скроллбар и подскроллы браузера идут мимо степпера, затишье возвращает остановку */
  SCROLLER?.addEventListener('scroll', onViewportResize, { passive: true })

  /* сторож: снимает зависший переход, lock у lenis и залипший жест */
  const tick = () => {
    const now = performance.now()
    if (busy && now > busyUntil) release()
    if (!busy && soft && lenis.isLocked) lenis.reset()
    if (!ready && now - lastEventAt > STEP.gestureGapMs) {
      ready = true
      acc = 0
    }
  }

  const destroy = () => {
    clearTimeout(realignTimer)
    window.removeEventListener('wheel', onWheel, active)
    window.removeEventListener('touchstart', onTouchStart, passive)
    window.removeEventListener('touchmove', onTouchMove, active)
    window.removeEventListener('touchend', onTouchEnd, passive)
    window.removeEventListener('touchcancel', onTouchEnd, passive)
    window.removeEventListener('keydown', onKeyDown, active)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('resize', onViewportResize)
    window.visualViewport?.removeEventListener('resize', onViewportResize)
    SCROLLER?.removeEventListener('scroll', onViewportResize)
  }

  return { tick, destroy, scrollToHero }
}

let scrollApi = null

export function scrollToHero(onComplete) {
  scrollApi?.scrollToHero(onComplete)
}

export function useSmoothScroll(wrapperRef) {
  useEffect(() => {
    const soft = !prefersReducedMotion()
    let lenis = null

    const wrapper = wrapperRef?.current
    SCROLLER = wrapper || null

    /* все scrollTo передают duration и easing явно, поэтому опций плавности нет */
    if (soft && wrapper) {
      lenis = new Lenis({
        wrapper,
        content: wrapper.firstElementChild,
        autoRaf: false,
        /* колесо и тач ведёт наш скроллер, lenis только анимирует */
        virtualScroll: () => false,
      })
    }

    /* при prefers-reduced-motion переходы мгновенные */
    const stepper = createStepScroller(lenis)
    scrollApi = stepper

    /* следующий кадр планируем до работы: исключение не убьёт цикл */
    /* подписчики читают геометрию, будим их только когда позиция или окно менялись */
    let lastY = -1
    const wake = () => { lastY = -1 }
    window.addEventListener('resize', wake)
    let id = requestAnimationFrame(function loop(time) {
      id = requestAnimationFrame(loop)
      if (lenis) lenis.raf(time)
      stepper.tick()
      const y = scrollTop()
      if (y === lastY) return
      lastY = y
      FRAME_SUBS.forEach((cb) => cb())
    })

    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', wake)
      stepper.destroy()
      if (lenis) lenis.destroy()
      if (scrollApi === stepper) scrollApi = null
      if (SCROLLER === wrapper) SCROLLER = null
    }
  }, [wrapperRef])
}
