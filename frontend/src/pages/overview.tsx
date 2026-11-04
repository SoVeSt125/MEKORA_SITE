import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Boxes,
  CircleCheck,
  TriangleAlert,
  Radio,
  SlidersHorizontal,
} from 'lucide-react'
import { api, send, dateTime } from '../services/api'
import { useApp } from '../app'
import type { Motor, Catalog, Alert } from '../types'
import { Button } from '../components/ui/button'
import { Modal } from '../components/ui/dialog'
import {
  Empty,
  ErrorBox,
  Field,
  Form,
  Loading,
  MotorTable,
  PageHead,
  EVENT_STATUS,
} from '../components/shared'

export function MotorEditor({ open, onClose, motor }: { open: boolean; onClose: () => void; motor?: Motor }) {
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api<Catalog>('/catalog') })
  return (
    <Modal
      title={motor ? 'Параметры двигателя' : 'Добавить электродвигатель'}
      description="Укажите паспортные данные. Температурное ограничение задаётся по документации оборудования, а не автоматически."
      open={open}
      onClose={onClose}
    >
      <ErrorBox error={catalog.error} />
      {!catalog.data?.assets.length ? (
        <Empty
          title="Сначала добавьте агрегат"
          text="Создайте предприятие, цех и агрегат, к которому относится двигатель."
        >
          <Button asChild>
            <Link to="/enterprises" onClick={onClose}>
              Настроить структуру <ArrowRight size={16} />
            </Link>
          </Button>
        </Empty>
      ) : (
        <Form
          onSuccess={onClose}
          submit={motor ? 'Сохранить изменения' : 'Добавить двигатель'}
          onSave={(data) => {
            const values = Object.fromEntries(data)
            return send(
              '/motors' + (motor ? '/' + motor.id : ''),
              {
                ...values,
                power_kw: Number(values.power_kw),
                rpm: Number(values.rpm),
                temperature_limit_c:
                  values.temperature_limit_c === '' ? null : Number(values.temperature_limit_c),
              },
              motor ? 'PUT' : 'POST',
            )
          }}
        >
          <div className="form-grid">
            <Field label="Название двигателя">
              <input
                name="name"
                required
                maxLength={160}
                defaultValue={motor?.name}
                placeholder="Например, двигатель насоса №12"
              />
            </Field>
            <Field label="Агрегат">
              <select name="asset_id" defaultValue={motor?.asset_id}>
                {catalog.data.assets.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name} · {a.inventory_number}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Модель">
              <input
                name="model"
                maxLength={100}
                defaultValue={motor?.model}
                placeholder="По паспорту двигателя"
              />
            </Field>
            <Field label="Серийный номер">
              <input name="serial_number" maxLength={100} defaultValue={motor?.serial_number} />
            </Field>
            <Field label="Мощность, кВт">
              <input
                name="power_kw"
                type="number"
                step="0.01"
                min="0.01"
                max="100000"
                required
                defaultValue={motor?.power_kw ?? 7.5}
              />
            </Field>
            <Field label="Номинальные обороты, об/мин">
              <input
                name="rpm"
                type="number"
                min="1"
                max="100000"
                required
                defaultValue={motor?.rpm ?? 1500}
              />
            </Field>
            <Field label="Ответственный инженер">
              <input name="engineer" maxLength={120} defaultValue={motor?.engineer} />
            </Field>
            <Field
              label="Ограничение температуры, °C"
              hint="Необязательно. Введите допустимое значение из технической документации."
            >
              <input
                name="temperature_limit_c"
                type="number"
                min="-50"
                max="200"
                step="0.1"
                defaultValue={motor?.temperature_limit_c ?? ''}
                placeholder="Не задано"
              />
            </Field>
          </div>
        </Form>
      )}
    </Modal>
  )
}

export function Overview() {
  const { organization, canEdit } = useApp()
  const motors = useQuery({ queryKey: ['motors'], queryFn: () => api<Motor[]>('/motors') })
  const events = useQuery({ queryKey: ['alerts'], queryFn: () => api<Alert[]>('/alerts') })
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api<Catalog>('/catalog') })
  const [workshop, setWorkshop] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [eventHours, setEventHours] = useState(24)
  const [adding, setAdding] = useState(false)
  const base = (motors.data || []).filter(
    (m) =>
      (!organization || m.organization.id === organization) &&
      (!workshop || m.workshop.id === workshop) &&
      (!category || m.asset.category === category),
  )
  const attention = base.filter((m) =>
    status ? m.status === status : ['warning', 'critical', 'offline', 'quality'].includes(m.status),
  )
  const ids = new Set(base.map((m) => m.id))
  const recentEvents = (events.data || [])
    .filter(
      (a) => ids.has(a.motor_id) && Date.now() - new Date(a.opened_at).getTime() <= eventHours * 3600000,
    )
    .slice(0, 5)
  const stats = [
    {
      label: 'Всего двигателей',
      value: base.length,
      note: 'Учтено в системе',
      icon: Boxes,
      variant: 'total',
    },
    {
      label: 'В нормальном состоянии',
      value: base.filter((m) => m.status === 'normal').length,
      note: 'Относительно утверждённой базы',
      icon: CircleCheck,
      variant: 'normal',
    },
    {
      label: 'С отклонениями',
      value: base.filter((m) => ['warning', 'critical', 'quality'].includes(m.status)).length,
      note: 'Требуют внимания инженера',
      icon: TriangleAlert,
      variant: 'warning',
    },
    {
      label: 'Без связи',
      value: base.filter((m) => m.status === 'offline').length,
      note: 'Нет свежих измерений',
      icon: Radio,
      variant: 'offline',
    },
  ]
  return (
    <>
      <PageHead
        eyebrow="ОБЗОР СИСТЕМЫ"
        title="Мониторинг оборудования"
        text={
          motors.data
            ? 'Обновлено ' + dateTime(new Date(motors.dataUpdatedAt).toISOString())
            : 'Техническое состояние вашего предприятия'
        }
        actions={
          canEdit && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={17} /> Добавить двигатель
            </Button>
          )
        }
      />
      <ErrorBox error={motors.error || events.error} />
      {motors.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="stats-grid">
            {stats.map((s) => (
              <section className={'stat-card stat-' + s.variant} key={s.label}>
                <div className="stat-top">
                  <span>{s.label}</span>
                  <s.icon size={18} />
                </div>
                <div className="stat-value">{s.value.toString().padStart(2, '0')}</div>
                <div className="stat-note">
                  <span className="status-dot" />
                  {s.note}
                </div>
              </section>
            ))}
          </div>
          {base.some((m) => m.status === 'insufficient') && (
            <p className="quiet-note">
              {base.filter((m) => m.status === 'insufficient').length} двиг. ожидают данных или утверждения
              базового уровня. Они ещё не оцениваются как исправные.
            </p>
          )}
          <div className="filter-row">
            <SlidersHorizontal size={17} />
            <select
              aria-label="Фильтр по цеху"
              value={workshop}
              onChange={(e) => setWorkshop(e.target.value)}
            >
              <option value="">Все цеха</option>
              {catalog.data?.workshops
                .filter((w) => !organization || w.organization_id === organization)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
            <select
              aria-label="Тип оборудования"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Все типы оборудования</option>
              {[...new Set(catalog.data?.assets.map((a) => a.category))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              aria-label="Состояние оборудования"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Требующие внимания</option>
              <option value="normal">В норме</option>
              <option value="insufficient">Недостаточно данных</option>
              <option value="warning">Требует проверки</option>
              <option value="critical">Превышение ограничения</option>
              <option value="offline">Нет связи</option>
              <option value="quality">Ошибка измерения</option>
              <option value="mode_changed">Другой рабочий режим</option>
            </select>
          </div>
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>
                  {status ? 'Оборудование по фильтру' : 'Требуют внимания'}{' '}
                  <span className="counter">{attention.length}</span>
                </h2>
                <p className="muted">Отклонения и устройства, для которых нужна проверка</p>
              </div>
              <Link className="text-link" to="/equipment">
                Всё оборудование <ArrowUpRight size={16} />
              </Link>
            </div>
            {attention.length ? (
              <MotorTable motors={attention} />
            ) : base.length ? (
              <Empty
                title="По выбранным условиям событий нет"
                text="Мониторинг продолжается. Историю и базовые уровни можно посмотреть в карточке двигателя."
              />
            ) : (
              <Empty
                title="Начните с вашего оборудования"
                text="Создайте предприятие и цех, добавьте двигатель и подключите виртуальный датчик."
              >
                {canEdit && (
                  <Button asChild>
                    <Link to="/enterprises">
                      Настроить предприятие <ArrowRight size={16} />
                    </Link>
                  </Button>
                )}
              </Empty>
            )}
          </section>
          <div className="overview-bottom">
            <section className="panel">
              <div className="section-head">
                <h2>Последние события</h2>
                <select
                  aria-label="Время события"
                  value={eventHours}
                  onChange={(e) => setEventHours(Number(e.target.value))}
                >
                  <option value={1}>За час</option>
                  <option value={24}>За сутки</option>
                  <option value={168}>За неделю</option>
                </select>
              </div>
              {recentEvents.length ? (
                <div className="event-list">
                  {recentEvents.map((a) => (
                    <Link key={a.id} to={'/events?alert=' + a.id} className="event-row">
                      <span className={'event-dot severity-' + a.severity} />
                      <div>
                        <strong>{a.title}</strong>
                        <p>
                          {a.motor_name} · {EVENT_STATUS[a.status]}
                        </p>
                      </div>
                      <time>{dateTime(a.opened_at)}</time>
                      <ArrowUpRight size={16} />
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Событий пока нет"
                  text="Подтверждённые отклонения и потери связи появятся здесь."
                />
              )}
            </section>
            <section className="insight-panel">
              <div className="eyebrow">MEKORA INTELLIGENCE</div>
              <ChartMark />
              <h2>
                От сигнала
                <br />к понятному действию.
              </h2>
              <p>Устойчивые изменения, проверяемые правила и история решений инженера.</p>
              <Link to="/analytics">
                Открыть аналитику <ArrowUpRight size={17} />
              </Link>
            </section>
          </div>
        </>
      )}
      <MotorEditor open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
function ChartMark() {
  return (
    <svg className="chart-mark" viewBox="0 0 240 70" aria-hidden="true">
      <path d="M0 48H44l10-10 13 22 12-43 13 36 12-15 12 6h32l12-7 11 11h69" />
    </svg>
  )
}

export function Equipment() {
  const { organization, canEdit } = useApp()
  const [params] = useSearchParams()
  const [archived, setArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState(params.get('search') || '')
  useEffect(() => {
    setSearch(params.get('search') || '')
  }, [params])
  const query = useQuery({
    queryKey: ['motors', archived],
    queryFn: () => api<Motor[]>('/motors?archived=' + archived),
  })
  const rows =
    query.data?.filter(
      (m) =>
        (!organization || m.organization.id === organization) &&
        (m.name + m.asset.name + m.serial_number).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    ) || []
  return (
    <>
      <PageHead
        eyebrow="РЕЕСТР ОБОРУДОВАНИЯ"
        title="Электродвигатели"
        text="Паспорт, история измерений и состояние каждого агрегата."
        actions={
          canEdit && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={17} /> Добавить двигатель
            </Button>
          )
        }
      />
      <div className="filter-row">
        <input
          aria-label="Поиск по реестру"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Название, агрегат или серийный номер"
        />
        <label className="checkbox">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Архив
          оборудования
        </label>
      </div>
      <ErrorBox error={query.error} />
      <section className="panel">
        {query.isPending ? (
          <Loading />
        ) : rows.length ? (
          <MotorTable motors={rows} />
        ) : (
          <Empty
            title={archived ? 'Архив пуст' : 'Двигателей пока нет'}
            text={
              search
                ? 'Попробуйте изменить поисковый запрос.'
                : 'Добавьте двигатель, чтобы начать собирать его измерения.'
            }
          />
        )}
      </section>
      <MotorEditor open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
