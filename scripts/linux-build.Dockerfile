# Reproduces the `desktop-linux` CI job (.github/workflows/desktop-build.yml)
# so an AppImage can be produced from a non-Linux workstation.
#
# Tauri cannot cross-compile to Linux — the build links against webkit2gtk and
# GTK, so it has to happen on Linux. Build with:
#
#   docker build -f scripts/linux-build.Dockerfile \
#     --output type=local,dest=./dist-linux .
#
# Add `--platform linux/amd64` for the x86_64 artifact that matches releases.
# On an Apple Silicon host that runs under emulation: expect it to take tens of
# minutes and to saturate every core, so prefer CI for release builds and keep
# the native (host-arch) build for local verification.
#
# CARGO_JOBS caps build parallelism so an interactive machine stays usable;
# raise it (or set 0 for Cargo's default of one job per core) on a build box.
#
# Keep the dependency list in sync with the CI job.
FROM ubuntu:22.04 AS build

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev \
      libgtk-3-dev \
      libayatana-appindicator3-dev \
      librsvg2-dev \
      patchelf \
      build-essential \
      curl \
      ca-certificates \
      file \
      desktop-file-utils \
      fuse3 \
      xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Node 24 + pnpm 10.17.1 via Corepack, matching CI.
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@10.17.1 --activate

# Rust stable.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --default-toolchain stable --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /src
COPY . .

# linuxdeploy/appimagetool cannot mount a FUSE filesystem inside an unprivileged
# container; this makes them extract themselves instead.
ENV APPIMAGE_EXTRACT_AND_RUN=1
# NO_STRIP avoids a known linuxdeploy strip failure on some glibc builds.
ENV NO_STRIP=1

ARG CARGO_JOBS=6
ENV CARGO_BUILD_JOBS=${CARGO_JOBS}

RUN pnpm install --frozen-lockfile
RUN pnpm --dir frontend_app tauri:build

# Emit just the artifacts so `--output type=local` writes a clean directory.
FROM scratch AS artifacts
COPY --from=build /src/desktop/src-tauri/target/release/bundle/appimage/*.AppImage /
