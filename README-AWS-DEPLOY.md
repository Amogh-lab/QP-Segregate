# QPaper AI — AWS Deployment Guide

Complete step-by-step guide to deploy QPaper AI on AWS EKS with GitHub Actions CI/CD and Prometheus+Grafana monitoring.

---

## Prerequisites

Install these tools on your local machine:

```bash
# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# eksctl (EKS cluster manager)
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Helm (for monitoring stack)
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Verify
aws --version && eksctl version && kubectl version --client && helm version
```

---

## Step 1 — Configure AWS CLI

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, Region (ap-south-1), output format (json)
```

---

## Step 2 — Create ECR Repositories

```bash
AWS_REGION=ap-south-1
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Create repositories
aws ecr create-repository --repository-name qpaper-backend --region $AWS_REGION
aws ecr create-repository --repository-name qpaper-frontend --region $AWS_REGION

echo "ECR Registry: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
```

---

## Step 3 — Create EKS Cluster

> ⚠️ This takes **15-20 minutes**. The cluster costs ~$72/month for the control plane alone.

```bash
eksctl create cluster \
  --name qpaper-cluster \
  --region ap-south-1 \
  --nodegroup-name on-demand-workers \
  --node-type t3.medium \
  --nodes 2 \
  --nodes-min 1 \
  --nodes-max 4 \
  --managed \
  --asg-access \
  --full-ecr-access

# Verify cluster is up
kubectl get nodes
```

### (Optional) Add a spot node group for Celery workers

```bash
eksctl create nodegroup \
  --cluster qpaper-cluster \
  --region ap-south-1 \
  --name spot-workers \
  --node-type t3.large \
  --nodes 1 \
  --nodes-min 0 \
  --nodes-max 3 \
  --spot \
  --full-ecr-access
```

---

## Step 4 — Install Cluster Add-ons

### 4a. AWS Load Balancer Controller (required for Ingress/ALB)

```bash
# Create IAM policy for the LB controller
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.2/docs/install/iam_policy.json
aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam_policy.json

# Create service account
eksctl create iamserviceaccount \
  --cluster=qpaper-cluster \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --role-name AmazonEKSLoadBalancerControllerRole \
  --attach-policy-arn=arn:aws:iam::$AWS_ACCOUNT_ID:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve

# Install via Helm
helm repo add eks https://aws.github.io/eks-charts
helm repo update eks
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=qpaper-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

# Verify
kubectl get deployment -n kube-system aws-load-balancer-controller
```

### 4b. Metrics Server (required for HPA)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Verify
kubectl top nodes
```

---

## Step 5 — Set Up GitHub Actions Secrets

In your GitHub repo → **Settings → Secrets and variables → Actions**, add these secrets:

### AWS / EKS (for CI/CD to use)
| Secret Name | Value |
|---|---|
| `AWS_ACCESS_KEY_ID_CI` | IAM user access key (create a dedicated CI user) |
| `AWS_SECRET_ACCESS_KEY_CI` | IAM user secret key |
| `AWS_ACCOUNT_ID` | Your 12-digit AWS account ID |
| `AWS_REGION` | `ap-south-1` |
| `EKS_CLUSTER_NAME` | `qpaper-cluster` |

### Backend runtime secrets
| Secret Name | Value |
|---|---|
| `DATABASE_URL` | Your PostgreSQL connection string |
| `MONGODB_URL` | Your MongoDB connection string |
| `REDIS_URL` | Your Redis connection string |
| `JWT_SECRET_KEY` | Any long random string (e.g. `openssl rand -hex 32`) |
| `AWS_ACCESS_KEY_ID` | AWS key for S3 (can be same as CI or separate) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret for S3 |
| `AWS_S3_BUCKET` | Your S3 bucket name |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OPENAI_API_KEY` | OpenAI API key (optional) |
| `PINECONE_API_KEY` | Pinecone API key (optional) |

### Frontend build-time secrets
| Secret Name | Value |
|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Same as `GOOGLE_CLIENT_ID` |
| `NEXT_PUBLIC_API_URL` | ⚠️ **Leave blank for first deploy** — see Step 7 |

---

## Step 6 — First Deploy (Phase 1)

Push to `main` to trigger the GitHub Actions pipeline:

```bash
git add .
git commit -m "feat: add AWS EKS deployment infrastructure"
git push origin main
```

Watch the pipeline run: **GitHub → Actions → CI/CD**

The pipeline will:
1. Build and push backend image to ECR
2. Build frontend image (with placeholder API URL — that's OK for now)
3. Apply all K8s manifests to EKS
4. Deploy all 4 containers
5. Print the ALB URL at the end ← **copy this**

---

## Step 7 — Get ALB URL and Redeploy Frontend

After the first deploy completes, get the ALB URL:

```bash
kubectl get ingress qpaper-ingress -n qpaper
# Look for the ADDRESS column — it looks like:
# k8s-qpaper-xxx.ap-south-1.elb.amazonaws.com
```

1. Copy the ALB URL
2. Go to GitHub Secrets → set `NEXT_PUBLIC_API_URL` = `http://k8s-qpaper-xxx.ap-south-1.elb.amazonaws.com`
3. Push an empty commit to trigger a rebuild: `git commit --allow-empty -m "fix: rebuild frontend with ALB URL" && git push`

Now the frontend will be built with the real API URL baked in. ✅

---

## Step 8 — Install Monitoring (Prometheus + Grafana)

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  -f monitoring/kube-prometheus-values.yaml \
  -n monitoring --create-namespace

# Wait for pods to be ready
kubectl get pods -n monitoring --watch
```

### Create the Grafana dashboard ConfigMap

```bash
kubectl create configmap qpaper-grafana-dashboard \
  -n monitoring \
  --from-file=qpaper-dashboard.json=monitoring/dashboards/qpaper-dashboard.json
```

### Access Grafana

```bash
# Forward Grafana to your local machine
kubectl port-forward svc/monitoring-grafana 3001:80 -n monitoring

# Open: http://localhost:3001
# Username: admin
# Password: qpaper-grafana-admin   (change this in monitoring/kube-prometheus-values.yaml)
```

---

## Verify Everything is Running

```bash
# Check all pods
kubectl get pods -n qpaper

# Check the ingress/ALB
kubectl get ingress -n qpaper

# Check HPA
kubectl get hpa -n qpaper

# Check services
kubectl get svc -n qpaper

# Tail backend logs
kubectl logs -f deployment/backend -n qpaper

# Tail celery worker logs
kubectl logs -f deployment/celery-worker -n qpaper
```

Expected output:
```
NAME                             READY   STATUS    RESTARTS
backend-xxxx-xxx                 1/1     Running   0
backend-xxxx-yyy                 1/1     Running   0
celery-beat-xxxx-xxx             1/1     Running   0
celery-worker-xxxx-xxx           1/1     Running   0
frontend-xxxx-xxx                1/1     Running   0
frontend-xxxx-yyy                1/1     Running   0
```

---

## Teardown (to stop AWS charges)

```bash
# Delete the EKS cluster (stops EC2 billing)
eksctl delete cluster --name qpaper-cluster --region ap-south-1

# Note: ECR repos and their images still incur minimal storage cost
# Delete if needed:
aws ecr delete-repository --repository-name qpaper-backend --force --region ap-south-1
aws ecr delete-repository --repository-name qpaper-frontend --force --region ap-south-1
```

---

## .env Reference (GitHub Secrets → K8s)

```
GitHub Secret               │ Goes to
────────────────────────────┼────────────────────────────────────────
DATABASE_URL                │ K8s Secret → backend + celery pods (runtime)
MONGODB_URL                 │ K8s Secret → backend + celery pods (runtime)
REDIS_URL                   │ K8s Secret → backend + celery pods (runtime)
JWT_SECRET_KEY              │ K8s Secret → backend + celery pods (runtime)
AWS_ACCESS_KEY_ID           │ K8s Secret → backend + celery pods (runtime)
AWS_SECRET_ACCESS_KEY       │ K8s Secret → backend + celery pods (runtime)
AWS_S3_BUCKET               │ K8s Secret → backend + celery pods (runtime)
GOOGLE_CLIENT_ID            │ K8s Secret → backend pods (runtime)
GOOGLE_CLIENT_SECRET        │ K8s Secret → backend pods (runtime)
────────────────────────────┼────────────────────────────────────────
NEXT_PUBLIC_API_URL         │ Docker --build-arg → baked into Next.js bundle
NEXT_PUBLIC_GOOGLE_CLIENT_ID│ Docker --build-arg → baked into Next.js bundle
```
