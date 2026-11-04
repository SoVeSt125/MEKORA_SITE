import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Pencil,
  Radio,
  Thermometer,
  Activity,
  BatteryMedium,
  Gauge,
  Download,
  CircleCheck,
  Archive,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Brush,
  Legend,
} from 'recharts'
import { api, send, dateTime, number } from '../services/api'
import { useApp } from '../app'
import type { Motor, Measurement, Alert } from '../types'
import { Button } from '../components/ui/button'
import { PageHead, ErrorBox, Loading, Empty, Status, ConfirmAction, EVENT_STATUS } from '../components/shared'
import { MotorEditor } from './overview'
import { RegisterDevice, DeviceControls } from './management'

const timeTick = (value: string) =>
  new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
function TelemetryChart({
  data,
  temperature,
  axes,
  baseline,
  limit,
  markerIds = [],
}: {
  data: Measurement[]
  temperature?: boolean
  axes?: boolean
  baseline?: number
  limit?: number | null
  markerIds?: string[]
}) {
  const colors = ['var(--green)', 'var(--cyan)', 'var(--amber)']
  const lines = temperature
    ? [{ key: 'temperature_c', name: 'Температура', color: colors[0] }]
    : axes
      ? ['x', 'y', 'z'].map((axis, i) => ({
          key: 'acceleration_rms_' + axis + '_g',
          name: 'Ось ' + axis.toUpperCase(),
          color: colors[i],
        }))
      : [{ key: 'acceleration_rms_g', name: 'Общий RMS', color: colors[1] }]
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 2, right: 18, top: 16, bottom: 2 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="measured_at"
            tickFormatter={timeTick}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            minTickGap={50}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={temperature ? ['auto', 'auto'] : [0, 'auto']}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            width={48}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => number(v, temperature ? 1 : 2)}
          />
          <Tooltip
            labelFormatter={(label) => dateTime(String(label))}
            formatter={(value, name) => [
              number(Number(value), temperature ? 1 : 4) + (temperature ? ' °C' : ' g'),
              name,
            ]}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text)',
            }}
          />
          {lines.map((line) => (
            <Line
              key={line.key}
              dataKey={line.key}
              name={line.name}
              stroke={line.color}
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
          {baseline != null && !axes && (
            <ReferenceLine
              y={baseline}
              stroke="var(--muted)"
              strokeDasharray="5 5"
              label={{ value: 'База', fill: 'var(--muted)', fontSize: 10, position: 'insideTopRight' }}
            />
          )}
          {limit != null && temperature && (
            <ReferenceLine
              y={limit}
              stroke="var(--red)"
              strokeDasharray="4 4"
              label={{ value: 'Ограничение', fill: 'var(--red)', fontSize: 10, position: 'insideTopRight' }}
            />
          )}
          {axes && <Legend />}
          {data
            .filter((r) => markerIds.includes(r.id))
            .map((r) => (
              <ReferenceLine
                key={r.id}
                x={r.measured_at}
                stroke="var(--amber)"
                strokeDasharray="3 4"
                label={{ value: 'Событие', fill: 'var(--amber)', fontSize: 9, position: 'insideTopRight' }}
              />
            ))}
          {data.length > 10 && (
            <Brush
              dataKey="measured_at"
              height={20}
              tickFormatter={timeTick}
              stroke="var(--border)"
              fill="var(--surface-alt)"
              travellerWidth={7}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
export function MotorPage() {
  const { id } = useParams()
  const { canEdit, settings } = useApp()
  const [hours, setHours] = useState(1)
  const [axes, setAxes] = useState(false)
  const [edit, setEdit] = useState(false)
  const [register, setRegister] = useState(false)
  const query = useQuery({ queryKey: ['motor', id], queryFn: () => api<Motor>('/motors/' + id) })
  const measurements = useQuery({
    queryKey: ['measurements', id, hours],
    queryFn: () =>
      api<{ items: Measurement[]; truncated: boolean }>('/motors/' + id + '/measurements?hours=' + hours),
  })
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: () => api<Alert[]>('/alerts') })
  if (query.isPending) return <Loading />
  if (!query.data) return <ErrorBox error={query.error} />
  const motor = query.data
  const last = motor.latest
  const data = measurements.data?.items || []
  const events = alerts.data?.filter((a) => a.motor_id === id) || []
  const markerIds = events.flatMap((a) => a.analysis.measurement_ids.slice(-1))
  return (
    <>
      <Link className="back-link" to="/equipment">
        <ArrowLeft size={15} /> К оборудованию
      </Link>
      <PageHead
        eyebrow={`${motor.organization.name} / ${motor.workshop.name} / ${motor.asset.inventory_number}`}
        title={motor.name}
        text={`${motor.asset.name} · ${motor.model || 'Модель не указана'} · ${motor.power_kw} кВт`}
        actions={
          <div className="button-row">
            <Status value={motor.status} />
            {canEdit && (
              <Button variant="outline" onClick={() => setEdit(true)}>
                <Pencil size={16} />
                Изменить
              </Button>
            )}
          </div>
        }
      />
      <ErrorBox error={query.error || measurements.error || alerts.error} />
      {motor.archived && <p className="notice">Двигатель в архиве. Сбор остановлен, история сохранена.</p>}
      <div className="motor-layout">
        <div className="motor-main">
          <div className="metric-grid">
            {[
              {
                name: 'Температура корпуса',
                value: number(last?.temperature_c),
                unit: '°C',
                icon: Thermometer,
                detail: 'Последнее измерение',
              },
              {
                name: 'Общая вибрация RMS',
                value: number(last?.acceleration_rms_g, 3),
                unit: 'g',
                icon: Activity,
                detail: last
                  ? last.measurement_band.join('–') + ' Гц · вектор X/Y/Z'
                  : 'Полоса не определена',
              },
              {
                name: 'Батарея датчика',
                value: number(last?.battery_percent, 0),
                unit: '%',
                icon: BatteryMedium,
                detail: last ? 'Связь ' + last.rssi_dbm + ' dBm' : 'Нет данных',
              },
              {
                name: 'Рабочие обороты',
                value: number(last?.rpm, 0),
                unit: 'об/мин',
                icon: Gauge,
                detail: last ? 'Нагрузка ' + number(last.load_percent, 0) + '%' : 'Нет данных',
              },
            ].map((m) => (
              <div className="metric" key={m.name}>
                <div className="stat-top">
                  <span>{m.name}</span>
                  <m.icon size={16} />
                </div>
                <strong>
                  {m.value} <small>{m.unit}</small>
                </strong>
                <span className="muted tiny">{m.detail}</span>
              </div>
            ))}
          </div>
          <div className="section-head chart-heading">
            <div>
              <h2>История измерений</h2>
              <p className="muted">
                {dateTime(last?.measured_at)}
                {last?.source === 'simulator' ? ' · демонстрационные данные' : ''}
              </p>
            </div>
            <select
              aria-label="Период графиков"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            >
              <option value={1}>За час</option>
              <option value={6}>За 6 часов</option>
              <option value={24}>За сутки</option>
              <option value={168}>За неделю</option>
              <option value={720}>За 30 дней</option>
            </select>
          </div>
          {measurements.data?.truncated && (
            <p className="notice">
              Показаны последние 2000 измерений выбранного периода. Сократите период для подробного просмотра.
            </p>
          )}
          {!data.length ? (
            <section className="panel">
              <Empty
                title="Ожидаем первые измерения"
                text="Зарегистрируйте виртуальный датчик, запустите процесс симулятора и включите сбор данных."
              />
            </section>
          ) : (
            <>
              <section className="panel chart-panel">
                <div className="section-head">
                  <h3>
                    Температура корпуса <span className="muted">°C</span>
                  </h3>
                  <span className="chart-key">
                    <i />
                    Температура
                  </span>
                </div>
                <TelemetryChart
                  data={data}
                  temperature
                  baseline={motor.baseline?.temperature_c}
                  limit={motor.temperature_limit_c}
                  markerIds={markerIds}
                />
              </section>
              <section className="panel chart-panel">
                <div className="section-head">
                  <h3>
                    Виброускорение RMS <span className="muted">g</span>
                  </h3>
                  <div className="segmented">
                    <button className={!axes ? 'active' : ''} onClick={() => setAxes(false)}>
                      Общий RMS
                    </button>
                    <button className={axes ? 'active' : ''} onClick={() => setAxes(true)}>
                      Оси X / Y / Z
                    </button>
                  </div>
                </div>
                <TelemetryChart
                  data={data}
                  axes={axes}
                  baseline={motor.baseline?.acceleration_rms_g}
                  markerIds={markerIds}
                />
              </section>
            </>
          )}
          <section className="panel">
            <div className="section-head">
              <h2>История событий</h2>
              <a
                className="text-link"
                href={'/api/reports/measurements.csv?motor_id=' + motor.id + '&hours=' + hours}
              >
                <Download size={15} />
                Экспорт CSV
              </a>
            </div>
            {events.length ? (
              events.map((event) => (
                <Link className="event-row" to={'/events?alert=' + event.id} key={event.id}>
                  <span className={'event-dot severity-' + event.severity} />
                  <div>
                    <strong>{event.title}</strong>
                    <p>
                      {EVENT_STATUS[event.status]} ·{' '}
                      {event.recovered_at ? 'Показатель восстановился' : 'Условие активно'}
                    </p>
                  </div>
                  <time>{dateTime(event.opened_at)}</time>
                </Link>
              ))
            ) : (
              <p className="padded muted">Подтверждённых событий пока нет.</p>
            )}
          </section>
        </div>
        <aside className="motor-aside">
          <section className="panel padded">
            <div className="eyebrow">ПАСПОРТ ОБОРУДОВАНИЯ</div>
            <h2>Данные двигателя</h2>
            <dl className="facts">
              <dt>Серийный номер</dt>
              <dd>{motor.serial_number || 'Не указан'}</dd>
              <dt>Ответственный</dt>
              <dd>{motor.engineer || 'Не назначен'}</dd>
              <dt>Номинальные обороты</dt>
              <dd>{motor.rpm} об/мин</dd>
              <dt>Ограничение температуры</dt>
              <dd>{motor.temperature_limit_c == null ? 'Не задано' : motor.temperature_limit_c + ' °C'}</dd>
              <dt>Пиковое ускорение</dt>
              <dd>{number(last?.vibration_peak_g, 3)} g</dd>
            </dl>
            <p className="tiny muted">
              Виброскорость и FFT не показываются: диагностическая запись сигнала в этом срезе не передаётся.
            </p>
          </section>
          <section className="panel padded">
            <div className="inline">
              <CircleCheck size={18} />
              <h2>Базовое состояние</h2>
            </div>
            {motor.baseline ? (
              <>
                <div className="baseline-value">
                  {number(motor.baseline.acceleration_rms_g, 3)} <span>g</span>
                </div>
                <p className="muted">
                  Утверждено {dateTime(motor.baseline.approved_at)} · {motor.baseline.sample_count} измер.
                </p>
              </>
            ) : (
              <p className="muted">
                Автоматически не утверждается. Соберите минимум 10 измерений в стабильном исправном режиме и
                подтвердите их после проверки.
              </p>
            )}
            {canEdit && !motor.archived && (
              <ConfirmAction
                text="Подтвердите: оборудование исправно, режим стабилен, последние измерения можно использовать как базовые. Это инженерное утверждение, а не автоматический диагноз."
                onConfirm={() => send('/motors/' + motor.id + '/baseline', {})}
              >
                {motor.baseline ? 'Утвердить новую базу' : 'Утвердить базовый уровень'}
              </ConfirmAction>
            )}
          </section>
          <section className="panel padded">
            <div className="eyebrow">ИСТОЧНИК ИЗМЕРЕНИЙ</div>
            {motor.device ? (
              <>
                <h2>{motor.device.name}</h2>
                <p className="mono muted">{motor.device.serial_number}</p>
                {canEdit && settings?.demo_enabled && !motor.archived && (
                  <DeviceControls device={motor.device} />
                )}
              </>
            ) : (
              <>
                <h2>Датчик не привязан</h2>
                <p className="muted">
                  Добавьте виртуальное устройство, чтобы проверить программный конвейер.
                </p>
                {canEdit && settings?.demo_enabled && !motor.archived && (
                  <Button onClick={() => setRegister(true)}>
                    <Radio size={16} />
                    Добавить датчик
                  </Button>
                )}
              </>
            )}
          </section>
          {canEdit && (
            <ConfirmAction
              danger
              text={
                motor.archived
                  ? 'Вернуть двигатель в активный реестр? Сбор данных останется выключенным.'
                  : 'Архивировать двигатель и остановить сбор? История измерений и событий сохранится.'
              }
              onConfirm={() => send('/motors/' + motor.id + '/archive', {})}
            >
              <Archive size={15} />
              {motor.archived ? 'Вернуть из архива' : 'Архивировать двигатель'}
            </ConfirmAction>
          )}
        </aside>
      </div>
      <MotorEditor motor={motor} open={edit} onClose={() => setEdit(false)} />
      <RegisterDevice motor={motor} open={register} onClose={() => setRegister(false)} />
    </>
  )
}
