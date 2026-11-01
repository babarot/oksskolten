# ca-certificates and chromium are upgraded on top of the upstream release,
# which is rebuilt only when FlareSolverr itself releases, so its Debian
# packages can lag behind security updates.
FROM ghcr.io/flaresolverr/flaresolverr:v3.5.2@sha256:c80ae007ce2ccdcd217a12426e4f039ef763ff90738c808d38810c3e59323767

USER root
# FlareSolverr runs /app/chromedriver, which its own build moves out of
# /usr/bin. An upgraded chromium-driver puts a new one back in /usr/bin, and
# that one replaces the copy in /app; without an upgrade there is none.
RUN apt-get update -qq \
 && apt-get install -y -qq --only-upgrade ca-certificates chromium chromium-driver \
 && rm -rf /var/lib/apt/lists/* \
 && if [ -e /usr/bin/chromedriver ]; then \
      mv /usr/bin/chromedriver /app/chromedriver \
      && chown flaresolverr:flaresolverr /app/chromedriver; \
    fi
USER flaresolverr
