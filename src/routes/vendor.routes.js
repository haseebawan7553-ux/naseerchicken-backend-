import { randomUUID } from 'crypto'
import { Router } from 'express'
import {
  buildVendorNameList,
  buildVendorPayload,
  normaliseVendorLedgerType,
  readVendorStore,
  toVendorNumber,
  writeVendorStore,
} from '../lib/vendor-store.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const store = await readVendorStore()
    res.json(buildVendorPayload(store))
  } catch (error) {
    next(error)
  }
})

router.get('/names', async (req, res, next) => {
  try {
    const store = await readVendorStore()
    res.json({ vendors: buildVendorNameList(store, String(req.query.search ?? '')) })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const {
      name,
      phone = '',
      address = '',
      ratePerKg = 0,
      rateAgreementPerDay = 0,
      openingBalance = 0,
      notes = '',
    } = req.body

    if (!String(name ?? '').trim()) {
      return res.status(400).json({ message: 'Vendor name is required.' })
    }

    const cleanName = String(name).trim()
    const parsedRate = toVendorNumber(ratePerKg)
    const parsedRateAgreementPerDay = toVendorNumber(rateAgreementPerDay)
    const parsedOpeningBalance = toVendorNumber(openingBalance)

    if (parsedRate < 0 || parsedRateAgreementPerDay < 0 || parsedOpeningBalance < 0) {
      return res.status(400).json({ message: 'Rate, rate agreement per day, aur current balance valid positive number hone chahiye.' })
    }

    const store = await readVendorStore()
    const duplicateVendor = (store.vendors ?? []).find(
      (vendor) => vendor.name.toLowerCase() === cleanName.toLowerCase(),
    )

    if (duplicateVendor) {
      return res.status(409).json({ message: 'Is naam ka vendor pehle se mojood hai.' })
    }

    const timestamp = new Date().toISOString()
    const vendor = {
      id: randomUUID(),
      name: cleanName,
      phone: String(phone).trim(),
      address: String(address).trim(),
      ratePerKg: parsedRate,
      rateAgreementPerDay: parsedRateAgreementPerDay,
      openingBalance: parsedOpeningBalance,
      notes: String(notes).trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    store.vendors = [vendor, ...(store.vendors ?? [])]
    await writeVendorStore(store)

    const payload = buildVendorPayload(store)
    res.status(201).json({
      message: 'Vendor successfully save ho gaya.',
      vendor: payload.vendors.find((item) => item.id === vendor.id),
      ...payload,
    })
  } catch (error) {
    next(error)
  }
})

router.put('/:vendorId', async (req, res, next) => {
  try {
    const { vendorId } = req.params
    const {
      name,
      phone = '',
      address = '',
      ratePerKg = 0,
      rateAgreementPerDay = 0,
      openingBalance = 0,
      notes = '',
    } = req.body

    if (!String(name ?? '').trim()) {
      return res.status(400).json({ message: 'Vendor name is required.' })
    }

    const cleanName = String(name).trim()
    const parsedRate = toVendorNumber(ratePerKg)
    const parsedRateAgreementPerDay = toVendorNumber(rateAgreementPerDay)
    const parsedOpeningBalance = toVendorNumber(openingBalance)

    if (parsedRate < 0 || parsedRateAgreementPerDay < 0 || parsedOpeningBalance < 0) {
      return res.status(400).json({ message: 'Rate, rate agreement per day, aur current balance valid positive number hone chahiye.' })
    }

    const store = await readVendorStore()
    const vendorIndex = (store.vendors ?? []).findIndex((vendor) => vendor.id === vendorId)

    if (vendorIndex === -1) {
      return res.status(404).json({ message: 'Vendor not found.' })
    }

    const duplicateVendor = (store.vendors ?? []).find(
      (vendor) => vendor.id !== vendorId && vendor.name.toLowerCase() === cleanName.toLowerCase(),
    )

    if (duplicateVendor) {
      return res.status(409).json({ message: 'Is naam ka vendor pehle se mojood hai.' })
    }

    const updatedVendor = {
      ...store.vendors[vendorIndex],
      name: cleanName,
      phone: String(phone).trim(),
      address: String(address).trim(),
      ratePerKg: parsedRate,
      rateAgreementPerDay: parsedRateAgreementPerDay,
      openingBalance: parsedOpeningBalance,
      notes: String(notes).trim(),
      updatedAt: new Date().toISOString(),
    }

    store.vendors[vendorIndex] = updatedVendor
    await writeVendorStore(store)

    const payload = buildVendorPayload(store)
    res.json({
      message: 'Vendor successfully update ho gaya.',
      vendor: payload.vendors.find((item) => item.id === updatedVendor.id),
      ...payload,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/:vendorId/ledger', async (req, res, next) => {
  try {
    const { vendorId } = req.params
    const {
      description,
      entryType = 'PURCHASE',
      amount,
      notes = '',
    } = req.body

    if (!String(description ?? '').trim()) {
      return res.status(400).json({ message: 'Ledger description is required.' })
    }

    const parsedAmount = toVendorNumber(amount)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Amount zero se bara hona chahiye.' })
    }

    const store = await readVendorStore()
    const vendorIndex = (store.vendors ?? []).findIndex((vendor) => vendor.id === vendorId)

    if (vendorIndex === -1) {
      return res.status(404).json({ message: 'Vendor not found.' })
    }

    const currentPayload = buildVendorPayload(store)
    const currentVendor = currentPayload.vendors.find((vendor) => vendor.id === vendorId)
    const normalisedEntryType = normaliseVendorLedgerType(entryType)

    if (normalisedEntryType === 'PAYMENT' && parsedAmount > toVendorNumber(currentVendor?.payableBalance)) {
      return res.status(400).json({ message: 'Payment current payable balance se zyada nahi ho sakti.' })
    }

    const timestamp = new Date().toISOString()
    const ledgerEntry = {
      id: randomUUID(),
      vendorId,
      description: String(description).trim(),
      entryType: normalisedEntryType,
      amount: parsedAmount,
      notes: String(notes).trim(),
      entryDate: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    store.ledgerEntries = [ledgerEntry, ...(store.ledgerEntries ?? [])]
    store.vendors[vendorIndex] = {
      ...store.vendors[vendorIndex],
      updatedAt: timestamp,
    }

    await writeVendorStore(store)

    const payload = buildVendorPayload(store)
    res.status(201).json({
      message: ledgerEntry.entryType === 'PAYMENT'
        ? 'Vendor payment successfully save ho gayi.'
        : 'Vendor purchase entry successfully save ho gayi.',
      ledgerEntry,
      vendor: payload.vendors.find((item) => item.id === vendorId),
      ...payload,
    })
  } catch (error) {
    next(error)
  }
})

export default router
