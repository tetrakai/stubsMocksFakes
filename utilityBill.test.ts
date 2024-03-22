import { mock } from 'jest-mock-extended'

/*
Choice: real (but would actually be a fake for me, to be honest)

When unit testing validate dates, we can use the real Date interface. I wouldn't
personally do this myself if I could get away with it, because it leads to time
bomb tests (I'd prefer to use a fake time implementation), but would do this if
e.g. it turned out that faking time was super annoying in the language I was
working in.

In the end-to-end calculateCosts function, I actually fake time, to demonstrate
what this would look like.

Reason:
 * Using a real (or fake) Date doesn't make tests materially slower
 * Mocking or stubbing time introduces the risk that you mock differently to the
   actual implementation, and this function is tightly coupled to the underlying
   Date interface
*/
describe("validateDates", () => {
  const testAccountId = 123
  const mockUsageFetcher = mock<UsageFetcher>()
  const utilityBill = new UtilityBill(testAccountId, mockUsageFetcher)

  test('permits dates that are in the past', () => {
    expect(() => {
      utilityBill.validateDates(new Date(1970, 1, 1), new Date(1970, 2, 1))
    }).not.toThrow()
  })

  test('does not permit dates that are in the future', () => {
    // Strictly this is a timebomb test, but it doesn't seem likely that our
    // code will still be in use in 75 years time...
    expect(() => {
      utilityBill.validateDates(new Date(2100, 1, 1), new Date(2100, 2, 1))
    }).toThrow()
  })

  test('does not permit cases where the end date is prior or equal to the start date', () => {
    expect(() => {
      utilityBill.validateDates(new Date(1970, 2, 1), new Date(1970, 1, 1))
    }).toThrow()
  })
})

/*
Choice: fake (with a stubbed error method)

For getGreenPowerSurcharges, we're fetching data from the DB and then
manipulating it into another shape. We use an in-memory DB fake (Prismock, for
the underlying Prisma DB adapter).

This gives us approximately the same contract as talking to the real DB would,
though not entirely - we have to manually stub DB errors to check that code is
resilient to those cases.

We're also relying on the assumption that the real Prisma client will correctly
catch all underlying errors (e.g. network errors) and re-throw them specifically
as PrismaErrors.

Reason:
 * Using a real implementation of the DB would require setting up our tests to
   run inside e.g. a local docker container (a lot of work). It will also mean
   that we need to run our tests in serial, since otherwise one test's state
   could interfere with another's
 * Just stubbing the returns from the database calls introduces significant risk
   that the DB schema could change (but not our test code), and that our code
   might not be resilient to these changes.

*/
describe("getGreenPowerSurcharges", () => {
  const testAccountId = 123
  const mockUsageFetcher = mock<UsageFetcher>()
  const utilityBill = new UtilityBill(testAccountId, mockUsageFetcher)
  let client: PrismockClient

  beforeEach(async () => {
    // Mock out the DB client with an in-memory version (not actually certain
    // that putting this in a beforeEach handler would work, but roll with it
    // and pretend it does)
    client = jest.requireActual('prismock').PrismockClient

    jest.mock('@prisma/client', () => {
      return {
        ...jest.requireActual('@prisma/client'),
        PrismaClient: client
      }
    })
  })

  test('does not handle DB errors', async () => {
    jest.spyOn(
      client.greenPowerSurcharges, 'findMany'
    ).mockImplementation(async () => {
      throw new PrismaError('Unable to connect to DB');
    })

    await expect(utilityBill.getGreenPowerSurcharges()).rejects.toThrow()
  })

  test('handles an account with no green power surcharge', async () => {
    // No data in the DB => no surcharges
    await expect(utilityBill.getGreenPowerSurcharges()).resolves.toEqual({})
  })

  test('handles surcharges that are applied globally', async () => {
    // Create a surcharge that applies globally
    await client.account.create({
      data: {
        id: testAccountId,
        provider: 'ausgrid'
      }
    }

    const startDate = new Date(2020, 1, 1)
    const endDate = new Date(2020, 2, 1)
    await client.greenPowerSurcharges.create({
      data: {
        accountId: testAccountId,
        percInc: 5,
        startDate: startDate,
        endDate: endDate
      }
    })

    await expect(utilityBill.getGreenPowerSurcharges()).resolves.toEqual({
      'peak': [{
        percInc: 5,
        startDate,
        endDate,
      }],
      'off-peak': [{
        percInc: 5,
        startDate,
        endDate
      }],
      'shoulder': [{
        percInc: 5,
        startDate,
        endDate
      }]
    })
  })

  test('handles surcharges that are applied to specific tariffs', async () => {
    // Create a surcharge that applies only to a subset of tariffs
    await client.account.create({
      data: {
        id: testAccountId,
        provider: 'ausgrid'
      }
    }

    const startDate = new Date(2020, 1, 1)
    const endDate = new Date(2020, 2, 1)
    await client.greenPowerSurcharges.create({
      data: {
        accountId: testAccountId,
        percInc: 5,
        startDate: startDate,
        endDate: endDate
        onlyOnTariffs: ['peak', 'shoulder']
      }
    })

    await expect(utilityBill.getGreenPowerSurcharges()).resolves.toEqual({
      'peak': [{
        percInc: 5,
        startDate,
        endDate,
      }],
      'shoulder': [{
        percInc: 5,
        startDate,
        endDate
      }]
    })
  })
})

/*
Choice: stub (validateDate)
Choice: mock (UsageFetcher)
Choice: stub (getTariffs and getGreenPowerSurcharge)

Reason:
 * We're only attempting to unit test the actual calculation logic in our
   function, not check that everything works end-to-end
*/
describe("calculateCost (unit)", () => {
  const testAccountId = 123
  const mockUsageFetcher = mock<UsageFetcher>()
  const utilityBill = new UtilityBill(testAccountId, mockUsageFetcher)

  const startDate = new Date(2023, 6, 1)
  const endDate = newDate(2023, 8, 31)

  // Pretend that there are a bunch more tests that look just like this one, but
  // testing different values for the usage and tariff combinations. I'm too
  // lazy to write all these for a toy, they all have the same shape.
  test('correctly performs calculations ', async () => {
    // All dates are valid
    jest.spyOn(
      utilityBill, 'validateDates'
    ).mockImplementation(() => {})

    mockUsageFetcher.fetchUsage = jest.fn().mockReturnValue({
      accountId: testAccountId,
      provider: 'ausgrid',
      data: [{
        date: new Date(2023, 7, 1),
        tariff: 'peak',
        hours: 3,
      }],
    })

    jest.spyOn(
      utilityBill, 'getTariffs'
    ).mockImplementation(async () => {
      return {
        'peak': [{
          ratePerMin: 3,
          startDate,
          endDate
        }]
      }
    })

    jest.spyOn(
      utilityBill, 'getGreenPowerSurcharges'
    ).mockImplementation(async () => {
      return {}
    })

    // 3c / min, for 3 hours
    // (3 * 60 * 3 / 100) = $5.40 (very expensive electricity!)
    await expect(utilityBill.calculateCost()).resolves.toEqual(5.4)
  })
})

/*
Choice: mock (UsageFetcher)

Reason:
 * Faking the entire behavior of this class would be expensive, and for little
   benefit - it has a very simple interface, it either returns data of a
   well-specified type, or it throws an error. We handle all errors thrown by
   this class identically, and the underlying implementation is a clear
   functionality boundary.
 * Stubbing just the method we're calling would be another option, but means
   that we exercise the constructor code for the class, which adds cost and
   complexity to our tests, without meaningfully improving the overall
   guarantees we get (i.e. we still won't have a "real enough" implementation
   that we'd be 100% certain we're testing the whole flow end-to-end)
*/

/*
Choice: fake and stub (Prisma)

Reason:
 * Similar to the getGreenPowerSurcharges code, we use a fake DB client where
   possible, to minimise the number of mocks, but do need to stub the result in
   an error case, to ensure that we handle it correctly
 * If the getGreenPowerSurcharges code wrapped the DB error, I would have chosen
   to stub that method, rather than the DB, and to just mock the wrapped error
   being thrown
*/

/*
Choice: fake (Date)

Reason:
 * Using real dates introduces the chance that something unrelated to our code
   (i.e. the system time) could create test failures
 * The goal of an end-to-end test is to catch the cases that might be missed by
   more isolated tests, i.e. those with more stubs and mocks, so my aim is to
   use the fewest mocks as possible, while letting the test be reliable
*/
describe("calculateCost (end-to-end)", () => {
  const testAccountId = 123
  const mockUsageFetcher = mock<UsageFetcher>()
  const utilityBill = new UtilityBill(testAccountId, mockUsageFetcher)
  let client: PrismockClient
  const startDate = new Date(2023, 6, 1)
  const endDate = newDate(2023, 8, 31)

  beforeEach(async () => {
    // Mock out the DB client with an in-memory version (not actually certain
    // that putting this in a beforeEach handler would work, but roll with it
    // and pretend it does)
    client = jest.requireActual('prismock').PrismockClient

    jest.mock('@prisma/client', () => {
      return {
        ...jest.requireActual('@prisma/client'),
        PrismaClient: client
      }
    })

    // Fake time for all the tests, so that we can be sure the code is running
    // the same way each time
    jest.setSystemTime(new Date(2024, 1, 1))
  })

  test('handles usage fetching errors', async () => {
    mockUsageFetcher.fetchUsage = jest.fn().mockImplementation(async () => {
      throw new Error('Error fetching Ausgrid data')
    })

    await expect(
      utilityBill.calculateCost()
    ).rejects.toThrow(
      new Error('Could not fetch usage data: Error fetching Ausgrid data')
    )
  })

  test('handles database errors', async () => {
    mockUsageFetcher.fetchUsage = jest.fn().mockReturnValue({
      accountId: testAccountId,
      provider: 'ausgrid',
      data: [],
    })

    jest.spyOn(
      client.greenPowerSurcharges, 'findMany'
    ).mockImplementation(async () => {
      throw new PrismaError('Unable to connect to DB');
    })

    await expect(
      utilityBill.calculateCost()
    ).rejects.toThrow(
      new Error('Could not fetch tariff rates: Unable to connect to DB')
    )
  })

  test('handles missing tariffs', async () => {
    mockUsageFetcher.fetchUsage = jest.fn().mockReturnValue({
      accountId: testAccountId,
      provider: 'ausgrid',
      data: [{
        date: new Date(2023, 7, 1),
        tariff: 'peak',
        hours: 3,
      }],
    })

    await expect(
      utilityBill.calculateCost()
    ).rejects.toThrow(
      new Error('Unknown rate for tariff peak on date 2023-07-01')
    )
  })

  test('correctly calculates for an account with no surcharges', async () => {
    // Create a tariff rate plan
    await client.account.create({
      data: {
        id: testAccountId,
        provider: 'ausgrid'
      }
    }

    await client.tariffRates.create({
      data: {
        accountId: testAccountId,
        type: 'peak',
        ratePerMin: 20,
        startDate,
        endDate
      }
    })

    mockUsageFetcher.fetchUsage = jest.fn().mockReturnValue({
      accountId: testAccountId,
      provider: 'ausgrid',
      data: [{
        date: new Date(2023, 7, 1),
        tariff: 'peak',
        hours: 3,
      }],
    })

    // 20c / min, for 3 hours
    // 20 * 60 * 3 / 100 = $36 (very expensive electricity!)
    await expect(utilityBill.calculateCost()).resolves.toEqual(36.0)
  })

  test('correctly calculates for an account with surcharges', async () => {
    // Create a tariff rate plan
    await client.account.create({
      data: {
        id: testAccountId,
        provider: 'ausgrid'
      }
    }

    await client.tariffRates.create({
      data: {
        accountId: testAccountId,
        type: 'peak',
        ratePerMin: 20,
        startDate,
        endDate
      }
    })

    // And a surcharge
    await client.greenPowerSurcharges.create({
      data: {
        accountId: testAccountId,
        percInc: 5,
        startDate: startDate,
        endDate: endDate
      }
    })

    mockUsageFetcher.fetchUsage = jest.fn().mockReturnValue({
      accountId: testAccountId,
      provider: 'ausgrid',
      data: [{
        date: new Date(2023, 7, 1),
        tariff: 'peak',
        hours: 3,
      }],
    })

    // 20c / min, for 3 hours, with a 5% surcharge
    // (20 * 60 * 3 / 100) * 1.05 = $37.80 (very expensive electricity!)
    await expect(utilityBill.calculateCost()).resolves.toEqual(37.8)
  })
})


