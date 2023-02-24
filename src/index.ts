import fs from 'fs';
import YAML from 'yaml'
import path from 'path';
import dayjs from 'dayjs';
import hash from 'object-hash';
import * as core from '@actions/core'

import { getDeployment, getDeploymentWithDetails, updateDeployment } from './service';

const TIMEOUT_IN_MINUTES = 15;

const paperspaceApiKey = process.env.PAPERSPACE_API_KEY || core.getInput('paperspaceApiKey');
const deploymentId = core.getInput('deploymentId', { required: true });

function getFilePath() {
  const relativeFilePath = core.getInput('filePath');
  const workspacePath = process.env.GITHUB_WORKSPACE ?? '';

  if (relativeFilePath) {
    return path.join(workspacePath, relativeFilePath);
  } else {
    core.warning('No filePath input provided. Defaulting to .paperspace/spec.yaml.');

    return path.join(workspacePath, '.paperspace', 'spec.yaml');
  }
}

const filePath = getFilePath();

const validateParams = () => {
  core.info(`Validating input paramters...`)

  if (!paperspaceApiKey) {
    throw new Error('Neither env.PAPERSPACE_API_KEY or inputs.paperspaceApiKey exists');
  }
}

const sleep = (time = 1000) => new Promise((resolve) => setTimeout(resolve, time));

const ensureFile = () => {
  core.info(`Checking for Paperspace spec file at path: ${filePath}...`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Paperspace spec file does not exist at path: ${filePath}`);
  }
}

async function syncDeployment(deploymentId: string, yaml: any) {
  const res = await updateDeployment({
    id: deploymentId,
    spec: yaml,
  });

  if (!res.updateDeployment) {
    throw new Error('Deployment update failed');
  }

  const start = dayjs();

  let isDeploymentUpdated = false;

  while (!isDeploymentUpdated) {
    core.info('Waiting for deployment to be complete...');

    if (start.isBefore(dayjs().subtract(TIMEOUT_IN_MINUTES, 'minutes'))) {
      throw new Error(`Deployment update timed out after ${TIMEOUT_IN_MINUTES} minutes.`);
    }

    const { spec, latestRun } = await getDeploymentWithDetails(deploymentId);
  
    if (spec?.externalApplied && latestRun.readyReplicas === latestRun.replicas) {
      core.info('Deployment update complete.');

      isDeploymentUpdated = true;
    }

    await sleep(3000);
  }
}

async function maybeSyncDeployment() {
  core.info(`Starting deployment update...`)

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
    core.info(`No spec changes detected. Skipping deployment update.`);

    return;
  }

  core.info('Spec changes detected. Updating deployment...');

  await syncDeployment(deploymentId, parsed);
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