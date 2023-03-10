# [WORK IN PROGRESS] Container Deployment Action
GitHub action for deploying updates to a Paperspace container deployment.

## Inputs

### `paperspaceApiKey`

**Required** Your Paperspace API key.

### `projectId`

**Required** The ID of the project the deployment lives under.

### `filePath`

**Optional** The relative file path of the spec file. Example: ./src/deploy/spec.yaml. Defaults to `$PROJECT_ROOT/.paperspace/spec.yaml`

### `image`

**Optional** The relative file path of the spec file. Example: ./src/deploy/spec.yaml

## Example usage

```yaml
uses: paperspace/deploy@v1.0
env:
  PAPERSPACE_API_KEY: ${{ secrets.PAPERSPACE_API_KEY }}
with:
  projectId: p28rlnvnw51
```

You can also pass the api key as an input.

```yaml
uses: paperspace/deploy@v1.0
with:
  paperspaceApiKey: ${{ secrets.PAPERSPACE_API_KEY }}
  projectId: p28rlnvnw51
```

## Example passing an image as an input:

Mark the image as replacable using `:image` within your `.paperspace/spec.yaml`.
```yaml
enabled: true
name: Demo
image: :image
port: 8888
resources:
  replicas: 1
  instanceType: P4000
  ```


```yaml
uses: paperspace/deploy@v1.0
env:
  PAPERSPACE_API_KEY: ${{ secrets.PAPERSPACE_API_KEY }}
with:
  image: paperspace/deployment-fixture:${{ steps.docker-tag-name.outputs.DOCKER_TAG_NAME }})
  projectId: p28rlnvnw51
```
