# Supabase Setup

Project ref inferred from the service role JWT:

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
select id, 'Staff Name', 'owner', true
from auth.users
where email = 'staff@spacespk.com'
on conflict (user_id) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  active = true,
  updated_at = now();
```

Use `owner`, `manager`, or `staff` for the role. At the moment all active staff
roles have the same app permissions; the role column is there so we can split
permissions later.

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
