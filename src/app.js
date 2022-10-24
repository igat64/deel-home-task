const express = require('express')
const bodyParser = require('body-parser')

const { sequelize } = require('./model')
const { getProfile } = require('./middleware/getProfile')
const createServices = require("./services")

const app = express()
app.use(bodyParser.json())

app.set('sequelize', sequelize)
app.set('models', sequelize.models)
app.set('services', createServices({ sequelize }))

// TODO: apply request validation
// TODO: add global error handler
// TODO: extract and separate routes
// TODO: db indexes?

///////////// PUBLIC ENDPOINTS ///////////////

/**
 * @example curl 'localhost:3001/contracts/1'--header 'profile_id: 1'
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
  // TODO: validate and coerce id
  const { id } = req.params
  const profile = req.profile
  const { getContract } = req.app.get('services')

  const contract = await getContract(profile, id)
  if (!contract) return res.status(404).end()

  res.json(contract)
})

/**
 * @example curl 'localhost:3001/contracts' --header 'profile_id: 3'
 */
app.get('/contracts', getProfile, async (req, res) => {
  const profile = req.profile
  const { getNonTerminatedContracts } = req.app.get('services')

  const contracts = await getNonTerminatedContracts(profile)

  res.json(contracts)
})

/**
 * @example curl 'localhost:3001/jobs/unpaid' --header 'profile_id: 2'
 */
app.get('/jobs/unpaid', getProfile, async (req, res) => {
  const profile = req.profile
  const { getActiveContractsUnpaidJobs } = req.app.get('services')

  const jobs = await getActiveContractsUnpaidJobs(profile)

  res.json(jobs)
})

/**
 * @example curl --request POST 'localhost:3001/jobs/4/pay' --header 'profile_id: 2'
 */
app.post('/jobs/:jobId/pay', getProfile, async (req, res) => {
  const client = req.profile
  const { jobId } = req.params
  // TODO: validate jobId parameter
  const { payForJob } = req.app.get('services')
  if (!client.isClient()) return res.status(403).end()

  try {
    await payForJob(client, Number(jobId))
    return res.status(201).end()
  } catch (err) {
    console.error(err)
    // TODO: use the constants for the service error codes and possibly wrap in something like replyError(res, error)
    if (err.code === 'PAYMENT_JOB_NOT_FOUND')
      return res.status(404).end(err.message)
    if (err.code === 'PAYMENT_INSUFFICIENT_FUNDS')
      return res.status(400).end(err.message)
    if (err.code === 'PAYMENT_CONTRACTOR_NOT_EXISTS')
      return res.status(500).end(err.message)
    return res.status(500).end('Internal server error')
  }
})

app.post('/balances/deposit/:userId ', getProfile, async (req, res) => {
  // TODO: Implement me
  // Wasn't able to implement within the given time constrain
})

///////////// PRIVATE ENDPOINTS ///////////////

/**
 * @example curl 'localhost:3001/admin/best-profession?start=2020-08-13&end=2022-10-23'
 */
app.get('/admin/best-profession', async (req, res) => {
  const { start, end } = req.query
  const { getBestProfession } = req.app.get('services')
  // TODO: Resolve assumption: "start" and "end" query parameters are mandatory
  if (!start || !end)
    return res.status(400).end('Query parameters "start" and "end” must be provided')
  // TODO: carefully check query params

  const bestProfession = await getBestProfession(new Date(start), new Date(end))
  if (!bestProfession) return res.status(404).end()

  return res.json(bestProfession)
})

/**
 * @example curl 'localhost:3001/admin/best-clients?start=2020-08-13&end=2022-10-23&limit=1'
 */
app.get('/admin/best-clients', async (req, res) => {
  const { start, end, limit } = req.query
  const { getBestClients } = req.app.get('services')
  // TODO: Resolve assumption: "start" and "end" query parameters are mandatory
  if (!start || !end)
    return res.status(400).end('Query parameters "start" and "end” must be provided')
  if (limit !== undefined && isNaN(Number(limit)))
    return res.status(400).end('Query parameter "limit” must be a number')
  // TODO: carefully check query params like "limit" , "start" and "end"

  const startDate = new Date(start)
  const endDate = new Date(end)
  const take = limit ? Number(limit) : undefined
  const bestClients = await getBestClients(startDate, endDate, take)

  return res.json(bestClients)
})

module.exports = app



