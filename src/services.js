const { Op, QueryTypes, Sequelize } = require('sequelize')

function createServices({ sequelize }) {

  /**
   *
   * @param {Profile} user
   * @param {number} contractId
   * @returns {Promise<Contract>}
   */
  async function getContract(user, contractId) {
    const { Contract } = sequelize.models

    const profileField = user.isClient() ? 'ClientId' : 'ContractorId'
    return await Contract.findOne({
      where: {
        id: contractId,
        [profileField]: user.id,
      }
    })
  }

  /**
   *
   * @param {Profile} user
   * @returns {Promise<Contract[]>}
   */
  async function getNonTerminatedContracts(user) {
    const { Contract } = sequelize.models

    const profileField = user.isClient() ? 'ClientId' : 'ContractorId'
    return await Contract.findAll({ where: {
      status: { [Op.ne]: 'terminated' },
      [profileField]: user.id,
    }})
  }

  /**
   *
   * @param {Profile} user
   * @returns {Promise<Job[]>}
   */
  async function getActiveContractsUnpaidJobs(user) {
    const { Contract, Job } = sequelize.models
    const profileField = user.isClient() ? 'ClientId' : 'ContractorId'

    return await Job.findAll({
      where: {
        paid: { [Op.not]: true }
      },
      include: [{
        model: Contract,
        where: {
          [profileField]: user.id,
          status: 'in_progress'
        },
      }]
    })
  }

  // Question: Is it possible to pay for a job that belongs to the "terminated" or "new" contract?
  // Assume that contractor can only pay for an active contract job.
  /**
   *
   * @param {Profile} client
   * @param {number} jobId
   * @returns {Promise<void>}
   */
  async function payForJob(client, jobId) {
    const { Contract, Profile, Job } = sequelize.models
    await sequelize.transaction({
      type: Sequelize.Transaction.TYPES.IMMEDIATE
    }, async t => {
      const job = await Job.findOne({
        where: {
          id: jobId,
          paid: { [Op.not]: true }
        },
        include: [{
          model: Contract,
          where: {
            clientId: client.id,
            status: 'in_progress'
          },
        }]
      }, { lock: true })
      if (!job) throw createError('PAYMENT_JOB_NOT_FOUND')
      if (client.balance < job.price) throw createError('PAYMENT_INSUFFICIENT_FUNDS')

      const contractor = await Profile.findByPk(job.Contract.ContractorId, { lock: true })
      if (!contractor) throw createError('PAYMENT_CONTRACTOR_NOT_EXISTS')

      // TODO: calculate changes in balances more carefully, in a separate method
      const clientNewBalance = client.balance - job.price
      const contractorNewBalance = contractor.balance + job.price

      client.balance = clientNewBalance
      contractor.balance = contractorNewBalance
      job.paid = true
      job.paymentDate = new Date()

      await Promise.all([client, contractor, job].map(e => e.save({ transaction: t })))
    })
  }

  /**
   *
   * @param {Date} startDate
   * @param {Date} endDate
   * @returns {Promise<{profession: string, earned: number}>}
   */
  async function getBestProfession(startDate, endDate) {
    // TODO: figure out how this can be written in ORM-like way instead of raw SQL
    return await sequelize.query(`
      select P.profession, sum(J.price) earned
      from Jobs J
               left join Contracts C on J.ContractId = C.id
               left join Profiles P on C.ContractorId = P.id
      where J.paid = true
        and J.paymentDate >= :startDate
        and J.paymentDate <= :endDate
      group by P.profession
      order by earned desc
      limit 1
    `, {
      raw: true,
      plain: true,
      type: QueryTypes.SELECT,
      replacements: { startDate, endDate },
    })
  }

  /**
   *
   * @param {Date} startDate
   * @param {Date} endDate
   * @param {number} [limit=2]
   * @returns {Promise<{id: number, fullName: string, paid: number}[]>}
   */
  async function getBestClients(startDate, endDate, limit = 2) {
    // TODO: figure out how this can be written in ORM-like way instead of raw SQL
    return await sequelize.query(`
      select P.id, P.firstName || ' ' || P.lastName as fullName, sum(price) as paid
      from Jobs J
               left join Contracts C on J.ContractId = C.id
               left join Profiles P on C.ClientId = P.id
      where J.paid = true
        and J.paymentDate >= :startDate
        and J.paymentDate <= :endDate
      group by P.id
      order by paid desc
      limit :limit
    `, {
      raw: true,
      type: QueryTypes.SELECT,
      replacements: { startDate, endDate, limit },
    })
  }

  return {
    getContract,
    getNonTerminatedContracts,
    getActiveContractsUnpaidJobs,
    payForJob,
    getBestProfession,
    getBestClients,
  }
}

module.exports = createServices

// TODO: move to helpers and consider extending from Error class

function createError(code) {
  const codeToMessage = {
    PAYMENT_JOB_NOT_FOUND: 'There is no unpaid active job with the given job id',
    PAYMENT_INSUFFICIENT_FUNDS: 'There is not enough money to pay for the job',
    PAYMENT_CONTRACTOR_NOT_EXISTS: 'The contractor does not exist',
  }
  const error = new Error()
  error.code = code
  error.message = codeToMessage[code] ?? ''
  return error
}
