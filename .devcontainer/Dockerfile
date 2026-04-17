FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git python3 python3-pip python3-venv pipx \
    make g++ curl openssh-server ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# SSH setup
RUN mkdir -p /run/sshd && \
    sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && \
    echo "PubkeyAuthentication yes" >> /etc/ssh/sshd_config

# Accept host SSH key at build time
ARG SSH_PUBLIC_KEY=""
RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh && \
    if [ -n "$SSH_PUBLIC_KEY" ]; then \
      echo "$SSH_PUBLIC_KEY" > /root/.ssh/authorized_keys; \
    fi && \
    chmod 600 /root/.ssh/authorized_keys 2>/dev/null || true

# Add GitHub SSH host keys (plugins like supabase use git@github.com: submodules)
RUN ssh-keyscan -t ed25519,rsa github.com >> /root/.ssh/known_hosts 2>/dev/null

# Install pnpm
RUN npm install -g pnpm@10

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Pre-clone optional skills at build time (baked into image, no runtime network needed)
RUN git clone --quiet https://github.com/kepano/obsidian-skills.git /root/.claude/skills/obsidian 2>/dev/null || true
RUN git clone --quiet https://github.com/Weizhena/Deep-Research-skills.git /tmp/deep-research-skills 2>/dev/null && \
    mkdir -p /root/.claude/skills && \
    cp -r /tmp/deep-research-skills/skills/research-en/* /root/.claude/skills/ 2>/dev/null || true && \
    rm -rf /tmp/deep-research-skills

# Git config
RUN git config --global user.name "UAT" && \
    git config --global user.email "uat@test.local"

WORKDIR /workspace

# Start SSH daemon
CMD ["/usr/sbin/sshd", "-D"]
