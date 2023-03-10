# [WORK IN PROGRESS] Container Deployment Action
GitHub action for deploying updates to a Paperspace container deployment.

## Inputs

| Input | Description | Required | Type | Default
| --- | --- | --- | --- | ---
| `paperspaceApiKey` | Your Paperspace API key | true | string |
| `projectId` | The ID of the project the deployment lives under | true | string |
| `filePath` | The relative file path of the configuration file. Example: ./src/deploy/app.yaml | false | string | `.paperspace/app.yaml`
| `image` | Container image to be used in the configuration | false | string |

## Usage

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

### Passing an image as an input:

Mark the image as replacable using `:image` within your `.paperspace/app.yaml`.
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

### Full workflow

```yaml
name: test-pr
on:
  pull_request:
    paths:
      - "*"

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - uses: paperspace/deploy@v1.0
        name: Deploy Staging
        id: deploy
        env:
          PAPERSPACE_API_KEY: ${{ secrets.PAPERSPACE_API_KEY }}
        with:
          projectId: p28rlnvnw51
          image: nginx:latest
```
