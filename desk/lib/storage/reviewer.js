export async function reviewerStorage() {
  const response = await fetch('/api/workspace', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not open this reviewer session. Reload to sign in.');
  const workspace = await response.json();
  let revision = workspace.revision;
  let offset = workspace.now - Date.now();
  return {
    now: () => Date.now() + offset,
    read: () => JSON.stringify(workspace.orders),
    async write(orders, context) {
      const request = {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision, orders: ['edit','batch'].includes(context.action) ? orders : undefined, requestId: crypto.randomUUID(), ...context }),
      };
      let response;
      try { response = await fetch('/api/workspace', request); }
      catch { response = await fetch('/api/workspace', request); }
      if (!response.ok) throw new Error(await response.text());
      const saved = await response.json();
      revision = saved.revision;
      offset = saved.now - Date.now();
      return saved.orders;
    },
  };
}
