/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment node
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SCRIPT = join(REPO_ROOT, 'scripts/setup-github-oidc.sh');
const REPOSITORY = 'AlexTo/wattle-lms';
const IMMUTABLE_PREFIX = 'repo:AlexTo@296212/wattle-lms@1340223666';

/** How the stub `gh` answers the OIDC subject customization request. */
type OidcSettings =
  | { kind: 'response'; useDefault: boolean; prefix?: string }
  | { kind: 'request-fails' }
  | { kind: 'no-gh' };

// Records every call and keeps each policy document it's handed, so tests can
// assert what the script would have sent to AWS without touching AWS.
const AWS_STUB = `#!/usr/bin/env bash
echo "aws $*" >> "$OUT/calls.log"
case "$1 $2" in
  "sts get-caller-identity") echo "arn:aws:sts::111122223333:assumed-role/Admin/test"; exit;;
  "configure get") echo "ap-southeast-2"; exit;;
  "configure list-profiles") exit;;
  "ssm get-parameter") exit 0;;
  "iam get-open-id-connect-provider"|"iam get-role"|"iam get-policy") exit 1;;
esac
for arg in "$@"; do
  case "$arg" in file://*) cp "\${arg#file://}" "$OUT/$(basename "\${arg#file://}" | sed 's/\\.[A-Za-z0-9]\\{6\\}\\.json$/.json/')";; esac
done
`;

const ghStub = (settings: OidcSettings): string => {
  const oidcResponse =
    settings.kind === 'response'
      ? `printf '%s\\t%s\\n' ${settings.useDefault} '${settings.prefix ?? ''}'; exit 0`
      : `echo "connection reset" >&2; exit 1`;
  return `#!/usr/bin/env bash
echo "gh $*" >> "$OUT/calls.log"
[[ "$1" == auth ]] && exit ${settings.kind === 'no-gh' ? 1 : 0}
if [[ "$*" == *actions/oidc/customization/sub* ]]; then ${oidcResponse}; fi
exit 0
`;
};

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true });
});

const runSetup = (settings: OidcSettings, env: Record<string, string> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'setup-github-oidc-'));
  tempDirs.push(dir);
  const bin = join(dir, 'bin');
  const out = join(dir, 'out');
  mkdirSync(bin);
  mkdirSync(out);
  writeFileSync(join(bin, 'aws'), AWS_STUB);
  writeFileSync(join(bin, 'gh'), ghStub(settings));
  chmodSync(join(bin, 'aws'), 0o755);
  chmodSync(join(bin, 'gh'), 0o755);

  const result = spawnSync('bash', [SCRIPT, '--yes', 'wattle-development'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      OUT: out,
      GITHUB_REPOSITORY: REPOSITORY,
      AWS_PROFILE: '',
      ...env,
    },
  });

  const calls = existsSync(join(out, 'calls.log'))
    ? readFileSync(join(out, 'calls.log'), 'utf8').split('\n')
    : [];
  const trustFile = join(out, 'github-deploy-wattle-development.trust.json');
  const trustedSubject = existsSync(trustFile)
    ? JSON.parse(readFileSync(trustFile, 'utf8')).Statement[0].Condition
        .StringEquals['token.actions.githubusercontent.com:sub']
    : undefined;
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    iamCalls: calls.filter((call) => call.startsWith('aws iam ')),
    trustedSubject,
  };
};

describe('setup-github-oidc.sh OIDC subject', { timeout: 60_000 }, () => {
  it("trusts the repository's immutable subject prefix", () => {
    const { trustedSubject } = runSetup({
      kind: 'response',
      useDefault: true,
      prefix: IMMUTABLE_PREFIX,
    });

    expect(trustedSubject).toBe(
      `${IMMUTABLE_PREFIX}:environment:wattle-development`,
    );
  });

  it('trusts repo:<owner>/<repo> when GitHub reports no prefix', () => {
    const { trustedSubject } = runSetup({ kind: 'response', useDefault: true });

    expect(trustedSubject).toBe(
      `repo:${REPOSITORY}:environment:wattle-development`,
    );
  });

  it('stops before touching IAM when the settings request fails', () => {
    const { status, output, iamCalls, trustedSubject } = runSetup({
      kind: 'request-fails',
    });

    expect(status).not.toBe(0);
    expect(output).toContain("Couldn't read");
    expect(iamCalls).toEqual([]);
    expect(trustedSubject).toBeUndefined();
  });

  it('stops before touching IAM for a custom subject claim template', () => {
    const { status, output, iamCalls } = runSetup({
      kind: 'response',
      useDefault: false,
    });

    expect(status).not.toBe(0);
    expect(output).toContain('custom OIDC subject claim template');
    expect(iamCalls).toEqual([]);
  });

  it('warns and assumes the default prefix without an authenticated gh', () => {
    const { output, trustedSubject } = runSetup({ kind: 'no-gh' });

    expect(output).toContain('assuming the default prefix');
    expect(trustedSubject).toBe(
      `repo:${REPOSITORY}:environment:wattle-development`,
    );
  });

  it('uses GITHUB_OIDC_SUBJECT_PREFIX without asking GitHub', () => {
    const { trustedSubject } = runSetup(
      { kind: 'request-fails' },
      { GITHUB_OIDC_SUBJECT_PREFIX: 'repo:someone/fork' },
    );

    expect(trustedSubject).toBe(
      'repo:someone/fork:environment:wattle-development',
    );
  });
});
