# The build context is the REPOSITORY ROOT, not this directory.
#
# The watcher validates rules against the plugin's own schema
# (seal-copilot/hooks/schemas/alerts.json) with the plugin's own validator, so
# that a rule valid for the plugin's hook is valid here. That import reaches
# outside watcher/, so a build rooted at watcher/ would be missing it. One
# contract is worth a wider build context.
#
# On Railway: root directory `/`, Dockerfile path `watcher/Dockerfile`.
FROM node:22-alpine

# No dependencies. Node 22 has fetch, and timezone maths is Intl.
WORKDIR /app
COPY watcher ./watcher
COPY seal-copilot/hooks/scripts/lib ./seal-copilot/hooks/scripts/lib
COPY seal-copilot/hooks/schemas ./seal-copilot/hooks/schemas

# Fail the build rather than the first alert.
RUN node watcher/test.mjs

# A watchdog that cannot tell the time is useless, so pin the container to UTC
# and let every rule's own timezone do the work.
ENV TZ=UTC
USER node

CMD ["node", "watcher/watch.mjs"]
