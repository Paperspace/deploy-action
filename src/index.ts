import fs from 'fs';
import YAML from 'yaml'
import path from 'path';
import dayjs from 'dayjs';
import hash from 'object-hash';
import * as core from '@actions/core'

import './fetch-polyfill';

import type { LatestRuns, Deployment } from './service';
import { getDeploymentWithDetails, upsertDeployment, getDeploymentByProjectAndName } from './service';

const TIMEOUT_IN_MINUTES = 5;
const BAD_INSTANCE_STATES = ['errored', 'failed'];

// const token = process.env.GITHUB_TOKEN || core.getInput('githubToken');
const paperspaceApiKey = process.env.PAPERSPACE_API_KEY || core.getInput('paperspaceApiKey');
const projectId = core.getInput('projectId', { required: true });
const optionalImage = core.getInput('image', { required: true });

function getFilePath() {
  const relativeFilePath = core.getInput('configPath');
  const workspacePath = process.env.GITHUB_WORKSPACE ?? '';

  if (relativeFilePath) {
    return path.join(workspacePath, relativeFilePath);
  } else {
    core.warning('No filePath input provided. Defaulting to .paperspace/app.yaml.');

    return path.join(workspacePath, '.paperspace', 'app.yaml');
  }
}

const filePath = getFilePath();

const sleep = (time = 1000) => new Promise((resolve) => setTimeout(resolve, time));

function validateParams() {
  core.info(`Validating input paramters...`)

  if (!paperspaceApiKey) {
    throw new Error('Neither env.PAPERSPACE_API_KEY or inputs.paperspaceApiKey exists');
  }
}

function ensureFile() {
  core.info(`Checking for Paperspace spec file at path: ${filePath}...`)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Paperspace spec file does not exist at path: ${filePath}`);
  }
}

function isDeploymentDisabled(runs: LatestRuns, deployment: Deployment): boolean {
  if (deployment?.latestSpec?.data && "resources" in deployment?.latestSpec?.data) {
    return !runs.length && (deployment.latestSpec?.data.enabled === false || !deployment.latestSpec.data.resources.replicas);
  }

  return false;
}

function throwBadDeployError(runs: LatestRuns) {
  const badRun = runs.find(run => {
    const badInstance = run.instances.find(instance => BAD_INSTANCE_STATES.includes(instance.state));

    return badInstance;
  })

  if (badRun) {
    const badInstance = badRun.instances.find(instance => BAD_INSTANCE_STATES.includes(instance.state));

    throw new Error(`
      Deployment update timed out after ${TIMEOUT_IN_MINUTES} minutes.
      ${badInstance ? `Last instance message: ${badInstance.stateMessage}` : ''}
    `);
  }

  throw new Error(`Deployment update timed out after ${TIMEOUT_IN_MINUTES} minutes.`);
}

function isDeploymentStable(runs: LatestRuns): boolean {
  const healthyRun = runs.find(run => run.replicas && run.replicas > 0 && run.readyReplicas === run.replicas);

  return !!healthyRun;
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

    const { runs, deployment } = await getDeploymentWithDetails(deploymentId);

    // only look at deployments that were applied to the target cluster
    if (deployment.latestSpec?.externalApplied) {
      if (start.isBefore(dayjs().subtract(TIMEOUT_IN_MINUTES, 'minutes'))) {
        throwBadDeployError(runs);
      }

      if (isDeploymentDisabled(runs, deployment)) {
        core.info('Deployment successfully disabled.');

        isDeploymentUpdated = true;
        return;
      }

      // No runs came back yet, and deployment isn't disabled, so we're waiting for deployment update...
      if (!runs.length) {
        await sleep(3000);

        continue;
      }
  
      if (isDeploymentStable(runs)) {
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

  // image is always on top level of spec, regardless of version.
  if (optionalImage) {
    if (parsed.image !== ':image') {
      core.warning('Optional image was specified but config.image is not set to `:image`. This can lead to confusion and is not recommended.');
    }

    core.info(`Overriding config.image with optional image input: ${optionalImage}`)

    // replace the image in the spec with the one provided
    parsed.image = optionalImage;
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

/**
 * Main entry point
 */
run()