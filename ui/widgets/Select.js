/**
 * Create a select (dropdown) row.
 *
 * Spec:
 *   { type: 'select', options: string[], default, label }
 *
 * @param {object} spec
 * @param {{getValue: () => any, setValue: (v: any) => void, onChange: (fn: (v:any)=>void) => void}} binding
 * @returns {HTMLLabelElement}
 */
export function SelectWidget(spec, binding) {
  const label = document.createElement("label");
  label.className = "sf-row sf-select";
  label.style.cssText = "display: flex; flex-direction: column; gap: 4px;";

  if (spec.label ?? spec.name) {
    const labelText = document.createElement("span");
    labelText.textContent = spec.label ?? spec.name;
    label.appendChild(labelText);
  }

  const select = document.createElement("select");
  if (spec.name) select.name = spec.name;
  select.dataset.sfWidget = "select";

  for (const opt of spec.options ?? []) {
    const optionEl = document.createElement("option");
    optionEl.value = String(opt);
    optionEl.textContent = String(opt);
    select.appendChild(optionEl);
  }

  const initial = binding.getValue() ?? spec.default;
  if (initial != null) select.value = String(initial);

  select.addEventListener("change", () => {
    binding.setValue(select.value);
  });

  binding.onChange((v) => {
    if (v != null) select.value = String(v);
  });

  label.appendChild(select);
  return label;
}
