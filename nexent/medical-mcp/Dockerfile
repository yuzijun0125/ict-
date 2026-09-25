FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
ENV PORT=8090 HOST=0.0.0.0 MCP_PATH=/mcp MEDICAL_MCP_ALLOWED_ROOT=/data
EXPOSE 8090
CMD ["node", "src/server.js"]
