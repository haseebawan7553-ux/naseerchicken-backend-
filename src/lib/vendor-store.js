import { randomUUID } from 'crypto'
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

const vendorsFilePath = join(resolveDataDirectory(), 'vendors.json')

function defaultVendorStore() {
  return {
    vendors: [],
    ledgerEntries: [],
  }
}

export function toVendorNumber(value) {
  const parsed = Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

export function normaliseVendorLedgerType(value) {
  return String(value ?? '').trim().toUpperCase() === 'PAYMENT' ? 'PAYMENT' : 'PURCHASE'
}

async function ensureVendorsFile() {
  await mkdir(dirname(vendorsFilePath), { recursive: true })

  try {
    await readFile(vendorsFilePath, 'utf8')
  } catch {
    await writeFile(vendorsFilePath, JSON.stringify(defaultVendorStore(), null, 2))
  }
}

export async function readVendorStore() {
  await ensureVendorsFile()

  let parsed

  try {
    const raw = await readFile(vendorsFilePath, 'utf8')
    parsed = JSON.parse(raw)
  } catch {
    parsed = defaultVendorStore()
    await writeFile(vendorsFilePath, JSON.stringify(parsed, null, 2))
  }

  return {
    vendors: Array.isArray(parsed.vendors) ? parsed.vendors : [],
    ledgerEntries: Array.isArray(parsed.ledgerEntries) ? parsed.ledgerEntries : [],
  }
}

export async function writeVendorStore(store) {
  await ensureVendorsFile()
  await writeFile(vendorsFilePath, JSON.stringify(store, null, 2))
}

function sortByNewest(left, right) {
  return new Date(right.updatedAt ?? right.createdAt ?? 0).getTime()
    - new Date(left.updatedAt ?? left.createdAt ?? 0).getTime()
}

export function buildVendorPayload(store) {
  const vendors = (store.vendors ?? [])
    .map((vendor) => {
      const ledgerEntries = (store.ledgerEntries ?? [])
        .filter((entry) => entry.vendorId === vendor.id)
        .sort(sortByNewest)

      const totalPurchases = ledgerEntries
        .filter((entry) => entry.entryType === 'PURCHASE')
        .reduce((total, entry) => total + toVendorNumber(entry.amount), 0)

      const totalPayments = ledgerEntries
        .filter((entry) => entry.entryType === 'PAYMENT')
        .reduce((total, entry) => total + toVendorNumber(entry.amount), 0)

      const openingBalance = toVendorNumber(vendor.openingBalance)
      const payableBalance = openingBalance + totalPurchases - totalPayments

      return {
        ...vendor,
        rateAgreementPerDay: toVendorNumber(vendor.rateAgreementPerDay),
        openingBalance,
        totalPurchases,
        totalPayments,
        payableBalance,
        ledgerEntries,
        lastActivityAt: ledgerEntries[0]?.entryDate ?? vendor.updatedAt,
      }
    })
    .sort(sortByNewest)

  const totalPayable = vendors.reduce(
    (total, vendor) => total + Math.max(vendor.payableBalance, 0),
    0,
  )

  const averageRate = vendors.length
    ? vendors.reduce((total, vendor) => total + toVendorNumber(vendor.ratePerKg), 0) / vendors.length
    : 0

  return {
    vendors,
    summary: {
      totalVendors: vendors.length,
      vendorsWithPayable: vendors.filter((vendor) => vendor.payableBalance > 0).length,
      ledgerEntries: store.ledgerEntries?.length ?? 0,
      totalPayable,
      averageRate,
    },
  }
}

export function buildVendorNameList(store, search = '') {
  const query = String(search ?? '').trim().toLowerCase()

  return (store.vendors ?? [])
    .map((vendor) => vendor.name)
    .filter((name) => name && name.toLowerCase().includes(query))
    .sort((left, right) => left.localeCompare(right))
}

export async function ensureVendorExists(name) {
  const cleanName = String(name ?? '').trim()

  if (!cleanName) {
    return null
  }

  const store = await readVendorStore()
  const existingVendor = (store.vendors ?? []).find(
    (vendor) => vendor.name.toLowerCase() === cleanName.toLowerCase(),
  )

  if (existingVendor) {
    return existingVendor
  }

  const timestamp = new Date().toISOString()
    const vendor = {
      id: randomUUID(),
      name: cleanName,
      phone: '',
      address: '',
      ratePerKg: 0,
      rateAgreementPerDay: 0,
      openingBalance: 0,
      notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  store.vendors = [vendor, ...(store.vendors ?? [])]
  await writeVendorStore(store)

  return vendor
}
