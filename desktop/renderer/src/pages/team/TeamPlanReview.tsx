import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TeamLayout } from "../../components/TeamLayout";
import { usePolling } from "../../lib/usePolling";
import { teamApi } from "../../lib/teamApi";
import { Badge, ErrorNote } from "../../components/ui";

export function TeamPlanReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: plan, error } = usePolling<any>(() => teamApi(`/plans/${id}`), 6000);
  const [busy, setBusy] = useState(false);

  const decide = async (decision: "approve" | "reject") => {
    if (!plan) return;
    setBusy(true);
    try {
      const challenge = await teamApi(`/plans/${id}/challenge`, "POST", {});
      await teamApi(`/plans/${id}/approvals`, "POST", {
        approvalId: challenge.id,
        nonce: challenge.nonce,
        digest: challenge.digest,
        decision,
      });
      navigate(decision === "approve" ? "/team/jobs" : "/team/plans");
    } finally {
      setBusy(false);
    }
  };

  if (!plan) return <TeamLayout><ErrorNote error={error} /></TeamLayout>;

  return (
    <TeamLayout>
      <div className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>{plan.objective}</h2>
          <Badge>{plan.status}</Badge>
        </div>
        <div className="subtitle">
          Base {String(plan.baseSha ?? "").slice(0, 12)} · digest {String(plan.digest ?? "").slice(0, 12)}
        </div>

        <div className="card stack">
          <h3>Steps</h3>
          {(plan.steps ?? []).map((step: any, i: number) => (
            <div key={i}>◇ {step.description}</div>
          ))}
        </div>

        <div className="grid-2">
          <div className="card stack">
            <h3>Expected files</h3>
            {(plan.expectedPaths ?? []).map((p: string) => (
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

        {(plan.riskFlags ?? []).length > 0 && (
          <div className="card stack">
            <h3>Review before approving</h3>
            {plan.riskFlags.map((r: string, i: number) => (
              <div key={i} className="badge bad" style={{ display: "block", marginBottom: 4 }}>
                {r}
              </div>
            ))}
          </div>
        )}

        {(plan.unansweredQuestions ?? []).length > 0 && (
          <div className="card stack">
            <h3>Open questions</h3>
            {plan.unansweredQuestions.map((q: string, i: number) => (
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
    </TeamLayout>
  );
}
