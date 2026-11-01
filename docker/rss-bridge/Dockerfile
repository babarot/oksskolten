# The upstream image has no release tags after 2025-08, so it is pinned by the
# digest of `latest`. ca-certificates is upgraded on top because PHP curl
# verifies feeds against Debian's bundle, and the upstream build can predate a
# Debian security update of it.
FROM rssbridge/rss-bridge:latest@sha256:50cd1dc2469bee22b794d16561e6e90dd38e0fbfeff366f0e87d0cd0112dbc22

RUN apt-get update -qq \
 && apt-get install -y -qq --only-upgrade ca-certificates \
 && rm -rf /var/lib/apt/lists/*
