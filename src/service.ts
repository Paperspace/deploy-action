import * as core from "@actions/core";
import * as github from "@actions/github";
import { Fetcher, Middleware } from "openapi-typescript-fetch";

import { paths, operations } from "./api";

const BASE_API_URL = "https://api.paperspace.com/v1";
const paperspaceApiKey =
  process.env.PAPERSPACE_API_KEY || core.getInput("apiKey");

const fetcher = Fetcher.for<paths>();

const Logger: Middleware = async (url, init, next) => {
  if (process.env.DEBUG) {
    core.info("URL: " + url);
    core.info("Method: " + init.method);
    core.info(
      "Headers:\n" +
        JSON.stringify(Object.fromEntries(init.headers.entries()), null, 2)
    );
  }

  const response = await next(url, init);
  return response;
};

// global configuration
fetcher.configure({
  baseUrl: BASE_API_URL,
  use: [Logger],
  init: {
    headers: {
      Authorization: `Bearer ${paperspaceApiKey}`,
      "x-git-host": "github",
      "x-git-actor": github.context.actor,
      "x-git-owner": github.context.repo.owner,
      "x-git-repo": github.context.repo.repo,
      "x-git-ref": getRef(),
      "x-git-sha": getSha(),
    },
  },
});

// create fetch operations
const getSingleDeployment = fetcher
  .path("/deployments/{id}")
  .method("get")
  .create();
const getDeploymentWithRuns = fetcher
  .path("/deployments/{id}/runs")
  .method("get")
  .create();
const upsertDeploymentFetcher = fetcher
  .path("/deployments")
  .method("post")
  .create();
const getDeploymentByProjectFetcher = fetcher
  .path("/projects/{id}/deployments")
  .method("get")
  .create();

export type Config =
  operations["mutation.deployments.upsert"]["requestBody"]["content"]["application/json"];
export type Deployment =
  operations["query.deployments.get"]["responses"][200]["content"]["application/json"];
export type LatestRuns =
  operations["query.deploymentRuns.get"]["responses"][200]["content"]["application/json"];

export async function upsertDeployment(config: Config) {
  try {
    const { data: deployment } = await upsertDeploymentFetcher(config);

    const { deploymentId } = deployment;

    return deploymentId;
  } catch (e) {
    // check which operation threw the exception
    if (e instanceof upsertDeploymentFetcher.Error) {
      const { data } = e.getActualType();

      if ("issues" in data) {
        throw new Error(
          `Error upserting deployment: ${
            data.message
          }. Issues: ${JSON.stringify(data.issues)}`
        );
      }

      throw new Error(`Error upserting deployment: ${data.message}.`);
    }
  }
}

export async function getDeploymentByProjectAndName(
  id: string,
  name: string
) {
  const { data } = await getDeploymentByProjectFetcher({
    id,
    name,
  });

  const deployments = data.items;

  if (!deployments) {
    throw new Error(`Deployments matching name and project not found.`);
  }

  return deployments[0];
}

export async function getDeploymentWithDetails(id: string) {
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

  return {
    runs,
    deployment,
  };
}

function getRef() {
  let ref = github.context.ref;

  if (ref.startsWith("refs/pull/")) {
    ref = github.context.payload.pull_request?.head.ref ?? "";
  }

  if (ref.startsWith("refs/heads/")) {
    ref = ref.replace("refs/heads/", "");
  }

  return ref;
}

function getSha() {
  if (github.context.eventName === "pull_request") {
    return github.context.payload.pull_request?.head.sha ?? "";
  }

  return github.context.sha;
}
