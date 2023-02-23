# [WORK IN PROGRESS] Container Deployment Action
GitHub action for deploying updates to a Paperspace container deployment.

## Inputs

### `paperspaceApiKey`

**Required** Your Paperspace API key.

### `deploymentId`

**Required** The ID of the deployment you are updating.

## Outputs

### `externalApplied`

The time the deployment was updated

### `externalApplied`

The time the deployment was updated

## Example usage

```yaml
uses: paperspace/deploy@v1.0
with:
  paperspaceApiKey: ${{ secrets.PAPERSPACE_API_KEY }}
  deploymentId: b0e779e5-365f-450f-bd4d-bfeddfbf45b1
```

You can also pass env variables to the action for your API key

```yaml
uses: paperspace/deploy@v1.0
env:
  PAPERSPACE_API_KEY: ${{ secrets.PAPERSPACE_API_KEY }}
with:
  deploymentId: b0e779e5-365f-450f-bd4d-bfeddfbf45b1
```
