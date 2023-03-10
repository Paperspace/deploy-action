import fs from 'fs';
import YAML from 'yaml'
import path from 'path';
import dayjs from 'dayjs';
import hash from 'object-hash';
import * as core from '@actions/core'

import './fetch-polyfill';

import type { LatestRun, Deployment } from './service';
import { getDeploymentWithDetails, upsertDeployment, getDeploymentByProjectAndName } from './service';

const TIMEOUT_IN_MINUTES = 5;

// const token = process.env.GITHUB_TOKEN || core.getInput('githubToken');
const paperspaceApiKey = process.env.PAPERSPACE_API_KEY || core.getInput('paperspaceApiKey');
const projectId = core.getInput('projectId', { required: true });

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

function isDeploymentDisabled(latestRun: LatestRun, deployment: Deployment): boolean {
  if (deployment?.latestSpec?.data && "resources" in deployment?.latestSpec?.data) {
    return !latestRun && (deployment.latestSpec?.data.enabled === false || !deployment.latestSpec.data.resources.replicas);
  }

  return false;
}

async function syncDeployment(projectId: string, yaml: any) {
  const deploymentId = await upsertDeployment({
    config: yaml,
    projectId,
  });

  if (!deploymentId) {
    throw new Error('Deployment upsert failed');
  }

  const start = dayjs();

  let isDeploymentUpdated = false;

  while (!isDeploymentUpdated) {
    core.info('Waiting for deployment to be complete...');

    const { latestRun, deployment } = await getDeploymentWithDetails(deploymentId);

    // only look at deployments that were applied to the target cluster
    if (deployment.latestSpec?.externalApplied) {
      if (start.isBefore(dayjs().subtract(TIMEOUT_IN_MINUTES, 'minutes'))) {
        const instanceMessages = latestRun.instances.find(instance => ['error', 'failed'].includes(instance.state));

        throw new Error(`
          Deployment update timed out after ${TIMEOUT_IN_MINUTES} minutes.
          ${instanceMessages ? `Last instance messages: ${instanceMessages}` : ''}
        `);
      }

      if (!latestRun && isDeploymentDisabled(latestRun, deployment)) {
        core.info('Deployment successfully disabled.');

        isDeploymentUpdated = true;
        return;
      }
  
      if (latestRun.readyReplicas === latestRun.replicas || !latestRun) {
        core.info('Deployment update complete.');
  
        isDeploymentUpdated = true;
        return;
      }
    }

    await sleep(3000);
  }
}

async function maybeSyncDeployment() {
  core.info(`Starting deployment update...`)

  const file = fs.readFileSync(filePath, 'utf8');
  const parsed = YAML.parse(file);

  const deployment = await getDeploymentByProjectAndName(projectId, parsed.name);

  // latest api version unless specified otherwise.
  // this allows for backwards compat.
  // ensure this happens before hash comparison.
  if (!parsed.apiVersion) {
    parsed.apiVersion = 'latest';
  }

  if (deployment) {
    const specHash = hash(parsed, {
      algorithm: 'md5',
    })
  
    core.info(`Deployment Found. Comparing hashes: ${specHash} - ${deployment.latestSpecHash}`);
  
    if (specHash === deployment.latestSpecHash) {
      core.info(`No spec changes detected. Skipping deployment update.`);
  
      return;
    }
  }

  core.info('Upserting deployment...');

  await syncDeployment(projectId, parsed);
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