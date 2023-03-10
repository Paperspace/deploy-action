import * as core from '@actions/core'
import { Fetcher } from 'openapi-typescript-fetch'

import { paths, operations } from './api';

const BASE_API_URL = 'https://api.paperspace.com/v1/deployments';
const paperspaceApiKey = process.env.PAPERSPACE_API_KEY || core.getInput('paperspaceApiKey');

const fetcher = Fetcher.for<paths>()

// global configuration
fetcher.configure({
  baseUrl: BASE_API_URL,
  init: {
    headers: {
      Authorization: `Bearer ${paperspaceApiKey}`,
    },
  },
})

// create fetch operations
const getSingleDeployment = fetcher.path('/deployments/{id}').method('get').create()
const getDeploymentWithRuns = fetcher.path('/deployments/{id}/runs').method('get').create()
const upsertDeploymentFetcher = fetcher.path('/deployments').method('post').create()
const getDeploymentByProjectFetcher = fetcher.path('/projects/{handle}/deployments').method('get').create()

export type Config = operations["mutation.deployments.upsert"]["requestBody"]["content"]["application/json"];
export type Deployment = operations["query.deployments.get"]["responses"][200]["content"]["application/json"];
export type LatestRun = operations["query.deploymentRunsrouter.get"]["responses"][200]["content"]["application/json"];

export const upsertDeployment = async (config: Config) => {
  const { data: deployment } = await upsertDeploymentFetcher(config);

  const { deploymentId } = deployment;

  return deploymentId;
}

export const getDeploymentByProjectAndName = async (handle: string, name: string) => {
  const { data: deployments } = await getDeploymentByProjectFetcher({
    handle,
    name,
  })

  if (!deployments) {
    throw new Error(`Deployments matchning name and project not found.`);
  }

  const [match] = deployments;

  return match;
}

export const getDeploymentWithDetails = async (id: string) => {
  const [{ data: runs }, { data: deployment }] = await Promise.all([
    getDeploymentWithRuns({
      id,
    }),
    getSingleDeployment({
      id,
    }),
  ]);

  if (!runs) {
    throw new Error(`Deployment runs for id: ${id} do not exist`);
  }

  if (!deployment) {
    throw new Error(`Deployment with id: ${id} does not exist`);
  }

  const [latestRun] = runs;

  return {
    latestRun,
    deployment,
  };
}

