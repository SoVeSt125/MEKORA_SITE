export type User = { id: string; username: string; role: 'admin' | 'chief' | 'engineer' | 'viewer' }
export type Organization = { id: string; name: string; description: string }
export type Workshop = { id: string; name: string; organization_id: string }
export type Asset = {
  id: string
  name: string
  workshop_id: string
  inventory_number: string
  category: string
}
export type Catalog = { organizations: Organization[]; workshops: Workshop[]; assets: Asset[] }
export type Device = {
  id: string
  name: string
  serial_number: string
  virtual: boolean
  simulation_enabled: boolean
  scenario: string
  interval_seconds: number
  motor_name?: string
  installation?: { motor_id: string; position: string; mount: string }
}
export type Measurement = {
  id: string
  measured_at: string
  temperature_c: number
  acceleration_rms_g: number
  acceleration_rms_x_g: number
  acceleration_rms_y_g: number
  acceleration_rms_z_g: number
  vibration_peak_g: number
  battery_percent: number
  rssi_dbm: number
  source: string
  rpm: number
  load_percent: number
  measurement_band: number[]
  quality_flags: string[]
  gap_count: number
}
export type Baseline = {
  id: string
  temperature_c: number
  acceleration_rms_g: number
  sample_count: number
  approved_at: string
}
export type Motor = {
  id: string
  name: string
  serial_number: string
  model: string
  asset_id: string
  power_kw: number
  rpm: number
  engineer: string
  temperature_limit_c: number | null
  archived: boolean
  asset: Asset
  workshop: Workshop
  organization: Organization
  device: Device | null
  latest: Measurement | null
  baseline: Baseline | null
  status: string
}
export type Analysis = {
  fact: string
  reason: string
  hypothesis: string
  limitations: string
  consequence: string
  checks: string[]
  algorithm_version: string
  demonstration: boolean
  measurement_ids: string[]
}
export type Alert = {
  id: string
  motor_id: string
  motor_name: string
  title: string
  kind: string
  severity: string
  status: string
  assignee: string
  opened_at: string
  recovered_at: string | null
  result: string
  evidence: Record<string, unknown>
  analysis: Analysis
  history?: { id: string; at: string; status: string; comment: string }[]
  inspections?: { id: string; findings: string; confirmed: boolean; created_at: string }[]
  maintenance?: { id: string; work: string; created_at: string }[]
}
export type Settings = { demo_enabled: boolean; stale_seconds: number; rule_version: string; storage: string }
