import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = process.env;
const ready = Boolean(
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY &&
  env.TEST_EMPLOYEE_EMAIL && env.TEST_EMPLOYEE_PASSWORD &&
  env.TEST_OWNER_EMAIL && env.TEST_OWNER_PASSWORD,
);

const run = Math.random().toString(36).slice(2, 8);
const base = (n: string) => ({
  barcode: `TEST-${run}-${n}`, name: `TEST Rice ${run}`, unit: 'kg', selling_price: 10, company: `TEST Co ${run}`,
});

function client() {
  return createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
}
async function signedIn(email: string, password: string) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

describe.skipIf(!ready)('products RLS and constraints (real Supabase project)', () => {
  let employee: SupabaseClient;
  let owner: SupabaseClient;
  let employeeId: string;

  beforeAll(async () => {
    employee = await signedIn(env.TEST_EMPLOYEE_EMAIL!, env.TEST_EMPLOYEE_PASSWORD!);
    owner = await signedIn(env.TEST_OWNER_EMAIL!, env.TEST_OWNER_PASSWORD!);
    employeeId = (await employee.auth.getUser()).data.user!.id;
  });

  afterAll(async () => {
    if (owner) await owner.from('products').delete().like('barcode', `TEST-${run}-%`);
  });

  it('denies anonymous access', async () => {
    const { data, error } = await client().from('products').select('id').limit(1);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    expect((await client().from('products').insert(base('anon'))).error).not.toBeNull();
  });

  it('lets an employee insert and read, stamping created_by and created_by_email', async () => {
    const { data, error } = await employee.from('products').insert(base('a')).select().single();
    expect(error).toBeNull();
    expect(data!.created_by).toBe(employeeId);
    expect(data!.created_by_email).toBe(env.TEST_EMPLOYEE_EMAIL);
  });

  it('cannot forge the author email', async () => {
    const { data } = await employee.from('products')
      .insert({ ...base('forge'), name: 'TEST forge', created_by_email: 'boss@shop.com' }).select().single();
    expect(data!.created_by_email).toBe(env.TEST_EMPLOYEE_EMAIL);
  });

  it('rejects a duplicate barcode, including whitespace variants', async () => {
    const dup = { ...base('a'), name: 'TEST other', company: 'TEST other co' };
    const r1 = await employee.from('products').insert(dup);
    expect(r1.error?.code).toBe('23505');
    expect(r1.error?.message).toContain('products_barcode_key');
    const r2 = await employee.from('products').insert({ ...dup, barcode: `  ${dup.barcode}  ` });
    expect(r2.error?.code).toBe('23505');
  });

  it('rejects same name+company+unit under another barcode (case/space-insensitive)', async () => {
    const r = await employee.from('products').insert({
      ...base('b'), name: `  ${base('b').name.toUpperCase()} `, company: base('b').company.toLowerCase(), unit: 'kg',
    });
    expect(r.error?.code).toBe('23505');
    expect(r.error?.message).toContain('products_name_company_unit_key');
  });

  it('allows same name+company with a different unit', async () => {
    expect((await employee.from('products').insert({ ...base('c'), unit: 'g' })).error).toBeNull();
  });

  it('rejects a negative price and a bad unit', async () => {
    const neg = await employee.from('products').insert({ ...base('d'), name: 'TEST neg', selling_price: -1 });
    expect(neg.error?.code).toBe('23514');
    const unit = await employee.from('products').insert({ ...base('e'), name: 'TEST unit', unit: 'tonne' });
    expect(unit.error?.code).toBe('23514');
  });

  it('rejects a forged created_by', async () => {
    const r = await employee.from('products')
      .insert({ ...base('f'), name: 'TEST forged', created_by: '00000000-0000-0000-0000-000000000000' });
    expect(r.error).not.toBeNull();
  });

  it('stops an employee from updating or deleting', async () => {
    const u = await employee.from('products').update({ name: 'TEST hacked' }).eq('barcode', base('a').barcode).select();
    expect(u.data ?? []).toHaveLength(0);
    const d = await employee.from('products').delete().eq('barcode', base('a').barcode).select();
    expect(d.data ?? []).toHaveLength(0);
    const still = await owner.from('products').select('name').eq('barcode', base('a').barcode).single();
    expect(still.data!.name).toBe(base('a').name);
  });

  it('lets the owner update (updated_at moves, author is immutable) and delete', async () => {
    const before = await owner.from('products').select('updated_at,created_by_email').eq('barcode', base('a').barcode).single();
    const u = await owner.from('products')
      .update({ selling_price: 11, created_by_email: 'x@y.z' }).eq('barcode', base('a').barcode).select().single();
    expect(u.error).toBeNull();
    expect(u.data!.selling_price).toBe(11);
    expect(u.data!.created_by_email).toBe(before.data!.created_by_email);
    expect(new Date(u.data!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before.data!.updated_at).getTime());
    const d = await owner.from('products').delete().eq('barcode', base('a').barcode).select();
    expect(d.data).toHaveLength(1);
  });

  it('does not let an employee change their own role', async () => {
    const r = await employee.from('profiles').update({ role: 'owner' }).eq('id', employeeId).select();
    expect(r.data ?? []).toHaveLength(0);
  });

  it('does not expose private.is_owner through the API', async () => {
    const r = await employee.schema('private' as never).rpc('is_owner');
    expect(r.error).not.toBeNull();
  });
});
