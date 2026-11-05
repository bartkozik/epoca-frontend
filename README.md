# EPOCA frontend

The real React and TypeScript frontend of EPOCA, a commercial application for tracking work, managing organizations, clients and projects, and producing detailed reports. This is a sanitized source snapshot of the application, paired with the Scala backend in `epoca-backend`. It retains the application's modules, interfaces, API integration and tests.

Related repository: [epoca-backend](https://github.com/bartkozik/epoca-backend).

## My contribution

I worked on EPOCA through my contract with Iterators and was its main frontend developer for approximately three years. My work included time-entry interfaces, configurable pivot reports, worklog correction and history views, reusable accessible controls, Polish/English localization, API integration and automated regression coverage. The project was developed with backend developers and testers; this snapshot includes team code and does not claim sole authorship of every file.

The frontend originally used MobX. This integrated snapshot uses TanStack Query for server state and React feature providers for session and interface state. My contributions to the paired Scala backend during the last year used AI-assisted development.

## Application and architecture

- **Organizations, people, clients and projects:** workspace context, role-dependent administration, membership and assignment interfaces.
- **Time tracking:** calendar and time-entry workflows, validation and editing of recorded work.
- **Reporting:** report filters, configurable pivot tables, exports, worklog overrides and correction history.
- **Access and integrations:** login/session handling, SAML callbacks, invitations and OAuth integration-client administration.
- **Shared UI:** reusable controls, responsive layouts, keyboard/ARIA behavior and Polish/English translations.

`src/app` composes routes and providers. `src/core` contains API infrastructure, shared models, configuration, utilities, translations and theme resources. `src/modules` owns feature interfaces, Zod models, query keys, requests and TanStack Query hooks. `tests` contains Playwright specifications and controlled test fixtures; component and integration tests live beside the source.

The current snapshot does not include the parked billing-configuration and invitation-cooperation features. Reporting can support billing workflows, but this is not an accounting application.

## Stack

React 18.3.1, TypeScript 5.6.3, Vite 7.3.6, TanStack Query, React Router, Axios, Zod 3, SCSS, i18next and dnd-kit. Tests use Vitest 4.1.11, React Testing Library and Playwright. Dependencies and the Yarn lockfile retain the selected application's versions.

## Run locally

Use Node **22.23.2** and Yarn **4.18.0**. The pinned Yarn executable is included.

```sh
node .yarn/releases/yarn-4.18.0.cjs install --immutable --mode=skip-build
cp .env.example .env.local
node .yarn/releases/yarn-4.18.0.cjs dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`. Requests to `/api/v1` are proxied to `http://127.0.0.1:9000`. Start the paired backend and its dedicated local PostgreSQL database first. The frontend uses the actual authenticated API; it has no replacement mock backend or automatic login. No company staging endpoint or account is supplied.

The backend must use the same frontend origin for its SAML/invitation callbacks. See its README for `APP_FE_URL`, optional integrations and account provisioning. External mail, SAML, Firebase and storage features need your own configuration; they are not configured by this snapshot.

## Verify

```sh
node .yarn/releases/yarn-4.18.0.cjs typecheck
node .yarn/releases/yarn-4.18.0.cjs typecheck:e2e
node .yarn/releases/yarn-4.18.0.cjs lint
node .yarn/releases/yarn-4.18.0.cjs test
node .yarn/releases/yarn-4.18.0.cjs build
```

Validation of this snapshot: TypeScript and E2E typechecking passed; all 2,593 Vitest tests in 289 files passed; the production build passed; ESLint completed with 0 errors and 1,124 warnings. Eleven pure host-guard contracts and 24 applicable Node acceptance-helper tests passed. The helper test that inspects the private GitLab pipeline is not runnable because that pipeline is deliberately excluded.

The retained Playwright suite contains mock, controlled integration and live/release tiers. Live tiers require an explicitly configured isolated environment and their original operational setup is not included. A screenshot baseline was removed during privacy review, so visual baselines must be created against your own local environment. No live/staging browser run is claimed by this snapshot.

## Sanitization and attribution

Original Git history, private CI/deployment configuration, environment values and internal operational notes are excluded. Non-public endpoint/identity literals were anonymized. Imported account/onboarding screenshot assets were replaced with a neutral “Image removed for privacy” resource; application structure and workflows remain intact. Existing test fixtures were retained where synthetic, with identity literals sanitized consistently.

Application names and source attribution are preserved. This snapshot does not include a new project-wide license or claim ownership of third-party resources. Deployment infrastructure, real accounts and client data are not included.

## Public demo

The demo build enables `VITE_DEMO_ENABLED=true` and uses the [EPOCA guest gateway](https://github.com/bartkozik/epoca-backend/tree/main/demo) on the same origin. Visitors can open a temporary workspace, follow a short guide and reset the sample data. The normal application build retains its existing authentication flow.

GitHub Actions checks types, lint, tests and the built container before publishing its image. The demo container serves static assets as an unprivileged user; database credentials and signing keys are never included in the frontend. Deployment configuration lives in [portfolio-infra](https://github.com/bartkozik/portfolio-infra).
