# Backend Testing

## DB-backed integration tests

The default backend Jest config runs `src/test/setup.ts` before each suite. That setup applies SQL migrations and requires a reachable PostgreSQL test database.

Create `backend/.env.test` from `backend/.env.test.example`, then set either:

- `DATABASE_URL=postgres://...`
- or `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`

The default fallback database name is `d6_student_communicator_test`.

Focused recent-work suites:

```sh
npm --prefix backend test -- --runInBand src/test/course.enrollment.module-sync.test.ts src/test/student.profile.test.ts src/test/support.tickets.test.ts src/test/approved-learner.import.test.ts
```

## DB-free unit tests

For logic that does not need migrations or a database, use the unit config:

```sh
npm --prefix backend run test:unit
```

This currently covers the learner CSV parser and bulk-import control flow without running the global DB bootstrap.
