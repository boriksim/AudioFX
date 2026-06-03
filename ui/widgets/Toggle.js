/**
 * Create a checkbox / toggle row.
 *
 * Spec:
 *   { type: 'toggle', default, label }
 *
 * @param {object} spec
 * @param {{getValue: () => boolean, setValue: (v: boolean) => void, onChange: (fn: (v:boolean)=>void) => void}} binding
 * @returns {HTMLLabelElement}
 */
export function ToggleWidget(spec, binding) {
  const label = document.createElement("label");
  label.className = "sf-row sf-toggle";
  label.style.cssText = "display: flex; align-items: center; gap: 8px;";

  const input = document.createElement("input");
  input.type = "checkbox";
  if (spec.name) input.name = spec.name;
  input.dataset.sfWidget = "toggle";

  const initial = binding.getValue() ?? spec.default ?? false;
  input.checked = Boolean(initial);

  input.addEventListener("change", () => {
    binding.setValue(input.checked);
  });

  binding.onChange((v) => {
    input.checked = Boolean(v);
  });

  const labelText = document.createElement("span");
  labelText.textContent = spec.label ?? spec.name ?? "";

  label.appendChild(input);
  label.appendChild(labelText);
  return label;
}
