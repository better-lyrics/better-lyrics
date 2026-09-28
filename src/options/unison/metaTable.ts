// -- Meta Table --------------------------

export function appendMetaRow(
  table: HTMLTableElement,
  label: string,
  value: string | HTMLElement
): HTMLTableCellElement {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  th.textContent = label;
  const td = document.createElement("td");
  if (typeof value === "string") {
    td.textContent = value;
  } else {
    td.appendChild(value);
  }
  tr.appendChild(th);
  tr.appendChild(td);
  table.appendChild(tr);
  return td;
}
