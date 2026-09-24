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

  // Private invoice links: apply after historical receipts exist to exercise
  // the backfill against issue_date values overwritten by payment settlement.
  await sql("reset role");
  await sql(`do $$ begin
    if not exists (select from pg_roles where rolname='service_role') then
      create role service_role bypassrls;
    end if;
    end $$; grant usage on schema public to service_role;`);
  const privateMigration = await readFile(new URL("../supabase/migrations/20260923_private_invoice_links.sql", import.meta.url), "utf8");
  const accountingDefinition = (await sql("select pg_get_functiondef('public.record_membership_payment(uuid,integer,text,date,date,text)'::regprocedure) as definition")).rows[0].definition;
  const financialState = async () => (await sql(`select
    (select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from payments p) as payments,
    (select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]') from cash_ledger c) as cash,
    (select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]') from owner_ledger o) as owner,
    (select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]') from members m) as members`)).rows[0];
  const beforeMigration = await financialState();
  const irregular = (await sql(`insert into invoices(invoice_number,member_id,invoice_type,issue_date,valid_till,status)
    values ('IRREGULAR-HISTORY',$1,'membership','2026-09-13','2026-10-12','paid') returning id`,[member.member_id])).rows[0].id;
  await sql(privateMigration);
  await sql(privateMigration);
  checks += 2;
  check(await financialState(),beforeMigration,"Private migration changes no accounting or member rows");
  check((await sql("select pg_get_functiondef('public.record_membership_payment(uuid,integer,text,date,date,text)'::regprocedure) as definition")).rows[0].definition,accountingDefinition,"Accounting function is unchanged");
  check((await sql("select membership_from::text from invoices where id=$1",[edited.invoice_id])).rows[0].membership_from,"2026-10-01","Paid edited history backfills canonical start, not collection date");
  check((await sql("select membership_from from invoices where id=$1",[irregular])).rows[0].membership_from,null,"Irregular historical cycle remains unknown");
  for (const [joining,month,expected] of [
    ["2024-01-31","2024-02-01","2024-02-29"],
    ["2025-01-31","2025-02-01","2025-02-28"],
    ["2025-01-31","2025-03-01","2025-03-31"],
    ["2025-01-30","2025-02-01","2025-02-28"],
    ["2025-01-31","2025-04-01","2025-04-30"],
    ["2025-12-31","2026-01-01","2026-01-31"]
  ]) {
    check((await sql("select membership_month_anchor($1,$2)::text as day",[joining,month])).rows[0].day,expected,"Joining day clamps independently each month");
  }
  for (const [joining,until,expected] of [
    ["2024-01-31","2024-02-29","2024-01-31"],
    ["2024-01-31","2024-03-31","2024-02-29"],
    ["2025-01-31","2025-03-31","2025-02-28"],
    ["2025-01-31","2025-04-30","2025-03-31"],
    ["2025-01-31","2025-02-27",null],
    ["2025-01-31","2025-01-31",null]
  ]) {
    check((await sql("select canonical_membership_from($1,$2)::text as day",[joining,until])).rows[0].day,expected,"Canonical start handles clamped and invalid periods");
  }
  const today = (await sql("select to_char(now() at time zone 'Asia/Karachi','YYYY-MM-DD') as day")).rows[0].day;
  const anchor = (joining, year, month) => {
    const day = Math.min(Number(joining.slice(8)),new Date(Date.UTC(year,month+1,0)).getUTCDate());
    return new Date(Date.UTC(year,month,day)).toISOString().slice(0,10);
  };
  const expectedCycle = (joining) => {
    const date = new Date(`${today}T00:00:00Z`);
    let from = anchor(joining,date.getUTCFullYear(),date.getUTCMonth());
    if (from > today) from = anchor(joining,date.getUTCFullYear(),date.getUTCMonth()-1);
    if (joining > from) from = joining;
    const start = new Date(`${from}T00:00:00Z`);
    return {from,until:anchor(joining,start.getUTCFullYear(),start.getUTCMonth()+1)};
  };
  const fixture = async (joining = "2024-01-31") => {
    await sql("reset role");
    const id = (await sql(`insert into members(full_name,phone,plan_name,seats,joining_date,renewal_date,
      standard_monthly_rate,offered_monthly_rate) values ('Invoice Fixture',$1,'Bundle',5,$2,$2::date+interval '1 month',20000,16500)
      returning id`,[randomUUID(),joining])).rows[0].id;
    await sql(`insert into member_plan_items(member_id,plan_name,category,seats,standard_monthly_rate,offered_monthly_rate,sort_order)
      values ($1,'Dedicated','individual',2,12000,10000,0),($1,'Room','room',3,8000,6500,1)`,[id]);
    return {id,joining,...expectedCycle(joining)};
  };
  const copyInvoice = async (id,type = "membership",status = "sent",until = null) => (await sql(`
    insert into invoices(invoice_number,member_id,invoice_type,issue_date,valid_till,standard_amount,
      discount_amount,subtotal_amount,tax_amount,total_amount,status)
    select $2,member_id,$3,issue_date,coalesce($5::date,valid_till),standard_amount,
      discount_amount,subtotal_amount,tax_amount,total_amount,$4 from invoices where id=$1 returning id`,
  [id,randomUUID(),type,status,until])).rows[0].id;
  const generated = [];
  for (const role of [owner,manager,staff]) {
    const f = await fixture();
    const before = await financialState();
    await login(role);
    const result = await rpc("generate_membership_invoice",[f.id,f.until]);
    check((await rpc("generate_membership_invoice",[f.id,f.until])).invoice_id,result.invoice_id,"Every active role generates and retries");
    await sql("reset role");
    check(await financialState(),before,"Generating unpaid invoice never changes balances, ledgers, members or payments");
    const saved = (await sql(`select status,total_amount,standard_amount,discount_amount,issue_date::text,membership_from::text
      from invoices where id=$1`,[result.invoice_id])).rows[0];
    check(saved,{status:"sent",total_amount:16500,standard_amount:20000,discount_amount:3500,issue_date:f.from,membership_from:f.from},"Saved DB rate and canonical dates");
    check((await sql("select description,quantity,amount from invoice_items where invoice_id=$1 order by description",[result.invoice_id])).rows,
      [{description:"Dedicated",quantity:2,amount:10000},{description:"Room",quantity:3,amount:6500}],"Saved bundle lines, not catalog or per-seat multiplication");
    generated.push({...f,...result});
  }
  const primary = generated[0];
  const savedContent = (await sql("select to_jsonb(i) as invoice,(select jsonb_agg(to_jsonb(l) order by id) from invoice_items l where invoice_id=i.id) as lines from invoices i where id=$1",[primary.invoice_id])).rows[0];
  await sql("update members set offered_monthly_rate=19000,standard_monthly_rate=22000,plan_name='Changed' where id=$1",[primary.id]);
  await sql("update member_plan_items set offered_monthly_rate=9000,plan_name='Changed' where member_id=$1",[primary.id]);
  await login(staff);
  check((await rpc("generate_membership_invoice",[primary.id,primary.until])).invoice_id,primary.invoice_id,"Member changes reuse saved invoice");
  await sql("reset role");
  check((await sql("select to_jsonb(i) as invoice,(select jsonb_agg(to_jsonb(l) order by id) from invoice_items l where invoice_id=i.id) as lines from invoices i where id=$1",[primary.invoice_id])).rows[0],savedContent,"No stale-content repricing or line rewrites");
  await login(staff);
  check((await rpc("record_membership_payment",[primary.id,16500,"staff",today,primary.until,null])).invoice_id,primary.invoice_id,"Settlement reuses generated invoice at its saved rate");
  check((await rpc("generate_membership_invoice",[primary.id,primary.until])).invoice_id,primary.invoice_id,"Current paid invoice is reused");
  await sql("reset role");
  check((await sql("select status,issue_date::text,membership_from::text from invoices where id=$1",[primary.invoice_id])).rows[0],
    {status:"paid",issue_date:today,membership_from:primary.from},"Settlement preserves original membership start");
  check((await sql("select count(*)::int as n from payments where invoice_id=$1",[primary.invoice_id])).rows[0].n,1,"Generated invoice settled exactly once");

  const futureJoining = `${Number(today.slice(0,4))+2}-01-31`;
  const future = await fixture(futureJoining);
  await login(staff);
  const futureInvoice = await rpc("generate_membership_invoice",[future.id,future.until]);
  await rejection("generate_membership_invoice",[future.id,`${Number(today.slice(0,4))+2}-03-31`],/current membership period/);
  await rejection("generate_membership_invoice",[future.id,null],/expiry date/);
  await sql("reset role");
  check((await sql("select issue_date::text from invoices where id=$1",[futureInvoice.invoice_id])).rows[0].issue_date,futureJoining,"Future joining date is never moved backwards");

  const editedFixture = generated[1];
  await login(owner);
  const custom = await rpc("save_edited_invoice",[editedFixture.id,randomUUID(),editedFixture.from,editedFixture.until,
    13000,20000,"Agreed exception",JSON.stringify([{description:"Saved custom line",quantity:1,unit_price:13000,amount:13000}])]);
  await sql("reset role");
  const superseded = await copyInvoice(custom.invoice_id);
  await login(staff);
  check((await rpc("generate_membership_invoice",[editedFixture.id,editedFixture.until])).invoice_id,custom.invoice_id,"Single edited invoice wins over ordinary sent invoice");
  await sql("reset role");
  check((await sql("select total_amount from invoices where id=$1",[custom.invoice_id])).rows[0].total_amount,13000,"Edited amount is preserved");
  const ambiguous = await copyInvoice(custom.invoice_id,"edited");
  await login(staff);
  await rejection("generate_membership_invoice",[editedFixture.id,editedFixture.until],/Ambiguous invoices/);
  await sql("reset role");
  await sql("update invoices set status='void' where id in ($1,$2)",[ambiguous,superseded]);
  const ordinaryDuplicate = await copyInvoice(generated[2].invoice_id);
  await login(staff);
  await rejection("generate_membership_invoice",[generated[2].id,generated[2].until],/Ambiguous invoices/);
  await sql("reset role");
  await sql("update invoices set status='void' where id=$1",[ordinaryDuplicate]);
  const paidDuplicate = await copyInvoice(primary.invoice_id,"membership","paid");
  await login(staff);
  await rejection("generate_membership_invoice",[primary.id,primary.until],/Ambiguous invoices/);
  await sql("reset role");
  await sql("update invoices set status='void' where id=$1",[paidDuplicate]);
  const oldUntil = "2024-02-29";
  const overdue = await copyInvoice(generated[2].invoice_id,"membership","sent",oldUntil);
  await login(staff);
  check((await rpc("generate_membership_invoice",[generated[2].id,oldUntil])).invoice_id,overdue,"Existing overdue unpaid period can be reused");
  await rejection("generate_membership_invoice",[generated[2].id,"2099-01-31"],/current membership period/);
  await sql("reset role");
  await sql("update members set status='cancelled' where id=$1",[generated[2].id]);
  await login(staff);
  check((await rpc("generate_membership_invoice",[generated[2].id,oldUntil])).invoice_id,overdue,"Archived members can reuse saved invoices");
  const archived = await fixture();
  for (const status of ["cancelled","paused"]) {
    await sql("update members set status=$2 where id=$1",[archived.id,status]);
    await login(staff);
    await rejection("generate_membership_invoice",[archived.id,archived.until],/Archived or paused/);
    await sql("reset role");
  }

  // Two independent sessions race for the same cycle; one waits on the exact
  // accounting lock and observes the committed invoice from the other.
  const concurrent = await fixture();
  const peer = new pg.Client({connectionString});
  await peer.connect();
  try {
    await peer.query("select set_config('request.jwt.claim.sub',$1,false)",[staff]);
    await peer.query("set role authenticated");
    await login(staff);
    await sql("begin");
    const first = await rpc("generate_membership_invoice",[concurrent.id,concurrent.until]);
    const waiting = peer.query("select * from generate_membership_invoice($1,$2)",[concurrent.id,concurrent.until]);
    await sql("commit");
    check((await waiting).rows[0].invoice_id,first.invoice_id,"Concurrent generation reuses one committed invoice");
    await sql("reset role");
    check((await sql("select count(*)::int as n from invoices where member_id=$1",[concurrent.id])).rows[0].n,1,"Exactly one concurrent invoice");
  } finally {
    await sql("rollback");
    await peer.end();
  }
  const atomic = await fixture();
  await sql(`create function public.test_invoice_line_failure() returns trigger language plpgsql as
    $$ begin raise exception 'Injected invoice line failure'; end $$;
    create trigger test_invoice_line_failure before insert on invoice_items
    for each row execute function public.test_invoice_line_failure();`);
  await login(staff);
  await rejection("generate_membership_invoice",[atomic.id,atomic.until],/Injected invoice line failure/);
  await sql("reset role");
  await sql("drop trigger test_invoice_line_failure on invoice_items; drop function public.test_invoice_line_failure()");
  check((await sql("select count(*)::int as n from invoices where member_id=$1",[atomic.id])).rows[0].n,0,"Line failure rolls back invoice creation");

  const shareInvoice = generated[2].invoice_id;
  const hashes = [];
  for (const role of [owner,manager,staff]) {
    const hash = randomUUID().replaceAll("-","") + randomUUID().replaceAll("-","");
    hashes.push(hash);
    await login(role);
    const link = await rpc("create_invoice_share_link",[shareInvoice,hash]);
    check(Object.keys(link).sort(),["expires_at","id"],"Share RPC never returns hashes");
    await rejection("create_invoice_share_link",[shareInvoice,"raw-token"],/SHA-256/);
    await assert.rejects(sql("select * from invoice_share_links"),/permission denied/); checks++;
    for (const query of [
      "insert into invoice_share_links default values",
      "update invoice_share_links set revoked_at=now()",
      "delete from invoice_share_links"
    ]) { await assert.rejects(sql(query),/permission denied/); checks++; }
  }
  await sql("reset role");
  check((await sql("select bool_and(expires_at=created_at+interval '90 days') as bounded from invoice_share_links")).rows[0].bounded,true,"Share lifetime bounded to 90 days");
  check((await sql("select has_table_privilege('service_role','public.invoice_share_links','SELECT') as allowed")).rows[0].allowed,true,"Service role can resolve private hashes");
  await sql("set role service_role");
  check((await sql("select count(*)::int as n from invoice_share_links")).rows[0].n,3,"Service role can actually read links");
  await sql("reset role");
  await login(staff);
  await rpc("revoke_invoice_share_links",[shareInvoice]);
  await rpc("revoke_invoice_share_links",[shareInvoice]);
  await sql("reset role");
  check((await sql("select count(*)::int as n from invoice_share_links where invoice_id=$1 and revoked_at is null",[shareInvoice])).rows[0].n,0,"Any active staff can revoke all creators' links");
  await login(owner);
  await rpc("create_invoice_share_link",[shareInvoice,"a".repeat(64)]);
  await sql("reset role");
  await sql("update invoices set status='void' where id=$1",[shareInvoice]);
  check((await sql("select count(*)::int as n from invoice_share_links where invoice_id=$1 and revoked_at is null",[shareInvoice])).rows[0].n,0,"Voiding permanently revokes live links");
  await login(staff);
  await rejection("create_invoice_share_link",[shareInvoice,"b".repeat(64)],/Sent or paid invoice/);
  await rpc("revoke_invoice_share_links",[shareInvoice]);
  checks++;
  await rejection("create_invoice_share_link",[randomUUID(),"b".repeat(64)],/Sent or paid invoice/);
  await rejection("revoke_invoice_share_links",[randomUUID()],/Invoice not found/);
  await rejection("create_invoice_share_link",[primary.invoice_id,hashes[0]],/unique constraint/);
  await sql("reset role");
  const draft = await copyInvoice(primary.invoice_id,"membership","draft");
  await login(staff);
  await rejection("create_invoice_share_link",[draft,"e".repeat(64)],/Sent or paid invoice/);
  await rpc("revoke_invoice_share_links",[draft]);
  checks++;
  await sql("reset role");
  const audits = (await sql("select to_jsonb(a)::text as data from transaction_audit a where action in ('create_invoice_share_link','revoke_invoice_share_links')")).rows;
  check(audits.length > 0,true,"Link creation and revocation are audited");
  check(audits.some(({data}) => data.includes("token_hash") || [...hashes,"a".repeat(64)].some(hash => data.includes(hash))),false,"Audits never contain token hashes");
  const outsider = randomUUID();
  await sql("insert into auth.users(id) values ($1)",[outsider]);
  for (const id of [outsider,staff]) {
    if (id === staff) await sql("update staff_profiles set active=false where user_id=$1",[staff]);
    await login(id);
    await rejection("generate_membership_invoice",[primary.id,primary.until],/Active staff/);
    await rejection("create_invoice_share_link",[primary.invoice_id,"c".repeat(64)],/Active staff/);
    await rejection("revoke_invoice_share_links",[primary.invoice_id],/Active staff/);
    await sql("reset role");
  }
  await sql("update staff_profiles set active=true where user_id=$1",[staff]);
  await sql("set role anon");
  await rejection("generate_membership_invoice",[primary.id,primary.until],/permission denied/);
  await rejection("create_invoice_share_link",[primary.invoice_id,"d".repeat(64)],/permission denied/);
  await rejection("revoke_invoice_share_links",[primary.invoice_id],/permission denied/);
  await assert.rejects(sql("select * from invoice_share_links"),/permission denied/); checks++;
  await assert.rejects(sql("insert into invoice_share_links default values"),/permission denied/); checks++;
  console.log(`${checks} database checks passed, including migration rerun, rollback, permissions, receipts and linked transfers.`);
} finally {
  await db.end();
}
