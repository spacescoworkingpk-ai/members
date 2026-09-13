import { readFileSync } from "node:fs";
import vm from "node:vm";

export const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
export const fakeSession = {
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  user: { id: "test-user" },
  expires_at: 4102444800
};

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function jsonResponse(payload, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export function element(values = {}) {
  const children = new Map();
  const listeners = new Map();
  const classes = new Set();
  const node = {
    value: "", textContent: "", innerHTML: "", hidden: false, open: false,
    disabled: false, dataset: {}, style: {}, options: [], selectedIndex: 0,
    children: [], listeners,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle(name, force = !classes.has(name)) {
        if (force) classes.add(name); else classes.delete(name);
        return force;
      }
    },
    addEventListener(name, fn) {
      listeners.set(name, [...(listeners.get(name) || []), fn]);
    },
    removeEventListener(name, fn) {
      listeners.set(name, (listeners.get(name) || []).filter((item) => item !== fn));
    },
    querySelector(selector) {
      if (children.has(selector)) return children.get(selector);
      if (selector.startsWith("tr") || selector.includes(".dirty")) return null;
      const child = element();
      children.set(selector, child);
      return child;
    },
    querySelectorAll() { return []; },
    setQuery(selector, child) { children.set(selector, child); },
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return this[name] ?? null; },
    removeAttribute(name) { delete this[name]; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    reset() {}, focus() {}, remove() {}, click() {},
    checkValidity() { return true; }, reportValidity() { return true; },
    ...values
  };
  node.elements = new Proxy({}, {
    get(target, name) { return target[name] ??= element(); }
  });
  return node;
}

export function ledgerRow(fields) {
  const row = element();
  for (const [field, value] of Object.entries(fields)) {
    row.setQuery(`[data-field="${field}"]`, element({ value: String(value ?? "") }));
  }
  return row;
}

export function emulateSelectOptions(select) {
  let html = "";
  // Model the browser behavior relevant to this test: replacing options resets
  // selection to the selected option (or first option), even if value was set.
  Object.defineProperty(select, "innerHTML", {
    configurable: true,
    get: () => html,
    set(value) {
      html = value;
      select.options = [...value.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map((match) => ({
        value: match[1].match(/\bvalue="([^"]*)"/)?.[1] ?? match[2],
        selected: /\bselected\b/.test(match[1]),
        dataset: Object.fromEntries([...match[1].matchAll(/data-([\w-]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]))
      }));
      const index = select.options.findIndex((option) => option.selected);
      select.selectedIndex = Math.max(0, index);
      select.value = select.options[select.selectedIndex]?.value || "";
    }
  });
}

export function createApp({ fetch: fetchMock, storedSession = null } = {}) {
  const nodes = new Map();
  const calls = [];
  const storage = new Map();
  const warnings = [];
  if (storedSession) storage.set("spaces-coworking-staff-session", JSON.stringify(storedSession));
  const document = element();
  document.querySelector = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  document.createElement = () => element();
  const window = element({
    location: { hash: "#dashboard" },
    setTimeout() { return 1; }, clearTimeout() {},
    setInterval() { return 1; }, clearInterval() {},
    confirm() { return true; }
  });
  const context = vm.createContext({
    document, window, URL, URLSearchParams, Response, Buffer, Intl,
    CSS: { escape: (value) => String(value) },
    crypto: { randomUUID: () => "test-transfer-id" },
    navigator: {},
    console: { warn: (...args) => warnings.push(args), error: (...args) => warnings.push(args), log() {} },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    FormData: class {
      constructor(form) { this.values = form.formValues || {}; }
      get(name) { return this.values[name] ?? null; }
    },
    fetch: async (url, options = {}) => {
      const call = { url: String(url), options, body: options.body ? JSON.parse(options.body) : null };
      calls.push(call);
      if (!fetchMock) throw new Error("Unexpected fetch blocked by reliability harness");
      return fetchMock(call);
    }
  });
  const run = (source) => vm.runInContext(source, context, { timeout: 1000 });
  run(appSource);
  return {
    context, calls, nodes, storage, warnings, run,
    get: (name) => run(name),
    set(name, value) {
      context.__testValue = value;
      run(`${name} = __testValue`);
      delete context.__testValue;
    },
    call(name, ...args) {
      context.__testArgs = args;
      try { return run(`${name}(...__testArgs)`); }
      finally { delete context.__testArgs; }
    },
    signIn() {
      context.__testSession = fakeSession;
      run("session = __testSession; staffProfile = { user_id: 'test-user', role: 'owner' }; auditLogReady = false; healthChecked = true");
      delete context.__testSession;
    }
  };
}

// Execute server functions unchanged, replacing only ESM linkage with explicit
// test dependencies. No process environment or real network is exposed.
export function createServerModule(relativePath, dependencies = {}) {
  const source = readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8")
    .replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];\s*/gm, "")
    .replace(/^export default /gm, "")
    .replace(/^export (?=(?:async )?function|const )/gm, "");
  const context = vm.createContext({
    Buffer, URL, Response, FormData, Blob, console,
    process: { env: {} },
    fetch: async () => { throw new Error("Unexpected server fetch blocked by reliability harness"); },
    ...dependencies
  });
  vm.runInContext(source, context, { timeout: 1000, filename: relativePath });
  return {
    get: (name) => vm.runInContext(name, context),
    call(name, ...args) {
      context.__testArgs = args;
      try { return vm.runInContext(`${name}(...__testArgs)`, context, { timeout: 1000 }); }
      finally { delete context.__testArgs; }
    }
  };
}
