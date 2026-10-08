FROM dailyco/pipecat-base:latest@sha256:c34a7c605b0f42d790a7593c9870417a098b0d6258b87119ebd6142d27c11e82
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev
COPY bot.py scenario.py live_provider.py ./
