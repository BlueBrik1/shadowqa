FROM node:24.14.0-bookworm-slim
ARG OPENCODE_VERSION=1.15.10
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates ripgrep && rm -rf /var/lib/apt/lists/* \
    && npm install -g opencode-ai@${OPENCODE_VERSION} \
    && mkdir -p /opt/shadowqa /workspace /bridge/api-in /bridge/api-out /bridge/model-in /bridge/model-out /home/node/.cache /home/node/.config
COPY infra/bridge.mjs /opt/shadowqa/bridge.mjs
RUN chown -R node:node /home/node /workspace /bridge
USER node
# Warm the provider registry at build time; execution itself has no network.
RUN GOOGLE_GENERATIVE_AI_API_KEY=shadowqa-build-placeholder opencode models google >/dev/null
WORKDIR /workspace
ENV HOME=/home/node OPENCODE_DISABLE_AUTOUPDATE=true OPENCODE_DISABLE_SHARE=true OPENCODE_DISABLE_CLAUDE_CODE=true OPENCODE_DISABLE_EXTERNAL_SKILLS=true
CMD ["node", "/opt/shadowqa/bridge.mjs"]
