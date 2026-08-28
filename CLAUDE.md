# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

### Layout

- `packages/apis/core-api` — the tRPC API (`@wattle/core-api`), deployed as a single Lambda behind API Gateway
- `packages/databases/core-table` — single-table DynamoDB access via ElectroDB (`@wattle/core-table`)
- `packages/events` — standalone Lambda handlers for AWS-triggered events (e.g. Cognito lifecycle triggers), separate from the tRPC API
- `packages/websites/student-portal`, `packages/websites/instructor-portal` — React + Vite + TanStack Router frontends
- `packages/common/constructs` — CDK constructs for every deployable piece (API, table, Cognito, static sites); `packages/infra` composes these into stacks and has no infra logic of its own
- `packages/common/infra-config` — per-stage deployment config (credentials, region, which security features are on)
- `packages/common/shadcn` — shared shadcn/ui components consumed by both portals
- `packages/common/scripts` — deploy/destroy/local-DynamoDB tooling invoked by Nx targets
- `docs` — Astro/Starlight docs site, deployed to GitHub Pages on push to `main`

### Request flow

`packages/infra/src/stages/application-stage.ts` → `packages/infra/src/stacks/application-stack.ts` wires together the CDK constructs from `@wattle/common-constructs`: `UserIdentity` (Cognito), `CoreTable` (DynamoDB), `CoreApi` (API Gateway + Lambda running the tRPC router), and the two `StaticWebsite`-based portals. `ApplicationStack` reads per-component config objects (`enableWaf`, `enableKmsEncryption`, `enableMfa`, etc.) that default to fully-hardened and are only relaxed per stage.

The tRPC router lives in `packages/apis/core-api/src/router.ts`; procedures compose middleware plugins (`init.ts`) — logger, tracer, metrics, auth, error — via `.concat()`. `publicProcedure` has these; `protectedProcedure` additionally requires `ctx.user`, narrowing it from optional to required. `src/handler.ts` is the deployed Lambda entrypoint (behind real API Gateway + Cognito authorizer); `src/local-server.ts` is what `nx dev`/`nx serve` runs locally, decoding JWTs itself since there's no API Gateway in front of it locally — `middleware/auth.ts` normalizes the resulting Cognito claims the same way regardless of which path produced them.

DynamoDB access is single-table via ElectroDB entities in `packages/databases/core-table/src/entities/`; `client.ts` resolves the table name/client so entities work identically against local DynamoDB (via Docker, see `packages/common/scripts/src/dynamodb`) and the deployed table.

### Stages and deployment config

Deployment targets ("stages") are defined in `packages/common/infra-config/src/stages.config.ts`, not in `packages/infra`. Each stage sets AWS credentials/region and per-component security flags (WAF, MFA, KMS CMK + key rotation, deletion protection). `wattle-development` turns most of these off for cheap/fast iteration; `wattle-production` turns them all on. `packages/infra/src/main.ts` iterates every configured stage and instantiates an `ApplicationStage` per stage — adding a new stage means editing `stages.config.ts` only.

### Nx target conventions

Every TS project has the same target shape from the `@nx/js/typescript`, `@nx/vitest`, and `@nx/vite` plugins in [nx.json](nx.json): `compile` (tsc), `test` (vitest), `format`/`lint` (Biome, `--configuration=fix` to auto-fix), and app-specific ones (`bundle` via rolldown for Lambdas, `synth`/`checkov` for infra, `serve`/`dev` for local run). `lint` depends on `format` and the workspace-level `license-check` (SPDX header sync, configured in [aws-nx-plugin.config.mts](aws-nx-plugin.config.mts)); don't hand-edit copyright headers — they're generator-managed. `build` depends on `lint`, `compile`, `test`, and any bundle/synth step, so `pnpm build` is the full gate.

## Conventions

- Commits and PR titles follow [Conventional Commits](https://www.conventionalcommits.org) (`commitlint.config.js`, enforced by the `commit-msg` husky hook via `pnpm cz`).
- Biome (not ESLint/Prettier) formats and lints: single quotes, trailing commas, 80-col width, import organization on save (`biome.json`).
- Every source file except generated (`*.gen.*`), translated docs content, and `.astro` files carries an Apache-2.0 SPDX header — this is enforced by the `license#sync` Nx sync generator, not written by hand.
- Pre-commit runs `git-secrets` and `lint-staged`, then fails if either mutated the working tree (`.husky/pre-commit`) — stage the result and recommit rather than fighting it.
