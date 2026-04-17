FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3 make g++ curl \
  && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@10

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Git config (overrideable via env)
RUN git config --global user.name "UAT" && \
    git config --global user.email "uat@test.local"

WORKDIR /workspace
