import 'whatwg-fetch';
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
const upsertDeployment = fetcher.path('/deployments').method('post').create()

type Config = operations["mutation.deployments.upsert"]["requestBody"]["content"]["application/json"];

export const updateDeployment = async (config: Config) => {
  const { data: deployment } = await upsertDeployment(config);

  const { deploymentId } = deployment;

  return deploymentId;
}

export const getDeployment = async (id: string) => {
  const { data: deployment } = await getSingleDeployment({
    id,
  })

  if (!deployment) {
    throw new Error(`Deployment with id ${id} does not exist`);
  }

  return deployment;
}

export const getDeploymentWithDetails = async (id: string) => {
  const { data: runs } = await getDeploymentWithRuns({
    id,
  })

  if (!runs) {
    throw new Error(`Deployment runs for id: ${id} do not exist`);
  }

  const [latestRun] = runs;

  return latestRun;
}

