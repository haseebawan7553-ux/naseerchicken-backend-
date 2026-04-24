import { randomUUID } from 'crypto'
import { Router } from 'express'
import {
  buildCustomerPayload,
  normaliseSaleType,
  readCustomerStore,
  toCustomerNumber,
  writeCustomerStore,
} from '../lib/customer-store.js'
import {
  readBusinessStore,
  sortByNewest,
  toBusinessNumber,
  writeBusinessStore,
} from '../lib/business-store.js'
import {
  buildVendorPayload,
  readVendorStore,
  toVendorNumber,
  writeVendorStore,
} from '../lib/vendor-store.js'

const router = Router()

function normalisePaymentType(value) {
  return String(value ?? '').trim().toUpperCase() === 'CREDIT' ? 'CREDIT' : 'CASH'
}

function normaliseExpenseType(value) {
  const clean = String(value ?? '').trim()
  return clean || 'Shop Expense'
}

function normaliseSalaryType(value) {
  const clean = String(value ?? '').trim().toUpperCase()
  if (clean === 'WEEKLY') {
    return 'Weekly'
  }
  if (clean === 'DAILY') {
    return 'Daily'
  }
  return 'Monthly'
}

function normaliseWasteSettlementCycle(value) {
  return String(value ?? '').trim().toUpperCase() === 'YEARLY' ? 'Yearly' : 'Monthly'
}

function createDateValue(value, fallback = new Date().toISOString()) {
  return value ? new Date(value).toISOString() : fallback
}

function buildPurchaseSummary(records) {
  const totalAmount = records.reduce((total, record) => total + toBusinessNumber(record.totalAmount), 0)
  const totalPaid = records.reduce((total, record) => total + toBusinessNumber(record.paidAmount), 0)
  const totalQuantity = records.reduce((total, record) => total + toBusinessNumber(record.quantity), 0)

  return {
    totalRecords: records.length,
    totalAmount,
    totalPaid,
    totalQuantity,
    unpaidAmount: Math.max(totalAmount - totalPaid, 0),
  }
}

function buildSalesSummary(records) {
  const totalAmount = records.reduce((total, record) => total + toBusinessNumber(record.totalAmount), 0)
  const cashSales = records.filter((record) => record.paymentType === 'CASH')
  const creditSales = records.filter((record) => record.paymentType === 'CREDIT')

  return {
    totalRecords: records.length,
    totalAmount,
    cashSales: cashSales.length,
    creditSales: creditSales.length,
    averageSale: records.length ? totalAmount / records.length : 0,
  }
}

function buildRatesSummary(records) {
  const latest = [...records].sort(sortByNewest)[0]

  return {
    totalUpdates: records.length,
    liveRate: toBusinessNumber(latest?.liveRate),
    boneMeatRate: toBusinessNumber(latest?.boneMeatRate),
    bonelessRate: toBusinessNumber(latest?.bonelessRate),
    lastUpdatedAt: latest?.effectiveDate ?? latest?.updatedAt ?? null,
  }
}

function buildExpenseSummary(records) {
  const totalAmount = records.reduce((total, record) => total + toBusinessNumber(record.amount), 0)

  return {
    totalRecords: records.length,
    totalAmount,
    salaryAmount: records
      .filter((record) => String(record.expenseType).toLowerCase().includes('salary'))
      .reduce((total, record) => total + toBusinessNumber(record.amount), 0),
    onlinePayments: records
      .filter((record) => String(record.paymentMethod).toLowerCase().includes('online'))
      .reduce((total, record) => total + toBusinessNumber(record.amount), 0),
  }
}

function buildWorkerSummary(records) {
  const totalSalary = records.reduce((total, record) => total + toBusinessNumber(record.salaryAmount), 0)

  return {
    totalRecords: records.length,
    totalSalary,
    monthlyWorkers: records.filter((record) => record.salaryType === 'Monthly').length,
    weeklyWorkers: records.filter((record) => record.salaryType === 'Weekly').length,
  }
}

function buildWasteSummary(purchaseRecords, saleRecords) {
  const totalPurchaseAmount = purchaseRecords.reduce((total, record) => total + toBusinessNumber(record.totalAmount), 0)
  const totalSaleAmount = saleRecords.reduce((total, record) => total + toBusinessNumber(record.totalAmount), 0)
  const totalPurchaseWeight = purchaseRecords.reduce((total, record) => total + toBusinessNumber(record.wasteWeight), 0)
  const totalSaleWeight = saleRecords.reduce((total, record) => total + toBusinessNumber(record.wasteWeight), 0)
  const totalAdvance = saleRecords.reduce((total, record) => total + toBusinessNumber(record.advanceAmount), 0)

  return {
    totalPurchaseRecords: purchaseRecords.length,
    totalSaleRecords: saleRecords.length,
    totalPurchaseAmount,
    totalSaleAmount,
    totalPurchaseWeight,
    totalSaleWeight,
    totalAdvance,
    totalReceivable: Math.max(totalSaleAmount - totalAdvance, 0),
    monthlyContracts: saleRecords.filter((record) => record.settlementCycle === 'Monthly').length,
    yearlyContracts: saleRecords.filter((record) => record.settlementCycle === 'Yearly').length,
    averagePurchaseRate: purchaseRecords.length ? totalPurchaseAmount / Math.max(totalPurchaseWeight, 1) : 0,
    averageSaleRate: saleRecords.length ? totalSaleAmount / Math.max(totalSaleWeight, 1) : 0,
  }
}

function buildReports(store, customerPayload, vendorPayload) {
  const purchaseSummary = buildPurchaseSummary(store.purchases ?? [])
  const salesSummary = buildSalesSummary(store.sales ?? [])
  const wasteSummary = buildWasteSummary(store.wastePurchases ?? [], store.wasteSales ?? [])
  const expenseSummary = buildExpenseSummary(store.expenses ?? [])
  const ratesSummary = buildRatesSummary(store.rates ?? [])
  const workerSummary = buildWorkerSummary(store.workers ?? [])
  const totalPurchaseAmount = purchaseSummary.totalAmount + wasteSummary.totalPurchaseAmount
  const totalSalesAmount = salesSummary.totalAmount + wasteSummary.totalSaleAmount
  const grossBalance = totalSalesAmount - totalPurchaseAmount - expenseSummary.totalAmount

  return {
    summary: {
      purchaseAmount: totalPurchaseAmount,
      salesAmount: totalSalesAmount,
      expenseAmount: expenseSummary.totalAmount,
      grossBalance,
      customerOutstanding: customerPayload.summary.totalOutstanding,
      vendorPayable: vendorPayload.summary.totalPayable,
    },
    sections: {
      dailyReport: [
        ['Purchase Entries', `${purchaseSummary.totalRecords}`],
        ['Sales Entries', `${salesSummary.totalRecords}`],
        ['Waste Purchases', `${wasteSummary.totalPurchaseRecords}`],
        ['Waste Sales', `${wasteSummary.totalSaleRecords}`],
        ['Expense Entries', `${expenseSummary.totalRecords}`],
        ['Rate Updates', `${ratesSummary.totalUpdates}`],
        ['Workers', `${workerSummary.totalRecords}`],
      ],
      customerLedger: customerPayload.customers
        .filter((customer) => customer.balance > 0)
        .slice(0, 10)
        .map((customer) => [
          customer.name,
          customer.phone || '-',
          `Rs. ${toCustomerNumber(customer.balance).toLocaleString()}`,
        ]),
      purchaseVsSales: [
        ['Purchases', `Rs. ${totalPurchaseAmount.toLocaleString()}`, `${purchaseSummary.totalRecords} normal + ${wasteSummary.totalPurchaseRecords} waste`],
        ['Sales', `Rs. ${totalSalesAmount.toLocaleString()}`, `${salesSummary.totalRecords} normal + ${wasteSummary.totalSaleRecords} waste`],
        ['Expenses', `Rs. ${expenseSummary.totalAmount.toLocaleString()}`, `${expenseSummary.totalRecords} records`],
        ['Gross Balance', `Rs. ${grossBalance.toLocaleString()}`, 'Live calculation'],
      ],
    },
  }
}

async function buildPayload() {
  const [businessStore, customerStore, vendorStore] = await Promise.all([
    readBusinessStore(),
    readCustomerStore(),
    readVendorStore(),
  ])

  const customerPayload = buildCustomerPayload(customerStore)
  const vendorPayload = buildVendorPayload(vendorStore)

  const purchases = [...businessStore.purchases].sort(sortByNewest)
  const sales = [...businessStore.sales].sort(sortByNewest)
  const wastePurchases = [...businessStore.wastePurchases].sort(sortByNewest)
  const wasteSales = [...businessStore.wasteSales].sort(sortByNewest)
  const rates = [...businessStore.rates].sort(sortByNewest)
  const expenses = [...businessStore.expenses].sort(sortByNewest)
  const workers = [...businessStore.workers].sort(sortByNewest)

  return {
    modules: {
      purchases: {
        records: purchases,
        summary: buildPurchaseSummary(purchases),
      },
      sales: {
        records: sales,
        summary: buildSalesSummary(sales),
      },
      waste: {
        purchases: wastePurchases,
        sales: wasteSales,
        summary: buildWasteSummary(wastePurchases, wasteSales),
      },
      rates: {
        records: rates,
        summary: buildRatesSummary(rates),
      },
      expenses: {
        records: expenses,
        summary: buildExpenseSummary(expenses),
      },
      workers: {
        records: workers,
        summary: buildWorkerSummary(workers),
      },
      reports: buildReports(
        {
          purchases,
          sales,
          wastePurchases,
          wasteSales,
          rates,
          expenses,
          workers,
        },
        customerPayload,
        vendorPayload,
      ),
    },
  }
}

async function appendVendorLedgerEntries(vendorId, entries, timestamp) {
  const vendorStore = await readVendorStore()
  const vendorIndex = vendorStore.vendors.findIndex((vendor) => vendor.id === vendorId)

  if (vendorIndex === -1) {
    throw new Error('Vendor not found.')
  }

  vendorStore.ledgerEntries = [
    ...entries.map((entry) => ({
      id: randomUUID(),
      vendorId,
      description: entry.description,
      entryType: entry.entryType,
      amount: toVendorNumber(entry.amount),
      notes: entry.notes ?? '',
      entryDate: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    ...(vendorStore.ledgerEntries ?? []),
  ]

  vendorStore.vendors[vendorIndex] = {
    ...vendorStore.vendors[vendorIndex],
    updatedAt: timestamp,
  }

  await writeVendorStore(vendorStore)
}

async function appendCustomerLedgerEntry(customerId, entry, timestamp) {
  const customerStore = await readCustomerStore()
  const customerIndex = customerStore.customers.findIndex((customer) => customer.id === customerId)

  if (customerIndex === -1) {
    throw new Error('Customer not found.')
  }

  customerStore.ledgerEntries = [
    {
      id: randomUUID(),
      customerId,
      description: entry.description,
      entryType: entry.entryType,
      amount: toCustomerNumber(entry.amount),
      notes: entry.notes ?? '',
      entryDate: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    ...(customerStore.ledgerEntries ?? []),
  ]

  customerStore.customers[customerIndex] = {
    ...customerStore.customers[customerIndex],
    saleType: entry.entryType === 'DEBIT'
      ? normaliseSaleType('CREDIT')
      : customerStore.customers[customerIndex].saleType,
    updatedAt: timestamp,
  }

  await writeCustomerStore(customerStore)
}

router.get('/', async (_req, res, next) => {
  try {
    res.json(await buildPayload())
  } catch (error) {
    next(error)
  }
})

router.post('/:moduleId/records', async (req, res, next) => {
  try {
    const { moduleId } = req.params
    const store = await readBusinessStore()
    const timestamp = new Date().toISOString()

    if (moduleId === 'purchases') {
      const {
        vendorId,
        productType,
        quantity,
        unit = 'KG',
        ratePerKg,
        paidAmount = 0,
        purchaseDate,
        notes = '',
      } = req.body

      if (!vendorId || !String(productType ?? '').trim()) {
        return res.status(400).json({ message: 'Vendor aur product type required hain.' })
      }

      const vendorStore = await readVendorStore()
      const vendor = vendorStore.vendors.find((item) => item.id === vendorId)

      if (!vendor) {
        return res.status(404).json({ message: 'Vendor not found.' })
      }

      const parsedQuantity = toBusinessNumber(quantity)
      const parsedRate = toBusinessNumber(ratePerKg)
      const parsedPaidAmount = toBusinessNumber(paidAmount)
      const totalAmount = parsedQuantity * parsedRate

      if (parsedQuantity <= 0 || parsedRate <= 0) {
        return res.status(400).json({ message: 'Quantity aur rate zero se baray hone chahiye.' })
      }

      if (parsedPaidAmount < 0 || parsedPaidAmount > totalAmount) {
        return res.status(400).json({ message: 'Paid amount valid hona chahiye aur total se zyada nahi ho sakta.' })
      }

      const record = {
        id: randomUUID(),
        vendorId,
        vendorName: vendor.name,
        productType: String(productType).trim(),
        quantity: parsedQuantity,
        unit: String(unit).trim() || 'KG',
        ratePerKg: parsedRate,
        paidAmount: parsedPaidAmount,
        totalAmount,
        purchaseDate: createDateValue(purchaseDate, timestamp),
        notes: String(notes).trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      store.purchases = [record, ...(store.purchases ?? [])]
      await writeBusinessStore(store)

      const vendorLedgerEntries = [
        {
          description: `${record.productType} purchase`,
          entryType: 'PURCHASE',
          amount: totalAmount,
          notes: record.notes,
        },
      ]

      if (parsedPaidAmount > 0) {
        vendorLedgerEntries.push({
          description: `${record.productType} purchase payment`,
          entryType: 'PAYMENT',
          amount: parsedPaidAmount,
          notes: record.notes,
        })
      }

      await appendVendorLedgerEntries(vendorId, vendorLedgerEntries, timestamp)

      return res.status(201).json({
        message: 'Purchase record successfully save ho gaya.',
        record,
        ...(await buildPayload()),
      })
    }

    if (moduleId === 'sales') {
      const {
        customerId,
        productType,
        quantity,
        unit = 'KG',
        ratePerKg,
        paymentType = 'CASH',
        saleDate,
        notes = '',
      } = req.body

      if (!customerId || !String(productType ?? '').trim()) {
        return res.status(400).json({ message: 'Customer aur product type required hain.' })
      }

      const customerStore = await readCustomerStore()
      const customerIndex = customerStore.customers.findIndex((item) => item.id === customerId)

      if (customerIndex === -1) {
        return res.status(404).json({ message: 'Customer not found.' })
      }

      const customer = customerStore.customers[customerIndex]
      const parsedQuantity = toBusinessNumber(quantity)
      const parsedRate = toBusinessNumber(ratePerKg)
      const cleanPaymentType = normalisePaymentType(paymentType)
      const totalAmount = parsedQuantity * parsedRate

      if (parsedQuantity <= 0 || parsedRate <= 0) {
        return res.status(400).json({ message: 'Quantity aur rate zero se baray hone chahiye.' })
      }

      const record = {
        id: randomUUID(),
        customerId,
        customerName: customer.name,
        productType: String(productType).trim(),
        quantity: parsedQuantity,
        unit: String(unit).trim() || 'KG',
        ratePerKg: parsedRate,
        totalAmount,
        paymentType: cleanPaymentType,
        saleDate: createDateValue(saleDate, timestamp),
        notes: String(notes).trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      store.sales = [record, ...(store.sales ?? [])]
      await writeBusinessStore(store)

      customerStore.customers[customerIndex] = {
        ...customer,
        saleType: cleanPaymentType === 'CREDIT' ? 'CREDIT' : customer.saleType,
        saleDate: record.saleDate,
        updatedAt: timestamp,
      }
      await writeCustomerStore(customerStore)

      if (cleanPaymentType === 'CREDIT') {
        await appendCustomerLedgerEntry(customerId, {
          description: `${record.productType} sale`,
          entryType: 'DEBIT',
          amount: totalAmount,
          notes: record.notes,
        }, timestamp)
      }

      return res.status(201).json({
        message: cleanPaymentType === 'CREDIT'
          ? 'Credit sale save ho gayi aur customer ledger update ho gaya.'
          : 'Cash sale successfully save ho gayi.',
        record,
        ...(await buildPayload()),
      })
    }

    if (moduleId === 'rates') {
      const {
        liveRate,
        boneMeatRate,
        bonelessRate,
        effectiveDate,
        updatedBy = 'Admin',
        notes = '',
      } = req.body

      const record = {
        id: randomUUID(),
        liveRate: toBusinessNumber(liveRate),
        boneMeatRate: toBusinessNumber(boneMeatRate),
        bonelessRate: toBusinessNumber(bonelessRate),
        effectiveDate: createDateValue(effectiveDate, timestamp),
        updatedBy: String(updatedBy).trim() || 'Admin',
        notes: String(notes).trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      store.rates = [record, ...(store.rates ?? [])]
      await writeBusinessStore(store)

      return res.status(201).json({
        message: 'Daily rates successfully save ho gaye.',
        record,
        ...(await buildPayload()),
      })
    }

    if (moduleId === 'waste') {
      const { transactionType } = req.body

      if (String(transactionType ?? '').trim().toUpperCase() === 'SALE') {
        const {
          partyName,
          phoneNumber = '',
          address = '',
          wasteWeight,
          unit = 'KG',
          ratePerKg,
          advanceAmount = 0,
          settlementCycle = 'Monthly',
          saleDate,
          notes = '',
        } = req.body

        const parsedWeight = toBusinessNumber(wasteWeight)
        const parsedRate = toBusinessNumber(ratePerKg)
        const parsedAdvance = toBusinessNumber(advanceAmount)
        const totalAmount = parsedWeight * parsedRate

        if (!String(partyName ?? '').trim() || parsedWeight <= 0 || parsedRate <= 0) {
          return res.status(400).json({ message: 'Party name, waste weight, aur sale rate required hain.' })
        }

        if (parsedAdvance < 0 || parsedAdvance > totalAmount) {
          return res.status(400).json({ message: 'Advance valid hona chahiye aur total amount se zyada nahi ho sakta.' })
        }

        const record = {
          id: randomUUID(),
          partyName: String(partyName).trim(),
          phoneNumber: String(phoneNumber).trim(),
          address: String(address).trim(),
          wasteWeight: parsedWeight,
          unit: String(unit).trim() || 'KG',
          ratePerKg: parsedRate,
          totalAmount,
          advanceAmount: parsedAdvance,
          receivableAmount: Math.max(totalAmount - parsedAdvance, 0),
          creditType: 'CREDIT',
          settlementCycle: normaliseWasteSettlementCycle(settlementCycle),
          saleDate: createDateValue(saleDate, timestamp),
          notes: String(notes).trim(),
          createdAt: timestamp,
          updatedAt: timestamp,
        }

        store.wasteSales = [record, ...(store.wasteSales ?? [])]
        await writeBusinessStore(store)

        return res.status(201).json({
          message: 'Waste sale credit record successfully save ho gaya.',
          record,
          ...(await buildPayload()),
        })
      }

      const {
        customerName,
        wasteWeight,
        unit = 'KG',
        ratePerKg,
        monthlyRate = 0,
        purchaseDate,
        notes = '',
      } = req.body

      const parsedWeight = toBusinessNumber(wasteWeight)
      const parsedRate = toBusinessNumber(ratePerKg)
      const parsedMonthlyRate = toBusinessNumber(monthlyRate)
      const totalAmount = parsedWeight * parsedRate

      if (!String(customerName ?? '').trim() || parsedWeight <= 0 || parsedRate <= 0) {
        return res.status(400).json({ message: 'Customer name, waste weight, aur purchase rate required hain.' })
      }

      const record = {
        id: randomUUID(),
        customerName: String(customerName).trim(),
        wasteWeight: parsedWeight,
        unit: String(unit).trim() || 'KG',
        ratePerKg: parsedRate,
        monthlyRate: Math.max(parsedMonthlyRate, 0),
        totalAmount,
        purchaseDate: createDateValue(purchaseDate, timestamp),
        notes: String(notes).trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      store.wastePurchases = [record, ...(store.wastePurchases ?? [])]
      await writeBusinessStore(store)

      return res.status(201).json({
        message: 'Waste purchase successfully save ho gayi.',
        record,
        ...(await buildPayload()),
      })
    }

    if (moduleId === 'expenses') {
      const {
        expenseType,
        title,
        expenseDate,
        amount,
        reference = '',
        paymentMethod = 'Cash',
        notes = '',
      } = req.body

      if (!String(title ?? '').trim() || toBusinessNumber(amount) <= 0) {
        return res.status(400).json({ message: 'Expense title aur amount required hain.' })
      }

      const record = {
        id: randomUUID(),
        expenseType: normaliseExpenseType(expenseType),
        title: String(title).trim(),
        expenseDate: createDateValue(expenseDate, timestamp),
        amount: toBusinessNumber(amount),
        reference: String(reference).trim(),
        paymentMethod: String(paymentMethod).trim() || 'Cash',
        notes: String(notes).trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      store.expenses = [record, ...(store.expenses ?? [])]
      await writeBusinessStore(store)

      return res.status(201).json({
        message: 'Expense record successfully save ho gaya.',
        record,
        ...(await buildPayload()),
      })
    }

    if (moduleId === 'workers') {
      const {
        name,
        phone = '',
        designation,
        salaryType = 'Monthly',
        salaryAmount,
        joiningDate,
        address = '',
        notes = '',
      } = req.body

      if (!String(name ?? '').trim() || !String(designation ?? '').trim()) {
        return res.status(400).json({ message: 'Worker name aur designation required hain.' })
      }

      const record = {
        id: randomUUID(),
        name: String(name).trim(),
        phone: String(phone).trim(),
        designation: String(designation).trim(),
        salaryType: normaliseSalaryType(salaryType),
        salaryAmount: toBusinessNumber(salaryAmount),
        joiningDate: createDateValue(joiningDate, timestamp),
        address: String(address).trim(),
        notes: String(notes).trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      store.workers = [record, ...(store.workers ?? [])]
      await writeBusinessStore(store)

      return res.status(201).json({
        message: 'Worker record successfully save ho gaya.',
        record,
        ...(await buildPayload()),
      })
    }

    return res.status(400).json({ message: 'Unsupported module for record creation.' })
  } catch (error) {
    next(error)
  }
})

export default router
