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

# Strip any trailing slash the operator may have set (e.g. "/teams/epoca/"), so downstream
# substitution always collapses to exactly one slash. A trailing slash on RESOURCE_PATH_PREFIX
# produces a literal `//` in nginx.conf's `location` block; nginx's `merge_slashes on` default
# then collapses `//` in every incoming request before matching, so that block can never match
# any request -- total site outage (every request 404s).
PUBLIC_URL="${PUBLIC_URL%/}"
RESOURCE_PATH_PREFIX="${RESOURCE_PATH_PREFIX%/}"

envsubst < /usr/share/nginx/html/assets/env.template.js > /usr/share/nginx/html/assets/env.js
envsubst '${APP_VERSION} ${RESOURCE_PATH_PREFIX}' < /etc/nginx/conf.d/default.template > /etc/nginx/conf.d/default.conf

# Vite's `--base=/__PUBLIC_URL__/` build flag bakes the literal `/__PUBLIC_URL__/` token into
# every built file referencing a path -- index.html, .css (url(...)), and .js (chunk loading,
# asset URLs, and `import.meta.env.BASE_URL`). Rewrite it across all of them here.
find /usr/share/nginx/html -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' \) \
  -exec sed -i "s;/__PUBLIC_URL__/;${PUBLIC_URL}/;g" {} +

echo
echo "#"
echo "#" "Starting HTTP fileserver nginx"
echo "#"
echo

exec nginx -g 'daemon off;'
