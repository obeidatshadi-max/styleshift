-- Stripe billing fields on companies
alter table public.companies
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- Allow authenticated users to read their own company (for onboarding/invite)
create policy "member read own company" on public.companies
  for select using (
    id in (select company_id from public.profiles where id = auth.uid())
  );

-- Allow managers to update their company (plan, name)
create policy "manager update company" on public.companies
  for update using (
    id in (
      select company_id from public.profiles
      where id = auth.uid() and role = 'manager'
    )
  );

-- Allow managers to insert a company (during onboarding)
create policy "manager insert company" on public.companies
  for insert with check (true);

-- Allow managers to update rep profiles in their company (for assign feature)
create policy "manager update rep profiles" on public.profiles
  for update using (
    company_id in (
      select company_id from public.profiles
      where id = auth.uid() and role = 'manager'
    )
  );
