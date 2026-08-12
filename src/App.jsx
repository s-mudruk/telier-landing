import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react'
import { createPortal } from 'react-dom'
import emailjs from '@emailjs/browser'
import NumberFlow from '@number-flow/react'
import { useSmoothScroll, attachRailSnap, onFrame, clamp, sceneStyle, trackProgress, scrollToHero } from './scroll.js'

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
const EMAILJS_TO = 'artem_ermakov_1999@mail.ru'

const PHONE = '+7 495 975-97-90'
const PHONE_LABEL = '+7 (495) 975-97-90'

/* Короткие слова и предлоги не отрываются от следующего слова.
   keepTail дополнительно склеивает последние два слова строки. */
const GLUE = new Set([
  'в', 'во', 'и', 'а', 'к', 'с', 'со', 'о', 'об', 'у', 'на', 'не', 'по', 'из', 'от', 'до',
  'за', 'над', 'под', 'при', 'для', 'как', 'что', 'уже', 'мы', 'вы', 'но', 'же', 'ни', 'то', 'без',
])

const NBSP = '\u00A0'

function typo(src, keepTail = true) {
  const words = src.replace(/ /g, ' ').split(' ').filter(Boolean)
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

/* Живые действия сервиса: тикер в hero */
const ACTIONS = [
  { icon: 'check', text: 'Принят заказ на 1 940 ₽' },
  { icon: 'clock', text: 'Массаж забронирован на 14:00' },
  { icon: 'bag', text: 'Минибар пополнен за 18 минут' },
  { icon: 'globe', text: 'Гость переключился на English' },
]

/* Ротация показателей. Плюс и минус к 25 не должны идти подряд. */
const METRICS = [
  { v: 25, prefix: '+', suffix: '%', label: 'к продажам допуслуг, NPS и возврату гостей' },
  { v: 27.6, prefix: '+', suffix: '%', fraction: 1, label: 'рост рынка допуслуг отелей России за 2024 год' },
  { v: 25, prefix: '−', suffix: '%', label: 'выручки от допуслуг теряет отель без Telier' },
  { v: 5, suffix: '%', label: 'комиссии, больше никаких платежей' },
]

/* Сцены продукта. Описания держать в две строки на мобильном:
   иначе подписи разной высоты и мокап прыгает. */
const SCENES = [
  {
    title: 'Единый вход',
    desc: 'Гость регистрируется один раз, и все сервисы отеля уже внутри.',
    img: '/assets/mock-onboarding.png',
  },
  {
    title: 'Точный заказ в пару касаний',
    desc: 'Еда, спа и уборка со счётом на номер, без карты и ожидания.',
    img: '/assets/mock-massage.png',
  },
  {
    title: 'Персональный чат 24/7',
    desc: 'Любой вопрос решается в переписке, ресепшн разгружен.',
    img: '/assets/mock-chat.png',
  },
  {
    title: 'Говорит на языке гостя',
    desc: 'Интерфейс настраивается под нужный язык.',
    img: '/assets/mock-language.png',
  },
]

/* Карточки ленты. Описания держать в две строки на любой ширине. */
const USP = [
  {
    t: 'Не чат-бот и не виджет',
    d: 'Приложение остаётся у гостя после выезда и приводит его снова.',
  },
  {
    t: 'Встаёт в ваши системы',
    d: 'PMS, Rkeeper, iiko и умные замки подхватывают заказы сами.',
  },
  {
    t: 'Ноль затрат на старт',
    d: 'Интеграцию, обучение смены и промо берём на себя.',
  },
  {
    t: 'Оплата с результата',
    d: 'Только процент с заказов, которые сами вам и принесли.',
  },
  {
    t: 'Шахматка заказов',
    d: 'Кухня, спа и хаускипинг видят одну доску заказов.',
  },
  {
    t: 'Аналитика без выгрузок',
    d: 'Средний чек, выручка допуслуг и NPS в одном окне.',
  },
  {
    t: 'Push в нужный момент',
    d: 'Спа на 16:00 или ужин к заезду приходят вовремя.',
  },
]

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

/* Маска телефона +7 (999) 888-77-66 */
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

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  /* Каретка не уходит левее префикса «+7 (» */
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
        { phone: val, to_email: EMAILJS_TO },
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
          }}
          onBlur={() => {
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
          <img className="hero-logo" src="/assets/logo.svg" alt="Тельер" />
          <h1>Все услуги отеля в одном приложении</h1>
          <ActionTicker />
        </div>
      </div>
      <img className="hero-hand" src="/assets/hero-hand.png" alt="Приложение Тельер в руке гостя" />
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

/* ============ Продукт: sticky-сцена ============ */
/* Кривые в scene-timing.js, здесь только раскладка значений по DOM */
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
                <h2>{s.title}</h2>
                <p>{typo(s.desc)}</p>
              </div>
            ))}
          </div>
          <div className="stage-shots">
            {SCENES.map((s, d) => (
              <img
                key={s.title}
                ref={(el) => (shotRefs.current[d] = el)}
                src={s.img}
                alt={s.title}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============ Преимущества ============ */
/* Лента шире экрана. Протяжка мышью и доводка в attachRailSnap. */
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
              <div className="usp-media" aria-hidden="true" />
              <div className="usp-text">
                <b>{typo(u.t)}</b>
                <p>{typo(u.d, false)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============ Футер ============ */
/* Курсор из макета поверх слова «больше» */
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

    let prevR = -1

    const apply = () => {
      const mob = window.innerWidth <= 860
      const vh = window.innerHeight

      /* десктоп: радиус едет с 62 до 24, мобилка всегда 32 */
      const rp = clamp(sheet.getBoundingClientRect().top / (vh * 0.34), 0, 1)
      const r = mob ? 32 : 24 + 38 * rp
      if (Math.abs(rp - prevR) > 0.002) {
        prevR = rp
        sheet.style.borderTopLeftRadius = sheet.style.borderTopRightRadius = `${r.toFixed(1)}px`
      }
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
                <a href={`mailto:${EMAILJS_TO}`}>{EMAILJS_TO}</a>
              </div>
            </div>

            <div className="footer-brand">
              <img src="/assets/mark.svg" alt="" className="footer-mark" />
              <p>
                © {new Date().getFullYear()} ООО «Тельер».
                <br />
                Все права защищены.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* слой `mv grd` из макета, 1440×306 под плашкой */}
      <img className="footer-wave" src="/assets/footer-wave.png" alt="" aria-hidden="true" />
    </section>
  )
}

export default function App() {
  useSmoothScroll()
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
          <img className={`logo header-fly ${chromeShown ? 'show' : ''}`} src="/assets/logo.svg" alt="Тельер" />
          <Cta
            className={`header-start header-fly ${chromeShown ? 'show' : ''}`}
            tabIndex={chromeShown ? 0 : -1}
            onClick={() => handleDemoClick('scroll')}
          >
            Заказать демо
          </Cta>
        </div>
      </header>
      <main className="snap">
        <Hero heroRef={heroRef} phoneFormRef={phoneFormRef} onDemoClick={() => handleDemoClick('hero')} />
        <Numbers />
        <ProductSticky />
        <Hotel />
        <Footer footerRef={footerRef} onDemoClick={() => handleDemoClick('scroll')} />
      </main>
    </>
  )
}
