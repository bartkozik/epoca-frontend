ARG BUILD_VERSION
FROM node:22.23.2 AS builder
ARG BUILD_VERSION
WORKDIR /app
RUN test -n "$BUILD_VERSION"
COPY package.json .
COPY yarn.lock .
COPY .yarnrc.yml ./
COPY .yarn/ ./.yarn/
RUN test "$(node --version)" = "v22.23.2"
RUN test "$(node .yarn/releases/yarn-4.18.0.cjs --version)" = "4.18.0"
RUN node .yarn/releases/yarn-4.18.0.cjs install --immutable
COPY . .
RUN node .yarn/releases/yarn-4.18.0.cjs build

# Bundle static assets with nginx
FROM nginx:1.30.0-alpine@sha256:0272e4604ed93c1792f03695a033a6e8546840f86e0de20a884bb17d2c924883 as production
ARG BUILD_VERSION
LABEL org.opencontainers.image.revision=$BUILD_VERSION
ENV NODE_ENV production
# Copy built assets from builder
COPY --from=builder /app/build /usr/share/nginx/html
RUN test -n "$BUILD_VERSION" && printf '%s\n' "$BUILD_VERSION" > /usr/share/nginx/html/frontend-version
# Add your nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.template
COPY entrypoint.sh entrypoint.sh
# Expose port
EXPOSE 80
# Require a real HTTP version response matching the immutable image file, at the configured prefix.
HEALTHCHECK --interval=10s --timeout=4s --start-period=20s --retries=6 CMD test "$(wget -q -T 3 -O - "http://127.0.0.1${RESOURCE_PATH_PREFIX%/}/frontend-version")" = "$(cat /usr/share/nginx/html/frontend-version)" || exit 1
# Start nginx
CMD ["/bin/sh",  "/entrypoint.sh"]
