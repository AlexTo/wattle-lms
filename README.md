<div align="center">
  <h1>Wattle LMS</h1>
  <h3>The serverless, AI-native LMS for AWS</h3>
  <a href="https://opensource.org/licenses/Apache-2.0">
    <img
      src="https://img.shields.io/badge/License-Apache%202.0-yellowgreen.svg"
      alt="Apache 2.0 License"
    />
  </a>
  <a href="https://github.com/AlexTo/wattle-lms/actions/workflows/ci.yml">
    <img
      src="https://github.com/AlexTo/wattle-lms/actions/workflows/ci.yml/badge.svg"
      alt="Release badge"
    />
  </a>
  <a href="https://github.com/AlexTo/wattle-lms/commits/main">
    <img
      src="https://img.shields.io/github/commit-activity/w/AlexTo/wattle-lms"
      alt="Commit activity"
    />
  </a>
</div>

---

**Wattle LMS** is a free and open source, serverless, AWS-native Learning Management System: course delivery, enrolment, and student/instructor portals, deployable to your own AWS account.

It's opinionated by design: one stack, one way to deploy, rather than a generic pluggable framework. The trade-off is deliberate, easier to deploy, fewer integration quirks, and a richer built-in feature set, instead of maximum flexibility. And it's built with agentic AI from the start rather than bolted on later: an AI assistant and personalised learning are part of the core experience, not a paid add-on.

## Tech stack

- Nx monorepo (pnpm workspaces), built with [`@aws/nx-plugin`](https://awslabs.github.io/nx-plugin-for-aws)
- Serverless AWS: Lambda, DynamoDB (ElectroDB), Cognito, CDK infra
- React + Vite frontends (student portal, instructor portal) with TanStack Router and Tailwind
- tRPC API
- Agentic AI: Amazon Bedrock, Bedrock AgentCore, and Strands Agents powering the in-app assistant and personalised learning paths

## Getting started

Prerequisites: Node 24+, [pnpm](https://pnpm.io) 11+.

```sh
git clone git@github.com:AlexTo/wattle-lms.git
cd wattle-lms
pnpm i
pnpm dev
```

Other common tasks:

```sh
pnpm build   # build all projects
pnpm lint    # lint (and fix) all projects
pnpm test    # test all projects
```

These map to Nx targets under the hood. Run `pnpm nx <target> <project-name>` to target a single project (e.g. `pnpm nx build @wattle/core-api`).

## Documentation

Full documentation, including architecture, generators, and guides, lives at the [Wattle LMS docs site](https://alexto.github.io/wattle-lms/).

## License

Apache License 2.0, see [LICENSE](LICENSE).

## Contributing

Contributions are welcome. There's no `CONTRIBUTING.md` yet, so please open an issue to discuss a change before sending a PR.
