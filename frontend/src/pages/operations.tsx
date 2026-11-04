import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Download, Printer, ShieldCheck, Plus, SearchCheck } from 'lucide-react'
import { api, send, dateTime, number } from '../services/api'
import { useApp } from '../app'
import type { Alert, Motor, User, Measurement } from '../types'
import { Button } from '../components/ui/button'
import { Modal } from '../components/ui/dialog'
import { PageHead, ErrorBox, Loading, Empty, Field, Form, EVENT_STATUS } from '../components/shared'

const NEXT: Record<string, string[]> = {
  new: ['acknowledged'],
  acknowledged: ['investigating'],
  investigating: ['confirmed', 'rejected'],
  confirmed: ['resolved'],
  resolved: ['closed'],
  rejected: ['closed'],
  closed: [],
}
function AnalysisText({ alert }: { alert: Alert }) {
  const a = alert.analysis
  return (
    <div className="analysis-text">
      {a.demonstration && <span className="tag">ДЕМОНСТРАЦИОННОЕ ЗАКЛЮЧЕНИЕ</span>}
      <h3>Измеренный факт</h3>
      <p>{a.fact}</p>
      <h3>Почему создано событие</h3>
      <p>{a.reason}</p>
      <h3>{a.hypothesis}</h3>
      <p className="muted">{a.limitations}</p>
      <h3>Рекомендуемые проверки</h3>
      <ol>
        {a.checks.map((check) => (
          <li key={check}>{check}</li>
        ))}
      </ol>
      <p className="muted tiny">{a.consequence}</p>
      <small className="mono muted">
        {a.algorithm_version} · измерений-оснований: {a.measurement_ids.length}
      </small>
    </div>
  )
}
function AlertDetail({ id, close }: { id: string; close: () => void }) {
  const { canEngineer } = useApp()
  const query = useQuery({ queryKey: ['alert', id], queryFn: () => api<Alert>('/alerts/' + id) })
  const a = query.data
  return (
    <Modal
      open
      onClose={close}
      title="Карточка события"
      description="Измерения, диагностические ограничения и действия инженера."
    >
      <ErrorBox error={query.error} />
      {!a ? (
        <Loading />
      ) : (
        <>
          <div className="event-detail-head">
            <div className="eyebrow">
              {EVENT_STATUS[a.status]} · {dateTime(a.opened_at)}
            </div>
            <h2>{a.title}</h2>
            <Link className="text-link" to={'/motors/' + a.motor_id}>
              {a.motor_name}
              <ArrowUpRight size={15} />
            </Link>
            <p className="muted">
              Ответственный: {a.assignee || 'не назначен'}.{' '}
              {a.recovered_at
                ? 'Показатель восстановился ' + dateTime(a.recovered_at)
                : 'Условие события ещё активно.'}
            </p>
          </div>
          <AnalysisText alert={a} />
          {a.result && (
            <div className="notice">
              <strong>Результат закрытия</strong>
              <p>{a.result}</p>
            </div>
          )}
          {canEngineer && ['investigating', 'confirmed'].includes(a.status) && (
            <section className="form-section">
              <h3>Результат осмотра и работы</h3>
              <Form
                submit="Записать осмотр"
                onSave={(fd) =>
                  send('/alerts/' + id + '/inspections', {
                    findings: fd.get('findings'),
                    confirmed: fd.get('confirmed') === 'on',
                    work: fd.get('work'),
                  })
                }
              >
                <Field label="Что обнаружено">
                  <textarea name="findings" required maxLength={4000} />
                </Field>
                <label className="checkbox">
                  <input type="checkbox" name="confirmed" /> Причина подтверждена осмотром
                </label>
                <Field label="Выполненные работы, если проводились">
                  <textarea name="work" maxLength={4000} />
                </Field>
              </Form>
            </section>
          )}
          {canEngineer && NEXT[a.status]?.length > 0 && (
            <section className="form-section">
              <h3>Следующее действие</h3>
              <Form
                key={a.status}
                submit="Изменить статус"
                onSave={(fd) => send('/alerts/' + id, Object.fromEntries(fd), 'PATCH')}
              >
                <Field label="Статус">
                  <select name="status">
                    {NEXT[a.status].map((s) => (
                      <option value={s} key={s}>
                        {EVENT_STATUS[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Ответственный">
                  <input name="assignee" maxLength={120} defaultValue={a.assignee} />
                </Field>
                <Field
                  label={
                    a.status === 'resolved' || a.status === 'rejected' ? 'Результат закрытия' : 'Комментарий'
                  }
                >
                  <textarea name="comment" required maxLength={4000} />
                </Field>
              </Form>
            </section>
          )}
          <section className="form-section">
            <h3>История решений</h3>
            <div className="timeline">
              {a.history?.map((h) => (
                <div key={h.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{EVENT_STATUS[h.status]}</strong>
                    <p>{h.comment}</p>
                    <small className="muted">{dateTime(h.at)}</small>
                  </div>
                </div>
              ))}
            </div>
            {a.inspections?.map((i) => (
              <p className="record" key={i.id}>
                <strong>Осмотр · {dateTime(i.created_at)}</strong>
                <br />
                {i.findings} · {i.confirmed ? 'Подтверждено' : 'Не подтверждено'}
              </p>
            ))}
            {a.maintenance?.map((m) => (
              <p className="record" key={m.id}>
                <strong>Работы · {dateTime(m.created_at)}</strong>
                <br />
                {m.work}
              </p>
            ))}
          </section>
        </>
      )}
    </Modal>
  )
}

export function Events() {
  const { organization } = useApp()
  const query = useQuery({ queryKey: ['alerts'], queryFn: () => api<Alert[]>('/alerts') })
  const motors = useQuery({ queryKey: ['motors'], queryFn: () => api<Motor[]>('/motors') })
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState('')
  const [hours, setHours] = useState(720)
  const [onlyActive, setOnlyActive] = useState(false)
  const id = params.get('alert')
  const rows =
    query.data?.filter(
      (a) =>
        (!status || a.status === status) &&
        (!onlyActive || !a.recovered_at) &&
        Date.now() - new Date(a.opened_at).getTime() < hours * 3600000 &&
        (!organization ||
          motors.data?.some((m) => m.id === a.motor_id && m.organization.id === organization)),
    ) || []
  return (
    <>
      <PageHead
        eyebrow="ЦЕНТР ПРЕДУПРЕЖДЕНИЙ"
        title="События"
        text="Подтверждённые условия правил, результаты осмотров и история действий."
      />
      <div className="filter-row">
        <select aria-label="Статус события" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(EVENT_STATUS).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
        <select aria-label="Период событий" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          <option value={1}>За час</option>
          <option value={24}>За сутки</option>
          <option value={168}>За неделю</option>
          <option value={720}>За 30 дней</option>
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />{' '}
          Только активные условия
        </label>
      </div>
      <ErrorBox error={query.error || motors.error} />
      <section className="panel">
        {query.isPending ? (
          <Loading />
        ) : !rows.length ? (
          <Empty
            title="Событий по этим условиям нет"
            text="Предупреждения появляются после подтверждения правилом. Один скачок сам по себе не означает неисправность."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Событие / оборудование</th>
                  <th>Обнаружено</th>
                  <th>Статус</th>
                  <th>Ответственный</th>
                  <th>Условие</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <button className="table-title event-title" onClick={() => setParams({ alert: a.id })}>
                        <span className={'event-dot severity-' + a.severity} />
                        {a.title}
                      </button>
                      <span className="table-sub">{a.motor_name}</span>
                    </td>
                    <td className="table-time">{dateTime(a.opened_at)}</td>
                    <td>{EVENT_STATUS[a.status]}</td>
                    <td>{a.assignee || 'Не назначен'}</td>
                    <td>
                      <span className={'badge ' + (a.recovered_at ? 'status-normal' : 'status-warning')}>
                        {a.recovered_at ? 'Восстановлено' : 'Активно'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        onClick={() => setParams({ alert: a.id })}
                        aria-label={'Открыть событие ' + a.motor_name}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="quiet-note">
        Показаны последние 500 событий. Закрытие события инженером не означает автоматическое восстановление
        измеренного параметра.
      </p>
      {id && <AlertDetail id={id} close={() => setParams({})} />}
    </>
  )
}

export function Analytics() {
  const { settings, organization } = useApp()
  const query = useQuery({ queryKey: ['alerts'], queryFn: () => api<Alert[]>('/alerts') })
  const motors = useQuery({ queryKey: ['motors'], queryFn: () => api<Motor[]>('/motors') })
  const rows =
    query.data?.filter(
      (a) =>
        !organization || motors.data?.some((m) => m.id === a.motor_id && m.organization.id === organization),
    ) || []
  return (
    <>
      <PageHead
        eyebrow="MEKORA INTELLIGENCE"
        title="Диагностическая аналитика"
        text="Измеренный факт, условия правила и следующие действия. Без неподтверждённых диагнозов."
      />
      <section className="panel padded rule-summary">
        <div>
          <span className="tag">{settings?.rule_version || 'ПРАВИЛА'}</span>
          <h2>Проверяемые правила вместо догадок</h2>
          <p className="muted">
            Базу утверждает инженер после проверки. Рост RMS подтверждается тремя свежими измерениями в
            сопоставимом режиме; возвращение оценивается с гистерезисом.
          </p>
        </div>
        <div className="rule-badges">
          <span>Рост ≥ 2× базы</span>
          <span>Подтверждение: 3 измерения</span>
          <span>Возврат ≤ 1,5× базы</span>
        </div>
      </section>
      <ErrorBox error={query.error || motors.error} />
      {query.isPending ? (
        <Loading />
      ) : !rows.length ? (
        <section className="panel">
          <Empty
            title="Пока нет заключений"
            text="Соберите данные, утвердите исправную базу в карточке двигателя, затем включите контролируемый рост вибрации."
          />
        </section>
      ) : (
        <div className="analysis-grid">
          {rows.slice(0, 20).map((a) => (
            <section className="panel padded" key={a.id}>
              <div className="section-head">
                <div>
                  <div className="eyebrow">{a.motor_name}</div>
                  <h2>{a.title}</h2>
                </div>
                <SearchCheck size={22} />
              </div>
              <AnalysisText alert={a} />
              <Link className="text-link" to={'/events?alert=' + a.id}>
                Открыть событие <ArrowUpRight size={16} />
              </Link>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

export function Reports() {
  const { organization } = useApp()
  const motors = useQuery({ queryKey: ['motors'], queryFn: () => api<Motor[]>('/motors') })
  const events = useQuery({ queryKey: ['alerts'], queryFn: () => api<Alert[]>('/alerts') })
  const [id, setId] = useState('')
  const [hours, setHours] = useState(24)
  const selected = motors.data?.find((m) => m.id === id)
  const data = useQuery({
    queryKey: ['measurements', id, hours],
    queryFn: () =>
      api<{ items: Measurement[]; truncated: boolean }>('/motors/' + id + '/measurements?hours=' + hours),
    enabled: !!id,
  })
  const rows = data.data?.items || []
  const alerts =
    events.data?.filter(
      (a) => a.motor_id === id && Date.now() - new Date(a.opened_at).getTime() < hours * 3600000,
    ) || []
  return (
    <>
      <PageHead
        eyebrow="ДАННЫЕ И РЕЗУЛЬТАТЫ"
        title="Отчёты"
        text="История фактических измерений и решений инженера. Экспорт в CSV или печать браузером в PDF."
        actions={
          selected && (
            <div className="button-row">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer size={16} />
                Печать / PDF
              </Button>
              <Button asChild>
                <a href={'/api/reports/measurements.csv?motor_id=' + id + '&hours=' + hours}>
                  <Download size={16} />
                  Скачать CSV
                </a>
              </Button>
            </div>
          )
        }
      />
      <div className="filter-row">
        <select aria-label="Двигатель для отчёта" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Выберите двигатель</option>
          {motors.data
            ?.filter((m) => !organization || m.organization.id === organization)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
        <select aria-label="Период отчёта" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          <option value={1}>За час</option>
          <option value={24}>За сутки</option>
          <option value={168}>За неделю</option>
          <option value={720}>За 30 дней</option>
        </select>
      </div>
      <ErrorBox error={motors.error || events.error || data.error} />
      {!selected ? (
        <section className="panel">
          <Empty
            title="Выберите оборудование"
            text="Отчёт формируется из сохранённых сервером измерений, без предзаполненных показателей."
          />
        </section>
      ) : (
        <section className="panel padded report">
          <h2>
            {selected.name} · последние {hours} ч
          </h2>
          <p className="muted">
            {selected.organization.name} / {selected.workshop.name} / {selected.asset.name}
          </p>
          <p>
            {rows.length} измерений в выборке · {alerts.length} событий ·{' '}
            {
              alerts.filter(
                (a) => ['confirmed', 'resolved', 'closed'].includes(a.status) && a.kind !== 'connection',
              ).length
            }{' '}
            событий с результатами инженера
          </p>
          {data.data?.truncated && (
            <p className="notice">
              Экран ограничен 2000 последними измерениями. CSV содержит до 100 000 записей; при превышении
              сократите период.
            </p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Температура, °C</th>
                  <th>Общий RMS, g</th>
                  <th>Полоса, Гц</th>
                  <th>Источник</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(-50)
                  .reverse()
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{dateTime(r.measured_at)}</td>
                      <td>{number(r.temperature_c)}</td>
                      <td>{number(r.acceleration_rms_g, 4)}</td>
                      <td>{r.measurement_band.join('–')}</td>
                      <td>{r.source === 'simulator' ? 'Демонстрационный' : 'Шлюз'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="quiet-note">В таблице последние 50 записей выборки. Полная выгрузка — CSV.</p>
          <h3>События и результаты</h3>
          {alerts.map((a) => (
            <div className="record" key={a.id}>
              <strong>{a.title}</strong>
              <p>
                {dateTime(a.opened_at)} · {EVENT_STATUS[a.status]}
              </p>
              <p>{a.result || 'Событие ещё не закрыто с результатом'}</p>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

const roles: Record<string, string> = {
  admin: 'Администратор',
  chief: 'Главный инженер',
  engineer: 'Инженер',
  viewer: 'Наблюдатель',
}
export function Preferences() {
  const { user, canEdit, settings } = useApp()
  const query = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/users'), enabled: canEdit })
  const [adding, setAdding] = useState(false)
  return (
    <>
      <PageHead
        eyebrow="РАБОЧЕЕ ПРОСТРАНСТВО"
        title="Настройки"
        text="Учётные записи и параметры локального сервера."
      />
      <div className="device-grid">
        <section className="panel padded">
          <div className="inline">
            <ShieldCheck size={22} />
            <h2>Ваша учётная запись</h2>
          </div>
          <dl className="facts">
            <dt>Логин</dt>
            <dd>{user.username}</dd>
            <dt>Роль</dt>
            <dd>{roles[user.role]}</dd>
            <dt>Авторизация</dt>
            <dd>Серверная сессия · HttpOnly</dd>
            <dt>Изменения</dt>
            <dd>Защищены CSRF-токеном</dd>
          </dl>
        </section>
        <section className="panel padded">
          <h2>Параметры системы</h2>
          <dl className="facts">
            <dt>Хранилище</dt>
            <dd>{settings?.storage || 'Загрузка…'}</dd>
            <dt>Демонстрационный режим</dt>
            <dd>{settings?.demo_enabled ? 'Включён' : 'Выключен'}</dd>
            <dt>Таймаут связи</dt>
            <dd>{settings?.stale_seconds} с</dd>
            <dt>Версия правил</dt>
            <dd>{settings?.rule_version}</dd>
          </dl>
          <p className="muted tiny">
            Параметры сервера задаются в .env. Тема переключается кнопкой солнца или луны в верхней панели.
          </p>
        </section>
      </div>
      {canEdit && (
        <section className="panel">
          <div className="section-head">
            <h2>Пользователи</h2>
            {user.role === 'admin' && (
              <Button onClick={() => setAdding(true)}>
                <Plus size={16} />
                Добавить пользователя
              </Button>
            )}
          </div>
          <ErrorBox error={query.error} />
          <table>
            <thead>
              <tr>
                <th>Логин</th>
                <th>Роль</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{roles[u.role]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Новый пользователь">
        <Form onSuccess={() => setAdding(false)} onSave={(fd) => send('/users', Object.fromEntries(fd))}>
          <Field label="Логин" hint="Латинские буквы, цифры, точка, дефис или подчёркивание.">
            <input
              name="username"
              required
              pattern="[a-zA-Z0-9_.\-]{3,80}"
              minLength={3}
              maxLength={80}
              autoComplete="off"
            />
          </Field>
          <Field
            label="Пароль"
            hint="Минимум 12 символов. Передайте пароль пользователю безопасным способом."
          >
            <input
              name="password"
              required
              type="password"
              minLength={12}
              maxLength={256}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Роль">
            <select name="role" defaultValue="engineer">
              {Object.entries(roles).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </Form>
      </Modal>
    </>
  )
}
