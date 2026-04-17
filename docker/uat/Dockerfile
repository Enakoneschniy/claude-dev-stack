FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy tarball + smoke script (tarball built by pnpm pack before docker build)
COPY claude-dev-stack-*.tgz ./
COPY docker/uat/run-smoke.sh ./run-smoke.sh

# Initialize minimal git config (wizard needs git user.name/email)
RUN git config --global user.name "UAT" && git config --global user.email "uat@test.local"

CMD ["bash", "./run-smoke.sh"]
