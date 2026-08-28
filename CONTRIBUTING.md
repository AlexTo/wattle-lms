# Contributing to Wattle LMS

Thanks for your interest in contributing. This is a young project, so please open an issue to discuss any significant change before sending a PR — it saves both of us wasted work if the approach needs adjusting.

## Reporting bugs / requesting features

Use the GitHub issue tracker. Check existing open (and recently closed) issues first. Useful details: reproduction steps, the stage/environment you hit it in (`wattle-development` vs `wattle-production`, local vs deployed), and anything unusual about your setup.

## Contributing via pull requests

1. Work against the latest `main`.
2. Check open/recently-merged PRs so you're not duplicating effort.
3. Install dependencies: `pnpm i`.
4. Make your change, focused on what you're contributing — a bug fix doesn't need a drive-by reformat.
5. Run the full gate locally before pushing: `pnpm build` (this chains lint → compile → test → bundle/synth/checkov per project). For a faster loop while iterating, target one project or run `pnpm nx affected --target <lint|test|build>` to only touch what your change affects — CI's PR checks use `nx affected` the same way.
6. Commit with `git commit` as usual — the `prepare-commit-msg` hook runs [Commitizen](https://commitizen.github.io/cz-cli/) interactively to build a [Conventional Commits](https://www.conventionalcommits.org)-formatted message for you, and `commitlint` enforces it on `commit-msg`. PR titles follow the same convention.
7. Open the PR and keep an eye on CI (`pr-checks.yml` runs lint/test/build against your changes; `ci.yml` re-runs everything on `main` after merge).

## Adding a new project or component

Prefer the [Nx Plugin for AWS](https://awslabs.github.io/nx-plugin-for-aws) generators over hand-scaffolding — that's how every existing package in this repo (`core-api`, `core-table`, both portals, `infra`) was created, and it keeps generated projects consistent and eligible for future `nx migrate` upgrades. If you have the `nx-plugin-for-aws` MCP server available, use `list-generators` / `generator-guide` to find the right one; otherwise check the [generator docs](https://awslabs.github.io/nx-plugin-for-aws/en/guides/).

## Code style and license headers

- [Biome](https://biomejs.dev) formats and lints (single quotes, trailing commas, 80-col width) — `pnpm lint` runs it with `--configuration=fix`.
- Every source file (except generated output, translated docs, and `.astro` files) carries an Apache-2.0 SPDX header. This is written by the `license#sync` Nx sync generator, configured in [aws-nx-plugin.config.mts](aws-nx-plugin.config.mts) — don't hand-edit headers, `pnpm lint`/`pnpm build` keep them in sync.

## Documentation

Docs live in `docs/` (Astro + Starlight, deployed to GitHub Pages). Only author English content, under `docs/src/content/docs/en/` — other locales are generated from it, not hand-written.

To translate your changes locally (requires AWS credentials with Bedrock access):

```sh
pnpm nx run @wattle/docs:translate            # translate files changed vs main
pnpm nx run @wattle/docs:translate -- --all   # translate everything
pnpm nx run @wattle/docs:translate -- --dry-run
```

There's no CI workflow that runs this automatically yet — if your PR touches English docs, run the translation locally and commit the result, or flag in the PR that translations are pending.

## Licensing

Apache License 2.0 — see [LICENSE](LICENSE). By contributing, you agree your contribution is licensed under the same terms.
