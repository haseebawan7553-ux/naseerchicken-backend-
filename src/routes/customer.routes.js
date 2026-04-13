import { randomUUID } from 'crypto'
import { Router } from 'express'
import {
  buildCustomerPayload,
  normaliseCustomerEntryType,
  normaliseSaleType,
  readCustomerStore,
  toCustomerNumber,
  writeCustomerStore,
} from '../lib/customer-store.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const store = await readCustomerStore()
    res.json(buildCustomerPayload(store))
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const {
      name,
      phone = '',
      saleType = 'CASH',
      saleDate,
      address = '',
      notes = '',
    } = req.body

    if (!String(name ?? '').trim()) {
      return res.status(400).json({ message: 'Customer name is required.' })
    }

    const store = await readCustomerStore()
    const timestamp = new Date().toISOString()
    const customer = {
      id: randomUUID(),
      name: String(name).trim(),
      phone: String(phone).trim(),
      saleType: normaliseSaleType(saleType),
      saleDate: saleDate ? new Date(saleDate).toISOString() : timestamp,
      address: String(address).trim(),
      notes: String(notes).trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    store.customers = [customer, ...(store.customers ?? [])]
    await writeCustomerStore(store)

    const payload = buildCustomerPayload(store)
    res.status(201).json({
      message: 'Customer successfully save ho gaya.',
      customer: payload.customers.find((item) => item.id === customer.id),
      ...payload,
    })
  } catch (error) {
    next(error)
  }
})

router.put('/:customerId', async (req, res, next) => {
  try {
    const { customerId } = req.params
    const {
      name,
      phone = '',
      saleType = 'CASH',
      saleDate,
      address = '',
      notes = '',
    } = req.body

    if (!String(name ?? '').trim()) {
      return res.status(400).json({ message: 'Customer name is required.' })
    }

    const store = await readCustomerStore()
    const customerIndex = (store.customers ?? []).findIndex((customer) => customer.id === customerId)

    if (customerIndex === -1) {
      return res.status(404).json({ message: 'Customer not found.' })
    }

    const currentCustomer = store.customers[customerIndex]
    const updatedCustomer = {
      ...currentCustomer,
      name: String(name).trim(),
      phone: String(phone).trim(),
      saleType: normaliseSaleType(saleType),
      saleDate: saleDate ? new Date(saleDate).toISOString() : currentCustomer.saleDate ?? new Date().toISOString(),
      address: String(address).trim(),
      notes: String(notes).trim(),
      updatedAt: new Date().toISOString(),
    }

    store.customers[customerIndex] = updatedCustomer
    await writeCustomerStore(store)

    const payload = buildCustomerPayload(store)
    res.json({
      message: 'Customer successfully update ho gaya.',
      customer: payload.customers.find((item) => item.id === updatedCustomer.id),
      ...payload,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/:customerId/ledger', async (req, res, next) => {
  try {
    const { customerId } = req.params
    const {
      description,
      entryType = 'DEBIT',
      amount,
      notes = '',
      entryDate,
    } = req.body

    if (!String(description ?? '').trim()) {
      return res.status(400).json({ message: 'Ledger description is required.' })
    }

    const parsedAmount = toCustomerNumber(amount)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Ledger amount must be greater than zero.' })
    }

    const store = await readCustomerStore()
    const customerIndex = (store.customers ?? []).findIndex((customer) => customer.id === customerId)

    if (customerIndex === -1) {
      return res.status(404).json({ message: 'Customer not found.' })
    }

    const timestamp = new Date().toISOString()
    const ledgerEntry = {
      id: randomUUID(),
      customerId,
      description: String(description).trim(),
      entryType: normaliseCustomerEntryType(entryType),
      amount: parsedAmount,
      notes: String(notes).trim(),
      entryDate: entryDate ? new Date(entryDate).toISOString() : timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    store.ledgerEntries = [ledgerEntry, ...(store.ledgerEntries ?? [])]
    store.customers[customerIndex] = {
      ...store.customers[customerIndex],
      updatedAt: timestamp,
    }

    await writeCustomerStore(store)

    const payload = buildCustomerPayload(store)
    res.status(201).json({
      message: ledgerEntry.entryType === 'CREDIT'
        ? 'Recovery entry successfully save ho gayi.'
        : 'Ledger debit entry successfully save ho gayi.',
      ledgerEntry,
      customer: payload.customers.find((item) => item.id === customerId),
      ...payload,
    })
  } catch (error) {
    next(error)
  }
})

export default router
