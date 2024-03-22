Toy repo to discuss what type of tests we'd use when.

### Situation
You work at a company that provides utility bill visualisation via a web
service. Your team maintains the cost calculations, with the primary entry point
being UtilityBill.calculateCost.

You are writing tests for the UtilityBill class.

You rely heavily on UsageFetcher, which hits external providers to fetch data.
This may be maintained by your team, or by another team. There are no provided
fakes available for it.

You use Prisma as a database adapter. The Schema for the DB can be found in
prisma.schema.