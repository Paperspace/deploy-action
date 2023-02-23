import fs from 'fs';
import * as core from '@actions/core'
import path from 'path';

const paperspaceApiKey = process.env.PAPERSPACE_API_KEY || core.getInput('paperspaceApiKey');
const deploymentId = core.getInput('deploymentId');

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
  const filePath = path.join(__dirname, '.paperspace', 'spec.yaml');

  core.info(`Checking for Paperspace spec file at path: ${filePath}...`)
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Paperspace spec file does not exist at path: ${filePath}`);
  }
}

async function run(): Promise<void> {
  try {
    validateParams();
    ensureFile();

    
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()