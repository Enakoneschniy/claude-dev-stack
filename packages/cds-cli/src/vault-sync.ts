import { basename } from 'node:path';
import { readConfig } from './vault-setup.js';

export async function vaultSync(options: { project?: string }): Promise<void> {
  const config = readConfig();
  if (config.vault?.backend !== 's3' || !config.vault?.s3) {
    console.error('S3 backend not configured. Run: cds vault setup --backend s3');
    process.exitCode = 1;
    return;
  }

  const project = options.project ?? basename(process.cwd());
  const projectPath = process.cwd();

  console.log(`Syncing vault for project: ${project}...`);

  let S3BackendClass: any;
  try {
    const s3Pkg = '@cds/s3-backend';
    const s3Module = await import(s3Pkg) as Record<string, any>;
    S3BackendClass = s3Module.S3Backend;
  } catch {
    console.error('Package @cds/s3-backend is not installed. Run: pnpm add @cds/s3-backend');
    process.exitCode = 1;
    return;
  }

  const backend = new S3BackendClass(config.vault.s3);

  try {
    console.log('Pulling from S3...');
    await backend.pull(projectPath);

    const mergeResult = backend.getLastMergeResult();

    console.log('Pushing to S3...');
    await backend.push(projectPath);

    console.log('\nVault sync complete.');
    if (mergeResult) {
      console.log(`- Sessions merged: ${mergeResult.sessionsAdded}`);
      console.log(`- Observations merged: ${mergeResult.observationsAdded}`);
      console.log(`- Entities merged: ${mergeResult.entitiesAdded}`);
    }
  } catch (err: unknown) {
    const name = (err as any)?.name;
    if (name === 'S3SchemaVersionError') {
      console.error(`Sync failed: ${(err as Error).message}`);
      console.error('Update your local installation to sync with this remote database.');
    } else {
      console.error(`Sync failed: ${(err as Error).message ?? String(err)}`);
    }
    process.exitCode = 1;
  }
}
