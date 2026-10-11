const ALLIANCES = Object.freeze({
  des: Object.freeze({
    key: "des",
    label: "DeS",
    objectsCollection: "objects",
    membersCollection: "members"
  }),
  gem: Object.freeze({
    key: "gem",
    label: "GeM",
    objectsCollection: "gemObjects",
    membersCollection: "gemMembers",
    settingsCollection: "gemSettings"
  })
});

const currentParams = new URLSearchParams(window.location.search);
const requestedKey = (currentParams.get("alliance") || "des").toLowerCase();

export const allianceKey = Object.prototype.hasOwnProperty.call(ALLIANCES, requestedKey)
  ? requestedKey
  : "des";
export const allianceConfig = ALLIANCES[allianceKey];

export function allianceHref(file, key = allianceKey) {
  const selectedKey = Object.prototype.hasOwnProperty.call(ALLIANCES, key) ? key : "des";
  const params = new URLSearchParams();
  params.set("alliance", selectedKey);
  if (currentParams.get("preview") === "1") params.set("preview", "1");
  return `${file}?${params.toString()}`;
}

export function setupAllianceTabs(container, file) {
  if (!container) return;
  container.replaceChildren();

  Object.values(ALLIANCES).forEach(alliance => {
    const link = document.createElement("a");
    const active = alliance.key === allianceKey;
    link.href = allianceHref(file, alliance.key);
    link.textContent = alliance.label;
    link.dataset.alliance = alliance.key;
    link.setAttribute("role", "tab");
    link.setAttribute("aria-selected", String(active));
    if (active) link.setAttribute("aria-current", "page");
    container.appendChild(link);
  });
}

export { ALLIANCES };
