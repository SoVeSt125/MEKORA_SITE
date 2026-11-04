let csrf = ''
export function setCSRF(value: string) {
  csrf = value
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api' + path, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...init?.headers },
    })
  } catch {
    throw new ApiError(0, 'Нет соединения с сервером. Проверьте, что backend запущен.')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me')
      window.dispatchEvent(new Event('session-expired'))
    throw new ApiError(
      response.status,
      typeof body.detail === 'string' ? body.detail : 'Не удалось выполнить запрос',
    )
  }
  return response.json()
}
export const send = <T>(path: string, body: unknown, method = 'POST') =>
  api<T>(path, { method, body: JSON.stringify(body) })
export const dateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Ещё нет измерений'
export const number = (value?: number | null, digits = 1) =>
  value == null
    ? '—'
    : value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
