# Supabase Setup

Project ref inferred from the service role JWT:

```text
hsnkcrxowajnadwtzdlk
```

Likely API URL:

```text
https://hsnkcrxowajnadwtzdlk.supabase.co
```

## What Still Needs Confirmation

The link provided was the organization dashboard:

```text
https://supabase.com/dashboard/org/fssaqnfiaucfoysfenbn
```

Open the actual project, then go to:

```text
Project Settings > API > Project URL
```

Confirm that it matches the URL above.

## Running The Schema

Option A: Supabase SQL Editor

1. Open the project dashboard.
2. Go to SQL Editor.
3. Paste the contents of `supabase/schema.sql`.
4. Run it.

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
