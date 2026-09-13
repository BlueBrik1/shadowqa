import type { ReactNode } from "react";

export function Card(props: {
  children: ReactNode;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const classes = ["card", props.selectable && "selectable", props.selected && "selected"]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} onClick={props.onClick}>
      {props.children}
    </div>
  );
}

export function Badge(props: { tone?: "good" | "bad"; children: ReactNode }) {
  return <span className={"badge" + (props.tone ? " " + props.tone : "")}>{props.children}</span>;
}

export function Field(props: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label>{props.label}</label>
      {props.children}
      {props.hint && <div className="subtitle" style={{ fontSize: 12, marginTop: 4 }}>{props.hint}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="badge bad" style={{ display: "block" }}>
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}
