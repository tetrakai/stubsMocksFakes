type UsageDatum = {
  date: Date
  tariff: 'peak' | 'off-peak' | 'shoulder'
  hours: number
}

type Provider = 'ausgrid' | 'jemena'

export type Usage = {
  accountId: number
  provider: Provider
  data: UsageDatum[]
}

const maxAusgridAttempts = 3

export class UsageFetcher {
  async fetchUsage(accountId: number, startDate: Date, endDate: Date): Promise<Usage> {
    const provider = await this.getProviderFromAccountId(accountId)

    if (provider === 'ausgrid') {
      await this.getUsageForAusgrid(accountId, startDate, endDate)
    } else {
      await this.getUsageForJemena(accountId, startDate, endDate)
    }
  }

  private async getProviderFromAccountId(accountId: number): Promise<Provider> {
    // Make DB call to look up account. If the account doesn't exist, throw an
    // error. If the DB connection fails, the DB client in use throws an error.
    // If the DB schema is wrong (e.g. table/column does not exist), throws an
    // error, etc etc
    // Otherwise, returns a Provider
  }

  private async getUsageForAusgrid(accountId: number, startDate: Date, endDate: Date, numPreviousAttempts: number = 0): Promise<Usage> {
    const response: Response
    try {
      // Obviously not a real endpoint, don't do string interpolation for URLs like this in the real
      // world
      response = await fetch(`https://ausgrid.com.au/usage-data/${accountId}`)
    } catch (e) {
      throw new Error(`Error fetching Ausgrid data: ${String(e)}`)
    }

    // Handle rate limits
    if (response.status === 429) {
      if (numPreviousAttempts + 1 >= maxAusgridAttempts) {
        throw new Error(`Unable to fetch data from Ausgrid, timed out after ${maxAusgridAttempts} attempts`)
      } else {
        // Randomly backoff for between 1 and 3 seconds
        const jitterWait = Math.floor(Math.random() * 2000) + 1000
        await sleep(jitterWait)
        return await this.getUsageForAusgrid(accountId, startDate, endDate, numPreviousAttempts + 1)
      }
    } else if (response.status !== 200) {
      throw new Error(`Error fetching data from Ausgrid. Status: ${String(response.status)}. Error: ${String(response.error)}`)
    } else {
      return this.parseAusgridData(response.json())
    }
  }

  private async getUsageForJemena(accountId: number, startDate: Date, endDate: Date, numPreviousAttempts: number = 0): Promise<Usage> {
    // Similar custom logic
  }

  private parseAusgridData(data: any): Usage {
    // Complex custom logic here too
  }
}