import { useState, useId, cloneElement, type ReactElement, type ReactNode, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ArrowUpRight, Radio, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from './ui/button'
import type { Motor } from '../types'
import { dateTime, number } from '../services/api'

export const STATUS: Record<string, string> = {
  normal: 'В норме',
  warning: 'Требует проверки',
  critical: 'Превышение ограничения',
  offline: 'Нет связи',
  insufficient: 'Недостаточно данных',
  quality: 'Ошибка измерения',
  mode_changed: 'Другой рабочий режим',
}
export const EVENT_STATUS: Record<string, string> = {
  new: 'Новое',
  acknowledged: 'Принято в работу',
  investigating: 'На проверке',
  confirmed: 'Подтверждено',
  rejected: 'Не подтвердилось',
  resolved: 'Устранено',
  closed: 'Закрыто',
}
export function Status({ value }: { value: string }) {
  return (
    <span className={'badge status-' + value}>
      <span className="status-dot" />
      {STATUS[value] || EVENT_STATUS[value] || value}
    </span>
  )
}
export function PageHead({
  eyebrow,
  title,
  text,
  actions,
}: {
  eyebrow?: string
  title: string
  text?: string
  actions?: ReactNode
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {text && <p className="muted">{text}</p>}
      </div>
      <div className="head-actions">{actions}</div>
    </div>
  )
}
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div className="error" role="alert">
      <AlertCircle size={18} />
      <span>{error instanceof Error ? error.message : 'Не удалось выполнить запрос'}</span>
    </div>
  )
}
export function Loading() {
  return (
    <div className="empty">
      <Loader2 className="spin" />
      <p>Загружаем данные…</p>
    </div>
  )
}
export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Radio size={27} />
      </div>
      <h3>{title}</h3>
      <p className="muted">{text}</p>
      {children}
    </div>
  )
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children as ReactElement<{ id: string; 'aria-describedby'?: string }>, {
        id,
        'aria-describedby': hint ? id + '-hint' : undefined,
      })}
      {hint && (
        <small className="muted" id={id + '-hint'}>
          {hint}
        </small>
      )}
    </div>
  )
}
export function Form({
  onSave,
  children,
  submit = 'Сохранить',
  onSuccess,
}: {
  onSave: (data: FormData) => Promise<unknown>
  children: ReactNode
  submit?: string
  onSuccess?: () => void
}) {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: onSave,
    onSuccess: async () => {
      await qc.invalidateQueries()
      onSuccess?.()
    },
  })
  return (
    <form
      className="form-stack"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        mutation.mutate(new FormData(event.currentTarget))
      }}
    >
      <fieldset disabled={mutation.isPending}>{children}</fieldset>
      <ErrorBox error={mutation.error} />
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Сохраняем…' : submit}
      </Button>
    </form>
  )
}
export function MotorTable({ motors }: { motors: Motor[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Оборудование / двигатель</th>
            <th>Цех</th>
            <th>Температура</th>
            <th>Вибрация RMS</th>
            <th>Состояние</th>
            <th>Последнее измерение</th>
            <th>
              <span className="sr-only">Открыть</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {motors.map((m) => (
            <tr key={m.id}>
              <td>
                <Link className="table-title" to={'/motors/' + m.id}>
                  {m.name}
                </Link>
                <span className="table-sub">
                  {m.asset.name} · {m.asset.inventory_number}
                </span>
              </td>
              <td>{m.workshop.name}</td>
              <td className="numeric">
                {number(m.latest?.temperature_c)} <span className="muted">°C</span>
              </td>
              <td className="numeric">
                {number(m.latest?.acceleration_rms_g, 3)} <span className="muted">g</span>
                <small className="table-sub">
                  {m.latest ? m.latest.measurement_band.join('–') + ' Гц' : 'Нет измерений'}
                </small>
              </td>
              <td>
                <Status value={m.status} />
              </td>
              <td className="table-time">{dateTime(m.latest?.measured_at)}</td>
              <td>
                <Link className="icon-button" aria-label={'Открыть ' + m.name} to={'/motors/' + m.id}>
                  <ArrowUpRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export function ConfirmAction({
  text,
  onConfirm,
  children,
  danger = false,
}: {
  text: string
  onConfirm: () => Promise<unknown>
  children: ReactNode
  danger?: boolean
}) {
  const [confirm, setConfirm] = useState(false)
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: onConfirm,
    onSuccess: () => {
      qc.invalidateQueries()
      setConfirm(false)
    },
  })
  return (
    <div>
      {!confirm ? (
        <Button variant={danger ? 'danger' : 'outline'} onClick={() => setConfirm(true)}>
          {children}
        </Button>
      ) : (
        <div className="confirm-box">
          <p>{text}</p>
          <ErrorBox error={mutation.error} />
          <div className="button-row">
            <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Сохраняем…' : 'Подтвердить'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
