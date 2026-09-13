import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { usePolling } from "../lib/usePolling";
import { api } from "../lib/api";
import { Badge, ErrorNote } from "../components/ui";

export function PlanReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: plan, error } = usePolling<any>(() => api(`/plans/${id}`), 6000);
  const [busy, setBusy] = useState(false);

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    try {
      const result = await api(`/plans/${id}/approve`, "POST", { decision, digest: plan?.digest });
      if (decision === "approve" && result.task) navigate(`/jobs/${result.task.id}`);
      else navigate("/plans");
    } finally {
      setBusy(false);
    }
  };

  if (!plan) return <Layout><ErrorNote error={error} /></Layout>;

  const stale = plan.freshness && !plan.freshness.fresh;

  return (
    <Layout>
      <div className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>{plan.objective}</h2>
          <Badge>{plan.status}</Badge>
        </div>
        <div className="subtitle">
          Base {String(plan.baseSha ?? "").slice(0, 12)} · digest {String(plan.digest ?? "").slice(0, 12)} · backend {plan.backend}
        </div>

        {stale && <ErrorNote error={new Error("This plan is stale: " + plan.freshness.reason)} />}

        <div className="card stack">
          <h3>Steps</h3>
          {(plan.steps ?? []).map((step: any, i: number) => (
            <div key={i}>◇ {step.description}</div>
          ))}
        </div>

        <div className="grid-2">
          <div className="card stack">
            <h3>Affected files</h3>
            {(plan.affectedPaths ?? []).map((p: string) => (
              <div key={p} className="subtitle">
                {p}
              </div>
            ))}
          </div>
          <div className="card stack">
            <h3>Acceptance</h3>
            {(plan.acceptanceCriteria ?? []).map((a: string, i: number) => (
              <div key={i}>✓ {a}</div>
            ))}
          </div>
        </div>

        {(plan.risks ?? []).length > 0 && (
          <div className="card stack">
            <h3>Review before approving</h3>
            {plan.risks.map((r: string, i: number) => (
              <div key={i} className="badge bad" style={{ display: "block", marginBottom: 4 }}>
                {r}
              </div>
            ))}
          </div>
        )}

        {(plan.unresolvedQuestions ?? []).length > 0 && (
          <div className="card stack">
            <h3>Open questions</h3>
            {plan.unresolvedQuestions.map((q: string, i: number) => (
              <div key={i}>? {q}</div>
            ))}
          </div>
        )}

        <div className="row">
          <button className="primary" disabled={busy || plan.status !== "awaiting_approval"} onClick={() => decide("approve")}>
            Approve &amp; launch agent
          </button>
          <button className="secondary" disabled={busy || plan.status !== "awaiting_approval"} onClick={() => decide("reject")}>
            Reject
          </button>
        </div>
      </div>
    </Layout>
  );
}
