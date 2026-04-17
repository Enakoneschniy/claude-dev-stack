FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3 make g++ curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy tarball + smoke script (tarball built by pnpm pack before docker build)
COPY claude-dev-stack-*.tgz ./
COPY docker/uat/run-smoke.sh ./run-smoke.sh

# Install claude-dev-stack from tarball globally
RUN npm install -g ./claude-dev-stack-*.tgz

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Initialize minimal git config (wizard needs git user.name/email)
RUN git config --global user.name "UAT" && git config --global user.email "uat@test.local"

# Create a test project for interactive testing
RUN mkdir -p /test-project && cd /test-project && git init

CMD ["bash", "./run-smoke.sh"]
