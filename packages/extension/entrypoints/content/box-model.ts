export interface BoxModelDimensions {
  margin: { top: number; right: number; bottom: number; left: number };
  border: { top: number; right: number; bottom: number; left: number };
  padding: { top: number; right: number; bottom: number; left: number };
}

export function calculateBoxModel(el: Element): BoxModelDimensions {
  const style = getComputedStyle(el);
  return {
    margin: {
      top: parseFloat(style.marginTop),
      right: parseFloat(style.marginRight),
      bottom: parseFloat(style.marginBottom),
      left: parseFloat(style.marginLeft),
    },
    border: {
      top: parseFloat(style.borderTopWidth),
      right: parseFloat(style.borderRightWidth),
      bottom: parseFloat(style.borderBottomWidth),
      left: parseFloat(style.borderLeftWidth),
    },
    padding: {
      top: parseFloat(style.paddingTop),
      right: parseFloat(style.paddingRight),
      bottom: parseFloat(style.paddingBottom),
      left: parseFloat(style.paddingLeft),
    },
  };
}
