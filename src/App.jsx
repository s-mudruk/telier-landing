import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react'
import { createPortal } from 'react-dom'
import emailjs from '@emailjs/browser'
import NumberFlow from '@number-flow/react'
import {
  useSmoothScroll,
  attachRailSnap,
  onFrame,
  clamp,
  sceneStyle,
  trackProgress,
  scrollToHero,
  nudgeScroll,
  isEditable,
} from './scroll.js'

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
/* адрес и получатель заявок, и публичный контакт в футере */
const CONTACT_EMAIL = 'brylev15@yandex.ru'

const asset = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

const PHONE = '+7 495 975-97-90'
const PHONE_LABEL = '+7 (495) 975-97-90'

/* короткие слова клеятся к следующему, keepTail держит последние два слова вместе */
const GLUE = new Set([
  'в', 'во', 'и', 'а', 'к', 'с', 'со', 'о', 'об', 'у', 'на', 'не', 'по', 'из', 'от', 'до',
  'за', 'над', 'под', 'при', 'для', 'как', 'что', 'уже', 'мы', 'вы', 'но', 'же', 'ни', 'то', 'без',
])

const NBSP = '\u00A0'

function typo(src, keepTail = true) {
  const words = src.split(/\s+/).filter(Boolean)
  let out = ''
  for (let i = 0; i < words.length; i++) {
    out += words[i]
    if (i === words.length - 1) break
    const bare = words[i].replace(/[^а-яёa-z]/gi, '').toLowerCase()
    const glue =
      (bare.length > 0 && bare.length <= 2) ||
      GLUE.has(bare) ||
      (keepTail && i === words.length - 2)
    out += glue ? NBSP : ' '
  }
  return out
}

/* строки тикера в hero */
const ACTIONS = [
  { icon: 'check', text: 'Принят заказ на 1 940 ₽' },
  { icon: 'clock', text: 'Массаж забронирован на 14:00' },
  { icon: 'bag', text: 'Минибар пополнен за 18 минут' },
  { icon: 'globe', text: 'Гость переключился на English' },
]

/* ротация показателей, плюс и минус к 25 не подряд */
const METRICS = [
  { v: 25, prefix: '+', suffix: '%', label: 'к продажам допуслуг, NPS и возврату гостей' },
  { v: 27.6, prefix: '+', suffix: '%', fraction: 1, label: 'рост рынка допуслуг отелей России за 2024 год' },
  { v: 25, prefix: '−', suffix: '%', label: 'выручки от допуслуг теряет отель без Telier' },
  { v: 5, suffix: '%', label: 'комиссии, больше никаких платежей' },
]

/* сцены продукта, описания держать в две строки иначе мокап прыгает */
/* порядок согласован язык предпоследним, чат последним */
const SCENES = [
  {
    title: 'Единый вход',
    desc: 'Гость регистрируется один раз, и все сервисы отеля уже внутри.',
    img: asset('/assets/mock-onboarding.png'),
    webp: asset('/assets/mock-onboarding.webp'),
  },
  {
    title: 'Точный заказ в пару касаний',
    desc: 'Еда, спа и уборка со счётом на номер, без карты и ожидания.',
    img: asset('/assets/mock-massage.png'),
    webp: asset('/assets/mock-massage.webp'),
  },
  {
    title: 'Говорит на языке гостя',
    desc: 'Интерфейс настраивается под нужный язык.',
    img: asset('/assets/mock-language.png'),
    webp: asset('/assets/mock-language.webp'),
  },
  {
    title: 'Персональный чат 24/7',
    desc: 'Любой вопрос решается в переписке, ресепшн разгружен.',
    img: asset('/assets/mock-chat.png'),
    webp: asset('/assets/mock-chat.webp'),
  },
]

/* четыре карточки со слайда преимуществ, описания из макета, ill это базовое
   имя файла в assets/illustrations, у интеграции иллюстрации пока нет */
const USP = [
  {
    ill: 'usp-suitcase',
    t: 'Полноценное мобильное приложение',
    d: 'Не чат-бот и не виджет. Нативное приложение с безупречным UX остаётся у гостя на телефоне и возвращает его в ваш отель снова.',
  },
  {
    ill: 'usp-key',
    t: 'Интеграция с системами отеля',
    d: 'Бесшовное подключение к PMS, Rkeeper, iiko, умным замкам и сайту. Данные синхронизируются сами, без дополнительных настроек.',
  },
  {
    ill: 'usp-gift',
    t: 'Бесплатное внедрение и поддержка',
    d: 'Интеграция, обучение персонала и промо-материалы за наш счёт. Вы не несёте затрат на запуск и работу сервиса.',
  },
  {
    ill: 'usp-pie',
    t: 'Оплата только',
    t2: 'с транзакций',
    d: 'Без абонентской платы и скрытых платежей. Только 5% от заказов через приложение. Мы заинтересованы в вашем доходе.',
  },
]

/* ячейки бенто из макета, сервисы гостя по важности сценария;
   icon это имя файла в assets/icons, отельная ячейка тёмная */
const BENTO = [
  { t: 'Заказ еды', icon: 'food', mod: 'accent' },
  { t: 'Пополнение минибара', icon: 'minibar' },
  { t: 'Спа и массаж', icon: 'spa' },
  { t: 'Трансфер', icon: 'transfer' },
  { t: 'Уборка и стирка', icon: 'laundry' },
  { t: 'Бронирование стола', icon: 'table' },
  { t: 'Открытие номера', icon: 'key' },
  { t: 'Чат с персоналом 24/7', icon: 'chat' },
  { t: 'Профиль и история', icon: 'profile' },
  { t: 'Личные предложения', icon: 'offer' },
  { t: 'Аналитика по гостям, push и шахматка заказов', icon: 'analytics', mod: 'hotel' },
]

/* отельные пункты третьей полоски, из страницы 5 макета, чипы тёмные */
const HOTEL_POINTS = [
  { t: 'Аналитика по гостям', icon: 'analytics', mod: 'hotel' },
  { t: 'Push-уведомления', icon: 'push', mod: 'hotel' },
  { t: 'Шахматка заказов', icon: 'board', mod: 'hotel' },
]

/* разворот из макета владельцу прибыль, управляющему спокойствие */
const ROLES = {
  /* хвост первой строки ставит css на десктопе точка, на мобилке многоточие */
  lines: [
    { text: 'Владельцу рост прибыли' },
    { text: 'Управляющему спокойствие.' },
  ],
  cols: [
    {
      who: 'Владельцу',
      text: 'Прозрачная аналитика по допуслугам, среднему чеку и NPS.',
      textMob: 'Прозрачная аналитика допуслуг, среднего чека и NPS.',
    },
    { who: 'Управляющему', text: 'Разгруженный ресепшн, довольные гости и лёгкое внедрение.' },
  ],
  /* подтверждение из макета про обоих деньги на столе и вход без риска */
  more: 'Без Тельера отель оставляет деньги на столе. Мы уверены в этом настолько, что даём бесплатный вход и берём оплату только с результата.',
}

const Icon = ({ name }) => {
  const shapes = {
    check: <path d="M4.5 12.5 9.5 17.5 19.5 7" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.2V12l3.4 2" />
      </>
    ),
    bag: (
      <>
        <path d="M5.6 8h12.8l-1 12H6.6l-1-12Z" />
        <path d="M9.2 8V6.6a2.8 2.8 0 0 1 5.6 0V8" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17" />
        <path d="M12 3.5c2.2 2.4 3.4 5.3 3.4 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.4-5.3-3.4-8.5S9.8 5.9 12 3.5Z" />
      </>
    ),
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {shapes[name]}
    </svg>
  )
}

function useInView(threshold = 0.4) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return [ref, inView]
}

function Cta({ className = '', children, disabled, ...rest }) {
  return (
    <button
      type="button"
      className={`btn-start ${className}`.trim()}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  )
}

/* маска телефона +7 (999) 888-77-66 */
const PHONE_PREFIX = '+7 ('

function phoneDigits(v) {
  return v.replace(/\D/g, '').replace(/^[78]/, '')
}

function isPhoneComplete(v) {
  return phoneDigits(v).length === 10
}

function fmtPhone(v) {
  const d = phoneDigits(v).slice(0, 10)
  if (!d.length) return ''
  let out = PHONE_PREFIX + d.slice(0, 3)
  if (d.length >= 4) out += ') ' + d.slice(3, 6)
  if (d.length >= 7) out += '-' + d.slice(6, 8)
  if (d.length >= 9) out += '-' + d.slice(8, 10)
  return out
}

const PhoneForm = forwardRef(function PhoneForm({ cta, onCtaClick, ctaDisabled }, ref) {
  const [val, setVal] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null)
  const inputRef = useRef(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((type, message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ type, message })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  /* открытая клавиатура перекрывает плашку подводим её к верхнему краю
     клавиатуры, после закрытия перевыравнивание скролла вернёт остановку */
  const keyboardTimers = useRef([])

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    keyboardTimers.current.forEach(clearTimeout)
  }, [])

  const alignToKeyboard = useCallback(() => {
    const vv = window.visualViewport
    const pill = inputRef.current?.closest('.lead-pill')
    if (!vv || !pill) return
    /* низ плашки на 16px выше верхнего края клавиатуры */
    const delta = pill.getBoundingClientRect().bottom + 16 - (vv.offsetTop + vv.height)
    if (Math.abs(delta) > 4) nudgeScroll(delta)
  }, [])

  const onFocusAlign = useCallback(() => {
    keyboardTimers.current.forEach(clearTimeout)
    /* два прохода клавиатура выезжает не мгновенно */
    keyboardTimers.current = [350, 700].map((ms) => setTimeout(alignToKeyboard, ms))
  }, [alignToKeyboard])

  /* каретка не уходит левее префикса «+7 (» */
  const keepCaret = () => {
    const el = inputRef.current
    if (!el || !el.value.startsWith(PHONE_PREFIX)) return
    const min = PHONE_PREFIX.length
    if (el.selectionStart >= min && el.selectionEnd >= min) return
    el.setSelectionRange(Math.max(el.selectionStart, min), Math.max(el.selectionEnd, min))
  }

  const toEnd = () => {
    const el = inputRef.current
    if (el) el.setSelectionRange(el.value.length, el.value.length)
  }

  const focus = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    setVal((v) => v || PHONE_PREFIX)
    requestAnimationFrame(toEnd)
  }, [])

  const submit = useCallback(async () => {
    if (sending) return
    if (!isPhoneComplete(val)) {
      showToast('err', 'Введите полный номер телефона')
      focus()
      return
    }
    if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
      showToast('err', 'Сервис временно недоступен')
      return
    }
    setSending(true)
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        { phone: val, to_email: CONTACT_EMAIL },
        EMAILJS_PUBLIC_KEY,
      )
      showToast('ok', 'Заявка отправлена, мы скоро свяжемся')
      setVal('')
    } catch {
      showToast('err', 'Не удалось отправить, попробуйте позже')
    } finally {
      setSending(false)
    }
  }, [val, sending, showToast, focus])

  const tryHero = useCallback(() => {
    if (isPhoneComplete(val)) submit()
    else {
      showToast('err', 'Введите полный номер телефона')
      focus()
    }
  }, [val, submit, showToast, focus])

  useImperativeHandle(ref, () => ({ focus, submit, tryHero }), [focus, submit, tryHero])

  return (
    <>
      <div className={`lead-pill${toast?.type === 'err' && !isPhoneComplete(val) ? ' lead-pill--error' : ''}`}>
        <input
          ref={inputRef}
          type="tel"
          placeholder="Ваш номер"
          aria-label="Ваш номер телефона"
          value={val}
          disabled={sending}
          onChange={(e) => setVal(fmtPhone(e.target.value) || PHONE_PREFIX)}
          onFocus={() => {
            setVal((v) => v || PHONE_PREFIX)
            requestAnimationFrame(toEnd)
            onFocusAlign()
          }}
          onBlur={() => {
            keyboardTimers.current.forEach(clearTimeout)
            keyboardTimers.current = []
            if (val === PHONE_PREFIX) setVal('')
          }}
          onSelect={keepCaret}
          onClick={keepCaret}
        />
        <Cta disabled={sending || ctaDisabled} onClick={onCtaClick}>
          {sending ? 'Отправка…' : cta}
        </Cta>
      </div>
      {toast &&
        createPortal(
          <div className={`form-toast form-toast--${toast.type}`} role="status">
            {toast.message}
          </div>,
          document.body,
        )}
    </>
  )
})

/* ============ Hero ============ */
function ActionTicker() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % ACTIONS.length), 2600)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="ticker" aria-live="polite">
      <div className="ticker-label">Тельер для всех задач</div>
      <div className="ticker-row" key={i}>
        <span className="ticker-icon"><Icon name={ACTIONS[i].icon} /></span>
        {ACTIONS[i].text}
      </div>
    </div>
  )
}

function Hero({ heroRef, phoneFormRef, onDemoClick }) {
  return (
    <section ref={heroRef} className="panel hero">
      <div className="container hero-grid">
        <div className="hero-copy">
          <img className="hero-logo" src={asset('/assets/logo.svg')} alt="Тельер" />
          <h1>Все услуги отеля в одном приложении</h1>
          <ActionTicker />
        </div>
      </div>
      {/* webp в восемь раз легче, png остаётся фолбэком для старых браузеров */}
      <picture>
        <source type="image/webp" srcSet={asset('/assets/hero-hand.webp')} />
        <img className="hero-hand" src={asset('/assets/hero-hand.png')} alt="Приложение Тельер в руке гостя" />
      </picture>
      <div className="hero-lead">
        <PhoneForm ref={phoneFormRef} cta="Заказать демо" onCtaClick={onDemoClick} />
      </div>
    </section>
  )
}

/* ============ Цифры ============ */
function Numbers() {
  const [ref, inView] = useInView(0.5)
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!inView) return
    const t = setInterval(() => setI((x) => (x + 1) % METRICS.length), 3400)
    return () => clearInterval(t)
  }, [inView])
  const m = METRICS[i]
  return (
    <section ref={ref} className="panel numbers">
      <div className="metric-big">
        <NumberFlow
          value={inView ? m.v : 0}
          prefix={m.prefix}
          suffix={m.suffix}
          format={m.fraction ? { minimumFractionDigits: m.fraction, maximumFractionDigits: m.fraction } : undefined}
          transformTiming={{ duration: 850, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' }}
        />
      </div>
      <div className="metric-label" key={'l' + i}>{typo(m.label)}</div>
    </section>
  )
}

/* ============ Продукт sticky-сцена ============ */
/* кривые в scene-timing.js, здесь только раскладка значений по DOM */
function ProductSticky() {
  const trackRef = useRef(null)
  const capRefs = useRef([])
  const shotRefs = useRef([])

  useEffect(() => {
    const n = SCENES.length
    let prev = -1

    const apply = () => {
      const el = trackRef.current
      if (!el) return
      const p = trackProgress(el)
      if (Math.abs(p - prev) < 0.0001) return
      prev = p

      for (let i = 0; i < n; i++) {
        const { shot: shotStyle, text: textStyle } = sceneStyle(p, i, n)

        const cap = capRefs.current[i]
        if (cap) {
          cap.style.opacity = textStyle.opacity
          cap.style.transform = `translate3d(0, ${textStyle.translateY}px, 0)`
        }

        const shot = shotRefs.current[i]
        if (shot) {
          shot.style.opacity = shotStyle.opacity
          shot.style.transform = `translate3d(0, ${shotStyle.translateY}%, 0) scale(${shotStyle.scale})`
        }
      }
    }

    apply()
    const off = onFrame(apply)
    const onResize = () => {
      prev = -1
      apply()
    }
    window.addEventListener('resize', onResize)
    return () => {
      off()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <section ref={trackRef} className="product-track">
      <div className="product-stage">
        <div className="stage-inner container">
          <div className="stage-text">
            {SCENES.map((s, d) => (
              <div className="stage-caption" key={s.title} ref={(el) => (capRefs.current[d] = el)}>
                <h2>{typo(s.title)}</h2>
                <p>{typo(s.desc)}</p>
              </div>
            ))}
          </div>
          <div className="stage-shots">
            {SCENES.map((s, d) => (
              <picture key={s.title}>
                <source type="image/webp" srcSet={s.webp} />
                <img ref={(el) => (shotRefs.current[d] = el)} src={s.img} alt={s.title} />
              </picture>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============ Манифест ============ */
/* целевые сообщения из макета барьер заказа, статус против qr-страниц,
   владельцу прибыль и управляющему спокойствие, пока тестируем первое */
const STATEMENT = {
  lines: [
    { text: 'Гость не звонит на ресепшн,', muted: false },
    { text: 'он просто не заказывает', muted: false },
  ],
  note: 'Тельер убирает этот барьер, заказ занимает пару касаний прямо из номера.',
}

/* строки открываются из-под маски слово за словом, обратный скролл прячет всё разом;
   children встают между заголовком и подписью, на этом же ревиле построен экран ролей */
function Statement({ lines = STATEMENT.lines, note = STATEMENT.note, className = '', children }) {
  const [ref, inView] = useInView(0.5)
  let n = 0
  return (
    <section
      ref={ref}
      className={`panel statement${className ? ` ${className}` : ''}${inView ? ' in-view' : ''}`}
    >
      <h2 className="statement-title">
        {lines.map((line) => (
          <span className={`st-line${line.muted ? ' st-muted' : ''}`} key={line.text}>
            {line.text.split(' ').map((w, wi) => (
              <span className="st-word" style={{ '--d': n++ }} key={wi}>
                {w}
              </span>
            ))}
          </span>
        ))}
      </h2>
      {children}
      {note && (
        <p className="statement-note" style={{ '--d': n }}>
          {typo(note)}
        </p>
      )}
    </section>
  )
}

/* ============ Практика ============ */
/* мировые цифры со страницы 7 крупно, проблема со страницы 3 одной строкой */
function Practice() {
  const [ref, inView] = useInView(0.4)
  return (
    <section ref={ref} className={`panel practice${inView ? ' in-view' : ''}`}>
      <div className="container">
        <p className="practice-label">{typo('Мировая практика говорит сама за себя')}</p>
        <h2 className="practice-claim">
          {typo('Консьерж в приложении приносит')}
          <br className="only-wide" /> {typo('отелю')}{' '}
          <span className="practice-accent">{typo('до 25%')}</span>{' '}
          {typo('к продажам допуслуг,')}
          <br className="only-wide" /> {typo('растит NPS и возврат гостей')}
        </h2>
        <p className="practice-support">
          {typo('Гости отелей 4 и 5 звёзд готовы заказывать допуслуги, но')}{' '}
          <span className="nw">звонок на ресепшн</span>{' '}
          {typo('или QR-страница создают барьер, и отель недополучает до четверти возможной выручки. Тельер построен на мировой практике и адаптирован под российские реалии без компромиссов в качестве.')}
        </p>
      </div>
    </section>
  )
}

/* ============ Сервисы бенто ============ */
/* десктоп сетка из макета, еда тёплым акцентом, отельная ячейка тёмная;
   мобилка две встречные бесконечные строки чипов и отельная плашка */
function BentoCell({ cell, i = 0, hidden = false }) {
  return (
    <div
      className={`bento-cell${cell.mod ? ` bento-cell--${cell.mod}` : ''}`}
      style={{ '--i': i }}
      aria-hidden={hidden || undefined}
    >
      {/* без lazy ленивые иконки подгружались в момент входа на экран и дёргали ленты */}
      {cell.icon && <img className="bento-icon" src={asset(`/assets/icons/${cell.icon}.svg`)} alt="" />}
      <b>{typo(cell.t, false)}</b>
    </div>
  )
}

function Services() {
  const [ref, inView] = useInView(0.4)
  const guests = BENTO.filter((c) => c.mod !== 'hotel')
  return (
    <section ref={ref} className={`panel services${inView ? ' in-view' : ''}`}>
      <div className="container">
        <h2 className="services-title">
          {typo('Всё, что нужно гостю, в одном')}
          <br className="only-desk" /> {typo('приложении и едином стиле')}
        </h2>
        <div className="bento">
          {BENTO.map((c, i) => (
            <BentoCell cell={c} i={i} key={c.t} />
          ))}
        </div>
        <div className="bento-rows">
          {/* третья полоска, отельные пункты, направления чередуются */}
          {[guests.slice(0, 5), guests.slice(5), HOTEL_POINTS].map((row, r) => (
            <div className={`bento-marq${r % 2 ? ' bento-marq--rev' : ''}`} key={r}>
              <div className="bento-run">
                {/* две копии строки дают бесшовный цикл, дубль скрыт от читалок */}
                {[false, true].map((hidden) => (
                  <div className="bento-set" key={String(hidden)}>
                    {row.map((c) => (
                      <BentoCell cell={c} hidden={hidden} key={c.t} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============ Преимущества ============ */
/* лента шире экрана, протяжка мышью и доводка в attachRailSnap */
function Hotel() {
  const [ref, inView] = useInView(0.3)
  const railRef = useRef(null)

  useEffect(() => attachRailSnap(railRef.current), [])

  return (
    <section ref={ref} className={`panel hotel ${inView ? 'in-view' : ''}`}>
      <div className="container hotel-inner">
        <h2 className="hotel-title">
          Преимущества<span className="only-mob"> сервиса</span>{NBSP}Telier
        </h2>
        <div className="usp-row" ref={railRef}>
          {USP.map((u, i) => (
            <div className="usp-col" key={u.t} style={{ '--i': i }}>
              <div className="usp-card">
                {u.ill && (
                  <picture className="usp-ill">
                    <source type="image/webp" srcSet={asset(`/assets/illustrations/${u.ill}.webp`)} />
                    <img src={asset(`/assets/illustrations/${u.ill}.png`)} alt="" loading="lazy" />
                  </picture>
                )}
                <div className="usp-text">
                  <b>
                    {typo(u.t)}
                    {u.t2 && (
                      <>
                        <br /> {typo(u.t2)}
                      </>
                    )}
                  </b>
                  <p>{typo(u.d, false)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============ Роли ============ */
/* разворот из макета на сплит-ревиле манифеста, под заголовком две карточки
   сути, на мобилке карточки листаются каруселью, и активной карточке
   отвечает своя строка заголовка */
function Roles() {
  const railRef = useRef(null)
  const [act, setAct] = useState(0)

  useEffect(() => {
    const el = railRef.current
    if (!el) return
    const detach = attachRailSnap(el)
    /* активная карточка по середине запаса прокрутки, карточек две */
    const onScroll = () => {
      const span = el.scrollWidth - el.clientWidth
      if (span > 8) setAct(el.scrollLeft > span / 2 ? 1 : 0)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      detach()
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <Statement className={`roles roles-act-${act}`} lines={ROLES.lines} note={null}>
      <div className="roles-cols" ref={railRef}>
        {ROLES.cols.map((c, i) => (
          <div className="roles-card" style={{ '--i': i }} key={c.who}>
            <div className="roles-card-who">{c.who}</div>
            {/* textMob подменяет формулировку только на мобилке */}
            <p>
              {c.textMob ? (
                <>
                  <span className="only-desk">{typo(c.text)}</span>
                  <span className="only-mob">{typo(c.textMob)}</span>
                </>
              ) : (
                typo(c.text)
              )}
            </p>
          </div>
        ))}
      </div>
      {/* статичное подтверждение под каруселью, живёт только на мобилке */}
      <div className="roles-detail">
        <p>{typo(ROLES.more)}</p>
      </div>
    </Statement>
  )
}

/* ============ Футер ============ */
/* курсор из макета поверх слова «больше» */
const CursorMark = () => (
  <svg className="cursor-mark" viewBox="0 0 26.45 26.45" fill="none" aria-hidden="true">
    <path
      d="M2.066 1.289a1.13 1.13 0 0 1 1.196-.264l20.7 7.34c.457.163.763.592.764 1.074 0 .482-.304.912-.76 1.076l-9.287 3.325a.29.29 0 0 0-.171.147l-3.192 9.054a1.13 1.13 0 0 1-1.087.765 1.13 1.13 0 0 1-1.085-.768L1.788 2.474a1.13 1.13 0 0 1 .278-1.185Z"
      fill="#131313"
      stroke="#ffffff"
      strokeWidth="1.91667"
      strokeLinejoin="round"
    />
  </svg>
)

function Footer({ footerRef, onDemoClick }) {
  const sheetRef = useRef(null)

  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return

    let prev = ''

    const apply = () => {
      /* 860 согласован с css-брейкпоинтом мобилки */
      const mob = window.innerWidth <= 860
      const vh = window.innerHeight

      /* десктоп радиус едет с 62 до 24, мобилка всегда 32 */
      const rp = clamp(sheet.getBoundingClientRect().top / (vh * 0.34), 0, 1)
      const r = mob ? 32 : 24 + 38 * rp
      const key = `${mob}|${rp.toFixed(3)}`
      if (key === prev) return
      prev = key
      sheet.style.borderTopLeftRadius = sheet.style.borderTopRightRadius = `${r.toFixed(1)}px`
    }

    apply()
    return onFrame(apply)
  }, [])

  return (
    <section ref={footerRef} className="panel footer">
      <div className="footer-sheet" ref={sheetRef}>
        <div className="footer-inner">
          <div className="footer-left">
            <h2 className="footer-title">
              <span className="ft-line">Начните зарабатывать</span>
              <span className="ft-line ft-line2">
                <span className="ft-more">больше</span>
                <span>уже сегодня</span>
                <CursorMark />
              </span>
            </h2>
            <div className="footer-cta-slot">
              <Cta className="footer-cta" onClick={onDemoClick}>Заказать демо</Cta>
            </div>
          </div>

          <div className="footer-right">
            <div className="footer-col footer-col-how">
              <div className="footer-sub">Как это работает?</div>
              <p className="footer-how">
                Приедем, покажем, как работает, настроим
                <br />
                интеграцию и обучим персонал. Бесплатно.
                <br />
                Оставьте заявку, и мы свяжемся с вами
                <br />в течение 24 часов.
              </p>
            </div>

            <div className="footer-col footer-col-contacts">
              <div className="footer-sub">Контакты</div>
              <div className="footer-contacts">
                <a href={`tel:${PHONE.replace(/[^+\d]/g, '')}`}>{PHONE_LABEL}</a>
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </div>
            </div>

            <div className="footer-brand">
              <img src={asset('/assets/mark.svg')} alt="" className="footer-mark" />
              <p>
                © {new Date().getFullYear()} ООО «Тельер».
                <br />
                Все права защищены.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* слой mv grd из макета, 1440×306 под плашкой */}
      <img className="footer-wave" src={asset('/assets/footer-wave.png')} alt="" aria-hidden="true" />
    </section>
  )
}

const DEBUG = new URLSearchParams(window.location.search).has('debug')

/* живые размеры вьюпорта на экране, для разбора мобильных браузеров */
function DebugHud({ scrollerRef }) {
  const [line, setLine] = useState('')
  useEffect(() => {
    const t = setInterval(() => {
      const vv = window.visualViewport
      const el = scrollerRef.current
      const ah = getComputedStyle(document.documentElement).getPropertyValue('--app-h').trim()
      setLine(
        `in ${window.innerWidth}×${window.innerHeight} | ` +
          (vv ? `vv ${Math.round(vv.width)}×${Math.round(vv.height)}+${Math.round(vv.offsetTop)} | ` : '') +
          (el ? `sc ${el.clientHeight} y${Math.round(el.scrollTop)}/${el.scrollHeight} | ` : '') +
          `ah ${ah || 'auto'} | ${document.documentElement.className || 'no-flags'}`,
      )
    }, 300)
    return () => clearInterval(t)
  }, [scrollerRef])
  return <div className="debug-hud">{line}</div>
}

export default function App() {
  const scrollerRef = useRef(null)
  useSmoothScroll(scrollerRef)

  /* высота секций заморожена в px обновляется на реальный resize,
     клавиатура (фокус в поле) раскладку не меняет */
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      if (isEditable(document.activeElement)) return
      const w = window.innerWidth
      const h = window.innerHeight
      root.style.setProperty('--app-h', `${h}px`)
      root.classList.toggle('is-compact', w <= 860 && h <= 740)
      root.classList.toggle('is-portrait', h > w)
      root.classList.toggle('is-tall', h >= 560)
    }
    /* ресайз, съеденный заморозкой при фокусе, доигрывается после ухода фокуса */
    const onFocusOut = () => requestAnimationFrame(apply)
    apply()
    window.addEventListener('resize', apply)
    window.addEventListener('focusout', onFocusOut)
    window.visualViewport?.addEventListener('resize', apply)
    return () => {
      window.removeEventListener('resize', apply)
      window.removeEventListener('focusout', onFocusOut)
      window.visualViewport?.removeEventListener('resize', apply)
    }
  }, [])

  const heroRef = useRef(null)
  const footerRef = useRef(null)
  const phoneFormRef = useRef(null)
  const [heroSeen, setHeroSeen] = useState(true)
  const [footerSeen, setFooterSeen] = useState(false)

  const handleDemoClick = useCallback((source) => {
    const form = phoneFormRef.current
    if (!form) return
    if (source === 'hero') form.tryHero()
    else scrollToHero(() => form.focus())
  }, [])

  useEffect(() => {
    const io1 = new IntersectionObserver(([e]) => setHeroSeen(e.isIntersecting), { threshold: 0.3 })
    const io2 = new IntersectionObserver(([e]) => setFooterSeen(e.isIntersecting), { threshold: 0.3 })
    if (heroRef.current) io1.observe(heroRef.current)
    if (footerRef.current) io2.observe(footerRef.current)
    return () => {
      io1.disconnect()
      io2.disconnect()
    }
  }, [])
  const chromeShown = !heroSeen && !footerSeen
  return (
    <>
      <header className={`header ${footerSeen ? 'hidden' : ''}`}>
        <div className="container header-row">
          <img className={`logo header-fly ${chromeShown ? 'show' : ''}`} src={asset('/assets/logo.svg')} alt="Тельер" />
          <Cta
            className={`header-fly ${chromeShown ? 'show' : ''}`}
            tabIndex={chromeShown ? 0 : -1}
            onClick={() => handleDemoClick('scroll')}
          >
            Заказать демо
          </Cta>
        </div>
      </header>
      <main className="snap" ref={scrollerRef}>
        <div className="snap-inner">
          {/* повествование обещание, цифры, проблема, доказательство,
              продукт в действии, всё внутри, условия, итог по ролям, CTA */}
          <Hero heroRef={heroRef} phoneFormRef={phoneFormRef} onDemoClick={() => handleDemoClick('hero')} />
          <Numbers />
          <Statement />
          <Practice />
          <ProductSticky />
          <Services />
          <Hotel />
          <Roles />
          <Footer footerRef={footerRef} onDemoClick={() => handleDemoClick('scroll')} />
        </div>
      </main>
      {/* волна за полупрозрачной нижней панелью браузера фикс-слой ниже вьюпорта */}
      <div className={`footer-under${footerSeen ? ' show' : ''}`} aria-hidden="true">
        <img src={asset('/assets/footer-wave.png')} alt="" />
      </div>
      {DEBUG && <DebugHud scrollerRef={scrollerRef} />}
    </>
  )
}
