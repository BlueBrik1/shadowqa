import { useEffect, useState } from "react";
import { fetchSettings, saveSettings } from "../api/store";
import { PageHeader } from "../components/Field";
import { useAuth } from "../store/AuthContext";

const toggles = [
  ["email_digest", "Weekly field digest", "A short note on new goods and restocks."],
  ["order_updates", "Order updates", "Shipping and delivery notifications."],
  ["marketing", "Seasonal offers", "Occasional promotions. Never more than monthly."],
];

export default function Settings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchSettings().then((d) => setPrefs(d.preferences));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const res = await saveSettings(prefs);
      setSaved(res.saved_at);
      setTimeout(() => setSaved(null), 2500);
    } finally {
      setBusy(false);
    }
  };

  if (!prefs) return <div className="text-sm text-mute font-mono">Loading…</div>;

  return (
    <div data-testid="settings-page">
      <PageHeader eyebrow="Account" title={<>Preferences &amp; <span className="italic font-light">account</span></>} />
      <div className="grid lg:grid-cols-5 gap-10">
        <section className="lg:col-span-3 bg-white border border-line divide-y divide-line reveal" data-testid="settings-toggles">
          {toggles.map(([key, label, help]) => (
            <label key={key} className="flex items-start justify-between gap-6 p-5 cursor-pointer">
              <span>
                <span className="block text-sm font-medium text-ink">{label}</span>
                <span className="block text-xs text-ink2 mt-0.5">{help}</span>
              </span>
              <input
                type="checkbox"
                name={key}
                data-testid={`settings-${key}`}
                checked={Boolean(prefs[key])}
                onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
                className="mt-1 h-4 w-4 accent-ink"
              />
            </label>
          ))}
          <div className="p-5 grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-ink2 mb-1.5">Units</span>
              <select name="units" data-testid="settings-units" className="field" value={prefs.units} onChange={(e) => setPrefs({ ...prefs, units: e.target.value })}>
                <option value="imperial">Imperial</option>
                <option value="metric">Metric</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-ink2 mb-1.5">Theme</span>
              <select name="theme" data-testid="settings-theme" className="field" value={prefs.theme} onChange={(e) => setPrefs({ ...prefs, theme: e.target.value })}>
                <option value="light">Light</option>
                <option value="dusk">Dusk</option>
              </select>
            </label>
          </div>
          <div className="p-5 flex items-center gap-4">
            <button className="btn-ink" onClick={save} disabled={busy} data-testid="settings-save-btn">{busy ? "Saving…" : "Save preferences"}</button>
            {saved && <span className="text-sm text-forest font-mono" data-testid="settings-saved">Saved</span>}
          </div>
        </section>
        <aside className="lg:col-span-2 bg-white border border-line p-6 reveal reveal-1" data-testid="account-card">
          <div className="eyebrow mb-4">Account</div>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-ink2 text-xs">Name</dt><dd className="text-ink">{user?.name}</dd></div>
            <div><dt className="text-ink2 text-xs">Email</dt><dd className="text-ink font-mono">{user?.email}</dd></div>
            <div><dt className="text-ink2 text-xs">Member since</dt><dd className="text-ink">{user?.member_since ? new Date(user.member_since).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—"}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
