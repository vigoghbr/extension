type Listener = () => void;

const listeners = new Set<Listener>();

export function onLoginRequired(listener: Listener): void {
  listeners.add(listener);
}

export function requestLogin(): void {
  for (const listener of listeners) listener();
}
