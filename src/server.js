import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import authRoutes from './routes/auth.routes.js'
import businessRoutes from './routes/business.routes.js'
import customerRoutes from './routes/customer.routes.js'
import inventoryRoutes from './routes/inventory.routes.js'
import vendorRoutes from './routes/vendor.routes.js'
import { errorHandler } from './middleware/error-handler.js'
import { requireAuth } from './middleware/require-auth.js'

const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

app.get('/', (_req, res) => {
  res.send('API is running')
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Ansir Chicken backend is running.' })
})

app.use('/api/auth', authRoutes)
app.use('/api/business', requireAuth, businessRoutes)
app.use('/api/customers', requireAuth, customerRoutes)
app.use('/api/inventory', requireAuth, inventoryRoutes)
app.use('/api/vendors', requireAuth, vendorRoutes)
app.use(errorHandler)

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
