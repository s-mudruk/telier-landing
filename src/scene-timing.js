/* тайминг sticky-сцены продукта одна сцена на один жест скролла */

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v
}

/* сглаживает кроссфейд по краям */
function smoothstep(v) {
  const t = clamp(v, 0, 1)
  return t * t * (3 - 2 * t)
}

const round = (v, digits) => {
  const k = Math.pow(10, digits)
  return Math.round(v * k) / k
}

/* ============ Тайминг sticky-сцены продукта ============ */

/* единица это шаг между центрами соседних сцен, он же один жест */
/* инвариант мокапов 2*hold + fade === 1, иначе провал в пустой кадр на пересменке */
/* у текста сумма меньше 1 намеренно, между заголовками нужна пауза */
const SCENE_TIMING = {
  /* мокапы travel и drift в % высоты мокапа */
  shot: {
    hold: 0.06,
    fade: 0.88, // движение занимает почти весь шаг
    fadeWidth: 0.28, // прозрачность меняется на 0.25 шага в середине
    drift: 2,
    /* мокапы разъезжаются почти на свою высоту, иначе корпуса наезжают друг на друга */
    travelOut: 80, // уход вверх
    travelIn: 68, // приход снизу
    moveMix: 0.3, // 0 это линейно, 1 это smoothstep
    scaleOut: 0.9,
    scaleIn: 0.93,
    scalePower: 2,
  },
  /* подписи travel и drift в px */
  text: {
    hold: 0.08,
    fade: 0.38,
    fadeWidth: 1,
    drift: 3,
    travelOut: 54,
    travelIn: 46,
    moveMix: 0.3,
  },
}

/* комплементарная кривая g(1-u) === 1 - g(u) при любом width */
function crossfade(u, width) {
  return smoothstep((u - 0.5) / width + 0.5)
}

/* d это расстояние до центра в шагах >0 сцена улетела вверх, <0 ждёт снизу */
function sceneLayer(d, spec) {
  const dir = d < 0 ? -1 : 1
  const a = Math.min(Math.abs(d), 1)
  const travel = dir > 0 ? spec.travelOut : spec.travelIn
  if (a <= spec.hold) {
    /* полка у центра сцена стоит на месте в точке остановки */
    const move = spec.drift * (spec.hold > 0 ? a / spec.hold : 0)
    return { dir, u: 0, opacity: 1, translateY: -dir * move }
  }
  const u = clamp((a - spec.hold) / spec.fade, 0, 1)
  const shaped = u + spec.moveMix * (smoothstep(u) - u)
  const move = spec.drift + (travel - spec.drift) * shaped
  return { dir, u, opacity: 1 - crossfade(u, spec.fadeWidth), translateY: -dir * move }
}

function shotScale(layer) {
  if (layer.u <= 0) return 1
  const spec = SCENE_TIMING.shot
  const target = layer.dir > 0 ? spec.scaleOut : spec.scaleIn
  return 1 - (1 - target) * (1 - Math.pow(1 - layer.u, spec.scalePower))
}

/* p это прогресс трека 0..1. translateY мокапа в % высоты, подписи в px, */
export function sceneStyle(p, index, total) {
  const t = 0.5 + clamp(p, 0, 1) * (total - 1)
  const d = t - (index + 0.5)
  const shot = sceneLayer(d, SCENE_TIMING.shot)
  const text = sceneLayer(d, SCENE_TIMING.text)
  return {
    shot: {
      opacity: round(shot.opacity, 4),
      translateY: round(shot.translateY, 2),
      scale: round(shotScale(shot), 4),
    },
    text: {
      opacity: round(text.opacity, 4),
      translateY: round(text.translateY, 2),
    },
  }
}
