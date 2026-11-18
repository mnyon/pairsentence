// Shadow DOM retargets input taps to the host element at document level.
// SiYuan's mobile keyboard handling therefore cannot see the real input.
export function bindMobileInputs(root, nativeWindow = window) {
  const inputFor = event => {
    const input = event.target.closest?.('textarea,input');
    if (!input || input.disabled || input.readOnly) return null;
    if (input.tagName === 'INPUT' && !['text','search','email','number','password','tel','url'].includes(input.type)) return null;
    return input;
  };
  const prepare = event => {
    if (!inputFor(event)) return;
    const bridge = nativeWindow.JSAndroid || nativeWindow.JSHarmony;
    bridge?.setWebViewFocusable?.(true);
  };
  const activate = event => {
    const input = inputFor(event);
    if (!input) return;
    prepare(event);
    // Stay in the user's tap event; deferred focus can fail to open mobile IMEs.
    // This also runs SiYuan's patched focus method and its keyboard resize lock.
    input.focus({preventScroll:true});
    const bridge = nativeWindow.JSAndroid?.showKeyboard ? nativeWindow.JSAndroid : nativeWindow.JSHarmony;
    bridge?.showKeyboard?.();
  };
  root.addEventListener('touchstart', prepare, {passive:true});
  root.addEventListener('click', activate);
  return () => {
    root.removeEventListener('touchstart', prepare);
    root.removeEventListener('click', activate);
  };
}
