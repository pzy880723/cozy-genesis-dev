# ERP SSO Deployment

## Runtime contract

- ERP production base URL: `https://boomer-off-buddy.lovable.app`
- AIGC public URL: `https://aigc.boomeroff.com`
- ERP entry target: `/auth/erp?ticket=<43-char-base64url-ticket>`
- Shared secret: `ERP_AIGC_SSO_SECRET`, with the exact same value in both Lovable projects

Allowed access is granted when the ERP response contains `permissions: ["aigc_access"]` or one of these roles:

- `super_admin`
- `hq_operator`
- `store_manager`
- `store_staff`

`warehouse_staff` alone is denied. The ERP and AIGC applications both enforce this rule.

## Required AIGC secrets

```text
ERP_SSO_BASE_URL=https://boomer-off-buddy.lovable.app
ERP_AIGC_SSO_SECRET=<same value as ERP>
AIGC_PUBLIC_URL=https://aigc.boomeroff.com
```

## Required database migration

Run `docs/migrations/2026-07-19-erp-sso.sql` in the AIGC shared Supabase project. It creates or upgrades `public.erp_user_links`, adds the `permissions` audit column, enables RLS, and removes browser-role access.

The ERP project separately needs `supabase/migrations/20260719110000_harden_aigc_sso_permissions.sql` applied to its Supabase database.

## Acceptance flow

1. Publish both Lovable projects from their GitHub `main` branches.
2. Log into ERP with an allowed real account.
3. Click `AI 营销中心` in the ERP sidebar.
4. Confirm the new tab lands on the AIGC domain without showing a second login form.
5. Confirm `erp_user_links` contains one mapping and the AIGC auth user's `app_metadata` contains current roles, permissions, ERP user ID, and shop scope. Display fields remain in `user_metadata`.
6. Repeat with a warehouse-only account and confirm access is denied.

Git delivery, Lovable Publish, Supabase migrations, domain binding, and a real-account browser test are separate acceptance boundaries.
