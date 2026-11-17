FROM golang:1.24-bookworm AS build
ARG MINIO_REVISION=7aac2a2c5b7c882e68c1ce017d8256be2feea27f
ENV GOMAXPROCS=2
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build CGO_ENABLED=0 go install -p 2 github.com/minio/minio@${MINIO_REVISION}

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=build /go/bin/minio /usr/local/bin/minio
RUN useradd --uid 10001 --create-home minio && mkdir /data && chown minio:minio /data
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
