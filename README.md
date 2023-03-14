# Paperspace Deployment Action

> A GitHub action for deploying updates to a Paperspace deployment.

## Inputs

| Input        | Type     | Required? | Description                                                                |
| ------------ | -------- | --------- | -------------------------------------------------------------------------- |
| `apiKey`     | `string` | Yes       | Your [Paperspace API key](https://console.paperspace.com/settings/apikeys) |
| `projectId`  | `string` | Yes       | The ID of the project the deployment lives under                           |
| `configPath` | `string` | No        | The relative file path of the configuration file.                          |
| `image`      | `string` | No        | Container image to be used in the configuration                            |

## Usage

```yaml
uses: paperspace/deploy@v1.0
env:
  API_KEY: ${{ secrets.PAPERSPACE_API_KEY }}
with:
  projectId: p28rlnvnw51
```

You can also pass the api key as an input.

```yaml
uses: paperspace/deploy@v1.0
with:
  apiKey: ${{ secrets.PAPERSPACE_API_KEY }}
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
  API_KEY: ${{ secrets.PAPERSPACE_API_KEY }}
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
      - uses: actions/checkout@v3

      - uses: paperspace/deploy@v1.0
        name: Deploy Staging
        id: deploy
        env:
          API_KEY: ${{ secrets.PAPERSPACE_API_KEY }}
        with:
          projectId: p28rlnvnw51
          image: nginx:latest
```

### Full build + deploy

An example of building a custom image and syncing the deployment to Paperspace after pushing to a container registry.

```yaml
name: fixture-release
on:
  push:
    tags:
      - deployment-fixture@*

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set docker tag name
        run: echo "::set-output name=DOCKER_TAG_NAME::$(echo $GITHUB_REF | cut -d / -f 3 | sed 's/deployment-fixture@//')"
        id: docker-tag-name

      - name: Set up docker build
        uses: docker/setup-buildx-action@v1

      - name: Login to DockerHub
        uses: docker/login-action@v1
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v2
        with:
          file: Dockerfile
          push: true
          tags: |
            paperspace/deployment-fixture:${{ steps.docker-tag-name.outputs.DOCKER_TAG_NAME }}

      - uses: paperspace/deploy-action@main
        name: Deploy to Paperspace
        id: deploy
        env:
          API_KEY: ${{ secrets.PAPERSPACE_API_KEY }}
        with:
          projectId: ptzm6ujwqwa
          image: paperspace/deployment-fixture:${{ steps.docker-tag-name.outputs.DOCKER_TAG_NAME }}

```

### Config paths

You can supply an optional relative path for your paperspace config like so:

```yaml
- uses: paperspace/deploy-action@main
  name: Deploy action
  id: deploy
  env:
    API_KEY: ${{ secrets.PAPERSPACE_API_KEY }}
  with:
    projectId: p28rlnvnw51
    configPath: ./random/paperspace.jsonc
    image: paperspace/deployment-fixture
```

By default, the action looks for a config file by order of precedence:

```js
[
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
]
```

### File extensions

`.json`, `.jsonc`, `.toml`, `.yaml` are all supported.