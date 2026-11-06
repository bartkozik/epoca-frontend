#!/usr/bin/env sh

set -e

echo
echo "#"
echo "#" "Starting web."
echo "#"
echo

echo
echo "#"
echo "#" "Interpolating environment variables"
echo "#"
echo

# Strip trailing slashes: nginx normalizes request paths, so a double-slash location would never match.
PUBLIC_URL="${PUBLIC_URL%/}"
RESOURCE_PATH_PREFIX="${RESOURCE_PATH_PREFIX%/}"

envsubst < /usr/share/nginx/html/assets/env.template.js > /usr/share/nginx/html/assets/env.js
envsubst '${APP_VERSION} ${RESOURCE_PATH_PREFIX}' < /etc/nginx/conf.d/default.template > /etc/nginx/conf.d/default.conf

# Rewrite the Vite base token in HTML, CSS and JS, including lazy chunk URLs.
find /usr/share/nginx/html -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' \) \
  -exec sed -i "s;/__PUBLIC_URL__/;${PUBLIC_URL}/;g" {} +

echo
echo "#"
echo "#" "Starting HTTP fileserver nginx"
echo "#"
echo

exec nginx -g 'daemon off;'
