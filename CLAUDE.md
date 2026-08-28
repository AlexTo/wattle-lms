# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR — it covers the PR process, commit conventions, and when to prefer an Nx generator over hand-scaffolding.

## What this is

Wattle LMS: a serverless, AWS-native Learning Management System. Opinionated by design — one cloud provider (AWS), one way to deploy (CDK), rather than a pluggable backend. Nx monorepo (pnpm workspaces) scaffolded and maintained with [`@aws/nx-plugin`](https://awslabs.github.io/nx-plugin-for-aws) — use the `nx-plugin-for-aws` MCP server (`list-generators`, `generator-guide`, `general-guidance`) before hand-writing new projects/components; prefer its generators over manual scaffolding.

## Commands

Install:

```sh
pnpm i
```

Build / lint / test everything:

```sh
pnpm build          # nx run-many --target build (compile, bundle, synth, checkov, etc. per project)
pnpm lint           # nx run-many --target lint --configuration=fix
pnpm test           # nx run-many --target test --all
```

Run a single project's target, or affected-only (what CI's PR checks use):

```sh
pnpm nx run @wattle/core-api:test              # watch mode (nx.json testMode: watch)
pnpm nx run @wattle/core-api:test -- --run auth.test.ts   # single file, run once
pnpm nx affected --target test
```

Update vitest snapshots for one project:

```sh
pnpm nx run @wattle/core-api:test -u
```

Local dev — deploy once, pull runtime config, then run dev servers:

```sh
pnpm nx deploy @wattle/infra "wattle-development/*"
pnpm nx load-runtime-config @wattle/student-portal
pnpm nx load-runtime-config @wattle/instructor-portal
pnpm dev
```

Deploy the hardened production stage instead of `wattle-development`: `pnpm nx deploy @wattle/infra "wattle-production/*"`.

Everything else (`compile`, `bundle`, `synth`, `checkov`, `dev`, `serve`) is a per-project Nx target — check that project's `project.json` rather than assuming a script exists.

## Architecture

- `packages/apis/core-api` — tRPC API (`@wattle/core-api`), one Lambda behind API Gateway
- `packages/databases/core-table` — single-table DynamoDB access via ElectroDB; `client.ts` resolves table/client so entities work identically against local (Docker) and deployed DynamoDB
- `packages/common/scripts` — deploy/destroy and local-DynamoDB (Docker) tooling invoked by Nx targets
- `packages/events` — standalone Lambda handlers for AWS-triggered events (e.g. Cognito), separate from the API
- `packages/websites/student-portal`, `packages/websites/instructor-portal` — React + Vite + TanStack Router frontends
- `packages/common/constructs` — all CDK constructs; `packages/infra` composes them into stacks and has no infra logic of its own
- `packages/common/infra-config` — per-stage deployment config (credentials, region, which security features are on)
- `packages/common/shadcn` — shared shadcn/ui components used by both portals
- `docs` — Astro/Starlight docs site, deployed to GitHub Pages on push to `main`

Stack composition (`packages/infra/src/stacks/application-stack.ts`) wires the constructs together and reads per-component config (`enableWaf`, `enableKmsEncryption`, etc.) that defaults to fully-hardened and is only relaxed per stage. Stages themselves are defined in `packages/common/infra-config/src/stages.config.ts`, not in `packages/infra` — adding a stage means editing that file only. `wattle-development` relaxes security for cheap iteration; `wattle-production` is the hardened baseline.

The tRPC router (`packages/apis/core-api/src/router.ts`) builds procedures from middleware plugins in `init.ts`; `protectedProcedure` additionally requires `ctx.user`. `src/handler.ts` is the deployed Lambda entrypoint; `src/local-server.ts` is what `nx dev` runs locally and decodes JWTs itself (no API Gateway in front locally) — see `middleware/auth.ts` for how the two are reconciled.

`lint` depends on the workspace-level `license-check` sync generator (SPDX headers) — don't hand-edit copyright headers, they're generator-managed.

## Conventions

- Conventional Commits for commit and PR titles (enforced by commitlint via husky).
- Biome (not ESLint/Prettier) formats and lints.
- Pre-commit runs `git-secrets` and `lint-staged`, and fails if either mutated the working tree — stage the result and recommit.
