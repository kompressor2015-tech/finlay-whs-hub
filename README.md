# Finlay WHS

Work health and safety records for The Finlay Group: incidents, hazards, actions, inspections and pre-starts, chemicals and SDS, and documents. It runs as a web app, with a phone layout for field staff.

It shares the Fleet Hub's Supabase project (`kompressor2015-tech/finlay-fleet-hub`) for logins, people and the machine list. WHS tables are prefixed `whs_`, and fleet tables are never changed by this app's migrations.

## Stack
React 19, TypeScript, Vite, Tailwind v4, Supabase (`@supabase/supabase-js`) and Vercel. GitHub Actions runs the type-check, the unit tests (`tsx --test src/utils/*.test.ts`) and a build on every push.

## Way of working
1. Mock up on the design canvas.
2. You approve ("build it").
3. Build on a branch until the checks are green.
4. Check the Vercel preview.
5. "Merge to main".
6. Run any SQL in Supabase.
7. You say "confirmed".
8. Update the docs.

## Access
- **Fleet admins:** WHS admins.
- **Everyone else:** needs `profiles.whs_role`, set to one of:
  - `whs_officer`
  - `supervisor`
  - `field`

  Set it with `supabase/migrations/whs_001_roles.sql`, which explains how.
- **Phone layout:** used on screens narrower than 768px. People can switch to the full version.

## Build steps
1. **Foundation:** logins and roles, and the home screen. *(Done 10/11/2026. `whs_001_roles.sql` has been run.)*
2. **Incidents, hazards and Actions.** *(Done 10/11/2026. `whs_002_incidents_hazards_actions.sql` has been run.)*
3. **Inspections and pre-starts.** *(Done 10/11/2026. `whs_003_checks_and_plant_flags.sql` has been run.)* A failed pre-start flags the unit and creates a workshop action; it does not change the fleet status. Site inspections are signed with a drawn signature.
4. Chemicals and SDS.
5. Documents (read-and-sign).
6. Later: Risk and SWMS, Contractors and Reports.

Training and tickets is handled elsewhere for now.

## Live site
- **Production:** https://finlay-whs-hub-finlay7.vercel.app
- **Previews:** each branch gets `finlay-whs-hub-git-<branch>-finlay7.vercel.app`.
- **Checks:** `vercel.json` makes the Vercel build run the type-check and unit tests before building.

## Settings
- **Supabase keys:** the Supabase URL and anon key default to the Fleet Hub's project. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel to override them.
- **Password reset links:** add the WHS site's address to the redirect URLs, under Supabase > Authentication > URL Configuration.

## Records
- **References:** INC-0001 and HAZ-0001, set by the database.
- **History:** written by database triggers into `whs_history`.
- **Photos:** kept in the private `whs-photos` storage bucket.
- **Notifiable incidents:** cannot be deleted. Keep them at least 5 years.
- **Closing:** only an admin or the WHS officer can close an incident, and only once its actions are done.

## Branding
The logos are the same as the Fleet Hub's and live in `public/`:
- `finlay-logo.jpg`: header
- `finlay-banner.jpg`: login screen
- `finlay-gear.png`, `favicon.png` and the app icons

## Dates
All dates are in Brisbane time and shown as DD/MM/YYYY.

## Compliance
The app helps keep records. It does not by itself make the business compliant with the Queensland WHS Act and Regulation. Notifiable incidents still go to WHSQ.
