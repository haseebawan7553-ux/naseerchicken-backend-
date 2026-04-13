import { mkdir, readFile, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { Router } from 'express'
import { buildVendorNameList, ensureVendorExists, readVendorStore } from '../lib/vendor-store.js'

const router = Router()
const inventoryFileUrl = new URL('../../data/inventory.json', import.meta.url)
const inventoryFilePath = fileURLToPath(inventoryFileUrl)

function defaultInventoryStore() {
  return {
    records: {
      live: [],
      meat: [],
    },
  }
}

function toNumber(value) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function buildSummaryFromStore(store) {
  const live = store.records.live ?? []
  const meat = store.records.meat ?? []
  const sum = (records, key) => records.reduce((total, item) => total + toNumber(item[key]), 0)
  const average = (records, key) => (records.length ? sum(records, key) / records.length : 0)

  return {
    liveBirds: sum(live, 'stockQuantity'),
    avgLivePurchase: average(live, 'purchasePrice'),
    avgLiveSale: average(live, 'salePrice'),
    totalMeatKg: sum(meat, 'stockQuantity'),
    avgMeatPurchase: average(meat, 'purchasePrice'),
    avgMeatSale: average(meat, 'salePrice'),
    meatTypes: new Set(meat.map((item) => item.productType)).size,
  }
}

async function buildVendorsFromData(search = '') {
  const vendorStore = await readVendorStore()
  return buildVendorNameList(vendorStore, search)
}

async function ensureInventoryFile() {
  await mkdir(dirname(inventoryFilePath), { recursive: true })

  try {
    await readFile(inventoryFilePath, 'utf8')
  } catch {
    await writeFile(inventoryFilePath, JSON.stringify(defaultInventoryStore(), null, 2))
  }
}

async function readInventoryStore() {
  await ensureInventoryFile()

  const raw = await readFile(inventoryFilePath, 'utf8')
  const parsed = JSON.parse(raw)

  return {
    records: {
      live: parsed.records?.live ?? [],
      meat: parsed.records?.meat ?? [],
    },
  }
}

async function writeInventoryStore(store) {
  await ensureInventoryFile()
  await writeFile(inventoryFilePath, JSON.stringify(store, null, 2))
}

function filterRecords(records, search = '') {
  const query = search.trim().toLowerCase()

  if (!query) {
    return records
  }

  return records.filter((item) =>
    [
      item.id,
      item.vendorName,
      item.productType,
      item.notes,
      item.updatedAt,
    ].some((value) => String(value ?? '').toLowerCase().includes(query)),
  )
}

router.get('/', async (_req, res, next) => {
  try {
    const store = await readInventoryStore()

    res.json({
      records: store.records,
      summary: buildSummaryFromStore(store),
      vendors: await buildVendorsFromData(),
    })
  } catch (error) {
    next(error)
  }
})

router.get('/entries', async (req, res, next) => {
  try {
    const { kind, search = '' } = req.query

    if (!kind || !['live', 'meat'].includes(String(kind))) {
      return res.status(400).json({ message: 'Query parameter "kind" must be "live" or "meat".' })
    }

    const store = await readInventoryStore()
    const records = filterRecords(store.records[String(kind)] ?? [], String(search))

    res.json({ records })
  } catch (error) {
    next(error)
  }
})

router.get('/summary', async (_req, res, next) => {
  try {
    const store = await readInventoryStore()
    res.json(buildSummaryFromStore(store))
  } catch (error) {
    next(error)
  }
})

router.get('/vendors', async (req, res, next) => {
  try {
    res.json({ vendors: await buildVendorsFromData(String(req.query.search ?? '')) })
  } catch (error) {
    next(error)
  }
})

router.post('/entries', async (req, res, next) => {
  try {
    const {
      kind,
      vendorName = '',
      productType,
      purchasePrice,
      salePrice,
      stockQuantity,
      notes = '',
    } = req.body

    if (!kind || !['live', 'meat'].includes(String(kind))) {
      return res.status(400).json({ message: 'Field "kind" must be "live" or "meat".' })
    }

    if (!productType || !String(productType).trim()) {
      return res.status(400).json({ message: 'Product type is required.' })
    }

    if (!String(vendorName).trim()) {
      return res.status(400).json({ message: 'Vendor name is required.' })
    }

    const purchase = toNumber(purchasePrice)
    const sale = toNumber(salePrice)
    const stock = toNumber(stockQuantity)

    if ([purchase, sale, stock].some((value) => !Number.isFinite(value) || value < 0)) {
      return res.status(400).json({ message: 'Purchase price, sale price, and stock must be valid positive numbers.' })
    }

    const store = await readInventoryStore()
    const mode = String(kind)
    const timestamp = new Date().toISOString()
    const record = {
      id: randomUUID(),
      kind: mode,
      vendorName: String(vendorName).trim(),
      productType: String(productType).trim(),
      purchasePrice: purchase,
      salePrice: sale,
      stockQuantity: stock,
      stockUnit: mode === 'live' ? 'BIRDS' : 'KG',
      notes: String(notes).trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    store.records[mode] = [record, ...(store.records[mode] ?? [])]

    await writeInventoryStore(store)

    await ensureVendorExists(record.vendorName)

    res.status(201).json({
      record,
      summary: buildSummaryFromStore(store),
      vendors: await buildVendorsFromData(),
    })
  } catch (error) {
    next(error)
  }
})

router.put('/entries/:entryId', async (req, res, next) => {
  try {
    const { entryId } = req.params
    const {
      kind,
      vendorName = '',
      productType,
      purchasePrice,
      salePrice,
      stockQuantity,
      notes = '',
    } = req.body

    if (!kind || !['live', 'meat'].includes(String(kind))) {
      return res.status(400).json({ message: 'Field "kind" must be "live" or "meat".' })
    }

    if (!String(vendorName).trim()) {
      return res.status(400).json({ message: 'Vendor name is required.' })
    }

    if (!productType || !String(productType).trim()) {
      return res.status(400).json({ message: 'Product type is required.' })
    }

    const purchase = toNumber(purchasePrice)
    const sale = toNumber(salePrice)
    const stock = toNumber(stockQuantity)

    if ([purchase, sale, stock].some((value) => !Number.isFinite(value) || value < 0)) {
      return res.status(400).json({ message: 'Purchase price, sale price, and stock must be valid positive numbers.' })
    }

    const store = await readInventoryStore()
    const mode = String(kind)
    const entryIndex = (store.records[mode] ?? []).findIndex((item) => item.id === entryId)

    if (entryIndex === -1) {
      return res.status(404).json({ message: 'Inventory entry not found.' })
    }

    const currentRecord = store.records[mode][entryIndex]
    const record = {
      ...currentRecord,
      kind: mode,
      vendorName: String(vendorName).trim(),
      productType: String(productType).trim(),
      purchasePrice: purchase,
      salePrice: sale,
      stockQuantity: stock,
      stockUnit: mode === 'live' ? 'BIRDS' : 'KG',
      notes: String(notes).trim(),
      updatedAt: new Date().toISOString(),
    }

    store.records[mode][entryIndex] = record
    await writeInventoryStore(store)
    await ensureVendorExists(record.vendorName)

    res.json({
      record,
      summary: buildSummaryFromStore(store),
      vendors: await buildVendorsFromData(),
    })
  } catch (error) {
    next(error)
  }
})

router.delete('/entries/:entryId', async (req, res, next) => {
  try {
    const { entryId } = req.params
    const store = await readInventoryStore()
    let deleted = false
    let deletedKind = ''

    for (const mode of ['live', 'meat']) {
      const currentRecords = store.records[mode] ?? []
      const nextRecords = currentRecords.filter((item) => item.id !== entryId)

      if (nextRecords.length !== currentRecords.length) {
        store.records[mode] = nextRecords
        deleted = true
        deletedKind = mode
        break
      }
    }

    if (!deleted) {
      return res.status(404).json({ message: 'Inventory entry not found.' })
    }

    await writeInventoryStore(store)

    res.json({
      message: deletedKind === 'live'
        ? 'Live chicken record delete ho gaya.'
        : 'Meat stock record delete ho gaya.',
      records: store.records,
      summary: buildSummaryFromStore(store),
      vendors: await buildVendorsFromData(),
    })
  } catch (error) {
    next(error)
  }
})

export default router
