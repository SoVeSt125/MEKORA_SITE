import { createContext, useContext, useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, NavLink, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import {
  Activity,
  Building2,
  Boxes,
  Radio,
  Bell,
  ChartNoAxesCombined,
  FileChartColumn,
  Settings2,
  Search,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react'
import { api, send, setCSRF, ApiError } from './services/api'
import type { User, Catalog, Alert, Settings } from './types'
import { Button } from './components/ui/button'
import { ErrorBox, Field, Loading } from './components/shared'
import { Overview, Equipment } from './pages/overview'
import { MotorPage } from './pages/motor'
import { Enterprises, Devices } from './pages/management'
import { Events, Analytics, Reports, Preferences } from './pages/operations'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, e) => !(e instanceof ApiError && [401, 403].includes(e.status)) && count < 1,
      staleTime: 1500,
    },
  },
})
const Context = createContext<{
  user: User
  organization: string
  canEdit: boolean
  canEngineer: boolean
  settings?: Settings
}>({} as never)
export const useApp = () => useContext(Context)
const nav = [
  ['/', 'Обзор', Activity],
  ['/enterprises', 'Предприятия и цеха', Building2],
  ['/equipment', 'Оборудование', Boxes],
  ['/devices', 'Датчики', Radio],
  ['/events', 'События', Bell],
  ['/analytics', 'Аналитика', ChartNoAxesCombined],
  ['/reports', 'Отчёты', FileChartColumn],
  ['/settings', 'Настройки', Settings2],
] as const

function Login({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState<unknown>()
  const [pending, setPending] = useState(false)
  return (
    <div className="login-screen">
      <div className="login-art">
        <Brand />
        <div>
          <div className="eyebrow">MEKORA MONITOR</div>
          <h1>
            Измерения.
            <br />
            Понимание.
            <br />
            <span>Действия.</span>
          </h1>
          <p>
            Техническое состояние оборудования —<br />в одной системе.
          </p>
        </div>
        <small>Промышленный мониторинг · Версия 0.1</small>
        <div className="orbital" aria-hidden="true" />
      </div>
      <main className="login-main">
        <form
          className="login-card form-stack"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            setError(undefined)
            const data = new FormData(e.currentTarget)
            try {
              const result = await send<{ user: User; csrf: string }>('/auth/login', Object.fromEntries(data))
              setCSRF(result.csrf)
              onLogin()
            } catch (err) {
              setError(err)
            } finally {
              setPending(false)
            }
          }}
        >
          <div className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</div>
          <h2>Вход в MEKORA</h2>
          <p className="muted">Войдите, чтобы видеть состояние оборудования.</p>
          <Field label="Логин">
            <input name="username" required autoComplete="username" placeholder="Ваш логин" />
          </Field>
          <Field label="Пароль">
            <input
              name="password"
              required
              type="password"
              autoComplete="current-password"
              placeholder="Ваш пароль"
            />
          </Field>
          <ErrorBox error={error} />
          <Button disabled={pending}>
            {pending ? (
              'Входим…'
            ) : (
              <>
                Войти в систему <ArrowUpRight size={17} />
              </>
            )}
          </Button>
          <small className="muted">
            Первого администратора создаёт локальный мастер запуска. Инструкция — в README проекта.
          </small>
        </form>
      </main>
    </div>
  )
}
function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M7 25V8l9 9 9-9v17" />
        </svg>
      </span>
      <span>
        MEKORA<small>MONITOR</small>
      </span>
    </Link>
  )
}

function Shell({ user, logout }: { user: User; logout: () => void }) {
  const queryClient = useQueryClient()
  const [organization, setOrganization] = useState('')
  const [search, setSearch] = useState('')
  const [connected, setConnected] = useState(false)
  const [actionError, setActionError] = useState<unknown>()
  const [dark, setDark] = useState(localStorage.getItem('mekora-theme') === 'dark')
  const navigate = useNavigate()
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api<Catalog>('/catalog') })
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: () => api<Alert[]>('/alerts') })
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') })
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('mekora-theme', dark ? 'dark' : 'light')
  }, [dark])
  useEffect(() => {
    const stream = new EventSource('/api/stream')
    stream.addEventListener('update', () => {
      setConnected(true)
      queryClient.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] !== 'auth' &&
          q.queryKey[0] !== 'settings' &&
          q.queryKey[0] !== 'catalog' &&
          q.queryKey[0] !== 'users',
      })
    })
    stream.addEventListener('expired', logout)
    stream.onerror = () => setConnected(false)
    return () => stream.close()
  }, [queryClient, logout])
  const count = alerts.data?.filter((a) => a.status === 'new').length || 0
  return (
    <Context.Provider
      value={{
        user,
        organization,
        settings: settings.data,
        canEdit: ['admin', 'chief'].includes(user.role),
        canEngineer: user.role !== 'viewer',
      }}
    >
      <div className="app-shell">
        <aside className="sidebar">
          <Brand />
          <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
          <nav>
            {nav.map(([path, title, Icon]) => (
              <NavLink key={path} to={path} end={path === '/'}>
                <Icon size={18} />
                <span>{title}</span>
                {path === '/events' && count > 0 && <span className="nav-count">{count}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <span className="version-label">MEKORA Intelligence</span>
            <p>
              От измерений
              <br />к понятным решениям.
            </p>
            <span className="tiny muted">Локальная платформа · 0.1.0</span>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <select
              aria-label="Предприятие"
              className="organization-select"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
            >
              <option value="">Все предприятия</option>
              {catalog.data?.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <div className="topbar-tools">
              <form
                className="search"
                onSubmit={(e) => {
                  e.preventDefault()
                  navigate('/equipment?search=' + encodeURIComponent(search))
                }}
              >
                <Search size={16} />
                <input
                  aria-label="Поиск оборудования"
                  placeholder="Найти оборудование…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>↵</kbd>
              </form>
              <span className={'connection ' + (connected ? 'online' : '')}>
                <i />
                {connected ? 'Сервер на связи' : 'Переподключение…'}
              </span>
              <button
                className="icon-button"
                aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
                onClick={() => setDark(!dark)}
              >
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <Link
                className="icon-button notification"
                to="/events"
                aria-label={`Новые предупреждения: ${count}`}
              >
                <Bell size={19} />
                {count > 0 && <i />}
              </Link>
              <div className="user-avatar" title={user.username}>
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <button
                className="icon-button"
                aria-label="Выйти"
                onClick={async () => {
                  try {
                    await send('/auth/logout', {})
                    logout()
                  } catch (error) {
                    setActionError(error)
                  }
                }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </header>
          <main className="content">
            <ErrorBox error={actionError || settings.error} />
            {settings.data?.demo_enabled && (
              <div className="demo-banner">
                <Radio size={15} />
                <span>
                  <strong>Демонстрационный режим</strong> · Данные виртуальных датчиков. Реальное оборудование
                  не подключено.
                </span>
                <Link to="/devices">
                  Управление <ChevronRight size={14} />
                </Link>
              </div>
            )}
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/equipment" element={<Equipment />} />
              <Route path="/motors/:id" element={<MotorPage />} />
              <Route path="/enterprises" element={<Enterprises />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/events" element={<Events />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Preferences />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <footer className="app-footer">
            <span>MEKORA Monitor</span>
            <span>Данные хранятся на вашем сервере · время устройства</span>
          </footer>
        </div>
      </div>
    </Context.Provider>
  )
}

function AuthGate() {
  const queryClient = useQueryClient()
  const auth = useQuery({
    queryKey: ['auth'],
    queryFn: () => api<{ user: User; csrf: string }>('/auth/me'),
    retry: false,
    staleTime: Infinity,
  })
  const logout = () => {
    setCSRF('')
    queryClient.clear()
    queryClient.setQueryData(['auth'], null)
  }
  useEffect(() => {
    window.addEventListener('session-expired', logout)
    return () => window.removeEventListener('session-expired', logout)
  }, [])
  useEffect(() => {
    if (auth.data) setCSRF(auth.data.csrf)
  }, [auth.data])
  if (auth.isPending) return <Loading />
  if (auth.error && !(auth.error instanceof ApiError && auth.error.status === 401))
    return (
      <div className="login-card">
        <h1>Сервер недоступен</h1>
        <ErrorBox error={auth.error} />
        <Button onClick={() => auth.refetch()}>Повторить подключение</Button>
      </div>
    )
  if (!auth.data) return <Login onLogin={() => queryClient.invalidateQueries({ queryKey: ['auth'] })} />
  return <Shell user={auth.data.user} logout={logout} />
}
export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthGate />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
