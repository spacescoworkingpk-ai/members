# Supabase Setup

Project reference:

```text
hsnkcrxowajnadwtzdlk
```

Confirmed API URL:

```text
https://hsnkcrxowajnadwtzdlk.supabase.co
```

## Running The Schema

Option A: Supabase SQL Editor

1. Open the project dashboard.
2. Go to SQL Editor.
3. Paste the contents of `supabase/schema.sql`.
4. Run it.

For an existing live database, apply numbered files in `supabase/migrations/`
in filename order. The current accounting authority is:

```text
supabase/migrations/20260906_reliable_write_paths.sql
```

It makes member bundles, payments, edited invoices, and linked ledger writes
atomic. Request IDs protect retried creates from duplicate entries. Apply it
before deploying the matching app.js. It does not backfill or reset balances.
Do not use older multi-request REST write fallbacks.

The live project successfully applied this migration on 13 September 2026.
Schema changes are transactional and the migration is safe to reapply.

## Staff Login

The live web app signs staff in through Supabase Auth.

Create staff users here:

```text
Authentication > Users > Add user
```

Use an email/password that staff can enter on the app login screen. The row-level
security policies in `schema.sql` only allow users listed in
`public.staff_profiles` to manage plans, members, invoices, invoice items,
payments, and expenses.

After creating a user in Supabase Auth, approve them as staff from SQL Editor:

```sql
insert into public.staff_profiles (user_id, full_name, role, active)
select id, 'Staff Name', 'staff', true
from auth.users
where email = 'staff@spacespk.com'
on conflict (user_id) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  active = true,
  updated_at = now();
```

Use `owner`, `manager`, or `staff` for the role. Only the owner has the business
ledger and aggregate revenue views. Staff can collect payments, register members,
update member contact details, and edit their own operational entries for three
days. System-generated receipt rows are locked; owner/staff transfers stay linked.

## Regression Checks

Run `npm test` for application and API regressions. To exercise PostgreSQL
transactions, use a disposable, empty local database (never the live project):

```sh
SPACES_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/spaces_test node scripts/test-database.mjs
```

The runner needs the `pg` package; `SPACES_TEST_PG_MODULE` can point at an existing
installation. It refuses non-local hosts and non-empty databases, builds the
schema, applies the reliability migration twice, and tests owner/staff permissions,
retries, discounted payments, and transfer conservation.

Option B: Direct migration from this machine

Provide a local-only database connection string from:

```text
Project Settings > Database > Connection string > URI
```

Do not commit the connection string.

## Security Note

The service role key was shared in chat. Rotate it after setup:

```text
Project Settings > API > JWT Secret / service role keys
```

Use the service role key only for server/admin scripts. Never expose it in frontend code.
