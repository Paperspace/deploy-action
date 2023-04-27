import fs from "fs";
import YAML from "yaml";
import TOML from "toml";
import { jsonc as JSONC } from "jsonc";
import path from "path";
import dayjs from "dayjs";
import hash from "object-hash";
import * as core from "@actions/core";

import "./fetch-polyfill";

import type { LatestRuns, Deployment } from "./service";
import {
  getDeploymentWithDetails,
  upsertDeployment,
  getDeploymentByProjectAndName,
} from "./service";

const TIMEOUT_IN_MINUTES = 5;
const BAD_INSTANCE_STATES = ["errored", "failed"];

const defaultConfigPaths = [
  "paperspace.yaml",
  "paperspace.yml",
  "paperspace.json",
  "paperspace.jsonc",
  "paperspace.toml",
  ".paperspace/app.yaml",
  ".paperspace/app.yml",
  ".paperspace/app.json",
  ".paperspace/app.jsonc",
  ".paperspace/app.toml",
];

// const token = process.env.GITHUB_TOKEN || core.getInput('githubToken');
const paperspaceApiKey =
  process.env.PAPERSPACE_API_KEY || core.getInput("apiKey");
const projectId = core.getInput("projectId", { required: true });
const optionalImage = core.getInput("image", { required: true });
const shouldForce = Boolean(core.getInput("force", { required: false }));

function ensureAndGetConfigPath(): string {
  const relativeFilePath = core.getInput("configPath");
  const workspacePath = process.env.GITHUB_WORKSPACE ?? "";

  if (relativeFilePath) {
    core.info(
      `Found configPath input: ${relativeFilePath}. Ensuring file exists...`
    );

    const relPath = path.join(workspacePath, relativeFilePath);

    if (!fs.existsSync(relPath)) {
      throw new Error(`File not found at path: ${relPath}`);
    }

    return relPath;
  }

  core.warning("No configPath input provided. Searching for default...");

  for (const fileName of defaultConfigPaths) {
    const pathToTry = path.join(workspacePath, fileName);

    core.info(`Trying for path: ${pathToTry}...`);

    if (fs.existsSync(pathToTry)) {
      core.info(`Path found: ${pathToTry}`);

      return pathToTry;
    }
  }

  throw new Error(
    `No Paperspace spec file found at any of the following paths: ${defaultConfigPaths.join(
      ", "
    )}`
  );
}

const sleep = (time = 1000) =>
  new Promise((resolve) => setTimeout(resolve, time));

function validateParams() {
  core.info(`Validating input paramters...`);

  if (!paperspaceApiKey) {
    throw new Error("Neither env.PAPERSPACE_API_KEY or inputs.apiKey exists");
  }
}

function isDeploymentDisabled(
  runs: LatestRuns,
  deployment: Deployment
): boolean {
  if (
    deployment?.latestSpec?.data &&
    "resources" in deployment.latestSpec.data
  ) {
    return (
      !runs.length &&
      (deployment.latestSpec?.data.enabled === false ||
        !deployment.latestSpec.data.resources.replicas)
    );
  }

  return false;
}

function throwBadDeployError(runs: LatestRuns) {
  const badRun = runs.find((run) => {
    const badInstance = run.instances.find((instance) =>
      BAD_INSTANCE_STATES.includes(instance.state)
    );

    return badInstance;
  });

  if (badRun) {
    const badInstance = badRun.instances.find((instance) =>
      BAD_INSTANCE_STATES.includes(instance.state)
    );

    throw new Error(`
      Deployment update timed out after ${TIMEOUT_IN_MINUTES} minutes.
      ${badInstance ? `Last instance message: ${badInstance.stateMessage}` : ""}
    `);
  }

  throw new Error(
    `Deployment update timed out after ${TIMEOUT_IN_MINUTES} minutes.`
  );
}

function isDeploymentStable(deployment: Deployment): boolean {
  const { latestSpec } = deployment;

  return !!latestSpec?.dtHealthy;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncDeployment(projectId: string, yaml: any) {
  const deploymentId = await upsertDeployment({
    config: yaml,
    projectId,
  });

  if (!deploymentId) {
    throw new Error("Deployment upsert failed");
  }

  const start = dayjs();

  let isDeploymentUpdated = false;

  while (!isDeploymentUpdated) {
    core.info("Waiting for deployment to complete...");

    const { runs, deployment } = await getDeploymentWithDetails(deploymentId);

    // only look at deployments that were applied to the target cluster
    if (deployment.latestSpec?.externalApplied) {
      if (start.isBefore(dayjs().subtract(TIMEOUT_IN_MINUTES, "minutes"))) {
        throwBadDeployError(runs);
      }

      if (isDeploymentDisabled(runs, deployment)) {
        core.info("Deployment successfully disabled.");

        isDeploymentUpdated = true;
        return;
      }

      if (isDeploymentStable(deployment)) {
        core.info("Deployment update complete.");

        isDeploymentUpdated = true;
        return;
      }
    }

    await sleep(3000);
  }
}

const parseByExt = (filePath: string) => {
  const ext = path.extname(filePath);
  const content = fs.readFileSync(filePath, "utf8");

  switch (ext) {
    case ".yaml":
      return YAML.parse(content);
    case ".toml":
      return TOML.parse(content);
    case ".jsonc":
      return JSONC.parse(content);
    case ".json":
      return JSON.parse(content);
    default:
      throw new Error(`Unsupported file extension: ${ext}`);
  }
};

async function maybeSyncDeployment() {
  core.info(`Starting deployment update...`);

  const filePath = ensureAndGetConfigPath();
  const parsed = parseByExt(filePath);

  const deployment = await getDeploymentByProjectAndName(
    projectId,
    parsed.name
  );

  // latest api version unless specified otherwise.
  // this allows for backwards compat.
  // ensure this happens before hash comparison.
  if (!parsed.apiVersion) {
    parsed.apiVersion = "latest";
  }

  // image is always on top level of spec, regardless of version.
  if (optionalImage) {
    if (parsed.image !== ":image") {
      core.warning(
        "Optional image was specified but config.image is not set to `:image`. This can lead to confusion and is not recommended."
      );
    }

    core.info(
      `Overriding config.image with optional image input: ${optionalImage}`
    );

    // replace the image in the spec with the one provided
    parsed.image = optionalImage;
  }

  if (deployment) {
    if (!shouldForce) {
      const specHash = hash(parsed, {
        algorithm: "md5",
      });
  
      core.info(
        `Deployment Found. Comparing hashes: ${specHash} - ${deployment.latestSpecHash}`
      );
  
      if (specHash === deployment.latestSpecHash) {
        core.info(`No spec changes detected. Skipping deployment update.`);
  
        return;
      }
    } else {
      core.info(`Force flag passed. Bypassing hash check.`);
    }
  }

  core.info("Upserting deployment...");

  await syncDeployment(projectId, parsed);
}

async function run(): Promise<void> {
  try {
    validateParams();

    await maybeSyncDeployment();
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

/**
 * Main entry point
 */
run();
