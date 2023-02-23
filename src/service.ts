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

const getDeploymentQuery = gql`
  query Deployment($deploymentId: UUID!) {
  deployment(id: $deploymentId) {
    id
    latestSpecHash
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

export const updateDeployment = async (variables: DeploymentUpdate) => {
  return client.request(updateMutation, {
    input: variables
  });
}

export const getDeployment = async (id: string) => {
  return client.request(getDeploymentQuery, {
    deploymentId: id
  });
}
