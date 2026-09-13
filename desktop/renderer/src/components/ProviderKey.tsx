import { useEffect, useState } from "react";
import { Field } from "./ui";
import { invalidateConfig } from "../lib/api";

const CONSOLES: Record<string, string> = {
  gemini: "https://aistudio.google.com/apikey",
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
};

/** A single provider's masked key field: saved state is shown, never the raw value once stored.
 * Storage is the OS keychain (via the main process) — never a project `.env` file. */
export function ProviderKey(props: { id: string; label: string; required?: boolean }) {
  const [saved, setSaved] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.shadowqa.keychain.get(props.id).then((existing) => setSaved(!!existing));
  }, [props.id]);

  const save = async () => {
    if (!value) return;
    setBusy(true);
    try {
      await window.shadowqa.keychain.set(props.id, value);
      invalidateConfig();
      setSaved(true);
      setValue("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field
      label={props.label + (props.required ? " (required)" : " (optional)")}
      hint={saved ? "Saved to your OS keychain." : undefined}
    >
      <div className="row">
        <input
          type="password"
          placeholder={saved ? "•••• replace saved key" : "Paste key"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="secondary" disabled={busy || !value} onClick={save}>
          Save
        </button>
        {CONSOLES[props.id] && (
          <button className="link" onClick={() => window.shadowqa.openExternal(CONSOLES[props.id])}>
            Get a key
          </button>
        )}
      </div>
    </Field>
  );
}
