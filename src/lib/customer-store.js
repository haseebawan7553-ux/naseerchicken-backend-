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

const customersFilePath = join(resolveDataDirectory(), 'customers.json')

function defaultCustomerStore() {
  return {
    customers: [],
    ledgerEntries: [],
  }
}

export function toCustomerNumber(value) {
  const parsed = Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

export function normaliseSaleType(value) {
  const normalised = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

  if (normalised === 'NET_SALE') {
    return 'NET_SALE'
  }

  if (normalised === 'CREDIT') {
    return 'CREDIT'
  }

  return 'CASH'
}

export function normaliseCustomerEntryType(value) {
  return String(value ?? '').trim().toUpperCase() === 'CREDIT' ? 'CREDIT' : 'DEBIT'
}

async function ensureCustomersFile() {
  await mkdir(dirname(customersFilePath), { recursive: true })

  try {
    await readFile(customersFilePath, 'utf8')
  } catch {
    await writeFile(customersFilePath, JSON.stringify(defaultCustomerStore(), null, 2))
  }
}

export async function readCustomerStore() {
  await ensureCustomersFile()

  let parsed

  try {
    const raw = await readFile(customersFilePath, 'utf8')
    parsed = JSON.parse(raw)
  } catch {
    parsed = defaultCustomerStore()
    await writeFile(customersFilePath, JSON.stringify(parsed, null, 2))
  }

  return {
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    ledgerEntries: Array.isArray(parsed.ledgerEntries) ? parsed.ledgerEntries : [],
  }
}

export async function writeCustomerStore(store) {
  await ensureCustomersFile()
  await writeFile(customersFilePath, JSON.stringify(store, null, 2))
}

function sortByNewest(left, right) {
  return new Date(right.updatedAt ?? right.createdAt ?? 0).getTime()
    - new Date(left.updatedAt ?? left.createdAt ?? 0).getTime()
}

export function buildCustomerPayload(store) {
  const customers = (store.customers ?? [])
    .map((customer) => {
      const ledgerEntries = (store.ledgerEntries ?? [])
        .filter((entry) => entry.customerId === customer.id)
        .sort(sortByNewest)

      const totalDebit = ledgerEntries
        .filter((entry) => entry.entryType === 'DEBIT')
        .reduce((total, entry) => total + toCustomerNumber(entry.amount), 0)

      const totalCredit = ledgerEntries
        .filter((entry) => entry.entryType === 'CREDIT')
        .reduce((total, entry) => total + toCustomerNumber(entry.amount), 0)

      return {
        ...customer,
        saleType: normaliseSaleType(customer.saleType),
        totalDebit,
        totalCredit,
        balance: totalDebit - totalCredit,
        saleDate: customer.saleDate ?? customer.createdAt,
        ledgerEntries,
        lastActivityAt: ledgerEntries[0]?.entryDate ?? customer.updatedAt,
      }
    })
    .sort(sortByNewest)

  const totalOutstanding = customers.reduce(
    (total, customer) => total + Math.max(customer.balance, 0),
    0,
  )

  return {
    customers,
    summary: {
      activeCustomers: customers.length,
      netSaleCustomers: customers.filter((customer) => customer.saleType === 'NET_SALE').length,
      creditCustomers: customers.filter((customer) => customer.saleType === 'CREDIT').length,
      cashCustomers: customers.filter((customer) => customer.saleType === 'CASH').length,
      ledgerEntries: store.ledgerEntries?.length ?? 0,
      totalOutstanding,
    },
  }
}
