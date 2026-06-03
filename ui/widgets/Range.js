/**
 * Widget primitives for the schema-driven UI.
 *
 * Each widget is a pure factory that takes a spec and a binding
 * `{ getValue(), setValue(v), onChange(fn) }` and returns a DOM element.
 * The widget knows nothing about effects — it only knows how to render
 * and emit a value. The `SchemaForm` is the only place that wires
 * widgets to effects.
 */

/**
 * Create a slider row.
 *
 * Spec:
 *   { type: 'range', min, max, step, default, label, unit }
 *
 * @param {object} spec
 * @param {{getValue: () => number, setValue: (v: number) => void, onChange: (fn: (v:number)=>void) => void}} binding
 * @returns {HTMLLabelElement}
 */
export function RangeWidget(spec, binding) {
  const label = document.createElement("label");
  label.className = "sf-row sf-range";
  label.style.cssText = "display: flex; flex-direction: column; gap: 4px;";

  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between;";
  const labelText = document.createElement("span");
  labelText.textContent = spec.label ?? spec.name ?? "";
  const valueText = document.createElement("span");
  valueText.dataset.sfValue = "1";
  header.appendChild(labelText);
  header.appendChild(valueText);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(spec.min ?? 0);
  input.max = String(spec.max ?? 1);
  if (spec.step != null) input.step = String(spec.step);
  if (spec.name) input.name = spec.name;
  input.dataset.sfWidget = "range";

  const initial = binding.getValue() ?? spec.default ?? spec.min ?? 0;
  input.value = String(initial);
  valueText.textContent = formatValue(initial, spec);

  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    valueText.textContent = formatValue(v, spec);
    binding.setValue(v);
  });

  binding.onChange((v) => {
    input.value = String(v);
    valueText.textContent = formatValue(v, spec);
  });

  label.appendChild(header);
  label.appendChild(input);
  return label;
}

function formatValue(v, spec) {
  const unit = spec.unit ? ` ${spec.unit}` : "";
  if (Number.isInteger(v) && (spec.step ?? 1) >= 1) return `${v}${unit}`;
  const decimals = spec.step != null && spec.step < 0.1 ? 3 : 2;
  return `${v.toFixed(decimals)}${unit}`;
}
