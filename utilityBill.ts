const allTariffs = [
  'peak',
  'off-peak',
  'shoulder'
]

export class UtilityBill {
  constructor(
    readonly accountId: string,
    private readonly usageFetcher: UsageFetcher
  ) {
    // Something something construction creates a connection pool and checks
    // for valid credentials being present.
  }

  async calculateCost(startDate: Date, endDate: Date): Promise<number> {
    // Check that the args passed are valid
    this.validateDates(startDate, endDate)

    // Fetch the usage data for the account
    let usage: Usage
    try {
      usage = await this.usageFetcher.fetchUsage(this.accountId, startDate, endDate)
    } catch (e) {
      throw new Error(`Could not fetch usage data: ${String(e)}`)
    }

    // Fetch the rates for the account
    let ratePerTariff: {[ key: string]: {ratePerMin: number, startDate: Date, endDate: Date}[]}
    let greenPowerSurchargePerTariff: {[ key: string]: {percInc: number, startDate: Date, endDate: Date}[]}
    try {
      ratePerTariff = await this.getTariffs()
      greenPowerSurchargePerTariff = await this.getGreenPowerSurcharges()
    } catch (e) {
      throw new Error(`Could not fetch tariff rates: ${String(e)}`)
    }

    // Calculate how much the usage would have cost
    // (In real life I think I would break this out into a separate and more
    // easily tested function, but for the sake of example, lets say that it
    // needs to be inline for some reason)
    let totalCost: number = 0
    usage.data.forEach(datum => {
      const rate = ratePerTariff[datum.tariff]?.find(t => {t.startDate >= usage.date && t.endDate < usage.date})
      const surcharge = greenPowerSurchargePerTariff[datum.tariff]?.find(t => {t.startDate >= usage.date && t.endDate < usage.date})

      if (rate === undefined) {
        throw new Error(`Unknown rate for tariff ${datum.tariff} on date ${datum.date}`)
      }

      let cost = rate.ratePerMin * (datum.hours * 60)
      if (surcharge !== undefined) {
        cost = cost + (cost * surcharge.percInc / 100.0)
      }

      totalCost += cost
    })

    // We return the total cost in dollars, rather than cents
    return totalCost / 100.0
  }

  /* Functions below here public for testing only */
  validateDates(startDate: Date, endDate: Date) {
    if (startDate > new Date()) {
      throw new Error('Start date must be in the past')
    }

    if (endDate > new Date()) {
      throw new Error('End date must be in the past')
    }

    if (startDate >= endDate) {
      throw new Error('Start date must be earlier than end date')
    }
  }

  calculatePeakCost(usage: usageDatum[]) {
    const totalHours = usage.filter(u => {u.tariff === 'peak'})
  }

  async getTariffs(): Promise<{[ key: string]: {ratePerMin: number, startDate: Date, endDate: Date}[]}> {
    const tariffs = await prisma.tariffRates.findMany({
      where: {
        accountId: this.accountId
      }
    })

    const ratePerTariff: {
      [key: string]: {ratePerMin: number, startDate: Date, endDate: Date}[],
    } = {}

    tariffs.forEach(t => {
      if (ratePerTariff[t.type] === undefined) {
        ratePerTariff[t.type] = []
      }

      ratePerTariff[t.type].push({
        ratePerMin: t.ratePerMin,
        startDate: t.startDate,
        endDate: t.endDate
      })
    })

    return ratePerTariff
  }

  async getGreenPowerSurcharges(): Promise<{[ key: string]: {percInc: number, startDate: Date, endDate: Date}[]}> {
    const surcharges = await prisma.greenPowerSurcharges.findMany({
      where: {
        accountId: this.accountId
      }
    })

    const surchargePerTariff: {
      [key: string]: {percInc: number, startDate: Date, endDate: Date}[],
    } = {}

    surcharges.forEach(surcharge => {
      let applyToTariffs = surcharge.onlyOnTariffs || allTariffs

      applyToTariffs.forEach(tariff => {
        if (surchargePerTariff[tariff] === undefined) {
          surchargePerTariff[tariff] = []
        }

        surchargePerTariff[tariff].push({
          percInc: surcharge.percInc,
          startDate: surcharge.startDate,
          endDate: surcharge.endDate
        })
      })

    })

    return surchargePerTariff
  }
}