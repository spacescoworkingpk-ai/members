import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// Run against an empty disposable LOCAL database, never a Supabase project.
const connectionString = process.env.SPACES_TEST_DATABASE_URL;
if (!connectionString || !["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname)) {
  throw new Error("SPACES_TEST_DATABASE_URL must point to a disposable localhost database.");
}
const { default: pg } = await import(process.env.SPACES_TEST_PG_MODULE || "pg");
const db = new pg.Client({ connectionString });
await db.connect();
const sql = (text, values) => db.query(text, values);
let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const rpc = async (name, args) => (await sql(`select * from public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})`, args)).rows[0];
const rejection = async (name, args, pattern) => { await assert.rejects(rpc(name, args), pattern); checks++; };
try {
  const empty = await sql("select to_regclass('public.members') as table_name");
  assert.equal(empty.rows[0].table_name, null, "Use an empty database; this runner will not erase existing data.");
  await sql(`do $$ begin
    if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
    end $$; create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`);
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  await sql(schema.slice(0, schema.indexOf("drop function if exists public.record_membership_payment")));
  await sql(await readFile(new URL("../supabase/migrations/20260721_production_catchup.sql", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../supabase/migrations/20260906_reliable_write_paths.sql", import.meta.url), "utf8");
  await sql(migration);
  await sql(migration);
  checks += 2;
  const owner = randomUUID(), staff = randomUUID(), manager = randomUUID();
  await sql("insert into auth.users(id) values ($1),($2),($3)", [owner, staff, manager]);
  await sql("insert into staff_profiles(user_id,role) values ($1,'owner'),($2,'staff'),($3,'manager')", [owner, staff, manager]);
  const plan = (await sql("insert into plans(name,category,default_seats,standard_monthly_rate) values ('Test Dedicated','individual',1,17500) returning id")).rows[0].id;
  const lines = JSON.stringify([{plan_id:plan,plan_name:"Test Dedicated",seats:1,standard_monthly_rate:17500,offered_monthly_rate:16500}]);
  const login = async (id) => { await sql("select set_config('request.jwt.claim.sub',$1,false)",[id]); await sql("set role authenticated"); };
  await login(owner);
  const memberArgs = [null,"Test Member",null,"03000000001",null,"2026-09-01","2026-10-01","active",0,null,null,lines,randomUUID()];
  const member = await rpc("save_member_bundle", memberArgs);
  check((await rpc("save_member_bundle", memberArgs)).member_id,member.member_id,"Member create retry");
  await rejection("save_member_bundle", [...memberArgs.slice(0,12),randomUUID()], /already has this phone/);
  const editArgs = [...memberArgs]; editArgs[0]=member.member_id; editArgs[1]="Updated Member";editArgs[12]=randomUUID();
  check((await rpc("save_member_bundle", editArgs)).full_name,"Updated Member","Member edit bundle");
  const cashArgs = ["2026-09-13","expense","Office Supplies",null,null,1200,null,"business_card",null,randomUUID()];
  const card = await rpc("create_cash_ledger_entry",cashArgs);
  check((await rpc("create_cash_ledger_entry",cashArgs)).entry_id,card.entry_id,"Expense retry");
  await rejection("create_cash_ledger_entry",[...cashArgs.slice(0,5),0,...cashArgs.slice(6,9),randomUUID()],/greater than zero/);
  const transferArgs = [null,"2026-09-13","expense","Petty Cash Top-Up",null,"spaces_account",5000,null,null,randomUUID()];
  const transfer = await rpc("save_owner_ledger_entry", transferArgs);
  check((await rpc("save_owner_ledger_entry",transferArgs)).owner_entry_id,transfer.owner_entry_id,"Transfer retry");
  const transferEdit = [...transferArgs];transferEdit[0]=transfer.owner_entry_id;transferEdit[6]=6000;transferEdit[9]=randomUUID();
  await rpc("save_owner_ledger_entry",transferEdit);
  await rejection("update_cash_ledger_entry",[transfer.cash_entry_id,"2026-09-13","expense","Returned to Owner",null,"Abrar",6000,null,"business_card"],/petty_cash/);
  await sql("reset role");
  check((await sql("select amount from cash_ledger where id=$1",[transfer.cash_entry_id])).rows[0].amount,6000,"Transfer amounts synchronize");
  check((await sql("select count(*)::int as count from members")).rows[0].count,1,"No duplicate member");
  check((await sql("select count(*)::int as count from member_plan_items where member_id=$1",[member.member_id])).rows[0].count,1,"No duplicate bundle lines");
  await login(staff);
  await rejection("save_owner_ledger_entry",transferArgs,/Owner access/);
  await rejection("update_cash_ledger_entry",[card.entry_id,"2026-09-13","expense","Cleaning",null,null,900,null,"petty_cash"],/three days/);
  const staffCashArgs=["2026-09-13","expense","Cleaning",null,null,100,null,"petty_cash",null,randomUUID()];
  const staffCash=await rpc("create_cash_ledger_entry",staffCashArgs);
  await rpc("update_cash_ledger_entry",[staffCash.entry_id,"2026-09-13","expense","Cleaning",null,null,200,null,"petty_cash"]);
  checks++;
  await sql("reset role");
  await sql("update cash_ledger set created_at=now()-interval '4 days' where id=$1",[staffCash.entry_id]);
  await login(staff);
  await rejection("update_cash_ledger_entry",[staffCash.entry_id,"2026-09-13","expense","Cleaning",null,null,300,null,"petty_cash"],/three days/);
  await login(manager);
  await rejection("update_cash_ledger_entry",[staffCash.entry_id,"2026-09-13","expense","Cleaning",null,null,300,null,"petty_cash"],/three days/);
  await login(owner);
  await rpc("update_cash_ledger_entry",[staffCash.entry_id,"2026-09-13","expense","Cleaning",null,null,300,null,"petty_cash"]);
  checks++;
  for (const [index,source] of ["spaces_account","abrar_owner","staff","raza_manager"].entries()) {
    const args=[`TEST-${index}`,"Walk-in",null,"Day Pass",3,833,2500,source,"2026-09-13","2026-09-13",null];
    const receipt=await rpc("record_quick_receipt",args);
    check((await rpc("record_quick_receipt",args)).receipt_id,receipt.receipt_id,"Quick receipt retry");
    const changed=[...args];changed[6]=2600;
    await rejection("record_quick_receipt",changed,/different data/);
  }
  const editedArgs=[member.member_id,"TEST-EDITED","2026-10-01","2026-11-01",14000,17500,"Discount",JSON.stringify([{description:"Test Dedicated",quantity:1,unit_price:14000,amount:14000}])];
  const edited=await rpc("save_edited_invoice",editedArgs);
  check((await rpc("save_edited_invoice",editedArgs)).invoice_id,edited.invoice_id,"Edited invoice retry");
  const badLines=[...editedArgs];badLines[1]="TEST-BAD-LINES";badLines[7]=JSON.stringify([{description:"Bad",quantity:1,unit_price:100,amount:100}]);
  await rejection("save_edited_invoice",badLines,/do not match/);
  await login(staff);
  await rejection("save_edited_invoice",[...editedArgs],/Owner access/);
  check((await rpc("record_membership_payment",[member.member_id,14000,"spaces_account","2026-09-13","2026-11-01",null])).invoice_id,edited.invoice_id,"Staff settles discounted invoice");
  await login(owner);
  const paymentArgs=[member.member_id,16500,"staff","2026-09-13","2026-10-01",null];
  const invoice=await rpc("record_membership_payment",paymentArgs);
  check((await rpc("record_membership_payment",paymentArgs)).invoice_id,invoice.invoice_id,"Membership retry");
  await rejection("record_membership_payment",[member.member_id,17000,"staff","2026-09-13","2026-10-01",null],/does not match/);
  await sql("reset role");
  check((await sql("select count(*)::int as count from payments where invoice_id=$1",[invoice.invoice_id])).rows[0].count,1,"Exactly one payment");
  check((await sql("select sum(amount)::int as total from invoice_items where invoice_id=$1",[invoice.invoice_id])).rows[0].total,16500,"Receipt line total");
  check((await sql("select count(*)::int as count from cash_ledger where invoice_id=$1",[invoice.invoice_id])).rows[0].count,1,"Exactly one cash movement");
  const paymentCashId=(await sql("select id from cash_ledger where invoice_id=$1",[invoice.invoice_id])).rows[0].id;
  await login(staff);
  await rejection("update_cash_ledger_entry",[paymentCashId,"2026-09-13","receiving",null,"Membership receipt",null,100,null,null],/locked/);
  await sql("reset role; set role anon");
  await rejection("create_cash_ledger_entry",cashArgs,/permission denied/);
  console.log(`${checks} database checks passed, including migration rerun, rollback, permissions, receipts and linked transfers.`);
} finally {
  await db.end();
}
