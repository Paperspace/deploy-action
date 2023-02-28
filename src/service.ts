import * as core from '@actions/core'
import { GraphQLClient, gql } from 'graphql-request'

const API_HOST = 'https://api.paperspace.com/graphql';
const paperspaceApiKey = process.env.PAPERSPACE_API_KEY || core.getInput('paperspaceApiKey');

const updateMutation = gql`
  mutation updateDeployment($input: UpdateDeploymentInput!) {
    updateDeployment(input: $input) {
      deployment {
        id
      }
    }
  }
`

const getBaseDeploymentQuery = gql`
  query Deployment($deploymentId: UUID!) {
  deployment(id: $deploymentId) {
    id
    latestSpecHash    
  }
}
`

const getPolledDeploymentQuery = gql`
  query Deployment($deploymentId: UUID!) {
  deployment(id: $deploymentId) {
    id
    latestSpecHash
    deploymentSpecs(first: 1) {
      nodes {
        id
        externalApplied
      }
    }
    deploymentRollouts(first: 1) {
      nodes {
        deploymentRuns(first: 1) {
          nodes {
            readyReplicas
            replicas
          }
        }
      }
    }
  }
}
`

const client = new GraphQLClient(API_HOST, {
  headers: {
    Authorization: `Bearer ${paperspaceApiKey}`,
  },
  jsonSerializer: {
    parse: JSON.parse,
    stringify: JSON.stringify,
  },
})

interface DeploymentUpdate {
  id: string;
  spec: unknown;
};

interface DeploymentDetails {
  spec: {
    externalApplied: string | null;
  };
  latestRun: {
    readyReplicas: number;
    replicas: number;
  };
}

export const updateDeployment = async (variables: DeploymentUpdate) => {
  return client.request(updateMutation, {
    input: variables
  });
}

export const getDeployment = async (id: string) => {
  return client.request(getBaseDeploymentQuery, {
    deploymentId: id
  });
}

export const getDeploymentWithDetails = async (id: string): Promise<DeploymentDetails> => {
  const res = await client.request(getPolledDeploymentQuery, {
    deploymentId: id
  });

  if (!res || !res.deployment) {
    throw new Error(`Deployment with id ${id} does not exist`);
  }

  return {
    spec: res.deployment.deploymentSpecs.nodes?.[0] ?? {},
    latestRun: res.deployment.deploymentRollouts.nodes[0]?.deploymentRuns?.nodes?.[0] ?? {},
  }
}

