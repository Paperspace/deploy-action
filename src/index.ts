import fs from 'fs';
import { exec } from 'child_process';
import YAML from 'yaml'
import hash from 'object-hash';
import * as core from '@actions/core'
import path from 'path';
import { getDeployment, updateDeployment } from './service';

const paperspaceApiKey = process.env.PAPERSPACE_API_KEY || core.getInput('paperspaceApiKey');
const deploymentId = core.getInput('deploymentId');

const filePath = path.join(process.env.GITHUB_WORKSPACE ?? '', '.paperspace', 'spec.yaml');

const validateParams = () => {
  core.info(`Validating input paramters...`)

  if (!paperspaceApiKey) {
    throw new Error('Neither env.PAPERSPACE_API_KEY or inputs.paperspaceApiKey exists');
  }

  if (!deploymentId) {
    throw new Error('inputs.deploymentId is not set');
  }
}

const ensureFile = () => {
  core.info(`Checking for Paperspace spec file at path: ${filePath}...`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Paperspace spec file does not exist at path: ${filePath}`);
  }
}

async function maybeSyncDeployment() {
  core.info(`Starting deployment sync...`)

  const file = fs.readFileSync(filePath, 'utf8');
  const parsed = YAML.parse(file);

  const res = await getDeployment(deploymentId);

  if (!res || !res.deployment) {
    throw new Error(`Deployment with id ${deploymentId} does not exist`);
  }

  const { deployment } = res;

  const specHash = hash(parsed, {
    algorithm: 'md5',
  })

  core.info(`Deployment Found. Comparing Hashes...`);

  if (specHash === deployment.latestSpecHash) {
    core.info(`No spec changes detected. Skipping deployment sync.`);

    return;
  }

  core.info('Spec changes detected. Syncing deployment...');

  await syncDeployment(deploymentId, parsed);
}

async function syncDeployment(deploymentId: string, yaml: any) {
  const res = await updateDeployment({
    id: deploymentId,
    spec: yaml,
  });

  console.log('res', res);
}

async function run(): Promise<void> {
  try {
    validateParams();
    ensureFile();

    await maybeSyncDeployment();
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()