const fields = ["bridgeUrl", "token", "appName"];

chrome.storage.sync.get([...fields, "enabled"], (v) => {
  fields.forEach((f) => (document.getElementById(f).value = v[f] || ""));
  document.getElementById("enabled").checked = v.enabled !== false;
});

document.getElementById("save").addEventListener("click", () => {
  const data = Object.fromEntries(fields.map((f) => [f, document.getElementById(f).value.trim()]));
  data.enabled = document.getElementById("enabled").checked;
  chrome.storage.sync.set(data, () => {
    document.getElementById("status").textContent = "Saved";
    setTimeout(() => (document.getElementById("status").textContent = ""), 1500);
  });
});
