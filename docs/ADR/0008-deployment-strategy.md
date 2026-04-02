# ADR-0008: Docker Compose for Local Network Orchestration

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-15 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | DICT, IT Operations |
| **Supersedes** | None |

## Context

The POC network consists of 5 Besu nodes (3 validators, 1 observer, 1 bootnode) plus monitoring (Prometheus, Grafana). The orchestration solution must:
- Be reproducible — any developer can start the full network with one command
- Support health checks and dependency ordering (validators depend on bootnode)
- Include monitoring stack
- Be portable to production (Kubernetes, Docker Swarm)

## Decision

We will use **Docker Compose** (v2) for local network orchestration with a single `docker-compose.yml` file defining all services.

The compose file defines:
- 5 Besu nodes with static IPs on a `blockchain` bridge network
- Prometheus and Grafana on a `monitoring` network (Prometheus also joins `blockchain`)
- Named volumes for blockchain data persistence
- Bind mounts for configuration files (`config/besu:/etc/besu`)
- Health checks using `eth_blockNumber` RPC calls
- Dependency ordering via `depends_on: condition: service_healthy`

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Manual node startup** | Full control, no tooling dependency | Error-prone, not reproducible, difficult for demos | POC must be one-command deployable |
| **Docker Swarm** | Built-in orchestration, resource limits, rolling updates | Requires Swarm mode initialization, overkill for POC | Added complexity not justified for 5-node POC |
| **Kubernetes (minikube/k3s)** | Production-grade, portable to enterprise K8s | Steep learning curve, heavy resource requirements | Overkill for POC; migration path documented for production |
| **Docker Compose (chosen)** | Simple, widely available, one-command startup, sufficient for POC | No built-in resource limits (Swarm-only), no rolling updates | Best balance of simplicity and capability for POC scope |

## Consequences

### Positive
- One-command network startup: `docker compose up -d`
- Reproducible across development machines
- Health checks ensure validators start only after bootnode is ready
- Monitoring stack included for observability
- Clear migration path to Kubernetes (documented in portability guide)

### Negative / Trade-offs
- `deploy.resources` sections are Swarm-only and silently ignored by Compose
- No rolling updates — must `down` and `up` to restart nodes
- Named volumes require manual backup/restore
- Port conflicts if multiple instances run on same host

### Compliance Impact
- No direct compliance impact. Supports operational readiness for demos and testing.

## References

- [Docker Compose Specification](https://docs.docker.com/compose/compose-file/)
- [Portability Guide](../portability-guide.md)
