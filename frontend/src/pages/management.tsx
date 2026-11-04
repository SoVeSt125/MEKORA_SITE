import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, ArrowDownRight, Radio, Play, Square, RotateCcw, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, send } from '../services/api'
import { useApp } from '../app'
import type { Catalog, Device, Motor } from '../types'
import { Button } from '../components/ui/button'
import { Modal } from '../components/ui/dialog'
import { Empty, ErrorBox, Field, Form, Loading, PageHead } from '../components/shared'

export function Enterprises() {
  const { canEdit, organization } = useApp()
  const query = useQuery({ queryKey: ['catalog'], queryFn: () => api<Catalog>('/catalog') })
  const [type, setType] = useState('')
  const data = query.data
  return (
    <>
      <PageHead
        eyebrow="СТРУКТУРА ПРЕДПРИЯТИЯ"
        title="Предприятия и цеха"
        text="Сначала предприятие, затем цех и агрегат. Двигатель добавляется в реестре оборудования."
        actions={
          canEdit && (
            <div className="button-row">
              <Button
                variant="outline"
                disabled={!data?.organizations.length}
                onClick={() => setType('workshop')}
              >
                <Plus size={16} /> Цех
              </Button>
              <Button variant="outline" disabled={!data?.workshops.length} onClick={() => setType('asset')}>
                <Plus size={16} /> Агрегат
              </Button>
              <Button onClick={() => setType('organization')}>
                <Plus size={16} /> Предприятие
              </Button>
            </div>
          )
        }
      />
      <ErrorBox error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : !data?.organizations.length ? (
        <section className="panel">
          <Empty
            title="Создайте структуру предприятия"
            text="Например: производство → механический цех → насосная установка. Это будут ваши записи, а не предзаполненные демонстрационные данные."
          >
            {canEdit && <Button onClick={() => setType('organization')}>Создать предприятие</Button>}
          </Empty>
        </section>
      ) : (
        data.organizations
          .filter((o) => !organization || o.id === organization)
          .map((o) => (
            <section key={o.id} className="panel enterprise">
              <div className="section-head">
                <div className="inline">
                  <div className="equipment-icon">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <h2>{o.name}</h2>
                    <p className="muted">
                      {o.description || 'Предприятие'} ·{' '}
                      {data.workshops.filter((w) => w.organization_id === o.id).length} цех.
                    </p>
                  </div>
                </div>
                <span className="tag">ПРЕДПРИЯТИЕ</span>
              </div>
              <div className="workshop-grid">
                {data.workshops
                  .filter((w) => w.organization_id === o.id)
                  .map((w) => (
                    <div className="workshop" key={w.id}>
                      <h3>
                        <ArrowDownRight size={17} />
                        {w.name}
                      </h3>
                      {data.assets
                        .filter((a) => a.workshop_id === w.id)
                        .map((a) => (
                          <div className="asset-row" key={a.id}>
                            <span>
                              {a.name}
                              <small>{a.category}</small>
                            </span>
                            <span className="mono muted">{a.inventory_number}</span>
                          </div>
                        ))}
                      {!data.assets.some((a) => a.workshop_id === w.id) && (
                        <p className="muted">Нет агрегатов. Добавьте агрегат кнопкой вверху.</p>
                      )}
                    </div>
                  ))}
                {!data.workshops.some((w) => w.organization_id === o.id) && (
                  <p className="muted">Добавьте первый цех кнопкой вверху страницы.</p>
                )}
              </div>
            </section>
          ))
      )}
      <Modal
        open={!!type}
        onClose={() => setType('')}
        title={
          type === 'organization' ? 'Новое предприятие' : type === 'workshop' ? 'Новый цех' : 'Новый агрегат'
        }
      >
        <Form
          key={type}
          onSuccess={() => setType('')}
          onSave={(fd) =>
            send(
              '/' +
                (type === 'organization' ? 'organizations' : type === 'workshop' ? 'workshops' : 'assets'),
              Object.fromEntries(fd),
            )
          }
        >
          <Field label="Название">
            <input name="name" required maxLength={160} />
          </Field>
          {type === 'organization' && (
            <Field label="Описание">
              <textarea name="description" maxLength={4000} />
            </Field>
          )}
          {type === 'workshop' && (
            <Field label="Предприятие">
              <select name="organization_id">
                {data?.organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {type === 'asset' && (
            <>
              <Field label="Цех">
                <select name="workshop_id">
                  {data?.workshops.map((w) => (
                    <option key={w.id} value={w.id}>
                      {data.organizations.find((o) => o.id === w.organization_id)?.name} / {w.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Инвентарный номер">
                <input name="inventory_number" required maxLength={80} />
              </Field>
              <Field label="Категория">
                <input name="category" required maxLength={80} defaultValue="Электропривод" />
              </Field>
            </>
          )}
        </Form>
      </Modal>
    </>
  )
}

export function RegisterDevice({
  motor,
  open,
  onClose,
}: {
  motor?: Motor
  open: boolean
  onClose: () => void
}) {
  const query = useQuery({ queryKey: ['motors'], queryFn: () => api<Motor[]>('/motors') })
  const eligible = query.data?.filter((m) => !m.device) || []
  return (
    <Modal
      title="Добавить виртуальный датчик"
      description="Демонстрационная регистрация MEKORA Core. Поиск реальных BLE-устройств не выполняется."
      open={open}
      onClose={onClose}
    >
      {!eligible.length ? (
        <Empty
          title="Нет свободного двигателя"
          text="Добавьте двигатель, к которому ещё не привязан датчик."
        />
      ) : (
        <Form onSuccess={onClose} onSave={(fd) => send('/devices', Object.fromEntries(fd))}>
          <Field label="Двигатель">
            <select name="motor_id" defaultValue={motor?.id}>
              {eligible.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Название датчика">
              <input name="name" required maxLength={160} defaultValue="MEKORA Core · виртуальный" />
            </Field>
            <Field label="Уникальный серийный номер">
              <input name="serial_number" required maxLength={100} placeholder="Например, SIM-001" />
            </Field>
            <Field label="Точка установки">
              <select name="position">
                <option value="DE">DE · приводная сторона</option>
                <option value="NDE">NDE · неприводная сторона</option>
                <option value="other">Другая</option>
              </select>
            </Field>
            <Field label="Монтажный адаптер">
              <select name="mount">
                <option value="Flat">Mount Flat</option>
                <option value="Fin">Mount Fin</option>
                <option value="other">Другой</option>
              </select>
            </Field>
          </div>
        </Form>
      )}
    </Modal>
  )
}

export const SCENARIOS: Record<string, string> = {
  normal: 'Исправный режим / восстановление',
  vibration: 'Постепенный рост вибрации',
  temperature: 'Повышение температуры',
  load: 'Изменение оборотов и нагрузки',
  impulse: 'Кратковременный импульс',
  offline: 'Потеря связи',
  battery: 'Низкий заряд батареи',
}
export function DeviceControls({ device }: { device: Device }) {
  const [scenario, setScenario] = useState(device.scenario)
  const [interval, setInterval] = useState(device.interval_seconds)
  const qc = useQueryClient()
  useEffect(() => {
    setScenario(device.scenario)
    setInterval(device.interval_seconds)
  }, [device.id, device.scenario, device.interval_seconds])
  const mutation = useMutation({
    mutationFn: ({ enabled, selected = scenario }: { enabled: boolean; selected?: string }) =>
      send(
        '/devices/' + device.id + '/simulation',
        { enabled, scenario: selected, interval_seconds: interval },
        'PUT',
      ),
    onSuccess: () => qc.invalidateQueries(),
  })
  return (
    <div className="sim-controls">
      <div className="inline">
        <Radio size={17} />
        <strong>Симулятор MEKORA Core</strong>
      </div>
      <p className="muted">
        {device.simulation_enabled
          ? 'Сбор запрошен. Измерения отправляет отдельный процесс симулятора.'
          : 'Сбор остановлен. История измерений сохраняется.'}
      </p>
      <Field label="Сценарий">
        <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
          {Object.entries(SCENARIOS).map(([value, text]) => (
            <option value={value} key={value}>
              {text}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Интервал измерений, секунд">
        <input
          type="number"
          min="0.5"
          max="60"
          step="0.5"
          value={interval}
          onChange={(e) => setInterval(Number(e.target.value))}
        />
      </Field>
      <ErrorBox error={mutation.error} />
      <div className="button-row">
        <Button
          disabled={mutation.isPending || interval < 0.5 || interval > 60}
          onClick={() => mutation.mutate({ enabled: true })}
        >
          <Play size={15} />
          {device.simulation_enabled ? 'Применить' : 'Запустить'}
        </Button>
        <Button
          variant="outline"
          disabled={mutation.isPending || !device.simulation_enabled}
          onClick={() => mutation.mutate({ enabled: false })}
        >
          <Square size={14} />
          Остановить
        </Button>
      </div>
      <div className="button-row">
        <Button
          variant="ghost"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ enabled: true, selected: 'vibration' })}
        >
          <TrendingUp size={15} />
          Создать отклонение
        </Button>
        <Button
          variant="ghost"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ enabled: true, selected: 'normal' })}
        >
          <RotateCcw size={15} />
          Восстановить норму
        </Button>
      </div>
    </div>
  )
}

export function Devices() {
  const { canEdit, settings } = useApp()
  const query = useQuery({ queryKey: ['devices'], queryFn: () => api<Device[]>('/devices') })
  const [adding, setAdding] = useState(false)
  return (
    <>
      <PageHead
        eyebrow="ИЗМЕРИТЕЛЬНЫЕ УСТРОЙСТВА"
        title="Датчики"
        text="Виртуальные MEKORA Core и управление демонстрационным сбором данных."
        actions={
          canEdit &&
          settings?.demo_enabled && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={17} />
              Добавить устройство
            </Button>
          )
        }
      />
      <ErrorBox error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : !query.data?.length ? (
        <section className="panel">
          <Empty
            title="Датчики не зарегистрированы"
            text="Добавьте двигатель, зарегистрируйте виртуальный датчик и запустите отдельный симулятор по README."
          />
        </section>
      ) : (
        <div className="device-grid">
          {query.data.map((d) => (
            <section className="panel padded" key={d.id}>
              <div className="section-head">
                <div>
                  <div className="eyebrow">ВИРТУАЛЬНЫЙ ДАТЧИК</div>
                  <h2>{d.name}</h2>
                </div>
                <Radio size={24} />
              </div>
              <dl className="facts">
                <dt>Серийный номер</dt>
                <dd className="mono">{d.serial_number}</dd>
                <dt>Двигатель</dt>
                <dd>
                  <Link className="text-link" to={'/motors/' + d.installation?.motor_id}>
                    {d.motor_name}
                  </Link>
                </dd>
                <dt>Установка</dt>
                <dd>
                  {d.installation?.position} · {d.installation?.mount}
                </dd>
                <dt>Источник</dt>
                <dd>Симулятор · не BLE</dd>
              </dl>
              {canEdit && settings?.demo_enabled && <DeviceControls device={d} />}
            </section>
          ))}
        </div>
      )}
      <RegisterDevice open={adding} onClose={() => setAdding(false)} />
    </>
  )
}
