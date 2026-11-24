// Match selected text after font loading; preserve the existing native select.
const measuredLabels = new WeakMap();
const textMeasure = document.createElement('canvas').getContext('2d');

export function sizeSelectedLabel(select) {
  const label = select.selectedOptions[0].textContent;
  if (measuredLabels.get(select) === label) return;
  const style = getComputedStyle(select);
  textMeasure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const textWidth = textMeasure.measureText(label).width;
  const spacing = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) +
    parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
  measuredLabels.set(select, label);
  select.style.width = `${Math.ceil(textWidth + spacing)}px`;
}

export function initSelectSizing(selects) {
  document.fonts.ready.then(() => {
    for (const select of selects) { measuredLabels.delete(select); sizeSelectedLabel(select); }
  });
}
