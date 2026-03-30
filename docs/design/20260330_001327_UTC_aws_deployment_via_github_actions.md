# AWS Deployment via GitHub Actions

**Author:** aallbright + Claude
**Date:** 2026-03-30
**Status:** Implemented (2026-03-30)

---

## Overview

Deploy Anthem World to AWS using GitHub Actions with OIDC federation (no long-lived AWS credentials). The architecture serves the Hugo static site from S3 + CloudFront and the game API from API Gateway + Lambda + DynamoDB via SAM.

```
                   Users
                     |
               [CloudFront]
                /         \
     Static site           API requests
       (S3)               (API Gateway)
                            |
                     [Lambda x 6]
                            |
                      [DynamoDB x 4]
```

---

## Part 1: AWS Resources to Create (one-time setup)

These are created manually in the AWS console or via CLI **once**, before the first deploy.

### 1A. OIDC Identity Provider

GitHub Actions authenticates to AWS via OIDC — no access keys stored in secrets.

```bash
# Run once from your local machine with admin credentials
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 \
  --client-id-list sts.amazonaws.com
```

> The thumbprint may change over time. GitHub publishes the current value at
> https://github.blog/changelog/2023-06-27-github-actions-update-on-oidc-integration-with-aws/

### 1B. S3 Bucket for Static Site

```bash
BUCKET_NAME="anthemworld-site"
aws s3 mb "s3://${BUCKET_NAME}" --region us-east-1

# Block all public access — CloudFront uses OAC, not public S3
aws s3api put-public-access-block \
  --bucket "${BUCKET_NAME}" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 1C. CloudFront Distribution

Create a CloudFront distribution that:
- **Origin 1 (default):** S3 bucket `anthemworld-site` via Origin Access Control (OAC)
- **Origin 2 (`/api/*`):** API Gateway URL (from SAM output `GameApiUrl`)
- **Default root object:** `index.html`
- **Custom error responses:** 403 and 404 both return `/index.html` with 200 (Hugo handles routing)
- **Cache policy:** `CachingOptimized` for S3 origin, `CachingDisabled` for API origin
- **Viewer protocol policy:** Redirect HTTP to HTTPS
- **Custom domain:** your domain (optional, requires ACM certificate in us-east-1)
- **Response headers policy:** Add `Strict-Transport-Security` and `X-Frame-Options: SAMEORIGIN`

After creating the distribution, add an S3 bucket policy granting CloudFront OAC read access:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontServicePrincipal",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::anthemworld-site/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::702353326783:distribution/E22QM4NDFL7MNS"
      }
    }
  }]
}
```

### 1D. IAM Deploy Role (least-privilege)

This is the role GitHub Actions assumes. It can **only** do what's needed for deployment.

```bash
# 1. Create the trust policy (allows only your repo's main branch)
cat > trust-policy.json << 'TRUST'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::702353326783:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:aallbrig/anthemworld:ref:refs/heads/main"
      }
    }
  }]
}
TRUST

# 2. Create the role
aws iam create-role \
  --role-name anthemworld-deploy \
  --assume-role-policy-document file://trust-policy.json

# 3. Attach the inline permissions policy (see below)
aws iam put-role-policy \
  --role-name anthemworld-deploy \
  --policy-name anthemworld-deploy-permissions \
  --policy-document file://deploy-permissions.json
```

**deploy-permissions.json** (minimal permissions):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3SiteSync",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::anthemworld-site",
        "arn:aws:s3:::anthemworld-site/*"
      ]
    },
    {
      "Sid": "CloudFrontInvalidation",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::702353326783:distribution/E22QM4NDFL7MNS"
    },
    {
      "Sid": "SAMDeploy",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:GetTemplate"
      ],
      "Resource": "arn:aws:cloudformation:us-east-1:702353326783:stack/anthemworld-game-*/*"
    },
    {
      "Sid": "SAMArtifactBucket",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:CreateBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::aws-sam-cli-managed-default-*",
        "arn:aws:s3:::aws-sam-cli-managed-default-*/*"
      ]
    },
    {
      "Sid": "LambdaManagement",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:DeleteFunction",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:TagResource",
        "lambda:ListTags"
      ],
      "Resource": "arn:aws:lambda:us-east-1:702353326783:function:anthemworld-game-*"
    },
    {
      "Sid": "APIGateway",
      "Effect": "Allow",
      "Action": [
        "apigateway:GET",
        "apigateway:POST",
        "apigateway:PUT",
        "apigateway:PATCH",
        "apigateway:DELETE"
      ],
      "Resource": [
        "arn:aws:apigateway:us-east-1::/restapis",
        "arn:aws:apigateway:us-east-1::/restapis/*"
      ]
    },
    {
      "Sid": "DynamoDBTableManagement",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:UpdateTable",
        "dynamodb:DescribeTable",
        "dynamodb:UpdateTimeToLive",
        "dynamodb:DescribeTimeToLive",
        "dynamodb:TagResource",
        "dynamodb:ListTagsOfResource"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:702353326783:table/anthem-*-prod"
    },
    {
      "Sid": "IAMPassRoleForLambda",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::702353326783:role/anthemworld-game-*",
      "Condition": {
        "StringEquals": { "iam:PassedToService": "lambda.amazonaws.com" }
      }
    },
    {
      "Sid": "IAMRoleManagement",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:TagRole"
      ],
      "Resource": "arn:aws:iam::702353326783:role/anthemworld-game-*"
    },
    {
      "Sid": "CloudFormationTransform",
      "Effect": "Allow",
      "Action": "cloudformation:CreateChangeSet",
      "Resource": "arn:aws:cloudformation:us-east-1:aws:transform/Serverless-2016-10-31"
    }
  ]
}
```

> **Why these permissions?**
> - `S3SiteSync` — sync Hugo build output to the site bucket
> - `CloudFrontInvalidation` — bust cache after deploy
> - `SAMDeploy` + `SAMArtifactBucket` — SAM packages Lambda zips into an S3 bucket, then creates/updates a CloudFormation stack
> - `LambdaManagement` — create and update the 6 game Lambda functions
> - `APIGateway` — SAM creates/updates the API Gateway REST API
> - `DynamoDBTableManagement` — create/modify the 4 DynamoDB tables (first deploy only; subsequent deploys are no-ops if schema unchanged)
> - `IAMPassRoleForLambda` + `IAMRoleManagement` — SAM creates execution roles for each Lambda function; `PassRole` lets CloudFormation assign them
> - `CloudFormationTransform` — required for the `AWS::Serverless` transform

---

## Part 2: GitHub Repository Configuration

### 2A. GitHub Secrets / Variables

Go to **Settings > Secrets and variables > Actions** and add:

| Type | Name | Value | Notes |
|------|------|-------|-------|
| Secret | `AWS_702353326783` | `123456789012` | Your 12-digit account ID |
| Variable | `AWS_REGION` | `us-east-1` | Deploy region |
| Variable | `CLOUDFRONT_E22QM4NDFL7MNS` | `E1EXAMPLE` | From Part 1C |
| Variable | `SITE_BUCKET` | `anthemworld-site` | From Part 1B |
| Variable | `PRODUCTION_DOMAIN` | `https://anthemworld.com` | For Hugo baseURL and CORS |

No AWS access keys are stored — OIDC handles authentication.

### 2B. Branch Protection

Enable on `main`:
- Require status checks to pass (cli, hugo, playwright, sam-validate)
- Require pull request reviews
- Do not allow bypassing the above

---

## Part 3: GitHub Actions Deploy Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

permissions:
  id-token: write   # Required for OIDC
  contents: read

concurrency:
  group: deploy-production
  cancel-in-progress: false  # Never cancel a running deploy

jobs:
  # ── Gate: run existing CI checks first ──────────────────────────────
  ci:
    uses: ./.github/workflows/ci.yml

  # ── Deploy game backend (SAM) ──────────────────────────────────────
  deploy-api:
    needs: ci
    runs-on: ubuntu-latest
    environment: production
    defaults:
      run:
        working-directory: sam/game
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install SAM CLI
        run: pip install aws-sam-cli

      - name: Install Lambda dependencies
        run: cd functions && npm ci --omit=dev

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_702353326783 }}:role/anthemworld-deploy
          aws-region: ${{ vars.AWS_REGION }}

      - name: SAM build
        run: sam build

      - name: SAM deploy
        run: |
          sam deploy \
            --stack-name anthemworld-game-prod \
            --resolve-s3 \
            --capabilities CAPABILITY_IAM \
            --no-confirm-changeset \
            --no-fail-on-empty-changeset \
            --parameter-overrides \
              Stage=prod \
              CorsOrigin=${{ vars.PRODUCTION_DOMAIN }}

      - name: Export API URL
        id: api-url
        run: |
          URL=$(aws cloudformation describe-stacks \
            --stack-name anthemworld-game-prod \
            --query 'Stacks[0].Outputs[?OutputKey==`GameApiUrl`].OutputValue' \
            --output text)
          echo "api_url=${URL}" >> "$GITHUB_OUTPUT"

    outputs:
      api_url: ${{ steps.api-url.outputs.api_url }}

  # ── Deploy static site (Hugo → S3 → CloudFront) ───────────────────
  deploy-site:
    needs: [ci, deploy-api]
    runs-on: ubuntu-latest
    environment: production
    defaults:
      run:
        working-directory: hugo/site
    steps:
      - uses: actions/checkout@v4

      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v3
        with:
          hugo-version: latest

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_702353326783 }}:role/anthemworld-deploy
          aws-region: ${{ vars.AWS_REGION }}

      - name: Build site
        run: |
          hugo --minify \
            --baseURL "${{ vars.PRODUCTION_DOMAIN }}/" \
            --params.gameApiBase="${{ needs.deploy-api.outputs.api_url }}"
        # baseURL and gameApiBase are set at build time — no config file changes needed

      - name: Sync to S3
        run: |
          aws s3 sync public/ "s3://${{ vars.SITE_BUCKET }}" \
            --delete \
            --cache-control "public, max-age=3600" \
            --exclude "data/*" \
            --exclude "js/*"

          # Long-cache static data and JS (fingerprinted or rarely changing)
          aws s3 sync public/data/ "s3://${{ vars.SITE_BUCKET }}/data/" \
            --cache-control "public, max-age=86400"
          aws s3 sync public/js/ "s3://${{ vars.SITE_BUCKET }}/js/" \
            --cache-control "public, max-age=86400"

      - name: Invalidate CloudFront cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id "${{ vars.CLOUDFRONT_E22QM4NDFL7MNS }}" \
            --paths "/*"

  # ── Seed rankings on first deploy ──────────────────────────────────
  seed-rankings:
    needs: deploy-api
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_702353326783 }}:role/anthemworld-deploy
          aws-region: ${{ vars.AWS_REGION }}

      - name: Seed if rankings table is empty
        run: |
          COUNT=$(aws dynamodb scan \
            --table-name anthem-rankings-prod \
            --select COUNT \
            --query 'Count' \
            --output text 2>/dev/null || echo "0")

          if [ "$COUNT" -lt 10 ]; then
            echo "Rankings table has $COUNT items — seeding..."
            STAGE=prod bash sam/game/scripts/seed-rankings.sh
          else
            echo "Rankings table has $COUNT items — skipping seed"
          fi
```

> **Note:** The `seed-rankings` job needs an additional IAM permission for the
> first deploy only. Add this statement to the deploy role temporarily, then
> remove it after the initial seed:
>
> ```json
> {
>   "Sid": "DynamoDBSeedWrite",
>   "Effect": "Allow",
>   "Action": ["dynamodb:BatchWriteItem", "dynamodb:Scan"],
>   "Resource": "arn:aws:dynamodb:us-east-1:702353326783:table/anthem-rankings-prod"
> }
> ```

---

## Part 4: Implementation Checklist

Do these steps in order. Each step depends on the previous one.

### One-time AWS setup (completed 2026-03-30)

- [x] **Domain:** `anthemworld.net` registered via Route 53 (hosted zone `Z08041081MP5MV3AWW9V3`)
- [x] **OIDC provider:** Already existed in account
- [x] **S3 bucket:** `anthemworld-site` created, public access blocked
- [x] **IAM deploy role:** `anthemworld-deploy` with OIDC trust for `aallbrig/anthemworld:main`
- [x] **ACM certificate:** `anthemworld.net` + `*.anthemworld.net` (DNS validated)
- [x] **CloudFront:** `E22QM4NDFL7MNS` (`demt6o1ioy2cy.cloudfront.net`), OAC `E3TDH809OEA7XT`
- [x] **S3 bucket policy:** Grants CloudFront OAC read access
- [x] **Route 53 alias:** A + AAAA records pointing `anthemworld.net` to CloudFront
- [x] **1Password:** All resource IDs saved as "Anthem World - AWS Deployment"

### One-time GitHub setup (completed 2026-03-30)

- [x] **Secret:** `AWS_ACCOUNT_ID`
- [x] **Variables:** `AWS_REGION=us-east-1`, `SITE_BUCKET=anthemworld-site`, `PRODUCTION_DOMAIN=https://anthemworld.net`, `CLOUDFRONT_DISTRIBUTION_ID=E22QM4NDFL7MNS`
- [x] **`ci.yml`:** Added `workflow_call` trigger
- [x] **`deploy.yml`:** Created with CI gate, SAM deploy, Hugo S3 sync, CloudFront invalidation, conditional seed
- [ ] **Enable branch protection** on `main` (Part 2B) — do after first successful deploy

### First deploy

- [ ] **Push to `main`** — the deploy workflow will run CI, deploy SAM, deploy Hugo, and seed rankings
  (DynamoDB seed permissions already included in deploy role)
- [ ] **Verify the site** at https://anthemworld.net

### Post-deploy verification

- [ ] Static site loads at production URL
- [ ] Game page creates sessions and loads matchups
- [ ] Leaderboard shows seeded countries
- [ ] CORS header matches production domain (check browser devtools network tab)
- [ ] CloudFront serves HTTPS with valid certificate

---

## Part 5: Cost Estimate

For a low-traffic hobby project (~1,000 visitors/month):

| Service | Estimated Monthly Cost |
|---------|----------------------|
| S3 (static site, <100 MB) | $0.02 |
| CloudFront (1 GB transfer) | $0.09 |
| Lambda (10,000 invocations) | $0.00 (free tier) |
| API Gateway (10,000 requests) | $0.04 |
| DynamoDB (on-demand, ~200 items + votes) | $0.00 (free tier) |
| Route 53 hosted zone | $0.50 |
| **Total** | **~$0.65/month** |

At 100,000 visitors/month the cost is still under $10/month thanks to on-demand DynamoDB and Lambda free tier.

---

## Part 6: What This Design Does NOT Cover

These are out of scope but worth considering later:

- **Staging environment** — deploy to a `dev` stage first. The SAM template already supports `Stage: dev`. Duplicate the deploy workflow with different variables.
- **Custom domain + Route 53** — add an `A` alias record pointing to the CloudFront distribution.
- **AWS WAF** — for bot protection beyond API Gateway throttling. Add when traffic justifies the $5/month base cost.
- **CloudWatch alarms** — alert on Lambda errors, API 5xx rate, DynamoDB throttling. Strongly recommended post-launch.
- **Rollback strategy** — SAM deploy creates a CloudFormation changeset. Failed deployments auto-rollback. For the static site, S3 versioning can be enabled for manual rollback.

---

## Appendix: Making ci.yml Reusable

Add `workflow_call` to the existing `ci.yml` triggers so `deploy.yml` can call it:

```yaml
# .github/workflows/ci.yml — add this to the existing `on:` block
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_call:   # <-- add this line
```

No other changes needed. The existing jobs (cli, hugo, playwright, sam-validate) run as-is when called from `deploy.yml`.
