# ADR-0011: Prometheus + Grafana for Monitoring

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2024-01-15 |
| **Author** | DICT Blockchain Team |
| **Stakeholders** | DIT Operations, DICT |
| **Supersedes** | None |

## Context

The blockchain network requires monitoring for:
- Node health (block height, peer count, sync status)
- Transaction throughput (TPS, gas usage, pending transactions)
- Consensus health (validator participation, round changes)
- Resource utilization (CPU, memory, disk, JVM metrics)
- Alerting for node failures, consensus issues, resource exhaustion

## Decision

We will use **Prometheus** for metrics collection and **Grafana** for visualization and dashboards.

Besu natively exposes Prometheus-compatible metrics at `/metrics`. Prometheus scrapes these endpoints and stores time-series data. Grafana connects to Prometheus as a data source and provides dashboards.

The stack is deployed as part of the Docker Compose network alongside Besu nodes.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Besu built-in logging only** | No additional infrastructure | No historical data, no dashboards, no alerting | Insufficient for production monitoring |
| **ELK Stack (Elasticsearch, Logstash, Kibana)** | Powerful log analysis, full-text search | Heavy resource usage, complex setup, overkill for metrics | Prometheus is purpose-built for time-series metrics |
| **Datadog / New Relic (SaaS)** | Managed service, built-in alerting | Data leaves government network, subscription costs, data residency concerns | RA 10173 and data residency requirements favor self-hosted |
| **Prometheus + Grafana (chosen)** | Industry standard, self-hosted, Besu-native integration, open-source | Requires operational expertise, no built-in log aggregation | Best fit for government self-hosted monitoring |

## Consequences

### Positive
- Besu exposes metrics natively — no instrumentation required
- Self-hosted — all data stays within government network (data residency)
- Open-source — no licensing costs, active community
- Grafana dashboards provide real-time visibility for operations team
- Prometheus alerting rules can notify on node failures, consensus issues

### Negative / Trade-offs
- Requires operational expertise to maintain Prometheus/Grafana
- No built-in log aggregation — Besu logs are separate from metrics
- Grafana dashboards are pre-configured for POC; production requires custom panels
- Prometheus data retention is limited by disk space (15 days default)

### Compliance Impact
- Monitoring supports DICT DBS-003 (key management monitoring) and DBS-004 (system availability)
- Alert rules for node down and consensus issues support incident response requirements

## References

- [Besu Metrics Documentation](https://besu.hyperledger.org/private-networks/how-to/monitor/metrics/)
- [Prometheus Architecture](https://prometheus.io/docs/introduction/overview/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
