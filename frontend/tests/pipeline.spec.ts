import { test, expect } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const password =
  process.env.MEKORA_TEST_PASSWORD ||
  readFileSync(resolve('../.env'), 'utf8')
    .split(/\r?\n/)
    .find((line) => line.startsWith('MEKORA_ADMIN_PASSWORD='))
    ?.split('=')
    .slice(1)
    .join('=')
const shots = resolve('../docs/screenshots')
test('UI → реальный симулятор → API → БД → графики → предупреждение → осмотр → восстановление', async ({
  page,
}) => {
  test.skip(!password, 'Требуется локальный тестовый администратор; пароль не выводится в отчёты')
  const errors: string[] = []
  const capture = async (filename: string) => {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: resolve(shots, filename), fullPage: true, animations: 'disabled' })
  }
  page.on('pageerror', (e) => errors.push(e.message))
  const suffix = Date.now().toString().slice(-7)
  await page.goto('/')
  await page.getByLabel('Логин', { exact: true }).fill(process.env.MEKORA_TEST_USER || 'admin')
  await page.getByLabel('Пароль', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Войти в систему' }).click()
  await expect(page.getByRole('heading', { name: 'Мониторинг оборудования', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Предприятия и цеха' }).click()
  await page.getByRole('button', { name: 'Предприятие', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Название', { exact: true }).fill('Демонстрационное производство ' + suffix)
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: 'Цех', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Название', { exact: true }).fill('Механический цех ' + suffix)
  await dialog
    .getByLabel('Предприятие', { exact: true })
    .selectOption({ label: 'Демонстрационное производство ' + suffix })
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: 'Агрегат', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Название', { exact: true }).fill('Насосная установка ' + suffix)
  await dialog
    .getByLabel('Цех', { exact: true })
    .selectOption({ label: 'Демонстрационное производство ' + suffix + ' / Механический цех ' + suffix })
  await dialog.getByLabel('Инвентарный номер').fill('Н-' + suffix)
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('link', { name: 'Оборудование', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить двигатель', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Название двигателя').fill('Двигатель №12 · ' + suffix)
  await dialog
    .getByLabel('Агрегат', { exact: true })
    .selectOption({ label: 'Насосная установка ' + suffix + ' · Н-' + suffix })
  await dialog.getByLabel('Модель', { exact: true }).fill('Виртуальный двигатель')
  await dialog.getByLabel('Ответственный инженер').fill('Инженер демонстрационного стенда')
  await dialog.getByLabel('Ограничение температуры').fill('80')
  await dialog.getByRole('button', { name: 'Добавить двигатель', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('link', { name: 'Двигатель №12 · ' + suffix, exact: true }).click()
  const motorPath = new URL(page.url()).pathname
  const motorId = motorPath.split('/').pop()
  await page.getByRole('button', { name: 'Добавить датчик', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Уникальный серийный номер').fill('SIM-' + suffix)
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByLabel('Интервал измерений, секунд').fill('0.5')
  await page.getByRole('button', { name: 'Запустить', exact: true }).click()
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/motors/' + motorId + '/measurements')).json()).items.length,
      { timeout: 30000 },
    )
    .toBeGreaterThanOrEqual(10)
  await expect(page.locator('.recharts-line-curve').first()).toBeVisible()
  await page.getByRole('button', { name: 'Утвердить базовый уровень', exact: true }).click()
  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click()
  await expect(page.getByText('В норме', { exact: true })).toBeVisible()
  mkdirSync(shots, { recursive: true })
  await capture('motor-light.png')
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click()
  await capture('motor-dark.png')
  await page.getByRole('button', { name: 'Включить светлую тему' }).click()
  await page.getByRole('button', { name: 'Создать отклонение', exact: true }).click()
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/alerts')).json()).filter(
          (a: { motor_id: string; kind: string }) =>
            a.motor_id === motorId && a.kind === 'vibration_baseline',
        ).length,
      { timeout: 30000 },
    )
    .toBe(1)
  await page.getByRole('link', { name: 'Обзор', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Двигатель №12 · ' + suffix, exact: true })).toBeVisible()
  await capture('overview-light.png')
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click()
  await capture('overview-dark.png')
  await page.getByRole('button', { name: 'Включить светлую тему' }).click()
  await page.getByRole('link', { name: 'События', exact: false }).first().click()
  await page.getByRole('button', { name: 'Открыть событие Двигатель №12 · ' + suffix }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Причина не установлена', { exact: true })).toBeVisible()
  await capture('alert-light.png')
  for (const [comment, nextStatus] of [
    ['Принято в работу', 'investigating'],
    ['Начата проверка', 'confirmed'],
  ]) {
    await dialog.getByLabel('Комментарий', { exact: true }).fill(comment)
    await dialog.getByRole('button', { name: 'Изменить статус', exact: true }).click()
    await expect(dialog.getByLabel('Статус', { exact: true })).toHaveValue(nextStatus)
  }
  await dialog.getByLabel('Что обнаружено').fill('Демонстрационная проверка крепления выполнена')
  await dialog.getByLabel('Причина подтверждена осмотром').check()
  await dialog.getByLabel('Выполненные работы').fill('Демонстрационная контрольная затяжка')
  await dialog.getByRole('button', { name: 'Записать осмотр', exact: true }).click()
  await expect(
    dialog.getByText('Демонстрационная проверка крепления выполнена · Подтверждено', { exact: false }),
  ).toBeVisible()
  for (const [comment, nextStatus] of [
    ['Подтверждено осмотром', 'resolved'],
    ['Работы выполнены', 'closed'],
  ]) {
    await dialog.getByLabel('Комментарий', { exact: true }).fill(comment)
    await dialog.getByRole('button', { name: 'Изменить статус', exact: true }).click()
    await expect(dialog.getByLabel('Статус', { exact: true })).toHaveValue(nextStatus)
  }
  await dialog
    .getByLabel('Результат закрытия', { exact: true })
    .fill('Контрольное измерение запланировано; демонстрационный ремонт записан')
  await dialog.getByRole('button', { name: 'Изменить статус', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Следующее действие' })).not.toBeVisible()
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.goto(motorPath)
  await page.getByRole('button', { name: 'Восстановить норму', exact: true }).click()
  await expect(page.getByText('В норме', { exact: true })).toBeVisible({ timeout: 15000 })
  const before = (await (await page.request.get('/api/motors/' + motorId + '/measurements')).json()).items
    .length
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/motors/' + motorId + '/measurements')).json()).items.length,
    )
    .toBeGreaterThan(before)
  await page.getByLabel('Сценарий', { exact: true }).selectOption('offline')
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  await expect(page.getByText('Нет связи', { exact: true })).toBeVisible({ timeout: 40000 })
  await page.getByRole('button', { name: 'Восстановить норму', exact: true }).click()
  await expect(page.getByText('В норме', { exact: true })).toBeVisible({ timeout: 15000 })
  await page.getByRole('link', { name: 'Настройки', exact: true }).click()
  await capture('settings-light.png')
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto(motorPath)
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1024)
  await expect(page.getByRole('heading', { name: 'История измерений', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Двигатель №12 · ' + suffix, exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
