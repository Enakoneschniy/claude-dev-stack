import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export interface CdsConfig {
  vault?: {
    backend?: string;
    s3?: {
      bucket: string;
      region: string;
      prefix: string;
      profile?: string;
    };
  };
}

function getConfigPath(): string {
  return join(homedir(), '.config', 'cds', 'config.json');
}

export function readConfig(): CdsConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as CdsConfig;
  } catch {
    return {};
  }
}

export function writeConfig(config: CdsConfig): void {
  const configPath = getConfigPath();
  const dir = join(homedir(), '.config', 'cds');
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

function ask(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
  const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

export async function vaultSetup(backend: string): Promise<void> {
  if (backend !== 's3') {
    console.error("Only 's3' backend is supported. Usage: cds vault setup --backend s3");
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('\nS3 Vault Backend Setup\n');

    const bucket = await ask(rl, 'S3 bucket name');
    if (!bucket) {
      console.error('Bucket name is required.');
      process.exitCode = 1;
      return;
    }

    const region = await ask(rl, 'AWS region', 'us-east-1');
    const profile = await ask(rl, 'AWS profile (optional)', 'default');
    const prefix = await ask(rl, 'Key prefix', 'vault/projects/');

    console.log('\nTesting S3 access...');

    // Dynamic import of @cds/s3-backend — keeps AWS SDK out of @cds/cli deps.
    // Variable-based import() bypasses TypeScript module resolution.
    const s3Pkg = '@cds/s3-backend';
    let s3Module: Record<string, any>;
    try {
      s3Module = await import(s3Pkg);
    } catch {
      console.error('Package @cds/s3-backend is not installed. Run: pnpm add @cds/s3-backend');
      process.exitCode = 1;
      return;
    }

    const s3Config = { bucket, region, prefix, profile: profile !== 'default' ? profile : undefined };
    const client = s3Module.createS3Client(s3Config);

    // Test S3 access using the s3-backend wrapper functions
    const testProject = `__cds_test_${Date.now()}`;

    try {
      // Upload a test file, check it exists, delete it
      await s3Module.uploadObject(client, s3Config, testProject, __filename);
      console.log('  Upload: OK');

      const exists = await s3Module.checkObjectExists(client, s3Config, testProject);
      console.log(`  Check: OK (exists=${exists})`);

      const testKey = s3Module.buildObjectKey(s3Config, testProject);
      await s3Module.deleteObject(client, s3Config, testKey);
      console.log('  Delete: OK');
    } catch (err: unknown) {
      console.error(`\nS3 access test failed: ${(err as Error).message}`);
      console.error('Config NOT saved. Fix the issue above and try again.');
      process.exitCode = 1;
      return;
    }

    // Save config
    const existing = readConfig();
    existing.vault = {
      backend: 's3',
      s3: {
        bucket,
        region,
        prefix,
        ...(profile !== 'default' ? { profile } : {}),
      },
    };
    writeConfig(existing);

    console.log(`\nConfig saved to ${getConfigPath()}`);
    console.log('\nS3 backend configured:');
    console.log(`  Bucket: ${bucket}`);
    console.log(`  Region: ${region}`);
    console.log(`  Prefix: ${prefix}`);
    if (profile !== 'default') console.log(`  Profile: ${profile}`);
    console.log('\nRun "cds vault sync" to sync your vault.');
  } finally {
    rl.close();
  }
}
