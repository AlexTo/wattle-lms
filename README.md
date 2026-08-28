<div align="center">
  <h1>Wattle LMS</h1>
  <h3>The serverless, AI-native Learning Management System</h3>
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

**Wattle LMS** is a free and open source, serverless, AWS-native Learning Management System: course delivery, enrolment, and student/instructor/admin portals, deployable to your own AWS account.

It's opinionated by design: one cloud provider, one way to deploy, rather than a pluggable backend you configure yourself. The trade-off is deliberate, easier to deploy and fewer integration quirks, instead of maximum backend flexibility. And it's built with agentic AI from the start rather than bolted on later: an AI assistant and personalised learning are part of the core experience, not a paid add-on.

## Tech stack

- [Nx](https://nx.dev) monorepo ([pnpm](https://pnpm.io) workspaces), built with [`@aws/nx-plugin`](https://awslabs.github.io/nx-plugin-for-aws)
- Serverless AWS: [Lambda](https://aws.amazon.com/lambda/), [DynamoDB](https://aws.amazon.com/dynamodb/) ([ElectroDB](https://electrodb.dev)), [Cognito](https://aws.amazon.com/cognito/), [CDK](https://aws.amazon.com/cdk/) infra
- [React](https://react.dev) + [Vite](https://vite.dev) frontends with [TanStack Router](https://tanstack.com/router), [Tailwind](https://tailwindcss.com), and [shadcn/ui](https://ui.shadcn.com)
- [tRPC](https://trpc.io) API
- Agentic AI: [Amazon Bedrock](https://aws.amazon.com/bedrock/), [Bedrock AgentCore](https://aws.amazon.com/bedrock/agentcore/), and [Strands Agents](https://strandsagents.com) powering the in-app assistant and personalised learning paths

## Getting started

Prerequisites: [Node](https://nodejs.org) 24+, [pnpm](https://pnpm.io) 11+, [Docker](https://www.docker.com).

### Clone and install

```sh
git clone git@github.com:AlexTo/wattle-lms.git
cd wattle-lms
pnpm i
```

### Deploy

With [AWS credentials configured](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html), deploy the entire stack to your own AWS account with a single command:

```sh
pnpm nx deploy @wattle/infra "wattle-development/*"
```

This deploys the `wattle-development` stage, which has WAF, MFA, KMS encryption/key rotation, and deletion protection all turned off for faster, cheaper iteration. Use the `wattle-production` stage for a deployment with these best practices enabled.

### Running locally

Most components (frontends, API) run locally against your machine, but a few, like Cognito, still point at the resources from your deployed stack. Once deployed, pull the runtime config so local dev knows how to reach those, then start the dev servers:

```sh
pnpm nx load-runtime-config @wattle/student-portal
pnpm nx load-runtime-config @wattle/instructor-portal
pnpm dev
```

## Documentation

Full documentation, including architecture and guides, lives at the [Wattle LMS docs site](https://alexto.github.io/wattle-lms/).

## License

Apache License 2.0, see [LICENSE](LICENSE).

## Contributing

Contributions are welcome. There's no `CONTRIBUTING.md` yet, so please open an issue to discuss a change before sending a PR.
