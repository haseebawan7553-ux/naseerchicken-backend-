import { mkdir, readFile, writeFile } from 'fs/promises'
import os from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

function resolveDataDirectory() {
  const explicitDir = String(process.env.DATA_DIR ?? '').trim()

  if (explicitDir) {
    return resolve(explicitDir)
  }

  if (process.env.RENDER) {
    return join(os.tmpdir(), 'naseer-chicken-data')
  }

  const localDataDirUrl = new URL('../../data', import.meta.url)
  return fileURLToPath(localDataDirUrl)
}

const businessFilePath = join(resolveDataDirectory(), 'business.json')

function defaultBusinessStore() {
  return {
    purchases: [],
    sales: [],
    wastePurchases: [],
    wasteSales: [],
    rates: [],
    expenses: [],
    workers: [],
  }
}

export function toBusinessNumber(value) {
  const parsed = Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

export async function ensureBusinessFile() {
  await mkdir(dirname(businessFilePath), { recursive: true })

  try {
    await readFile(businessFilePath, 'utf8')
  } catch {
    await writeFile(businessFilePath, JSON.stringify(defaultBusinessStore(), null, 2))
  }
}

export async function readBusinessStore() {
  await ensureBusinessFile()

  let parsed

  try {
    const raw = await readFile(businessFilePath, 'utf8')
    parsed = JSON.parse(raw)
  } catch {
    parsed = defaultBusinessStore()
    await writeFile(businessFilePath, JSON.stringify(parsed, null, 2))
  }

  return {
    purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
    sales: Array.isArray(parsed.sales) ? parsed.sales : [],
    wastePurchases: Array.isArray(parsed.wastePurchases) ? parsed.wastePurchases : [],
    wasteSales: Array.isArray(parsed.wasteSales) ? parsed.wasteSales : [],
    rates: Array.isArray(parsed.rates) ? parsed.rates : [],
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    workers: Array.isArray(parsed.workers) ? parsed.workers : [],
  }
}

export async function writeBusinessStore(store) {
  await ensureBusinessFile()
  await writeFile(businessFilePath, JSON.stringify(store, null, 2))
}

export function sortByNewest(left, right) {
  return new Date(right.updatedAt ?? right.createdAt ?? 0).getTime()
    - new Date(left.updatedAt ?? left.createdAt ?? 0).getTime()
}
